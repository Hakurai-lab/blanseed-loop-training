export function scoreQuiz(questions, answers, { passScore, questionCount }) {
  const results = questions.map((question) => {
    const selected = answers[question.id];
    return { question, selected, correct: selected === question.correctOptionId };
  });

  const score = results.filter((result) => result.correct).length;
  return {
    score,
    passed: results.length === questionCount && score >= passScore,
    results
  };
}

export function applyQuizResult(state, quizResult, { lessonId, attemptId }) {
  const now = new Date().toISOString();
  const progress = state.lessonProgress[lessonId] || {
    lessonStatus: "unstarted",
    quizPassed: false,
    bestScore: 0,
    attempts: 0
  };

  progress.lessonStatus = "completed";
  progress.quizPassed = quizResult.passed || progress.quizPassed;
  progress.bestScore = Math.max(progress.bestScore, quizResult.score);
  progress.attempts += 1;
  progress.lastCompletedAt = now;
  progress.lastAttemptId = attemptId;
  state.lessonProgress[lessonId] = progress;

  quizResult.results.forEach(({ question, selected, correct }) => {
    const existing = state.conceptStates[question.conceptId] || {
      understandingState: "unassessed",
      retentionState: "unassessed",
      retentionLevel: null,
      correctCount: 0,
      incorrectCount: 0
    };

    if (correct) {
      existing.understandingState = "initial";
      existing.correctCount += 1;
    } else {
      existing.retentionState = "weak";
      existing.retentionLevel = "R0";
      existing.incorrectCount += 1;
    }
    existing.lastAnsweredAt = now;
    state.conceptStates[question.conceptId] = existing;
    state.questionHistory.push({
      lessonId,
      attemptId,
      questionId: question.id,
      conceptId: question.conceptId,
      selected,
      correct,
      answeredAt: now
    });
  });
}

export function detectBuilderWeakness(fields, weaknessRules) {
  return weaknessRules
    .filter((rule) => rule.triggerOptionIds
      ? rule.triggerOptionIds.includes(fields[rule.stepId])
      : !rule.acceptableOptionIds.includes(fields[rule.stepId]))
    .map(({ code, message }) => ({ code, message }));
}

export function saveBuilderResult(state, fields, weaknesses, { lessonId, theme, builderId }) {
  const now = new Date().toISOString();
  const existing = builderId ? state.builderProjects.find((project) => project.id === builderId) : null;
  const project = existing || {
    id: `mini-builder-${lessonId}-${Date.now()}`,
    lessonId,
    createdAt: now
  };

  project.theme = theme;
  project.fields = fields;
  project.status = weaknesses.length === 0 ? "completed" : "needs_review";
  project.updatedAt = now;
  if (!existing) state.builderProjects.push(project);

  state.builderWeaknessEvents = state.builderWeaknessEvents.filter((event) => event.builderId !== project.id);
  weaknesses.forEach((weakness) => {
    state.builderWeaknessEvents.push({ ...weakness, lessonId, builderId: project.id, detectedAt: now });
  });
  return project;
}

export function evaluateStageExam(questions, answers, { passScore, questionCount, criticalConcepts }) {
  const quizResult = scoreQuiz(questions, answers, { passScore, questionCount });
  const criticalIds = new Set(criticalConcepts.map((concept) => concept.id));
  const missedCriticalConcepts = quizResult.results
    .filter(({ question, correct }) => !correct && criticalIds.has(question.criticalConceptId))
    .map(({ question }) => question.criticalConceptId);
  const status = quizResult.score < passScore
    ? "review_required"
    : missedCriticalConcepts.length
      ? "passed_with_review"
      : "passed";
  return { ...quizResult, status, missedCriticalConcepts };
}

export function applyStageExamResult(state, examResult, { stageId, attemptId }) {
  const now = new Date().toISOString();
  const progress = state.stageProgress[stageId] || {
    status: "available",
    examStatus: "available",
    builderStatus: "pending",
    bestScore: 0,
    attempts: 0
  };
  progress.status = examResult.status;
  progress.examStatus = examResult.status;
  progress.bestScore = Math.max(progress.bestScore, examResult.score);
  progress.attempts += 1;
  progress.lastAttemptId = attemptId;
  progress.lastExamAt = now;
  state.stageProgress[stageId] = progress;

  examResult.results.forEach(({ question, selected, correct }) => {
    state.stageExamHistory.push({
      stageId,
      attemptId,
      questionId: question.id,
      conceptId: question.conceptId,
      criticalConceptId: question.criticalConceptId || null,
      selected,
      correct,
      answeredAt: now
    });
  });
}

export function saveStageBuilderResult(state, fields, weaknesses, { stageId, builder, builderProjectId }) {
  const now = new Date().toISOString();
  const existing = builderProjectId
    ? state.stageBuilderProjects.find((project) => project.id === builderProjectId)
    : null;
  const project = existing || {
    id: `${builder.builderId}-${Date.now()}`,
    stageId,
    builderId: builder.builderId,
    createdAt: now
  };
  project.theme = builder.theme;
  project.fields = fields;
  project.status = weaknesses.length === 0 ? "completed" : "needs_review";
  project.updatedAt = now;
  if (!existing) state.stageBuilderProjects.push(project);

  state.stageBuilderWeaknessEvents = state.stageBuilderWeaknessEvents.filter((event) => event.builderProjectId !== project.id);
  weaknesses.forEach((weakness) => {
    state.stageBuilderWeaknessEvents.push({ ...weakness, stageId, builderProjectId: project.id, detectedAt: now });
  });

  state.competencyEvidence = state.competencyEvidence.filter((item) => item.builderProjectId !== project.id);
  builder.steps.forEach((step) => {
    const stepWeaknesses = builder.weaknessRules.filter((rule) =>
      rule.stepId === step.id && (rule.triggerOptionIds
        ? rule.triggerOptionIds.includes(fields[step.id])
        : !rule.acceptableOptionIds.includes(fields[step.id])));
    state.competencyEvidence.push({
      competencyId: step.competencyId,
      stageId,
      builderId: builder.builderId,
      builderProjectId: project.id,
      stepId: step.id,
      correct: stepWeaknesses.length === 0,
      weaknessCode: stepWeaknesses[0]?.code || null,
      timestamp: now
    });
  });

  const progress = state.stageProgress[stageId] || { status: "available", examStatus: "available", bestScore: 0, attempts: 0 };
  progress.builderStatus = project.status === "completed" ? "completed" : "pending";
  progress.lastBuilderAt = now;
  state.stageProgress[stageId] = progress;
  return project;
}
