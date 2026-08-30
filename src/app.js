import { getStorageError, loadState, saveState, updateState } from "./store.js";
import { applyQuizResult, detectBuilderWeakness, saveBuilderResult, scoreQuiz } from "./training.js";

const app = document.querySelector("#app");
let lesson;
let quizSession = { index: 0, answers: {}, attemptId: null };
let latestQuizResult = null;
let latestWeaknesses = [];

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function loadLesson() {
  const response = await fetch("./data/lesson-01.json");
  if (!response.ok) throw new Error("Lesson data could not be loaded");
  return response.json();
}

function navigate(hash) {
  window.location.hash = hash;
}

function createAttemptId() {
  return globalThis.crypto?.randomUUID?.() || `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getQuizConfig() {
  return { passScore: lesson.passScore, questionCount: lesson.questionCount };
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
  const progress = state.lessonProgress["01"];
  const weakConcepts = Object.entries(state.conceptStates)
    .filter(([, concept]) => concept.retentionState === "weak")
    .map(([id]) => lesson.concepts[id] || id);
  const latestBuilder = state.builderProjects.filter((project) => project.lessonId === lesson.id).at(-1);
  const completed = progress.lessonStatus === "completed";

  setScreen(`
    <section class="screen">
      <div class="hero">
        <p class="eyebrow">FOUNDATION TRAINING</p>
        <h1>Loopを設計できる力を、ひとつずつ。</h1>
        <p class="lead">Lessonで理解し、Quizで確かめ、Builderで使う。最初のTraining Loopを完成させましょう。</p>
        <div class="button-row">
          <a class="button" href="#/lesson/01">${completed ? "Lesson 01を復習する" : "Lesson 01を始める"}</a>
        </div>
      </div>

      <div class="grid">
        <section class="card">
          <p class="eyebrow">NEXT ACTION</p>
          <h2>${weakConcepts.length ? "弱いConceptを確認する" : completed ? "Mini Builderに取り組む" : "Loopの基本を学ぶ"}</h2>
          <p class="muted">${weakConcepts.length ? `${weakConcepts.length}件のReview候補があります。` : "Lesson 01「Loopとは何か」から始めます。"}</p>
          ${weakConcepts.length ? `<div>${weakConcepts.map((name) => `<span class="tag weak">${escapeHtml(name)}</span>`).join("")}</div>` : ""}
          <div class="button-row">
            <a class="button button-secondary" href="${weakConcepts.length ? "#/result/01" : completed ? "#/builder/mini" : "#/lesson/01"}">確認する</a>
          </div>
        </section>

        <section class="card card-accent">
          <p class="eyebrow">CURRENT POSITION</p>
          <div class="stat"><strong>${completed ? "1" : "0"}</strong><span>/ 20 Lessons</span></div>
          <div class="progress" aria-label="CORE Lesson進捗"><span style="width:${completed ? 5 : 0}%"></span></div>
          <p class="muted">Quiz Best: ${progress.bestScore} / 5<br>Mini Builder: ${latestBuilder?.status === "completed" ? "completed" : latestBuilder ? "needs review" : "unstarted"}</p>
        </section>
      </div>
    </section>
  `);
}

function renderLesson() {
  updateState((state) => {
    if (state.lessonProgress[lesson.id].lessonStatus === "unstarted") {
      state.lessonProgress[lesson.id].lessonStatus = "learning";
    }
  });
  setScreen(`
    <article class="screen narrow">
      <p class="eyebrow">CORE LESSON 01</p>
      <h1>${escapeHtml(lesson.title)}</h1>
      <p class="lead">${escapeHtml(lesson.summary)}</p>
      <div class="loop-flow" aria-label="Loopの最小構造">
        <div class="loop-node">Observation<span>状態を観測</span></div>
        <div class="loop-node">Action<span>状態へ働きかける</span></div>
        <div class="loop-node">Re-Observation<span>結果を再観測</span></div>
      </div>
      ${lesson.sections.map((section) => `<section class="lesson-body"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`).join("")}
      <div class="button-row"><button class="button" id="start-quiz">${lesson.questionCount}問Quizへ進む</button><a class="button button-secondary" href="#/home">Homeへ戻る</a></div>
    </article>
  `);
  document.querySelector("#start-quiz").addEventListener("click", () => {
    quizSession = { index: 0, answers: {}, attemptId: createAttemptId() };
    navigate("#/quiz/01");
  });
}

function renderQuiz() {
  quizSession.attemptId ||= createAttemptId();
  const question = lesson.questions[quizSession.index];
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">LESSON 01 QUIZ</p>
      <div class="step-indicator">Question ${quizSession.index + 1} / ${lesson.questionCount}</div>
      <form class="question" id="quiz-form">
        <h1>${escapeHtml(question.prompt)}</h1>
        <div class="options">
          ${question.options.map((option) => `
            <label class="option"><input type="radio" name="answer" value="${option.id}" required><span>${escapeHtml(option.label)}</span></label>
          `).join("")}
        </div>
        <div class="button-row"><button class="button" type="submit">${quizSession.index === lesson.questionCount - 1 ? "採点する" : "次の問題"}</button></div>
      </form>
    </section>
  `);
  document.querySelector("#quiz-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const answer = new FormData(event.currentTarget).get("answer");
    quizSession.answers[question.id] = answer;
    if (quizSession.index < lesson.questionCount - 1) {
      quizSession.index += 1;
      renderQuiz();
      return;
    }
    latestQuizResult = scoreQuiz(lesson.questions, quizSession.answers, getQuizConfig());
    updateState((state) => applyQuizResult(state, latestQuizResult, {
      lessonId: lesson.id,
      attemptId: quizSession.attemptId
    }));
    navigate("#/result/01");
  });
}

