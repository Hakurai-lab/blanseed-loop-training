const STORAGE_KEY = "blanseed-loop-training-v1";
const LESSON_STATUSES = new Set(["unstarted", "learning", "completed"]);
const RETENTION_STATES = new Set(["unassessed", "weak", "review", "stable"]);
const RETENTION_LEVELS = new Set(["R0", "R1", "R2", "R3"]);
let latestStorageError = null;

const initialState = () => ({
  version: 1,
  lessonProgress: {
    "01": { lessonStatus: "unstarted", quizPassed: false, bestScore: 0, attempts: 0 }
  },
  conceptStates: {},
  questionHistory: [],
  builderProjects: [],
  builderWeaknessEvents: [],
  currentPosition: "#/home"
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const asCount = (value) => Number.isInteger(value) && value >= 0 ? value : 0;
const asString = (value, fallback = "") => typeof value === "string" ? value : fallback;

function normalizeLessonProgress(value) {
  const source = isRecord(value) ? value : {};
  const normalized = {};

  Object.entries(source).forEach(([lessonId, progress]) => {
    if (!isRecord(progress)) return;
    normalized[lessonId] = {
      lessonStatus: LESSON_STATUSES.has(progress.lessonStatus) ? progress.lessonStatus : "unstarted",
      quizPassed: progress.quizPassed === true,
      bestScore: asCount(progress.bestScore),
      attempts: asCount(progress.attempts),
      ...(typeof progress.lastCompletedAt === "string" ? { lastCompletedAt: progress.lastCompletedAt } : {}),
      ...(typeof progress.lastAttemptId === "string" ? { lastAttemptId: progress.lastAttemptId } : {})
    };
  });

  normalized["01"] ??= initialState().lessonProgress["01"];
  return normalized;
}

function normalizeConceptStates(value) {
  if (!isRecord(value)) return {};
  const normalized = {};

  Object.entries(value).forEach(([conceptId, concept]) => {
    if (!isRecord(concept)) return;
    normalized[conceptId] = {
      understandingState: concept.understandingState === "initial" ? "initial" : "unassessed",
      retentionState: RETENTION_STATES.has(concept.retentionState) ? concept.retentionState : "unassessed",
      retentionLevel: RETENTION_LEVELS.has(concept.retentionLevel) ? concept.retentionLevel : null,
      correctCount: asCount(concept.correctCount),
      incorrectCount: asCount(concept.incorrectCount),
      ...(typeof concept.lastAnsweredAt === "string" ? { lastAnsweredAt: concept.lastAnsweredAt } : {})
    };
  });
  return normalized;
}

function normalizeQuestionHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry) || typeof entry.questionId !== "string") return [];
    const lessonId = asString(entry.lessonId, "01");
    const answeredAt = asString(entry.answeredAt);
    return [{
      lessonId,
      attemptId: asString(entry.attemptId, `legacy-${lessonId}-${answeredAt || index}`),
      questionId: entry.questionId,
      conceptId: asString(entry.conceptId),
      selected: typeof entry.selected === "string" ? entry.selected : null,
      correct: entry.correct === true,
      answeredAt
    }];
  });
}

function normalizeBuilderProjects(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((project) => {
    if (!isRecord(project) || typeof project.id !== "string") return [];
    const fields = isRecord(project.fields) ? project.fields : {};
    return [{
      id: project.id,
      lessonId: asString(project.lessonId, "01"),
      theme: asString(project.theme),
      fields: {
        observation: asString(fields.observation),
        action: asString(fields.action),
        reObservation: asString(fields.reObservation)
      },
      status: project.status === "completed" ? "completed" : "needs_review",
      createdAt: asString(project.createdAt),
      ...(typeof project.updatedAt === "string" ? { updatedAt: project.updatedAt } : {})
    }];
  });
}

function normalizeWeaknessEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((event) => {
    if (typeof event.code !== "string" || typeof event.builderId !== "string") return [];
    return [{
      code: event.code,
      message: asString(event.message),
      lessonId: asString(event.lessonId, "01"),
      builderId: event.builderId,
      detectedAt: asString(event.detectedAt)
    }];
  });
}

function normalizeState(saved) {
  const source = isRecord(saved) ? saved : {};
  return {
    version: 1,
    lessonProgress: normalizeLessonProgress(source.lessonProgress),
    conceptStates: normalizeConceptStates(source.conceptStates),
    questionHistory: normalizeQuestionHistory(source.questionHistory),
    builderProjects: normalizeBuilderProjects(source.builderProjects),
    builderWeaknessEvents: normalizeWeaknessEvents(source.builderWeaknessEvents),
    currentPosition: typeof source.currentPosition === "string" && source.currentPosition.startsWith("#/")
      ? source.currentPosition
      : "#/home"
  };
}

function reportStorageError() {
  latestStorageError = "進捗をこの端末に保存できませんでした。空き容量やブラウザ設定を確認してください。";
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("blanseed:storage-error", { detail: latestStorageError }));
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : initialState();
  } catch {
    return initialState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    latestStorageError = null;
    return true;
  } catch {
    reportStorageError();
    return false;
  }
}

export function updateState(mutator) {
  const state = loadState();
  mutator(state);
  saveState(state);
  return state;
}

export function getStorageError() {
  return latestStorageError;
}
