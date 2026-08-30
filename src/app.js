import { getStorageError, loadState, saveState, updateState } from "./store.js";
import {
  applyQuizResult,
  applyStageExamResult,
  detectBuilderWeakness,
  evaluateStageExam,
  saveBuilderResult,
  saveStageBuilderResult,
  scoreQuiz
} from "./training.js";

const app = document.querySelector("#app");
let curriculum;
let lessons = new Map();
let stages = new Map();
let quizSession = { lessonId: null, index: 0, answers: {}, attemptId: null };
let latestQuizResult = null;
let stageExamSession = { stageId: null, index: 0, answers: {}, attemptId: null };
let latestStageExamResult = null;

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
  const loadedStages = await Promise.all((catalog.stages || []).map(async (entry) => {
    if (!entry.path) return { ...entry, stageId: entry.id };
    const response = await fetch(entry.path);
    if (!response.ok) throw new Error(`Stage ${entry.id} could not be loaded`);
    const stage = await response.json();
    validateStage(stage, entry.id);
    return stage;
  }));
  return { ...catalog, loadedLessons, loadedStages };
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

function validateStage(stage, expectedId) {
  const required = ["stageId", "title", "lessonIds", "exam", "guidedBuilder"];
  if (required.some((key) => stage[key] === undefined) || stage.stageId !== expectedId) {
    throw new Error(`Stage ${expectedId} does not match the Training Engine schema`);
  }
  if (!Array.isArray(stage.exam.questions) || stage.exam.questions.length !== stage.exam.questionCount) {
    throw new Error(`Stage ${expectedId} question count does not match its exam data`);
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

function getStageProgress(state, stageId) {
  return state.stageProgress[stageId] || {
    status: "available",
    examStatus: "available",
    builderStatus: "pending",
    bestScore: 0,
    attempts: 0
  };
}

function getLatestStageBuilder(state, stageId) {
  return state.stageBuilderProjects.filter((project) => project.stageId === stageId).at(-1);
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
  const availableStages = [...stages.values()];
  const stageIsComplete = (item) => {
    const itemProgress = getStageProgress(state, item.stageId);
    return ["passed", "passed_with_review"].includes(itemProgress.examStatus) && itemProgress.builderStatus === "completed";
  };
  const stage = availableStages.find((item) => !stageIsComplete(item)) || availableStages.at(-1);
  const stageLessons = stage ? stage.lessonIds.map((id) => lessons.get(id)).filter(Boolean) : availableLessons;
  const currentLesson = stageLessons.find((lesson) => !getProgress(state, lesson.id).quizPassed);
  const displayLesson = currentLesson || stageLessons.at(-1) || availableLessons.at(-1);
  if (!displayLesson) return renderError("利用可能なLessonがありません");

  const progress = getProgress(state, displayLesson.id);
  const passedLessons = availableLessons.filter((lesson) => getProgress(state, lesson.id).quizPassed).length;
  const weakConcepts = Object.entries(state.conceptStates)
    .filter(([, concept]) => concept.retentionState === "weak")
    .map(([id]) => getConceptLabel(id));
  const stageProgress = stage ? getStageProgress(state, stage.stageId) : null;
  const examPassed = ["passed", "passed_with_review"].includes(stageProgress?.examStatus);
  const stageComplete = examPassed && stageProgress?.builderStatus === "completed";
  let nextTitle;
  let nextDescription;
  let nextHref;
  if (currentLesson) {
    const currentProgress = getProgress(state, currentLesson.id);
    nextTitle = currentProgress.lessonStatus === "completed" ? `${currentLesson.title}を復習して再挑戦する` : `${currentLesson.title}を学ぶ`;
    nextDescription = currentProgress.lessonStatus === "completed"
      ? `Quiz Passには${currentLesson.passScore}/${currentLesson.questionCount}以上が必要です。`
      : `${currentLesson.tier} Lesson ${currentLesson.id}から始めます。`;
    nextHref = `#/lesson/${currentLesson.id}`;
  } else if (stage && !stage.exam) {
    nextTitle = `${stage.title} Stage Examは未実装`;
    nextDescription = "このStageのLesson学習は完了しています。Stage Examは次工程で追加します。";
    nextHref = null;
  } else if (stage && !examPassed) {
    nextTitle = stageProgress.examStatus === "review_required" ? `${stage.title} Stage Examを再受験する` : `${stage.title} Stage Examに進む`;
    nextDescription = `${stage.title}の概念を横断して確認します。`;
    nextHref = `#/stage/${stage.stageId}/exam`;
  } else if (stage && stageProgress.builderStatus !== "completed") {
    nextTitle = `${stage.title} Guided Builderに進む`;
    nextDescription = "PurposeからStateまでを1つのテーマで接続します。";
    nextHref = `#/stage/${stage.stageId}/builder`;
  } else {
    nextTitle = `${stage.title} Stage 完了`;
    nextDescription = "次のStageは未実装です。Retention Stableとは別に記録されています。";
    nextHref = null;
  }

  setScreen(`
    <section class="screen">
      <div class="hero">
        <p class="eyebrow">FOUNDATION TRAINING</p>
        <h1>Loopを設計できる力を、ひとつずつ。</h1>
        <p class="lead">Lessonで理解し、Quizで確かめ、Builderで使う。Training Loopをひとつずつ完成させましょう。</p>
        <div class="button-row">${nextHref ? `<a class="button" href="${nextHref}">${escapeHtml(nextTitle)}</a>` : `<span class="tag">Stage Complete</span>`}</div>
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
          <p class="muted">${stage ? `${escapeHtml(stage.stageId)}｜${escapeHtml(stage.title)}<br>` : ""}Current: ${currentLesson ? `Lesson ${currentLesson.id}` : stageComplete ? "Stage Complete" : "Stage Assessment"}<br>Quiz Best: ${progress.bestScore} / ${displayLesson.questionCount}</p>
          ${stage ? `<hr><p><strong>${escapeHtml(stage.tier)}｜${escapeHtml(stage.title)}</strong><br>Lessons：${stage.lessonIds.filter((id) => getProgress(state, id).quizPassed).length} / ${stage.lessonIds.length}<br>Stage Exam：${stageProgress.examStatus === "passed" ? "Passed" : stageProgress.examStatus === "passed_with_review" ? "Passed with Review" : stageProgress.examStatus === "review_required" ? "Review" : stageProgress.examStatus === "learning" ? "Learning" : "Pending"}<br>Stage Builder：${stageProgress.builderStatus === "completed" ? "Completed" : "Pending"}</p>` : ""}
          ${stageComplete ? `<p><strong>次のStageは未実装です。</strong></p>` : ""}
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

function getStageExamConfig(stage) {
  return {
    passScore: stage.exam.passScore,
    questionCount: stage.exam.questionCount,
    criticalConcepts: stage.exam.criticalConcepts
  };
}

function renderStageExam(stage) {
  if (stageExamSession.stageId !== stage.stageId || latestStageExamResult) {
    stageExamSession = { stageId: stage.stageId, index: 0, answers: {}, attemptId: createAttemptId() };
    latestStageExamResult = null;
  }
  updateState((state) => {
    const progress = getStageProgress(state, stage.stageId);
    if (["available", "review_required"].includes(progress.status)) {
      progress.status = "learning";
      progress.examStatus = "learning";
    }
    state.stageProgress[stage.stageId] = progress;
  });
  const question = stage.exam.questions[stageExamSession.index];
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">${escapeHtml(stage.stageId)} · STAGE EXAM</p>
      <div class="step-indicator">Question ${stageExamSession.index + 1} / ${stage.exam.questionCount}</div>
      <form class="question" id="stage-exam-form">
        <h1>${escapeHtml(question.prompt)}</h1>
        <div class="options">${question.options.map((option) => `<label class="option"><input type="radio" name="answer" value="${escapeHtml(option.id)}" required><span>${escapeHtml(option.label)}</span></label>`).join("")}</div>
        <div class="button-row"><button class="button" type="submit">${stageExamSession.index === stage.exam.questionCount - 1 ? "採点する" : "次の問題"}</button></div>
      </form>
    </section>
  `);
  document.querySelector("#stage-exam-form").addEventListener("submit", (event) => {
    event.preventDefault();
    stageExamSession.answers[question.id] = new FormData(event.currentTarget).get("answer");
    if (stageExamSession.index < stage.exam.questionCount - 1) {
      stageExamSession.index += 1;
      renderStageExam(stage);
      return;
    }
    latestStageExamResult = evaluateStageExam(stage.exam.questions, stageExamSession.answers, getStageExamConfig(stage));
    updateState((state) => applyStageExamResult(state, latestStageExamResult, { stageId: stage.stageId, attemptId: stageExamSession.attemptId }));
    navigate(`#/stage/${stage.stageId}/result`);
  });
}

function getLatestStageExamResult(stage) {
  const state = loadState();
  const progress = getStageProgress(state, stage.stageId);
  const attemptId = progress.lastAttemptId;
  if (!attemptId) return null;
  const attempt = state.stageExamHistory.filter((item) => item.stageId === stage.stageId && item.attemptId === attemptId);
  if (attempt.length !== stage.exam.questionCount) return null;
  const answers = Object.fromEntries(attempt.map((item) => [item.questionId, item.selected]));
  return evaluateStageExam(stage.exam.questions, answers, getStageExamConfig(stage));
}

function renderStageExamResult(stage) {
  const result = latestStageExamResult && stageExamSession.stageId === stage.stageId
    ? latestStageExamResult
    : getLatestStageExamResult(stage);
  if (!result) return navigate(`#/stage/${stage.stageId}/exam`);
  const statusLabels = {
    passed: "Passed — Stageの概念を区別できています",
    passed_with_review: "Passed with Review — Critical Conceptを確認しましょう",
    review_required: "Review Required — Stage Lessonを復習しましょう"
  };
  const canBuild = ["passed", "passed_with_review"].includes(result.status);
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">${escapeHtml(stage.stageId)} · EXAM RESULT</p>
      <h1>${escapeHtml(statusLabels[result.status])}</h1>
      <div class="score-ring"><div><strong>${result.score}</strong><span> / ${stage.exam.questionCount}</span></div></div>
      <p class="notice ${result.status === "passed" ? "notice-success" : "notice-warning"}">Status：${escapeHtml(result.status)}。基本合格は${stage.exam.passScore}/${stage.exam.questionCount}以上です。</p>
      ${result.missedCriticalConcepts.length ? `<p class="notice notice-warning">Critical Concept Review：${result.missedCriticalConcepts.map((id) => escapeHtml(stage.exam.criticalConcepts.find((concept) => concept.id === id)?.label || id)).join("、")}</p>` : ""}
      <p class="muted">Stage ExamはLesson CompletionおよびRetention Stateとは別に保存されます。</p>
      <ul class="result-list">${result.results.map(({ question, selected, correct }) => {
        const selectedOption = question.options.find((option) => option.id === selected);
        return `<li class="result-item ${correct ? "correct" : "incorrect"}"><p><strong>${correct ? "正解" : "要Review"}：</strong>${escapeHtml(question.prompt)}</p><p><strong>選んだ回答：</strong>${escapeHtml(selectedOption?.label || "未回答")}</p><p class="muted">${escapeHtml(selectedOption?.feedback || "")}</p>${correct ? "" : `<p><strong>正解理由：</strong>${escapeHtml(question.explanation)}</p>`}</li>`;
      }).join("")}</ul>
      <div class="button-row">${canBuild ? `<a class="button" href="#/stage/${stage.stageId}/builder">Stage Guided Builderへ進む</a>` : `<a class="button" href="#/stage/${stage.stageId}/exam">再受験する</a>`}<a class="button button-secondary" href="#/home">Homeへ戻る</a></div>
    </section>
  `);
}

function renderStageBuilder(stage) {
  const builder = stage.guidedBuilder;
  const state = loadState();
  const existingBuilder = getLatestStageBuilder(state, stage.stageId);
  const fields = existingBuilder?.fields || {};
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">${escapeHtml(stage.stageId)} · GUIDED BUILDER</p>
      <h1>${escapeHtml(builder.title)}</h1>
      <div class="card card-accent"><p class="eyebrow">THEME</p><h2>${escapeHtml(builder.theme)}</h2><p>${escapeHtml(builder.intro)}</p></div>
      <form id="stage-builder-form" class="card">
        ${builder.steps.map((step) => renderBuilderStep(step, fields[step.id])).join("")}
        <button class="button button-block" type="submit">構造を確認する</button>
      </form>
    </section>
  `);
  document.querySelector("#stage-builder-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submittedFields = Object.fromEntries(builder.steps.map((step) => [step.id, form.get(step.id)]));
    const weaknesses = detectBuilderWeakness(submittedFields, builder.weaknessRules);
    updateState((nextState) => saveStageBuilderResult(nextState, submittedFields, weaknesses, {
      stageId: stage.stageId,
      builder,
      builderProjectId: existingBuilder?.id
    }));
    navigate(`#/stage/${stage.stageId}/weakness`);
  });
}