function getLatestAttemptResult() {
  const state = loadState();
  const lessonHistory = state.questionHistory.filter((item) => item.lessonId === lesson.id);
  const attemptId = state.lessonProgress[lesson.id]?.lastAttemptId || lessonHistory.at(-1)?.attemptId;
  if (!attemptId) return null;
  const attempt = lessonHistory.filter((item) => item.attemptId === attemptId);
  if (attempt.length !== lesson.questionCount) return null;
  const answers = Object.fromEntries(attempt.map((item) => [item.questionId, item.selected]));
  return scoreQuiz(lesson.questions, answers, getQuizConfig());
}

function renderResult() {
  const result = latestQuizResult || getLatestAttemptResult();
  if (!result) return navigate("#/lesson/01");
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">QUIZ RESULT</p>
      <h1>${result.passed ? "Pass — 基本を理解しています" : "Reviewして、もう一度つなげよう"}</h1>
      <div class="score-ring"><div><strong>${result.score}</strong><span> / 5</span></div></div>
      <p class="notice ${result.passed ? "notice-success" : "notice-warning"}">${lesson.questionCount}問回答完了によりLesson 01はcompletedです。${result.passed ? `${lesson.passScore}/${lesson.questionCount}以上のためQuiz Passです。` : `Quiz Passには${lesson.passScore}/${lesson.questionCount}以上が必要です。`}</p>
      <p class="muted">Concept Stateを更新しました。正答Conceptは初回理解、誤答ConceptはRetention Review候補（weak / R0）として記録されています。Quizだけでstableにはなりません。</p>
      <ul class="result-list">
        ${result.results.map(({ question, selected, correct }) => {
          const selectedOption = question.options.find((option) => option.id === selected);
          return `<li class="result-item ${correct ? "correct" : "incorrect"}">
            <p><strong>${correct ? "正解" : "要Review"}：</strong>${escapeHtml(question.prompt)}</p>
            <p><strong>選んだ回答：</strong>${escapeHtml(selectedOption?.label || "未回答")}</p>
            <p class="muted">${escapeHtml(selectedOption?.feedback || "")}</p>
            ${correct ? "" : `<p><strong>正解理由：</strong>${escapeHtml(question.explanation)}</p>`}
          </li>`;
        }).join("")}
      </ul>
      <div class="button-row"><a class="button" href="#/builder/mini">Mini Builderへ進む</a><a class="button button-secondary" href="#/lesson/01">Lessonを見直す</a></div>
    </section>
  `);
}

function renderBuilder() {
  const state = loadState();
  const existingBuilder = state.builderProjects.filter((project) => project.lessonId === lesson.id).at(-1);
  const fields = existingBuilder?.fields || { observation: "", action: "", reObservation: "" };
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">LESSON 01 · MINI BUILDER</p>
      <h1>Loopを成立させる</h1>
      <div class="card card-accent"><p class="eyebrow">THEME</p><h2>${escapeHtml(lesson.miniBuilder.theme)}</h2><p>候補を選び、Observation・Action・Re-Observationをつないでください。</p></div>
      <form id="builder-form" class="card">
        ${lesson.miniBuilder.steps.map((step) => `
          <fieldset class="builder-step">
            <legend>${escapeHtml(step.label)}</legend>
            <p class="muted">${escapeHtml(step.prompt)}</p>
            <div class="options">
              ${step.options.map((option) => `<label class="option"><input type="radio" name="${escapeHtml(step.id)}" value="${escapeHtml(option.id)}" ${fields[step.id] === option.id ? "checked" : ""} required><span>${escapeHtml(option.label)}</span></label>`).join("")}
            </div>
          </fieldset>
        `).join("")}
        <button class="button button-block" type="submit">Loopを確認する</button>
      </form>
    </section>
  `);
  document.querySelector("#builder-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = {
      observation: form.get("observation"),
      action: form.get("action"),
      reObservation: form.get("reObservation")
    };
    latestWeaknesses = detectBuilderWeakness(fields, lesson.miniBuilder.steps);
    updateState((state) => saveBuilderResult(state, fields, latestWeaknesses, {
      lessonId: lesson.id,
      theme: lesson.miniBuilder.theme,
      builderId: existingBuilder?.id
    }));
    navigate("#/weakness");
  });
}

