import { getStorageError, loadState, saveState, updateState } from "./store.js";
import { applyQuizResult, detectBuilderWeakness, saveBuilderResult, scoreQuiz } from "./training.js";

const app = document.querySelector("#app");
let curriculum;
let lessons = new Map();
let quizSession = { lessonId: null, index: 0, answers: {}, attemptId: null };
let latestQuizResult = null;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const emptyProgress = () => ({ lessonStatus: "unstarted", quizPassed: false, bestScore: 0, attempts: 0 });

async function loadTrainingData() {
  const catalogResponse = await fetch("./data/lessons.json");
  if (!catalogResponse.ok) throw new Error("Lesson catalog could not be loaded");
  const catalog = await catalogResponse.json();
  const loadedLessons = await Promise.all(catalog.lessons.map(async (entry) => {
    const response = await fetch(entry.path);
    if (!response.ok) throw new Error(`Lesson ${entry.id} could not be loaded`);
    const lesson = await response.json();
    validateLesson(lesson, entry.id);
    return lesson;
  }));
  return { ...catalog, loadedLessons };
}

function validateLesson(lesson, expectedId) {
  const required = ["id", "title", "stageId", "tier", "importance", "questionCount", "passScore", "conceptTags", "confusionTags", "content", "quiz", "miniBuilder"];
  if (required.some((key) => lesson[key] === undefined) || lesson.id !== expectedId) {
    throw new Error(`Lesson ${expectedId} does not match the Training Engine schema`);
  }
  if (!Array.isArray(lesson.quiz.questions) || lesson.quiz.questions.length !== lesson.questionCount) {
    throw new Error(`Lesson ${expectedId} question count does not match its quiz data`);
  }
}

function navigate(hash) {
  window.location.hash = hash;
}

function createAttemptId() {
  return globalThis.crypto?.randomUUID?.() || `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getQuizConfig(lesson) {
  return { passScore: lesson.passScore, questionCount: lesson.questionCount };
}

function getProgress(state, lessonId) {
  return state.lessonProgress[lessonId] || emptyProgress();
}

function getConceptLabel(conceptId) {
  for (const lesson of lessons.values()) {
    const concept = lesson.conceptTags.find((tag) => tag.id === conceptId);
    if (concept) return concept.label;
  }
  return conceptId;
}

function getLatestBuilder(state, lessonId) {
  return state.builderProjects.filter((project) => project.lessonId === lessonId).at(-1);
}

function syncStorageAlert(message = getStorageError()) {
  const existing = document.querySelector("#storage-alert");
  if (!message) {
    existing?.remove();
    return;
  }
  const alert = existing || document.createElement("div");
  alert.id = "storage-alert";
  alert.className = "storage-alert";
  alert.setAttribute("role", "alert");
  alert.textContent = message;
  if (!existing) document.querySelector(".site-header").insertAdjacentElement("afterend", alert);
}

function setScreen(markup) {
  app.innerHTML = markup;
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
  syncStorageAlert();
}

function renderHome() {
  const state = loadState();
  const availableLessons = [...lessons.values()];
  const currentLesson = availableLessons.find((lesson) => !getProgress(state, lesson.id).quizPassed) || availableLessons.at(-1);
  if (!currentLesson) return renderError("利用可能なLessonがありません");

  const progress = getProgress(state, currentLesson.id);
  const passedLessons = availableLessons.filter((lesson) => getProgress(state, lesson.id).quizPassed).length;
  const latestBuilder = getLatestBuilder(state, currentLesson.id);
  const weakConcepts = Object.entries(state.conceptStates)
    .filter(([, concept]) => concept.retentionState === "weak")
    .map(([id]) => getConceptLabel(id));
  const lessonCompleted = progress.lessonStatus === "completed";
  const quizPassed = progress.quizPassed;
  const builderCompleted = latestBuilder?.status === "completed";
  const stage = curriculum.stages?.find((item) => item.id === currentLesson.stageId);

  let nextTitle = lessonCompleted ? `${currentLesson.title}を復習して再挑戦する` : `${currentLesson.title}を学ぶ`;
  let nextDescription = lessonCompleted
    ? `Quiz Passには${currentLesson.passScore}/${currentLesson.questionCount}以上が必要です。`
    : `${currentLesson.tier} Lesson ${currentLesson.id}から始めます。`;
  let nextHref = `#/lesson/${currentLesson.id}`;
  if (quizPassed && !builderCompleted) {
    nextTitle = "Guided Builderに取り組む";
    nextDescription = `${currentLesson.title}を設計実践で確認します。`;
    nextHref = `#/builder/${currentLesson.id}`;
  } else if (quizPassed && builderCompleted) {
    nextTitle = "次のLessonは未実装";
    nextDescription = "現在利用できるTraining Loopは完了しています。";
    nextHref = null;
  }

  setScreen(`
    <section class="screen">
      <div class="hero">
        <p class="eyebrow">FOUNDATION TRAINING</p>
        <h1>Loopを設計できる力を、ひとつずつ。</h1>
        <p class="lead">Lessonで理解し、Quizで確かめ、Builderで使う。Training Loopをひとつずつ完成させましょう。</p>
        <div class="button-row"><a class="button" href="#/lesson/${currentLesson.id}">${lessonCompleted ? `Lesson ${currentLesson.id}を復習する` : `Lesson ${currentLesson.id}を始める`}</a></div>
      </div>

      <div class="grid">
        <section class="card">
          <p class="eyebrow">NEXT ACTION</p>
          <h2>${escapeHtml(nextTitle)}</h2>
          <p class="muted">${escapeHtml(nextDescription)}</p>
          ${weakConcepts.length ? `<p class="muted">Review候補</p><div>${weakConcepts.map((name) => `<span class="tag weak">${escapeHtml(name)}</span>`).join("")}</div>` : ""}
          ${nextHref ? `<div class="button-row"><a class="button button-secondary" href="${nextHref}">確認する</a></div>` : ""}
        </section>

        <section class="card card-accent">
          <p class="eyebrow">CURRENT POSITION</p>
          <div class="stat"><strong>${passedLessons}</strong><span>/ ${curriculum.curriculumSize} Lessons Passed</span></div>
          <div class="progress" aria-label="CORE Lesson進捗"><span style="width:${Math.round((passedLessons / curriculum.curriculumSize) * 100)}%"></span></div>
          <p class="muted">${stage ? `${escapeHtml(stage.id)}｜${escapeHtml(stage.title)}<br>` : ""}Current: Lesson ${currentLesson.id}<br>Quiz Best: ${progress.bestScore} / ${currentLesson.questionCount}<br>Guided Builder: ${builderCompleted ? "completed" : latestBuilder ? "needs review" : "unstarted"}</p>
          ${quizPassed && builderCompleted ? `<p><strong>次のLessonは未実装です。</strong></p>` : ""}
        </section>
      </div>
    </section>
  `);
}

