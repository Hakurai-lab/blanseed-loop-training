// Development-only checks; no dependencies or build step for the application.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));
const moduleFrom = async path => import('data:text/javascript;base64,' + Buffer.from(read(path)).toString('base64'));
const training = await moduleFrom('src/training.js');
let stored = null;
globalThis.localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
const store = await moduleFrom('src/store.js');
const catalog = json('data/lessons.json');
for (const item of catalog.lessons) {
  stored = null;
  const lesson = json(item.path), state = store.loadState();
  const questions = lesson.quiz.questions;
  assert.equal(questions.length, lesson.questionCount);
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  questions.forEach(q => assert.equal(q.options.filter(o => o.id === q.correctOptionId).length, 1));
  for (let score = 0; score <= questions.length; score++) {
    const answers = Object.fromEntries(questions.map((q, i) => [q.id, i < score ? q.correctOptionId : q.options.find(o => o.id !== q.correctOptionId).id]));
    const result = training.scoreQuiz(questions, answers, lesson);
    assert.equal(result.score, score);
    assert.equal(result.passed, score >= lesson.passScore);
  }
  const answers = Object.fromEntries(questions.map(q => [q.id, q.correctOptionId]));
  answers[questions[0].id] = questions[0].options.find(o => o.id !== questions[0].correctOptionId).id;
  training.applyQuizResult(state, training.scoreQuiz(questions, answers, lesson), {lessonId: lesson.id, attemptId: 'test-attempt'});
  assert.equal(state.lessonProgress[lesson.id].lessonStatus, 'completed');
  assert.equal(state.conceptStates[questions[0].conceptId].retentionState, 'weak');
  assert.equal(state.conceptStates[questions[0].conceptId].retentionLevel, 'R0');
  questions.slice(1).forEach(q => assert.equal(state.conceptStates[q.conceptId].understandingState, 'initial'));
  Object.values(state.conceptStates).forEach(c => assert.notEqual(c.retentionState, 'stable'));
  const builder = lesson.miniBuilder;
  const fields = builder.acceptableConnections[0].selections;
  const weaknesses = training.detectBuilderWeakness(fields, builder.weaknessRules);
  assert.deepEqual(weaknesses, []);
  const project = training.saveBuilderResult(state, fields, weaknesses, {lessonId: lesson.id, theme: builder.theme});
  training.saveBuilderResult(state, fields, weaknesses, {lessonId: lesson.id, theme: builder.theme, builderId: project.id});
  assert.equal(state.builderProjects.length, 1);
  assert.equal(state.builderProjects[0].id, project.id);
  assert.equal(store.saveState(state), true);
  assert.deepEqual(store.loadState(), state);
}
for (const item of catalog.stages) {
  const stage = json(item.path), exam = stage.exam;
  assert.equal(exam.questions.length, exam.questionCount);
  const answers = Object.fromEntries(exam.questions.map(q => [q.id, q.correctOptionId]));
  assert.equal(training.evaluateStageExam(exam.questions, answers, exam).status, 'passed');
}
for (const broken of ['{', 'null', '[]', '{"lessonProgress":{"01":{}},"conceptStates":null,"questionHistory":[null]}']) {
  stored = broken;
  assert.ok(Array.isArray(store.loadState().builderProjects));
}
globalThis.localStorage.setItem = () => { throw new Error('quota'); };
assert.equal(store.saveState(store.loadState()), false);
assert.ok(store.getStorageError());
const app = read('src/app.js');
assert.doesNotMatch(app, /escapeHtml\((option\.id|step\.id|question\.id|lesson\.id|stage\.stageId|lessonId|stageId)\)/);
console.log(`PASS: ${catalog.lessons.length} lessons, ${catalog.stages.length} stages, scoring boundaries, retention separation, builder identity, storage restoration/failure, internal ID escaping`);
