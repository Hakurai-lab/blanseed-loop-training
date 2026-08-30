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

export function detectBuilderWeakness(fields, steps) {
  const definitions = steps.map((step) => ({
    field: step.id,
    correctOptionId: step.correctOptionId,
    code: step.id === "reObservation" ? "feedback_loop_missing" : `${step.id}_incorrect`,
    message: step.id === "reObservation"
      ? "一方向のWorkflowになっており、Feedback Loopが成立していない可能性があります。"
      : `${step.label.replace(/^① |^② |^③ /, "")}の選択がLoopの目的に接続していません。`
  }));

  return definitions
    .filter(({ field, correctOptionId }) => fields[field] !== correctOptionId)
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