function renderLesson(lesson) {
  updateState((state) => {
    const progress = getProgress(state, lesson.id);
    if (progress.lessonStatus === "unstarted") progress.lessonStatus = "learning";
    state.lessonProgress[lesson.id] = progress;
  });
  const content = lesson.content;
  setScreen(`
    <article class="screen narrow">
      <p class="eyebrow">${escapeHtml(lesson.tier)} LESSON ${escapeHtml(lesson.id)}</p>
      <h1>${escapeHtml(lesson.title)}</h1>
      <p class="lead">${escapeHtml(content.summary)}</p>
      <section class="lesson-body"><h2>学習目標</h2><ul>${content.objectives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section class="lesson-body"><h2>定義</h2><p>${escapeHtml(content.definition)}</p></section>
      ${content.flow?.length ? `<div class="loop-flow" aria-label="${escapeHtml(lesson.title)}の基本構造">${content.flow.map((node) => `<div class="loop-node">${escapeHtml(node.label)}<span>${escapeHtml(node.caption)}</span></div>`).join("")}</div>` : ""}
      <section class="lesson-body"><h2>例</h2><ul>${content.examples.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section class="lesson-body"><h2>間違いやすい例</h2><ul>${content.commonMistakes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <section class="lesson-body"><h2>Key Points</h2><ul>${content.keyPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      <div class="button-row"><button class="button" id="start-quiz">${lesson.questionCount}問Quizへ進む</button><a class="button button-secondary" href="#/home">Homeへ戻る</a></div>
    </article>
  `);
  document.querySelector("#start-quiz").addEventListener("click", () => {
    quizSession = { lessonId: lesson.id, index: 0, answers: {}, attemptId: createAttemptId() };
    navigate(`#/quiz/${lesson.id}`);
  });
}