function renderWeakness() {
  const state = loadState();
  const latestProject = state.builderProjects.filter((project) => project.lessonId === lesson.id).at(-1);
  if (!latestProject) return navigate("#/builder/mini");
  const weaknesses = latestWeaknesses.length
    ? latestWeaknesses
    : state.builderWeaknessEvents.filter((event) => event.builderId === latestProject.id);
  const completed = latestProject.status === "completed";

  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">WEAKNESS DETECTION</p>
      <h1>${completed ? "Feedback Loopが成立しています" : "Loopに不足があります"}</h1>
      <p class="notice ${completed ? "notice-success" : "notice-danger"}">${completed ? "Observation・Action・Re-Observationの3項目が入力され、Lesson 01 Mini Builderはcompletedです。" : `${weaknesses.length}件のWeaknessを記録しました。`}</p>
      ${completed ? `<div class="loop-flow"><div class="loop-node">Observation</div><div class="loop-node">Action</div><div class="loop-node">Re-Observation</div></div>` : `<ul class="review-list">${weaknesses.map((item) => `<li><span class="tag weak">${escapeHtml(item.code)}</span><p>${escapeHtml(item.message)}</p></li>`).join("")}</ul>`}
      <div class="button-row"><a class="button" href="#/home">Homeへ戻る</a><a class="button button-secondary" href="#/builder/mini">Builderを修正する</a></div>
    </section>
  `);
}

function renderError() {
  setScreen(`<section class="screen narrow"><p class="eyebrow">ERROR</p><h1>コンテンツを読み込めませんでした</h1><p>ページを再読み込みしてください。</p></section>`);
}

function route() {
  const hash = window.location.hash || "#/home";
  const routes = {
    "#/home": renderHome,
    "#/lesson/01": renderLesson,
    "#/quiz/01": renderQuiz,
    "#/result/01": renderResult,
    "#/builder/mini": renderBuilder,
    "#/weakness": renderWeakness
  };
  (routes[hash] || renderHome)();
  const state = loadState();
  state.currentPosition = hash;
  saveState(state);
  syncStorageAlert();
}

async function start() {
  try {
    app.append(document.querySelector("#loading-template").content.cloneNode(true));
    lesson = await loadLesson();
    if (lesson.questions.length !== lesson.questionCount) throw new Error("Question count does not match lesson data");
    window.addEventListener("blanseed:storage-error", (event) => syncStorageAlert(event.detail));
    window.addEventListener("hashchange", route);
    route();
  } catch (error) {
    console.error(error);
    renderError();
  }
}

start();
