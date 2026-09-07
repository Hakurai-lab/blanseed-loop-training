// Renderer checks use a minimal DOM stub, not a browser or mobile layout test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const catalog = JSON.parse(read('data/lessons.json'));
const data = catalog.lessons.map(item => JSON.parse(read(item.path)));
const stageData = catalog.stages.map(item => JSON.parse(read(item.path)));
const app = { innerHTML: '', focus() {} };
const control = {addEventListener() {}, querySelectorAll: () => [], querySelector: () => control};
const state = {lessonProgress: {}, builderProjects: [], conceptStates: {}, stageProgress: {}, stageBuilderProjects: [], stageBuilderWeaknessEvents: []};
const context = vm.createContext({
  document: {querySelector: selector => selector === '#app' ? app : selector === '#storage-alert' ? null : control},
  window: {scrollTo() {}}, crypto: {randomUUID: () => 'test-id'},
  loadState: () => state, updateState: fn => fn(state), getStorageError: () => null,
  data, stageData, catalog, state, assert
});
vm.runInContext(read('src/app.js').replace(/import[\s\S]*?from "\.\/(?:store|training)\.js";\n/g, '').replace(/start\(\);\s*$/, ''), context);
vm.runInContext(`
  lessons = new Map(data.map(lesson => [lesson.id, lesson]));
  stages = new Map(stageData.map(stage => [stage.stageId, stage]));
  curriculum = catalog;
  renderHome();
  assert.ok(app.innerHTML.includes('現在地（Current Position）'));
  for (const stage of stageData) {
    for (const status of ['passed', 'passed_with_review', 'review_required']) {
      stageExamSession.stageId = stage.stageId;
      latestStageExamResult = {
        status, score: status === 'review_required' ? 0 : stage.exam.passScore,
        missedCriticalConcepts: status === 'passed' ? [] : [stage.exam.criticalConcepts[0].id],
        results: stage.exam.questions.map(question => ({question, selected: question.correctOptionId, correct: true}))
      };
      renderStageExamResult(stage);
      assert.ok(app.innerHTML.includes('判定（Status）'));
      assert.ok(app.innerHTML.includes('知識の定着状態（Retention State）'));
    }
    state.stageBuilderProjects.push({id: stage.stageId, stageId: stage.stageId, status: 'completed'});
    renderStageBuilderWeakness(stage);
    assert.ok(app.innerHTML.includes('このステージの設計要素'));
    assert.ok(!app.innerHTML.includes('5要素'));
    state.stageProgress[stage.stageId] = {examStatus: 'passed', builderStatus: 'completed'};
  }
  renderHome();
  assert.ok(app.innerHTML.includes('次のステージ（Stage）は未実装'));
  for (const lesson of data) {
    assert.ok(lesson.content.simpleFlow.length >= 3);
    renderLesson(lesson);
    for (const node of lesson.content.simpleFlow) {
      assert.ok(app.innerHTML.includes(escapeLiteral(node.label)));
      assert.ok(app.innerHTML.includes(escapeHtml(node.caption)));
    }
    assert.ok(app.innerHTML.includes('問の理解確認（Quiz）へ進む'));
    renderQuiz(lesson);
    for (const q of lesson.quiz.questions) {
      assert.ok(app.innerHTML.includes('data-question-id="' + q.id + '"'));
      assert.ok(app.innerHTML.includes(escapeHtml(q.prompt)));
    }
    assert.ok(app.innerHTML.includes('ヒント（Hint）を見る'));
    renderBuilder(lesson);
    for (const step of lesson.miniBuilder.steps) for (const option of step.options) {
      assert.ok(app.innerHTML.includes('value="' + option.id + '"'));
      assert.ok(app.innerHTML.includes(escapeHtml(option.label)));
    }
  }
  assert.equal(localizeConcepts('現在の状態（State）'), '現在の状態（State）');
  assert.equal(localizeConcepts('Observation(状態を観測)'), '状態を観測（Observation）');
  assert.equal(escapeLiteral('State_option'), 'State_option');
  const resumedLesson = data[0];
  quizSession = {lessonId: resumedLesson.id, answers: {[resumedLesson.quiz.questions[0].id]: resumedLesson.quiz.questions[0].correctOptionId}, attemptId: 'resume-test'};
  latestQuizResult = null;
  renderQuiz(resumedLesson);
  assert.ok(app.innerHTML.includes('1 / 5問 回答済み'));
  assert.ok(app.innerHTML.includes('disabled checked'));
  assert.ok(app.innerHTML.includes('正しい回答：'));
  for (const question of resumedLesson.quiz.questions) quizSession.answers[question.id] = question.correctOptionId;
  renderQuiz(resumedLesson);
  assert.ok(app.innerHTML.includes('5 / 5問 回答済み'));
  assert.ok(app.innerHTML.includes('type="submit" >結果を見る'));
`, context);
console.log('PASS: Home, 3 stage result statuses per stage, stage builder completion, 12 lesson/quiz/builder renderers, Japanese-first conversion');