function renderQuiz(lesson) {
  if (quizSession.lessonId !== lesson.id) {
    quizSession = { lessonId: lesson.id, index: 0, answers: {}, attemptId: createAttemptId() };
  }
  const questions = lesson.quiz.questions;
  const question = questions[quizSession.index];
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">LESSON ${escapeHtml(lesson.id)} QUIZ</p>
      <div class="step-indicator">Question ${quizSession.index + 1} / ${lesson.questionCount}</div>
      <form class="question" id="quiz-form">
        <h1>${escapeHtml(question.prompt)}</h1>
        <div class="options">${question.options.map((option) => `<label class="option"><input type="radio" name="answer" value="${escapeHtml(option.id)}" required><span>${escapeHtml(option.label)}</span></label>`).join("")}</div>
        <div class="button-row"><button class="button" type="submit">${quizSession.index === lesson.questionCount - 1 ? "採点する" : "次の問題"}</button></div>
      </form>
    </section>
  `);
  document.querySelector("#quiz-form").addEventListener("submit", (event) => {
    event.preventDefault();
    quizSession.answers[question.id] = new FormData(event.currentTarget).get("answer");
    if (quizSession.index < lesson.questionCount - 1) {
      quizSession.index += 1;
      renderQuiz(lesson);
      return;
    }
    latestQuizResult = scoreQuiz(questions, quizSession.answers, getQuizConfig(lesson));
    updateState((state) => applyQuizResult(state, latestQuizResult, { lessonId: lesson.id, attemptId: quizSession.attemptId }));
    navigate(`#/result/${lesson.id}`);
  });
}

function getLatestAttemptResult(lesson) {
  const state = loadState();
  const lessonHistory = state.questionHistory.filter((item) => item.lessonId === lesson.id);
  const attemptId = getProgress(state, lesson.id).lastAttemptId || lessonHistory.at(-1)?.attemptId;
  if (!attemptId) return null;
  const attempt = lessonHistory.filter((item) => item.attemptId === attemptId);
  if (attempt.length !== lesson.questionCount) return null;
  const answers = Object.fromEntries(attempt.map((item) => [item.questionId, item.selected]));
  return scoreQuiz(lesson.quiz.questions, answers, getQuizConfig(lesson));
}

function renderResult(lesson) {
  const result = latestQuizResult && quizSession.lessonId === lesson.id ? latestQuizResult : getLatestAttemptResult(lesson);
  if (!result) return navigate(`#/lesson/${lesson.id}`);
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">LESSON ${escapeHtml(lesson.id)} · QUIZ RESULT</p>
      <h1>${result.passed ? "Pass — 基本を理解しています" : "Reviewして、もう一度つなげよう"}</h1>
      <div class="score-ring"><div><strong>${result.score}</strong><span> / ${lesson.questionCount}</span></div></div>
      <p class="notice ${result.passed ? "notice-success" : "notice-warning"}">${lesson.questionCount}問回答完了によりLesson ${escapeHtml(lesson.id)}はcompletedです。${result.passed ? `${lesson.passScore}/${lesson.questionCount}以上のためQuiz Passです。` : `Quiz Passには${lesson.passScore}/${lesson.questionCount}以上が必要です。`}</p>
      <p class="muted">Concept Stateを更新しました。正答Conceptは初回理解、誤答ConceptはRetention Review候補（weak / R0）として記録されています。Quizだけでstableにはなりません。</p>
      <ul class="result-list">${result.results.map(({ question, selected, correct }) => {
        const selectedOption = question.options.find((option) => option.id === selected);
        return `<li class="result-item ${correct ? "correct" : "incorrect"}"><p><strong>${correct ? "正解" : "要Review"}：</strong>${escapeHtml(question.prompt)}</p><p><strong>選んだ回答：</strong>${escapeHtml(selectedOption?.label || "未回答")}</p><p class="muted">${escapeHtml(selectedOption?.feedback || "")}</p>${correct ? "" : `<p><strong>正解理由：</strong>${escapeHtml(question.explanation)}</p>`}</li>`;
      }).join("")}</ul>
      <div class="button-row"><a class="button" href="#/builder/${lesson.id}">Guided Builderへ進む</a><a class="button button-secondary" href="#/lesson/${lesson.id}">Lessonを見直す</a></div>
    </section>
  `);
}

function renderBuilder(lesson) {
  const builder = lesson.miniBuilder;
  const state = loadState();
  const existingBuilder = getLatestBuilder(state, lesson.id);
  const fields = existingBuilder?.fields || {};
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">LESSON ${escapeHtml(lesson.id)} · GUIDED BUILDER</p>
      <h1>${escapeHtml(builder.title)}</h1>
      <div class="card card-accent"><p class="eyebrow">THEME</p><h2>${escapeHtml(builder.theme)}</h2><p>${escapeHtml(builder.intro)}</p></div>
      <form id="builder-form" class="card">
        ${builder.steps.map((step) => renderBuilderStep(step, fields[step.id])).join("")}
        <button class="button button-block" type="submit">Loopを確認する</button>
      </form>
    </section>
  `);
  document.querySelector("#builder-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submittedFields = Object.fromEntries(builder.steps.map((step) => [step.id, form.get(step.id)]));
    const weaknesses = detectBuilderWeakness(submittedFields, builder.weaknessRules);
    updateState((nextState) => saveBuilderResult(nextState, submittedFields, weaknesses, {
      lessonId: lesson.id,
      theme: builder.theme,
      builderId: existingBuilder?.id
    }));
    navigate(`#/weakness/${lesson.id}`);
  });
}

