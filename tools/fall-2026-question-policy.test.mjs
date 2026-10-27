import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildQuestionCandidates, materializeQuestionCandidate, createSeededRng, generateFall2026Quiz } from '../assets/js/fall-2026-quiz-generator.js';
import { buildFall2026AdaptivePayload } from '../assets/js/fall-2026-adaptive-practice.js';
import { loadBrowserGlobal } from './browser-global-harness.mjs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const drugData = JSON.parse(read('assets/data/fall-2026-p2-top-drugs.json'));
const policy = JSON.parse(read('assets/data/fall-2026-lab3-quiz-policy.json'));
function allowed(q) {
  const m = q.metadata;
  assert.ok(!(m.knowledgeDomain === 'topAdverseReactions' && m.questionVariant === 'identifyDrugByStructuredValue'), q.prompt);
  assert.ok(!(m.knowledgeDomain === 'boxWarning' && m.choicePredicate?.value?.toLowerCase() === 'none'), q.prompt);
  assert.doesNotMatch(q.prompt, /Which drug has no boxed|Which drug.*(?:full|complete).*?(?:ADR|adverse.reaction).*list|\bNOT\b.*boxed/i);
}
test('faculty-rejected forms are absent from raw candidates, materialization, weekly, focus, Adaptive and fresh Boss pools', () => {
  const engine = loadBrowserGlobal('assets/js/quizEngine.js', {
    document: { addEventListener() {} }, location: { search: '?id=custom-quiz' },
    localStorage: { getItem() { return null; } }, sessionStorage: { getItem() { return null; } }
  });
  const capacities = [];
  const seen = new Set();
  for (let week = 1; week <= 10; week++) {
    const candidates = buildQuestionCandidates({ drugData, policy, quizWeek: week, materialType: 'new' });
    capacities.push(candidates.length);
    assert.ok(candidates.length >= 35, `Week ${week} capacity ${candidates.length}`);
    for (const candidate of candidates) {
      const raw = materializeQuestionCandidate({ drugData, policy, candidate, rng: createSeededRng(`raw-${week}-${candidate.id}`) });
      assert.equal(raw.status, 'materialized'); allowed(raw.question);
    }
    for (let seed = 0; seed < 10; seed++) {
      for (const mode of ['standard', 'week-focus']) {
        const round = generateFall2026Quiz({ drugData, policy, quizWeek: week, seed: `policy-${week}-${seed}-${mode}`, ...(mode === 'week-focus' ? { mode, questionCount: 10 } : week === 1 ? { mode: 'practice', questionCount: 10 } : {}) });
        assert.equal(round.questions.length, 10);
        round.questions.forEach(q => { allowed(q); seen.add(q.metadata.questionVariant); });
        if (mode === 'standard') {
          const remix = engine.buildFallLab3BossRemixPayload({ request: { quizWeek: week, remixGeneration: 1, targetSize: 6, focusDomains: ['topAdverseReactions'], chainQuestionIds: [], fallbackQuestions: [] }, practicePayload: { questions: round.questions }, createdAt: 0 });
          remix?.questions.forEach(allowed);
        }
      }
    }
    const adaptive = buildFall2026AdaptivePayload({ drugData, policy, targetWeek: week, seed: `policy-adaptive-${week}`, now: 0 });
    assert.equal(adaptive.questions.length, 10); adaptive.questions.forEach(allowed);
  }
  assert.ok(seen.has('atomicAdverseReactionRecognition'));
  assert.ok(seen.has('pairwiseSharedAdrRecognition'));
  assert.ok(seen.has('boxWarningDrugRecognition'));
});
test('all generator importers and cached parents advance together', () => {
  for (const parent of ['assets/js/fall-2026-lab3-launcher.js', 'assets/js/fall-2026-adaptive-practice.js']) assert.match(read(parent), /fall-2026-quiz-generator\.js\?v=20261027b/);
  assert.match(read('assets/js/fall-2026-lab3-launcher.js'), /fall-2026-adaptive-practice\.js\?v=20261027b/);
  assert.match(read('assets/js/quizEngine.js'), /fall-2026-lab3-launcher\.js\?v=20261027b/);
  assert.match(read('lab3-fall-2026.html'), /fall-2026-lab3-launcher\.js\?v=20261027b/);
  assert.match(read('quiz.html'), /quizEngine\.js\?v=20261027b/);
});
