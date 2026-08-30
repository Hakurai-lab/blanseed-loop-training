const STORAGE_KEY = "blanseed-loop-training-v1";
const LEGACY_DEFAULT_LESSON_ID = "01";
const LESSON_STATUSES = new Set(["unstarted", "learning", "completed"]);
const RETENTION_STATES = new Set(["unassessed", "weak", "review", "stable"]);
const RETENTION_LEVELS = new Set(["R0", "R1", "R2", "R3"]);
const STAGE_STATUSES = new Set(["available", "learning", "passed", "passed_with_review", "review_required"]);
let latestStorageError = null;

const initialState = () => ({
  version: 1,
  lessonProgress: {},
  conceptStates: {},
  questionHistory: [],
  builderProjects: [],
  builderWeaknessEvents: [],
  stageProgress: {},
  stageExamHistory: [],
  stageBuilderProjects: [],
  stageBuilderWeaknessEvents: [],
  competencyEvidence: [],
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
    const lessonId = asString(entry.lessonId, LEGACY_DEFAULT_LESSON_ID);
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
    const fields = isRecord(project.fields)
      ? Object.fromEntries(Object.entries(project.fields).filter(([, fieldValue]) => typeof fieldValue === "string"))
      : {};
    return [{
      id: project.id,
      lessonId: asString(project.lessonId, LEGACY_DEFAULT_LESSON_ID),
      theme: asString(project.theme),
      fields,
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
      lessonId: asString(event.lessonId, LEGACY_DEFAULT_LESSON_ID),
      builderId: event.builderId,
      detectedAt: asString(event.detectedAt)
    }];
  });
}

function normalizeStageProgress(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([stageId, progress]) => {
    if (!isRecord(progress)) return [];
    const status = STAGE_STATUSES.has(progress.status) ? progress.status : "available";
    const examStatus = STAGE_STATUSES.has(progress.examStatus) ? progress.examStatus : status;
    return [[stageId, {
      status,
      examStatus,
      builderStatus: progress.builderStatus === "completed" ? "completed" : "pending",
      bestScore: asCount(progress.bestScore),
      attempts: asCount(progress.attempts),
      ...(typeof progress.lastAttemptId === "string" ? { lastAttemptId: progress.lastAttemptId } : {}),
      ...(typeof progress.lastExamAt === "string" ? { lastExamAt: progress.lastExamAt } : {}),
      ...(typeof progress.lastBuilderAt === "string" ? { lastBuilderAt: progress.lastBuilderAt } : {})
    }]];
  }));
}

function normalizeStageExamHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    if (typeof entry.stageId !== "string" || typeof entry.attemptId !== "string" || typeof entry.questionId !== "string") return [];
    return [{
      stageId: entry.stageId,
      attemptId: entry.attemptId,
      questionId: entry.questionId,
      conceptId: asString(entry.conceptId),
      criticalConceptId: typeof entry.criticalConceptId === "string" ? entry.criticalConceptId : null,
      selected: typeof entry.selected === "string" ? entry.selected : null,
      correct: entry.correct === true,
      answeredAt: asString(entry.answeredAt)
    }];
  });
}

function normalizeStageBuilderProjects(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((project) => {
    if (typeof project.id !== "string" || typeof project.stageId !== "string" || typeof project.builderId !== "string") return [];
    const fields = isRecord(project.fields)
      ? Object.fromEntries(Object.entries(project.fields).filter(([, fieldValue]) => typeof fieldValue === "string"))
      : {};
    return [{
      id: project.id,
      stageId: project.stageId,
      builderId: project.builderId,
      theme: asString(project.theme),
      fields,
      status: project.status === "completed" ? "completed" : "needs_review",
      createdAt: asString(project.createdAt),
      ...(typeof project.updatedAt === "string" ? { updatedAt: project.updatedAt } : {})
    }];
  });
}

function normalizeStageBuilderWeaknessEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((event) => {
    if (typeof event.code !== "string" || typeof event.stageId !== "string" || typeof event.builderProjectId !== "string") return [];
    return [{ code: event.code, message: asString(event.message), stageId: event.stageId, builderProjectId: event.builderProjectId, detectedAt: asString(event.detectedAt) }];
  });
}

function normalizeCompetencyEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((item) => {
    if (typeof item.competencyId !== "string" || typeof item.stageId !== "string" || typeof item.builderId !== "string" || typeof item.stepId !== "string") return [];
    return [{
      competencyId: item.competencyId,
      stageId: item.stageId,
      builderId: item.builderId,
      builderProjectId: asString(item.builderProjectId),
      stepId: item.stepId,
      correct: item.correct === true,
      weaknessCode: typeof item.weaknessCode === "string" ? item.weaknessCode : null,
      timestamp: asString(item.timestamp)
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
    stageProgress: normalizeStageProgress(source.stageProgress),
    stageExamHistory: normalizeStageExamHistory(source.stageExamHistory),
    stageBuilderProjects: normalizeStageBuilderProjects(source.stageBuilderProjects),
    stageBuilderWeaknessEvents: normalizeStageBuilderWeaknessEvents(source.stageBuilderWeaknessEvents),
    competencyEvidence: normalizeCompetencyEvidence(source.competencyEvidence),
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