function renderBuilderStep(step, selectedValue) {
  if (step.type !== "single_choice") {
    return `<p class="notice notice-warning">このBuilder Step形式はまだ利用できません。</p>`;
  }
  return `<fieldset class="builder-step"><legend>${escapeHtml(step.label)}</legend><p class="muted">${escapeHtml(step.prompt)}</p><div class="options">${step.options.map((option) => `<label class="option"><input type="radio" name="${escapeHtml(step.id)}" value="${escapeHtml(option.id)}" ${selectedValue === option.id ? "checked" : ""} required><span>${escapeHtml(option.label)}</span></label>`).join("")}</div></fieldset>`;
}

function renderWeakness(lesson) {
  const state = loadState();
  const project = getLatestBuilder(state, lesson.id);
  if (!project) return navigate(`#/builder/${lesson.id}`);
  const weaknesses = state.builderWeaknessEvents.filter((event) => event.builderId === project.id);
  const completed = project.status === "completed";
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">LESSON ${escapeHtml(lesson.id)} · WEAKNESS DETECTION</p>
      <h1>${completed ? "Guided Builderが成立しています" : "設計に不足があります"}</h1>
      <p class="notice ${completed ? "notice-success" : "notice-danger"}">${completed ? `すべてのStepが適切に接続され、Lesson ${escapeHtml(lesson.id)} Guided Builderはcompletedです。` : `${weaknesses.length}件のWeaknessを記録しました。`}</p>
      ${completed ? `<div class="loop-flow">${lesson.miniBuilder.steps.map((step) => `<div class="loop-node">${escapeHtml(step.label.replace(/^\S+\s/, ""))}</div>`).join("")}</div>` : `<ul class="review-list">${weaknesses.map((item) => `<li><span class="tag weak">${escapeHtml(item.code)}</span><p>${escapeHtml(item.message)}</p></li>`).join("")}</ul>`}
      <div class="button-row"><a class="button" href="#/home">Homeへ戻る</a><a class="button button-secondary" href="#/builder/${lesson.id}">Builderを修正する</a></div>
    </section>
  `);
}

function renderLessonNotFound(lessonId) {
  setScreen(`<section class="screen narrow"><p class="eyebrow">LESSON NOT FOUND</p><h1>Lesson ${escapeHtml(lessonId)}は未実装です</h1><p>現在利用できるLessonから学習を続けてください。</p><div class="button-row"><a class="button" href="#/home">Homeへ戻る</a></div></section>`);
}

function renderError(message = "コンテンツを読み込めませんでした") {
  setScreen(`<section class="screen narrow"><p class="eyebrow">ERROR</p><h1>${escapeHtml(message)}</h1><p>ページを再読み込みしてください。</p></section>`);
}

function parseRoute(hash) {
  if (!hash || hash === "#/home") return { screen: "home" };
  const match = hash.match(/^#\/(lesson|quiz|result|builder|weakness)\/([^/]+)$/);
  return match ? { screen: match[1], lessonId: decodeURIComponent(match[2]) } : { screen: "home" };
}

function route() {
  const hash = window.location.hash || "#/home";
  const parsed = parseRoute(hash);
  if (parsed.screen === "home") {
    renderHome();
  } else {
    const lesson = lessons.get(parsed.lessonId);
    if (!lesson) renderLessonNotFound(parsed.lessonId);
    else if (parsed.screen === "lesson") renderLesson(lesson);
    else if (parsed.screen === "quiz") renderQuiz(lesson);
    else if (parsed.screen === "result") renderResult(lesson);
    else if (parsed.screen === "builder") renderBuilder(lesson);
    else renderWeakness(lesson);
  }
  const state = loadState();
  state.currentPosition = hash;
  saveState(state);
  syncStorageAlert();
}

async function start() {
  try {
    app.append(document.querySelector("#loading-template").content.cloneNode(true));
    curriculum = await loadTrainingData();
    lessons = new Map(curriculum.loadedLessons.map((lesson) => [lesson.id, lesson]));
    window.addEventListener("blanseed:storage-error", (event) => syncStorageAlert(event.detail));
    window.addEventListener("hashchange", route);
    route();
  } catch (error) {
    console.error(error);
    renderError();
  }
}

start();
