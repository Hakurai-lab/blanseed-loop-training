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

const CONCEPT_JAPANESE = new Map([
  ["Feedback Loop", "フィードバックループ"],
  ["Current State", "現在の状態"],
  ["Target State", "目標の状態"],
  ["Evaluation Rule", "評価ルール"],
  ["State Update", "状態の更新"],
  ["Re-Observation", "再観測"],
  ["Re-Evaluation", "再評価"],
  ["New Observation", "新しい観測"],
  ["Test Action", "試す行動"],
  ["Expected Result", "期待する結果"],
  ["Success Condition", "成功条件"],
  ["Learning Candidate", "学習候補"],
  ["Human Review", "人による確認"],
  ["Reusable Knowledge", "再利用できる知識"],
  ["Verified Fact", "検証済みの事実"],
  ["AI Output", "AIの出力"],
  ["Next Decision", "次の判断"],
  ["Interpretation", "解釈"],
  ["Intervention", "介入"],
  ["Observation", "観測"],
  ["Evaluation", "評価"],
  ["Hypothesis", "仮説"],
  ["Experiment", "実験"],
  ["Correlation", "相関"],
  ["Causation", "因果関係"],
  ["Confounder", "交絡要因"],
  ["Threshold", "判定の境目"],
  ["Workflow", "作業の流れ"],
  ["Feedback", "結果を次へ返す接続"],
  ["Evidence", "証拠"],
  ["Purpose", "目的"],
  ["Current", "現在"],
  ["Target", "目標"],
  ["Action", "行動"],
  ["Result", "結果"],
  ["State", "状態"],
  ["Evaluate", "評価する"],
  ["Fact", "事実"],
  ["Test", "検証"],
  ["Gap", "差"],
  ["Rule", "ルール"],
  ["Loop", "循環"]
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function localizeConcepts(value = "") {
  let text = String(value);
  const entries = [...CONCEPT_JAPANESE.entries()].sort(([a], [b]) => b.length - a.length);
  entries.forEach(([english, japanese]) => {
    const reversed = new RegExp(`(?<![A-Za-z])${escapeRegExp(english)}（([^（）]*[ぁ-んァ-ヶ一-龠][^（）]*)）`, "g");
    text = text.replace(reversed, (_, meaning) => `${meaning}（${english}）`);
    const asciiReversed = new RegExp(`(?<![A-Za-z])${escapeRegExp(english)}\\(([^()]*[ぁ-んァ-ヶ一-龠][^()]*)\\)`, "g");
    text = text.replace(asciiReversed, (_, meaning) => `${meaning}（${english}）`);
  });
  const protectedSegments = [];
  text = text.replace(/（[A-Za-z][A-Za-z\s\-\/]*）/g, (segment) => {
    protectedSegments.push(segment);
    return `@@CONCEPT_${protectedSegments.length - 1}@@`;
  });
  const terms = entries.map(([english]) => escapeRegExp(english)).join("|");
  const standalone = new RegExp(`(?<![A-Za-z])(?:${terms})(?![A-Za-z])`, "g");
  text = text.replace(standalone, (english) => `${CONCEPT_JAPANESE.get(english)}（${english}）`);
  return text.replace(/@@CONCEPT_(\d+)@@/g, (_, index) => protectedSegments[Number(index)]);
}

const escapeLiteral = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const escapeHtml = (value = "") => escapeLiteral(localizeConcepts(value));
const conceptDisplay = (english, japanese = CONCEPT_JAPANESE.get(english) || english) => `${escapeLiteral(japanese)}（${escapeLiteral(english)}）`;

const emptyProgress = () => ({ lessonStatus: "unstarted", quizPassed: false, bestScore: 0, attempts: 0 });

async function loadTrainingData() {
  const catalogResponse = await fetch("./data/lessons.json", { cache: "no-cache" });
  if (!catalogResponse.ok) throw new Error("Lesson catalog could not be loaded");
  const catalog = await catalogResponse.json();
  const loadedLessons = await Promise.all(catalog.lessons.map(async (entry) => {
    const response = await fetch(entry.path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Lesson ${entry.id} could not be loaded`);
    const lesson = await response.json();
    validateLesson(lesson, entry.id);
    return lesson;
  }));
  const loadedStages = await Promise.all((catalog.stages || []).map(async (entry) => {
    if (!entry.path) return { ...entry, stageId: entry.id };
    const response = await fetch(entry.path, { cache: "no-cache" });
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
  const prototypeLesson = availableLessons.find((lesson) => lesson.experience?.prototypeV2);
  const startedLessons = availableLessons.filter((lesson) => {
    const itemProgress = getProgress(state, lesson.id);
    return itemProgress.lessonStatus !== "unstarted" || itemProgress.attempts > 0;
  });
  const lessonStatusLabel = (lesson) => {
    const itemProgress = getProgress(state, lesson.id);
    if (itemProgress.quizPassed) return "Pass";
    if (itemProgress.lessonStatus === "completed") return "Quiz再挑戦";
    if (itemProgress.lessonStatus === "learning") return "学習中";
    return "未着手";
  };
  const stageOverview = availableStages.map((item) => {
    const itemLessons = item.lessonIds.map((id) => lessons.get(id)).filter(Boolean);
    const passedCount = itemLessons.filter((lesson) => getProgress(state, lesson.id).quizPassed).length;
    const itemProgress = getStageProgress(state, item.stageId);
    const isCurrent = item.stageId === stage?.stageId;
    const completed = stageIsComplete(item);
    return `
      <article class="dashboard-stage ${isCurrent ? "is-current" : ""}">
        <div class="dashboard-stage-header">
          <div><p class="eyebrow">${escapeHtml(item.tier)} · ${escapeHtml(item.stageId)}</p><h3>${escapeHtml(item.title)}</h3></div>
          <span class="tag ${completed ? "" : isCurrent ? "current" : "muted-tag"}">${completed ? "完了" : isCurrent ? "現在地" : "未着手"}</span>
        </div>
        <p class="muted">Lesson ${passedCount} / ${itemLessons.length} Pass · Stage Exam ${["passed", "passed_with_review"].includes(itemProgress.examStatus) ? "Pass" : "未完了"}</p>
        <div class="dashboard-lesson-list">${itemLessons.map((lesson) => `<a class="dashboard-lesson-link ${getProgress(state, lesson.id).quizPassed ? "is-passed" : currentLesson?.id === lesson.id ? "is-current" : ""}" href="#/lesson/${lesson.id}"><span>Lesson ${lesson.id}</span><strong>${escapeHtml(lesson.title)}</strong><small>${lessonStatusLabel(lesson)}</small></a>`).join("")}</div>
      </article>`;
  }).join("");
  const remainingLessonCount = Math.max(0, curriculum.curriculumSize - availableLessons.length);
  const historyMarkup = startedLessons.length
    ? startedLessons.map((lesson) => {
      const itemProgress = getProgress(state, lesson.id);
      const hasBuilder = state.builderProjects.some((project) => project.lessonId === lesson.id);
      return `<article class="history-item"><div><p class="eyebrow">LESSON ${lesson.id}</p><h3>${escapeHtml(lesson.title)}</h3><p class="muted">${lessonStatusLabel(lesson)} · Quiz Best ${itemProgress.bestScore}/${lesson.questionCount}</p></div><div class="history-actions"><a href="#/lesson/${lesson.id}">学習を見直す</a>${itemProgress.lastAttemptId ? `<a href="#/result/${lesson.id}">Quiz結果</a>` : ""}${hasBuilder ? `<a href="#/builder/${lesson.id}">Builder</a>` : ""}</div></article>`;
    }).join("")
    : `<p class="empty-state">学習を開始すると、ここから過去のLessonへ戻れるようになります。</p>`;
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
      <div class="hero cosmic-home-hero">
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
          ${prototypeLesson ? `<div class="reference-link"><p class="muted">用語を確認したいとき</p><a class="button button-secondary" href="#/concepts" target="_blank" rel="noopener">Concept用語集を別画面で開く</a></div>` : ""}
        </section>

        <section class="card card-accent">
          <p class="eyebrow">CURRENT POSITION</p>
          <div class="stat"><strong>${passedLessons}</strong><span>/ ${curriculum.curriculumSize} Lessons Passed</span></div>
          <div class="progress" aria-label="CORE Lesson進捗"><span style="width:${Math.round((passedLessons / curriculum.curriculumSize) * 100)}%"></span></div>
          <p class="muted">${stage ? `${escapeLiteral(stage.stageId)}｜${escapeHtml(stage.title)}<br>` : ""}Current: ${currentLesson ? `Lesson ${currentLesson.id}` : stageComplete ? "Stage Complete" : "Stage Assessment"}<br>Quiz Best: ${progress.bestScore} / ${displayLesson.questionCount}</p>
          ${stage ? `<hr><p><strong>${escapeHtml(stage.tier)}｜${escapeHtml(stage.title)}</strong><br>Lessons：${stage.lessonIds.filter((id) => getProgress(state, id).quizPassed).length} / ${stage.lessonIds.length}<br>Stage Exam：${stageProgress.examStatus === "passed" ? "Passed" : stageProgress.examStatus === "passed_with_review" ? "Passed with Review" : stageProgress.examStatus === "review_required" ? "Review" : stageProgress.examStatus === "learning" ? "Learning" : "Pending"}<br>Stage Builder：${stageProgress.builderStatus === "completed" ? "Completed" : "Pending"}</p>` : ""}
          ${stageComplete ? `<p><strong>次のStageは未実装です。</strong></p>` : ""}
        </section>
      </div>

      <section class="dashboard-section" aria-labelledby="curriculum-overview-title">
        <div class="section-heading"><div><p class="eyebrow">CURRICULUM MAP</p><h2 id="curriculum-overview-title">セクション全体と現在地</h2></div><p class="muted">各Lessonを選ぶと、いつでも内容を確認できます。</p></div>
        <div class="dashboard-stage-list">${stageOverview}</div>
        ${remainingLessonCount ? `<div class="dashboard-planned"><strong>今後のセクション</strong><span>Lesson ${String(availableLessons.length + 1).padStart(2, "0")}〜${curriculum.curriculumSize}（${remainingLessonCount} Lessons）は未実装です。</span></div>` : ""}
      </section>

      <section class="dashboard-section" aria-labelledby="training-history-title">
        <div class="section-heading"><div><p class="eyebrow">REVIEW & HISTORY</p><h2 id="training-history-title">過去のトレーニングを復習する</h2></div><p class="muted">学習内容、Quiz結果、作成済みBuilderへ戻れます。</p></div>
        <div class="history-list">${historyMarkup}</div>
      </section>
    </section>
  `);
}

function renderConceptReference() {
  const cards = [...lessons.values()]
    .filter((lesson) => lesson.experience?.lessonLayout === "guided_reference" || lesson.experience?.prototypeV2)
    .flatMap((lesson) => {
      const explicitCards = lesson.content.conceptCards;
      if (explicitCards?.length) return explicitCards.map((card) => ({ ...card, lessonId: lesson.id }));
      const connection = (lesson.content.flow || []).map((node) => node.label).join(" → ");
      return (lesson.content.flow || []).map((node) => ({
        lessonId: lesson.id,
        term: node.label,
        meaning: node.caption,
        function: lesson.content.summary,
        connection,
        example: lesson.content.examples?.[0] || lesson.content.definition
      }));
    });
  setScreen(`
    <section class="screen narrow concept-library">
      <p class="eyebrow">CONCEPT REFERENCE</p>
      <h1>用語・機能・接続を確認する</h1>
      <p class="lead">用語名、意味、機能、接続、例から検索できます。現在実装済みのLessonを横断して確認できます。</p>
      <label class="concept-search"><span>用語を検索</span><input id="concept-search" type="search" placeholder="例：Observation、観測、Action"></label>
      <p class="muted" id="concept-count">${cards.length}件のConcept</p>
      <div class="concept-grid" id="concept-results">${cards.map((card) => `
        <article class="concept-card" data-search="${escapeHtml([card.term, card.meaning, card.function, card.connection, card.example].join(" ").toLowerCase())}">
          <p class="eyebrow">LESSON ${escapeHtml(card.lessonId)}</p>
          <h2>${escapeHtml(card.term)}</h2>
          <p>${escapeHtml(card.meaning)}</p>
          <dl><dt>機能</dt><dd>${escapeHtml(card.function)}</dd><dt>接続</dt><dd>${escapeHtml(card.connection)}</dd><dt>学習ツールでの例</dt><dd>${escapeHtml(card.example)}</dd></dl>
        </article>
      `).join("")}</div>
      <p class="notice notice-warning" id="concept-empty" hidden>一致するConceptがありません。</p>
      <div class="button-row"><a class="button button-secondary" href="#/home">Homeへ戻る</a></div>
    </section>
  `);
  const input = document.querySelector("#concept-search");
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    let visibleCount = 0;
    document.querySelectorAll("#concept-results .concept-card").forEach((card) => {
      const visible = !query || card.dataset.search.includes(query);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    document.querySelector("#concept-count").textContent = `${visibleCount}件のConcept`;
    document.querySelector("#concept-empty").hidden = visibleCount !== 0;
  });
}

function renderTrainingRecords() {
  const state = loadState();
  const startedLessons = [...lessons.values()].filter((lesson) => {
    const progress = getProgress(state, lesson.id);
    return progress.lessonStatus !== "unstarted" || progress.attempts > 0;
  });
  setScreen(`
    <section class="screen records-screen">
      <div class="page-intro"><p class="eyebrow">HARVEST RECORD</p><h1>育てた学びを、次へつなぐ。</h1><p class="lead">Quiz、Builder、WeaknessをLessonごとに確認できます。Lessonの完了とRetentionは別々に記録されています。</p></div>
      <div class="record-layout">
        <aside class="record-index"><p class="eyebrow">TRAINING HISTORY</p>${startedLessons.map((lesson) => { const progress = getProgress(state, lesson.id); return `<a href="#/lesson/${lesson.id}"><span>Lesson ${lesson.id}</span><strong>${escapeHtml(lesson.title)}</strong><small>${progress.quizPassed ? "収穫済み" : "成長中"} · Best ${progress.bestScore}/${lesson.questionCount}</small></a>`; }).join("") || `<p class="muted">学習記録はまだありません。</p>`}</aside>
        <div class="record-details">${startedLessons.map((lesson) => {
          const progress = getProgress(state, lesson.id);
          const builder = getLatestBuilder(state, lesson.id);
          const weakCount = lesson.conceptTags.filter((tag) => state.conceptStates[tag.id]?.retentionState === "weak").length;
          return `<article class="record-entry"><div class="record-entry-heading"><div><p class="eyebrow">LESSON ${lesson.id}</p><h2>${escapeHtml(lesson.title)}</h2></div><span class="growth-state">${progress.quizPassed ? "収穫" : "成長中"}</span></div><dl><div><dt>Quiz</dt><dd>${progress.bestScore} / ${lesson.questionCount}</dd></div><div><dt>Builder</dt><dd>${builder?.status === "completed" ? "接続済み" : builder ? "要確認" : "未実施"}</dd></div><div><dt>Review</dt><dd>${weakCount} Concept</dd></div></dl><div class="history-actions"><a href="#/lesson/${lesson.id}">Lessonを見る</a>${progress.lastAttemptId ? `<a href="#/result/${lesson.id}">Quiz結果</a>` : ""}${builder ? `<a href="#/builder/${lesson.id}">Builder</a>` : ""}</div></article>`;
        }).join("")}</div>
      </div>
    </section>
  `);
}

function renderDesignLab() {
  const icon = (name) => {
    const paths = {
      blank: '<circle cx="24" cy="24" r="15" stroke-dasharray="2 5"/><circle cx="24" cy="24" r="2"/>',
      seed: '<path d="M24 37V21"/><path d="M24 27c-8 0-12-5-12-12 8 0 12 4 12 12Z"/><path d="M24 22c1-7 5-11 12-11 0 7-4 11-12 12Z"/><circle cx="24" cy="38" r="3"/>',
      growth: '<path d="M24 40V12"/><path d="M24 25c-9 0-14-5-14-13 9 0 14 5 14 13Z"/><path d="M24 20c1-8 6-12 14-12 0 8-5 13-14 13Z"/><path d="M16 40c4-4 12-4 16 0"/>',
      connection: '<circle cx="10" cy="24" r="4"/><circle cx="24" cy="12" r="4"/><circle cx="38" cy="24" r="4"/><path d="M14 21 20 15M28 15l6 6M34 27c-7 10-20 9-25 1"/><path d="m9 28 1 7 6-3"/>',
      harvest: '<path d="M24 40V10M24 17c-7 0-10-4-10-10 7 0 10 4 10 10ZM24 23c7 0 11-4 11-10-7 0-11 4-11 10Z"/><path d="M16 27c5 0 8 3 8 8-5 0-8-3-8-8ZM32 27c-5 0-8 3-8 8 5 0 8-3 8-8Z"/><path d="M14 41h20"/>',
      future: '<path d="M8 36c7-1 12-5 15-11 3-6 8-10 17-12"/><path d="m33 8 8 5-5 8"/><circle cx="9" cy="36" r="3"/><path d="M22 26c-6 0-9-4-9-9 6 0 9 3 9 9Z"/>'
    };
    return `<svg class="seed-icon" viewBox="0 0 48 48" aria-hidden="true">${paths[name]}</svg>`;
  };
  setScreen(`
    <section class="screen design-lab">
      <div class="page-intro"><p class="eyebrow">BLANSEED DESIGN LAB · 01</p><h1>育つUIの、かたちを選ぶ。</h1><p class="lead">実際の部品として比較するための試作ページです。装飾ではなく、学習状態を形とことばで区別します。</p></div>

      <section class="specimen-section"><div class="specimen-heading"><span>01</span><div><h2>Header</h2><p>ブランドと現在地を静かに示す2案</p></div></div>
        <div class="header-prototypes">
          <article><p class="prototype-label">A · EDITORIAL</p><div class="prototype-header editorial"><div class="mini-brand">${icon("seed")}<span><strong>BLANSEED</strong><small>LOOP TRAINING</small></span></div><div class="mini-tabs"><b>学習経路</b><span>用語集</span><span>学習記録</span></div><small>4 / 20</small></div><p>余白と文字を優先。現在の共通ヘッダーに近い案。</p></article>
          <article><p class="prototype-label">B · GROWTH LINE</p><div class="prototype-header growth-line"><div class="mini-brand">${icon("growth")}<span><strong>BLANSEED</strong><small>STAGE 02 · 成長中</small></span></div><div class="mini-progress"><i style="width:20%"></i></div><strong>04 / 20</strong></div><p>成長線と現在Stageを強く見せる案。</p></article>
          <article class="cosmic-header-specimen"><p class="prototype-label">C · COSMIC TERRARIUM</p><div class="cosmic-hero"><div class="cosmic-copy"><p>FOUNDATION TRAINING</p><h2>Loopを設計できる力を、<br>ひとつずつ。</h2><span>Lessonで理解し、Quizで確かめ、Builderで使う。学びを育て、次の判断へつなげます。</span><a href="#/lesson/05">評価ルールを学ぶ <b aria-hidden="true">→</b></a></div></div></article>
        </div>
      </section>

      <section class="specimen-section"><div class="specimen-heading"><span>02</span><div><h2>State Icons</h2><p>状態を色だけに依存せず、輪郭でも区別</p></div></div>
        <div class="icon-specimens"><div>${icon("blank")}<strong>空白</strong><small>未着手</small></div><div>${icon("seed")}<strong>種</strong><small>学習開始</small></div><div>${icon("growth")}<strong>成長</strong><small>初回理解</small></div><div>${icon("connection")}<strong>繋がり</strong><small>Builder</small></div><div>${icon("harvest")}<strong>収穫</strong><small>安定した理解</small></div><div>${icon("future")}<strong>未来</strong><small>次のLesson</small></div></div>
      </section>

      <section class="specimen-section"><div class="specimen-heading"><span>03</span><div><h2>Training Cards</h2><p>同じ箱の色違いではなく、役割ごとに情報密度を変える</p></div></div>
        <div class="card-specimens">
          <article class="cosmic-learning-card current-cosmic"><div><p>NEXT SEED · LESSON 05</p><h3>評価ルールを学ぶ</h3><small>観測した情報から、同じ基準で判断する力を育てます。</small><a href="#/lesson/05">学習を続ける <span aria-hidden="true">→</span></a></div></article>
          <article class="cosmic-learning-card review-cosmic"><div><p>REVIEW · RETENTION R0</p><h3>Observationを育て直す</h3><small>曖昧になったConceptを、つながりから確認します。</small><a href="#/lesson/03">復習する</a></div></article>
          <article class="seed-card empty">${icon("blank")}<div><p>LESSON 06</p><h3>Action / Intervention</h3><small>まだ学習していません</small></div><span>未着手</span></article>
          <article class="seed-card current">${icon("growth")}<div><p>NEXT LESSON · STAGE 02</p><h3>Evaluation Ruleを学ぶ</h3><small>判断を再現可能にする基準</small></div><a href="#/lesson/05">続きを学ぶ →</a></article>
          <article class="seed-card weak-card">${icon("connection")}<div><p>REVIEW SEED</p><h3>ObservationとEvaluationの境界</h3><small>Quizで1回誤答 · Retention R0</small></div><a href="#/lesson/03">育て直す</a></article>
          <article class="seed-card harvested">${icon("harvest")}<div><p>HARVEST · LESSON 01</p><h3>Loopとは何か</h3><small>Quiz 5/5 · Builder接続済み</small></div><span>収穫済み</span></article>
        </div>
      </section>

      <section class="specimen-section"><div class="specimen-heading"><span>04</span><div><h2>Actions</h2><p>行動の強さに合わせた4種類</p></div></div>
        <div class="action-specimens"><button class="prototype-button primary">学習を続ける <span>→</span></button><button class="prototype-button secondary">Lessonを見直す</button><button class="prototype-button reference">◇ 用語を確認する</button><button class="prototype-button review">育て直す</button></div>
      </section>
      <p class="design-lab-note">このページは比較用です。選定後にHome・Lesson・Quizへ段階的に反映します。</p>
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
  const usesGuidedReference = lesson.experience?.lessonLayout === "guided_reference" || lesson.experience?.prototypeV2;
  const coreFlow = content.flow?.length
    ? `<div class="loop-flow" aria-label="${escapeHtml(lesson.title)}の基本構造">${content.flow.map((node) => `<div class="loop-node">${escapeHtml(node.label)}<span>${escapeHtml(node.caption)}</span></div>`).join("")}</div>`
    : "";
  const simpleFlowNodes = content.simpleFlow || (content.flow || []).map((node) => ({
    label: CONCEPT_JAPANESE.get(node.label) || node.caption,
    term: node.label,
    caption: node.caption
  }));
  const simpleFlow = usesGuidedReference
    ? `<div class="vertical-flow simple-flow" aria-label="${escapeHtml(lesson.title)}のやさしい流れ">${simpleFlowNodes.map((node, index) => `${index ? '<div class="flow-arrow" aria-hidden="true">↓</div>' : ""}<div class="flow-card"><strong>${escapeLiteral(node.label)} <span>（${escapeLiteral(node.term)}）</span></strong>${node.caption ? `<small>${escapeHtml(node.caption)}</small>` : ""}</div>`).join("")}</div>`
    : "";
  const mechanics = usesGuidedReference
    ? `<ol>${(content.mechanics || content.flow || []).map((item) => item.term !== undefined
      ? `<li>${escapeHtml(item.before)}<strong>${escapeHtml(item.term)}</strong>${escapeHtml(item.after)}</li>`
      : `<li><strong>${escapeHtml(item.label)}</strong>：${escapeHtml(item.caption)}</li>`).join("")}</ol>`
    : "";
  const connection = content.connection;
  const connectionMarkup = connection
    ? `最小の接続は <strong>${conceptDisplay("Observation", connection.observation)}</strong> → <strong>${conceptDisplay("Action", connection.action)}</strong> → <strong>${conceptDisplay("Re-Observation", connection.reObservation)}</strong> → <strong>${escapeHtml(connection.decision)}</strong>（次の判断）です。${escapeHtml(connection.note)}`
    : `${(content.flow || []).map((node) => `<strong>${escapeHtml(node.label)}</strong>`).join(" → ")} の順につなぎ、前の情報を次の判断や処理へ渡します。`;
  const exampleFlow = usesGuidedReference && content.exampleFlow?.length
    ? `<div class="vertical-flow example-flow" aria-label="学習ツールでのLoop例">${content.exampleFlow.map((node, index) => `${index ? '<div class="flow-arrow" aria-hidden="true">↓</div>' : ""}<div class="flow-card"><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.caption)}</small></div>`).join("")}</div>`
    : `<ul>${content.examples.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  setScreen(`
    <article class="screen narrow">
      <p class="eyebrow">${escapeHtml(lesson.tier)} LESSON ${escapeLiteral(lesson.id)}</p>
      <h1>${escapeHtml(lesson.title)}</h1>
      <p class="lead">${escapeHtml(content.summary)}</p>
      <section class="lesson-body"><h2>学習目標</h2><ul>${content.objectives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      ${usesGuidedReference ? coreFlow : ""}
      <section class="lesson-body"><h2>まず知っておくこと</h2><p>${escapeHtml(content.definition)}</p>${usesGuidedReference ? `<h3>何のために使うか</h3><p>${escapeHtml(content.purpose || content.summary)}</p>${simpleFlow}` : ""}</section>
      ${usesGuidedReference ? `<section class="lesson-body"><h2>どのように動くか</h2>${mechanics}<h3>Conceptの接続</h3><p>${connectionMarkup}</p></section>` : coreFlow}
      <section class="lesson-body lesson-do"><h2>学習ツールでの使い方</h2>${exampleFlow}</section>
      <section class="lesson-body"><h2>学習のポイント（Key Points）</h2><ul>${content.keyPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      ${usesGuidedReference ? `<section class="concept-reference-link"><p class="eyebrow">CONCEPT REFERENCE</p><h2>用語・機能・接続を確認する</h2><p class="muted">用語集は別画面で開き、名前や説明から検索できます。</p><a class="button button-secondary" href="#/concepts" target="_blank" rel="noopener">検索できるConcept用語集を開く</a></section>` : ""}
      <aside class="lesson-dont"><h2>避ける例</h2><ul>${content.commonMistakes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></aside>
      ${usesGuidedReference && content.applicationTip ? `<aside class="application-tip"><strong>応用Tips</strong><p>${escapeHtml(content.applicationTip)}</p></aside>` : ""}
      <div class="button-row"><button class="button" id="start-quiz">${lesson.questionCount}問Quizへ進む</button><a class="button button-secondary" href="#/home">Homeへ戻る</a></div>
    </article>
  `);
  document.querySelector("#start-quiz").addEventListener("click", () => {
    quizSession = { lessonId: lesson.id, index: 0, answers: {}, attemptId: createAttemptId() };
    navigate(`#/quiz/${lesson.id}`);
  });
}

function renderQuiz(lesson) {
  if (lesson.experience?.quizLayout === "all_questions") {
    renderPrototypeQuiz(lesson);
    return;
  }
  if (quizSession.lessonId !== lesson.id) {
    quizSession = { lessonId: lesson.id, index: 0, answers: {}, attemptId: createAttemptId() };
  }
  const questions = lesson.quiz.questions;
  const question = questions[quizSession.index];
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">レッスン（Lesson） ${escapeLiteral(lesson.id)} · 理解確認（Quiz）</p>
      <div class="step-indicator">Question ${quizSession.index + 1} / ${lesson.questionCount}</div>
      <form class="question" id="quiz-form">
        <h1>${escapeHtml(question.prompt)}</h1>
        <div class="options">${question.options.map((option) => `<label class="option"><input type="radio" name="answer" value="${escapeLiteral(option.id)}" required><span>${escapeHtml(option.label)}</span></label>`).join("")}</div>
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

function renderImmediateFeedback(question, selectedId) {
  const correctOption = question.options.find((option) => option.id === question.correctOptionId);
  const selectedOption = question.options.find((option) => option.id === selectedId);
  const correct = selectedId === question.correctOptionId;
  return `
    <div class="immediate-summary ${correct ? "correct" : "incorrect"}">
      <p><strong>${correct ? "正解です" : "不正解です"}</strong></p>
      <p><strong>選んだ回答：</strong>${escapeHtml(selectedOption?.label || "")}</p>
      <p><strong>正しい回答：</strong>${escapeHtml(correctOption?.label || "")}</p>
      <p><strong>正解の理由：</strong>${escapeHtml(question.explanation)}</p>
    </div>
    <div class="option-reasons"><p><strong>各選択肢の確認</strong></p><ul>${question.options.map((option) => `<li class="${option.id === question.correctOptionId ? "correct-reason" : ""}"><strong><span aria-hidden="true">${option.id === question.correctOptionId ? "✅" : "❌"}</span>：</strong>${escapeHtml(option.label)}<br><span>${escapeHtml(option.feedback)}</span></li>`).join("")}</ul></div>
  `;
}

function getQuizHint(question) {
  if (question.hint) return question.hint;
  const focusHints = {
    Recognition: "定義だけでなく、そのConceptが何のために使われるかを確認してください。",
    Discrimination: "選択肢ごとに、Conceptの役割と接続先が一致しているかを比べてください。",
    "Error Detection": "書かれている要素と、不足・混同している要素を分けて確認してください。",
    "Scenario Judgement": "現在の情報、判断、次に必要な処理を順番に整理してください。",
    "Example / Classification": "各例を定義へ当てはめ、同じ基準で分類してください。"
  };
  return {
    title: `${getConceptLabel(question.conceptId)}の確認ポイント`,
    items: [
      { label: "問題の見方", text: focusHints[question.assessmentFocus] || "用語の定義と、前後のConceptとの接続を確認してください。" },
      { label: "選ぶ前に", text: "正しそうな単語ではなく、説明全体がLessonの定義と一致しているかを確認しましょう。", highlight: true }
    ]
  };
}

function renderPrototypeQuiz(lesson) {
  if (quizSession.lessonId !== lesson.id || latestQuizResult) {
    quizSession = { lessonId: lesson.id, index: 0, answers: {}, attemptId: createAttemptId() };
    latestQuizResult = null;
  }
  const questions = lesson.quiz.questions;
  setScreen(`
    <section class="screen quiz-sheet">
      <p class="eyebrow">レッスン（Lesson） ${escapeLiteral(lesson.id)} · 理解確認（Quiz）</p>
      <h1>${escapeHtml(lesson.title)}｜理解確認</h1>
      <p class="lead">5問をこのページで確認します。回答を選ぶと、その問題の解説がすぐに表示されます。最初に選んだ回答が採点対象です。</p>
      <form id="prototype-quiz-form">
        <div class="quiz-question-list">${questions.map((question, index) => {
          const hint = getQuizHint(question);
          return `
          <fieldset class="question question-card" data-question-id="${escapeLiteral(question.id)}">
            <legend>Question ${index + 1} / ${lesson.questionCount}</legend>
            <h2>${escapeHtml(question.prompt)}</h2>
            <button class="hint-button" type="button" data-hint-button="${escapeLiteral(question.id)}" aria-expanded="false">Hintを見る</button><div class="quiz-hint" data-hint-for="${escapeLiteral(question.id)}" hidden><strong>＜${escapeHtml(hint.title)}＞</strong>${hint.items.map((item) => `<p class="${item.highlight ? "hint-missing" : ""}"><b>${escapeHtml(item.label)}：</b>${escapeHtml(item.text)}</p>`).join("")}</div>
            <div class="options">${question.options.map((option) => `<label class="option"><input type="radio" name="answer-${escapeLiteral(question.id)}" value="${escapeLiteral(option.id)}"><span>${escapeHtml(option.label)}</span></label>`).join("")}</div>
            <div class="immediate-feedback" data-feedback-for="${escapeLiteral(question.id)}" aria-live="polite" hidden></div>
          </fieldset>
        `;}).join("")}</div>
        <div class="quiz-submit-bar"><p id="quiz-progress">0 / ${lesson.questionCount}問 回答済み</p><button class="button" type="submit" disabled>結果を見る</button></div>
      </form>
    </section>
  `);
  const form = document.querySelector("#prototype-quiz-form");
  form.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hint-button]");
    if (!button) return;
    const hint = form.querySelector(`[data-hint-for="${button.dataset.hintButton}"]`);
    const willOpen = hint.hidden;
    hint.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    button.textContent = willOpen ? "Hintを閉じる" : "Hintを見る";
  });
  form.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="radio"]');
    if (!input) return;
    const card = input.closest("[data-question-id]");
    const questionId = card.dataset.questionId;
    if (quizSession.answers[questionId]) return;
    const question = questions.find((item) => item.id === questionId);
    quizSession.answers[questionId] = input.value;
    card.querySelectorAll('input[type="radio"]').forEach((radio) => { radio.disabled = true; });
    input.closest(".option").classList.add(input.value === question.correctOptionId ? "selected-correct" : "selected-incorrect");
    const feedback = card.querySelector("[data-feedback-for]");
    feedback.innerHTML = renderImmediateFeedback(question, input.value);
    feedback.hidden = false;
    const answeredCount = Object.keys(quizSession.answers).length;
    document.querySelector("#quiz-progress").textContent = `${answeredCount} / ${lesson.questionCount}問 回答済み`;
    form.querySelector('button[type="submit"]').disabled = answeredCount !== lesson.questionCount;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (Object.keys(quizSession.answers).length !== lesson.questionCount) return;
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
      <p class="eyebrow">レッスン（Lesson） ${escapeLiteral(lesson.id)} · 結果（Quiz Result）</p>
      <h1>${result.passed ? "Pass — 基本を理解しています" : "Reviewして、もう一度つなげよう"}</h1>
      <div class="score-ring"><div><strong>${result.score}</strong><span> / ${lesson.questionCount}</span></div></div>
      <p class="notice ${result.passed ? "notice-success" : "notice-warning"}">${lesson.questionCount}問回答完了によりLesson ${escapeLiteral(lesson.id)}はcompletedです。${result.passed ? `${lesson.passScore}/${lesson.questionCount}以上のためQuiz Passです。` : `Quiz Passには${lesson.passScore}/${lesson.questionCount}以上が必要です。`}</p>
      <p class="muted">Conceptの状態（Concept State）を更新しました。正答Conceptは初回理解、誤答Conceptは復習候補（Retention Review / weak / R0）として記録されています。理解確認（Quiz）だけでstableにはなりません。</p>
      <ul class="result-list">${result.results.map(({ question, selected, correct }) => {
        const selectedOption = question.options.find((option) => option.id === selected);
        const correctOption = question.options.find((option) => option.id === question.correctOptionId);
        const showCorrectAnswer = lesson.experience?.showCorrectAnswerAlways;
        return `<li class="result-item ${correct ? "correct" : "incorrect"}"><p><strong>${correct ? "正解" : "要Review"}：</strong>${escapeHtml(question.prompt)}</p><p><strong>選んだ回答：</strong>${escapeHtml(selectedOption?.label || "未回答")}</p>${showCorrectAnswer ? `<p><strong>正しい回答：</strong>${escapeHtml(correctOption?.label || "")}</p>` : ""}<p class="muted">${escapeHtml(selectedOption?.feedback || "")}</p>${correct ? "" : `<p><strong>正解理由：</strong>${escapeHtml(question.explanation)}</p>`}</li>`;
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
      <p class="eyebrow">レッスン（Lesson） ${escapeLiteral(lesson.id)} · 設計練習（Guided Builder）</p>
      <h1>${escapeHtml(builder.title)}</h1>
      ${lesson.experience?.lessonLayout === "guided_reference" || lesson.experience?.prototypeV2
        ? `<div class="card card-accent"><p>${escapeHtml(builder.intro)}</p></div>`
        : `<div class="card card-accent"><p class="eyebrow">THEME</p><h2>${escapeHtml(builder.theme)}</h2><p>${escapeHtml(builder.intro)}</p></div>`}
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
  return `<fieldset class="builder-step"><legend>${escapeHtml(step.label)}</legend><p class="muted">${escapeHtml(step.prompt)}</p><div class="options">${step.options.map((option) => `<label class="option"><input type="radio" name="${escapeLiteral(step.id)}" value="${escapeLiteral(option.id)}" ${selectedValue === option.id ? "checked" : ""} required><span>${escapeHtml(option.label)}</span></label>`).join("")}</div></fieldset>`;
}

function renderWeakness(lesson) {
  const state = loadState();
  const project = getLatestBuilder(state, lesson.id);
  if (!project) return navigate(`#/builder/${lesson.id}`);
  const weaknesses = state.builderWeaknessEvents.filter((event) => event.builderId === project.id);
  const completed = project.status === "completed";
  const resultFlow = lesson.miniBuilder.resultFlow;
  const completedFlow = resultFlow
    ? `<div class="loop-flow weakness-flow">${resultFlow.map((item) => `<div class="weakness-flow-item"><p class="weakness-flow-lead">${escapeHtml(item.lead)}</p><div class="loop-node"><strong>${escapeHtml(item.term)}</strong><span>${escapeHtml(item.caption)}</span></div></div>`).join("")}</div>`
    : `<div class="loop-flow weakness-flow">${lesson.miniBuilder.steps.map((step) => {
      const selectedOption = step.options.find((option) => option.id === project.fields[step.id]);
      return `<div class="weakness-flow-item"><p class="weakness-flow-lead">${escapeHtml(step.prompt)}</p><div class="loop-node"><strong>${escapeHtml(step.label.replace(/^\S+\s/, ""))}</strong><span>${escapeHtml(selectedOption?.label || "未選択")}</span></div></div>`;
    }).join("")}</div>`;
  setScreen(`
    <section class="screen narrow">
      <p class="eyebrow">レッスン（Lesson） ${escapeLiteral(lesson.id)} · 弱点確認（Weakness Detection）</p>
      <h1>${completed ? "Guided Builderが成立しています" : "設計に不足があります"}</h1>
      <p class="notice ${completed ? "notice-success" : "notice-danger"}">${completed ? `すべてのStepが適切に接続され、Lesson ${escapeLiteral(lesson.id)} Guided Builderはcompletedです。` : `${weaknesses.length}件のWeaknessを記録しました。`}</p>
      ${completed ? completedFlow : `<ul class="review-list">${weaknesses.map((item) => `<li><span class="tag weak">${escapeHtml(item.code)}</span><p>${escapeHtml(item.message)}</p></li>`).join("")}</ul>`}
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
      <p class="eyebrow">${escapeLiteral(stage.stageId)} · STAGE EXAM</p>
      <div class="step-indicator">Question ${stageExamSession.index + 1} / ${stage.exam.questionCount}</div>
      <form class="question" id="stage-exam-form">
        <h1>${escapeHtml(question.prompt)}</h1>
        <div class="options">${question.options.map((option) => `<label class="option"><input type="radio" name="answer" value="${escapeLiteral(option.id)}" required><span>${escapeHtml(option.label)}</span></label>`).join("")}</div>
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
      <p class="eyebrow">${escapeLiteral(stage.stageId)} · EXAM RESULT</p>
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
      <p class="eyebrow">${escapeLiteral(stage.stageId)} · GUIDED BUILDER</p>
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
      <p class="eyebrow">${escapeLiteral(stage.stageId)} · BUILDER RESULT</p>
      <h1>${completed ? `${escapeHtml(stage.title)} Guided Builderが完成しました` : "構造にReview項目があります"}</h1>
      <p class="notice ${completed ? "notice-success" : "notice-danger"}">${completed ? "PurposeからStateまでの5要素が適切に接続されています。" : `${weaknesses.length}件のWeaknessを保存しました。`}</p>
      ${completed ? `<div class="loop-flow stage-flow">${stage.guidedBuilder.steps.map((step) => `<div class="loop-node">${escapeHtml(step.label.replace(/^Step \d+｜/, ""))}</div>`).join("")}</div><p class="muted">Stage CompleteはRetention Stableとは別の状態です。</p>` : `<ul class="review-list">${weaknesses.map((item) => `<li><span class="tag weak">${escapeHtml(item.code)}</span><p>${escapeHtml(item.message)}</p></li>`).join("")}</ul>`}
      <div class="button-row"><a class="button" href="#/home">Homeへ戻る</a><a class="button button-secondary" href="#/stage/${stage.stageId}/builder">Builderを修正する</a></div>
    </section>
  `);
}

function renderStageNotFound(stageId) {
  setScreen(`<section class="screen narrow"><p class="eyebrow">STAGE NOT FOUND</p><h1>${escapeLiteral(stageId)}は未実装です</h1><p>現在利用できるStageから続けてください。</p><div class="button-row"><a class="button" href="#/home">Homeへ戻る</a></div></section>`);
}

function renderStageFeatureNotFound(stage, feature) {
  setScreen(`<section class="screen narrow"><p class="eyebrow">${escapeLiteral(stage.stageId)} · NOT IMPLEMENTED</p><h1>${escapeHtml(stage.title)} ${escapeHtml(feature)}は未実装です</h1><p>このStageで利用可能なLesson学習を続けてください。</p><div class="button-row"><a class="button" href="#/home">Homeへ戻る</a></div></section>`);
}

function renderLessonNotFound(lessonId) {
  setScreen(`<section class="screen narrow"><p class="eyebrow">LESSON NOT FOUND</p><h1>Lesson ${escapeLiteral(lessonId)}は未実装です</h1><p>現在利用できるLessonから学習を続けてください。</p><div class="button-row"><a class="button" href="#/home">Homeへ戻る</a></div></section>`);
}

function renderError(message = "コンテンツを読み込めませんでした") {
  setScreen(`<section class="screen narrow"><p class="eyebrow">ERROR</p><h1>${escapeHtml(message)}</h1><p>ページを再読み込みしてください。</p></section>`);
}

function parseRoute(hash) {
  if (!hash || hash === "#/home") return { screen: "home" };
  if (hash === "#/concepts") return { screen: "concepts" };
  if (hash === "#/records") return { screen: "records" };
  if (hash === "#/design-lab") return { screen: "design-lab" };
  const lessonMatch = hash.match(/^#\/(lesson|quiz|result|builder|weakness)\/([^/]+)$/);
  if (lessonMatch) return { screen: lessonMatch[1], lessonId: decodeURIComponent(lessonMatch[2]) };
  const stageMatch = hash.match(/^#\/stage\/([^/]+)\/(exam|result|builder|weakness)$/);
  return stageMatch ? { screen: `stage-${stageMatch[2]}`, stageId: decodeURIComponent(stageMatch[1]) } : { screen: "home" };
}

function route() {
  const hash = window.location.hash || "#/home";
  const parsed = parseRoute(hash);
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const activeScreen = parsed.screen === "home" ? "home" : parsed.screen === "concepts" ? "concepts" : parsed.screen === "records" ? "records" : "home";
    if (link.dataset.nav === activeScreen) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (parsed.screen === "home") {
    renderHome();
  } else if (parsed.screen === "concepts") {
    renderConceptReference();
  } else if (parsed.screen === "records") {
    renderTrainingRecords();
  } else if (parsed.screen === "design-lab") {
    renderDesignLab();
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