function renderStageBuilderWeakness(stage) {
  const state = loadState();
  const project = getLatestStageBuilder(state, stage.stageId);
  if (!project) return navigate(`#/stage/${stage.stageId}/builder`);
  const weaknesses = state.stageBuilderWeaknessEvents.filter((event) => event.builderProjectId === project.id);
  const completed = project.status === "completed";
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">${escapeHtml(stage.stageId)} · BUILDER RESULT</p>
      <h1>${completed ? `${escapeHtml(stage.title)} Guided Builderが完成しました` : "構造にReview項目があります"}</h1>
      <p class="notice ${completed ? "notice-success" : "notice-danger"}">${completed ? "PurposeからStateまでの5要素が適切に接続されています。" : `${weaknesses.length}件のWeaknessを保存しました。`}</p>
      ${completed ? `<div class="loop-flow stage-flow">${stage.guidedBuilder.steps.map((step) => `<div class="loop-node">${escapeHtml(step.label.replace(/^Step \d+｜/, ""))}</div>`).join("")}</div><p class="muted">Stage CompleteはRetention Stableとは別の状態です。</p>` : `<ul class="review-list">${weaknesses.map((item) => `<li><span class="tag weak">${escapeHtml(item.code)}</span><p>${escapeHtml(item.message)}</p></li>`).join("")}</ul>`}
      <div class="button-row"><a class="button" href="#/home">Homeへ戻る</a><a class="button button-secondary" href="#/stage/${stage.stageId}/builder">Builderを修正する</a></div>
    </section>
  `);
}

function renderStageNotFound(stageId) {
  setScreen(`<section class="screen narrow"><p class="eyebrow">STAGE NOT FOUND</p><h1>${escapeHtml(stageId)}は未実装です</h1><p>現在利用できるStageから続けてください。</p><div class="button-row"><a class="button" href="#/home">Homeへ戻る</a></div></section>`);
}

function renderStageFeatureNotFound(stage, feature) {
  setScreen(`<section class="screen narrow"><p class="eyebrow">${escapeHtml(stage.stageId)} · NOT IMPLEMENTED</p><h1>${escapeHtml(stage.title)} ${escapeHtml(feature)}は未実装です</h1><p>このStageで利用可能なLesson学習を続けてください。</p><div class="button-row"><a class="button" href="#/home">Homeへ戻る</a></div></section>`);
}

function renderLessonNotFound(lessonId) {
  setScreen(`<section class="screen narrow"><p class="eyebrow">LESSON NOT FOUND</p><h1>Lesson ${escapeHtml(lessonId)}は未実装です</h1><p>現在利用できるLessonから学習を続けてください。</p><div class="button-row"><a class="button" href="#/home">Homeへ戻る</a></div></section>`);
}

function renderError(message = "コンテンツを読み込めませんでした") {
  setScreen(`<section class="screen narrow"><p class="eyebrow">ERROR</p><h1>${escapeHtml(message)}</h1><p>ページを再読み込みしてください。</p></section>`);
}

function parseRoute(hash) {
  if (!hash || hash === "#/home") return { screen: "home" };
  const lessonMatch = hash.match(/^#\/(lesson|quiz|result|builder|weakness)\/([^/]+)$/);
  if (lessonMatch) return { screen: lessonMatch[1], lessonId: decodeURIComponent(lessonMatch[2]) };
  const stageMatch = hash.match(/^#\/stage\/([^/]+)\/(exam|result|builder|weakness)$/);
  return stageMatch ? { screen: `stage-${stageMatch[2]}`, stageId: decodeURIComponent(stageMatch[1]) } : { screen: "home" };
}

function route() {
  const hash = window.location.hash || "#/home";
  const parsed = parseRoute(hash);
  if (parsed.screen === "home") {
    renderHome();
  } else if (parsed.lessonId) {
    const lesson = lessons.get(parsed.lessonId);
    if (!lesson) renderLessonNotFound(parsed.lessonId);
    else if (parsed.screen === "lesson") renderLesson(lesson);
    else if (parsed.screen === "quiz") renderQuiz(lesson);
    else if (parsed.screen === "result") renderResult(lesson);
    else if (parsed.screen === "builder") renderBuilder(lesson);
    else renderWeakness(lesson);
  } else {
    const stage = stages.get(parsed.stageId);
    if (!stage) renderStageNotFound(parsed.stageId);
    else if (["stage-exam", "stage-result"].includes(parsed.screen) && !stage.exam) renderStageFeatureNotFound(stage, "Stage Exam");
    else if (["stage-builder", "stage-weakness"].includes(parsed.screen) && !stage.guidedBuilder) renderStageFeatureNotFound(stage, "Guided Builder");
    else if (parsed.screen === "stage-exam") renderStageExam(stage);
    else if (parsed.screen === "stage-result") renderStageExamResult(stage);
    else if (parsed.screen === "stage-builder") renderStageBuilder(stage);
    else renderStageBuilderWeakness(stage);
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
    stages = new Map(curriculum.loadedStages.map((stage) => [stage.stageId, stage]));
    window.addEventListener("blanseed:storage-error", (event) => syncStorageAlert(event.detail));
    window.addEventListener("hashchange", route);
    route();
  } catch (error) {
    console.error(error);
    renderError();
  }
}

start();
