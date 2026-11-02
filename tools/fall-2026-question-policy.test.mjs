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
  assert.doesNotMatch(q.prompt, /\b(?:complete|full|entire|exhaustive)\b.*(?:indication|ADR|adverse)/i);
  assert.ok(!['notFdaIndicationRecognition', 'familyNotAdrRecognition', 'brandToGenericRecognition'].includes(m.questionVariant));
  if (m.knowledgeDomain === 'brandGeneric') {
    assert.equal(q.type, 'short');
    assert.equal(m.answerMatching.spellingSensitive, true);
    assert.equal(m.answerMatching.capitalizationSensitive, false);
  }
  if (['fdaIndication','topAdverseReactions'].includes(m.knowledgeDomain)) {
    assert.notEqual(m.questionVariant, 'structuredValueChoices');
    assert.notEqual(m.questionVariant, 'identifyDrugByStructuredValue');
  }
  assert.ok(!(m.knowledgeDomain === 'topAdverseReactions' && m.questionVariant === 'identifyDrugByStructuredValue'), q.prompt);
  assert.ok(!(m.knowledgeDomain === 'boxWarning' && m.choicePredicate?.value?.toLowerCase() === 'none'), q.prompt);
  if (m.knowledgeDomain === 'boxWarning') {
    for (const value of [q.answer,...q.choices]) assert.notEqual(String(value).trim().toLowerCase(),'none');
  }
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
    assert.equal(new Set(candidates.map(c=>c.domainId)).size, 6, `Week ${week}: six domains viable`);
    for (const candidate of candidates) {
      const raw = materializeQuestionCandidate({ drugData, policy, candidate, rng: createSeededRng(`raw-${week}-${candidate.id}`) });
      assert.equal(raw.status, 'materialized'); allowed(raw.question);
    }
    for (let seed = 0; seed < 10; seed++) {
      for (const mode of ['standard', 'week-focus']) {
        const round = generateFall2026Quiz({ drugData, policy, quizWeek: week, seed: `policy-${week}-${seed}-${mode}`, ...(mode === 'week-focus' ? { mode, questionCount: 10 } : week === 1 ? { mode: 'practice', questionCount: 10 } : {}) });
        assert.equal(round.questions.length, 10);
        assert.equal(round.questions.filter(q=>q.metadata.sourceDrugQuizWeek===week).length, mode === 'week-focus' || week===1 ? 10 : 6);
        round.questions.forEach(q => { allowed(q); seen.add(q.metadata.questionVariant); });
        if (mode === 'standard') {
          const remix = engine.buildFallLab3BossRemixPayload({ request: { quizWeek: week, remixGeneration: 1, targetSize: 6, focusDomains: ['topAdverseReactions'], chainQuestionIds: [], fallbackQuestions: [] }, practicePayload: { questions: round.questions }, createdAt: 0 });
          remix?.questions.forEach(allowed);
        }
      }
    }
    const adaptive = buildFall2026AdaptivePayload({ drugData, policy, targetWeek: week, seed: `policy-adaptive-${week}`, now: 0 });
    assert.equal(adaptive.questions.length, 10); adaptive.questions.forEach(allowed);
    assert.equal(adaptive.questions.filter(q=>q.metadata.sourceDrugQuizWeek===week).length, week===1 ? 10 : 6);
  }
  assert.ok(seen.has('atomicAdverseReactionRecognition'));
  assert.ok(seen.has('pairwiseSharedAdrRecognition'));
  assert.ok(seen.has('boxWarningDrugRecognition'));
});
test('all generator importers and cached parents advance together', () => {
  for (const parent of ['assets/js/fall-2026-lab3-launcher.js', 'assets/js/fall-2026-adaptive-practice.js']) assert.match(read(parent), /fall-2026-quiz-generator\.js\?v=20261101c/);
  assert.match(read('assets/js/fall-2026-lab3-launcher.js'), /fall-2026-adaptive-practice\.js\?v=20261101c/);
  assert.match(read('assets/js/quizEngine.js'), /fall-2026-lab3-launcher\.js\?v=20261101c/);
  assert.match(read('lab3-fall-2026.html'), /fall-2026-lab3-launcher\.js\?v=20261101c/);
  assert.match(read('quiz.html'), /quizEngine\.js\?v=20261101c/);
});

test('forged absence-of-warning and insufficient atomic pools fail closed without list fallbacks', () => {
  const drug = drugData.drugs.find(d=>d.boxWarning.toLowerCase()==='none');
  const candidate = { id:'forged', sourceDrugId:drug.id, sourceDrugIds:[drug.id], sourceDrugQuizWeek:drug.quizWeek, requestedQuizWeek:drug.quizWeek, materialType:'new', domainId:'boxWarning', questionType:'mcq' };
  assert.equal(materializeQuestionCandidate({drugData,policy,candidate,rng:createSeededRng('absence')}).status,'unavailable');
  const fixture=structuredClone(drugData);
  fixture.drugs.forEach(d=>{d.fdaIndications=['Same fact'];d.adverseReactions=['Same reaction'];});
  for(const domainId of ['fdaIndication','topAdverseReactions']) {
    assert.equal(materializeQuestionCandidate({drugData:fixture,policy,candidate:{...candidate,domainId},rng:createSeededRng(domainId)}).status,'unavailable');
  }
});

test('Farxiga, Topamax and Tenormin atomic choices never key one valid indication against another', () => {
  for(const brand of ['Farxiga','Topamax','Tenormin']) {
    const drug=drugData.drugs.find(d=>d.brandNames.some(b=>b.includes(brand)));
    assert.ok(drug,brand);
    const candidate=buildQuestionCandidates({drugData,policy,quizWeek:drug.quizWeek,materialType:'new'}).find(c=>c.sourceDrugId===drug.id&&c.domainId==='fdaIndication');
    assert.ok(candidate,brand);
    for(let seed=0;seed<12;seed++) {
      const {question:q}=materializeQuestionCandidate({drugData,policy,candidate,rng:createSeededRng(`${brand}-${seed}`)});
      allowed(q);assert.equal(q.type,'mcq');assert.equal(q.choices.length,4);
      if(q.metadata.stemReference) {
        assert.ok(drug.fdaIndications.includes(q.answer));
        assert.equal(q.choices.filter(c=>drug.fdaIndications.includes(c)).length,1);
      } else assert.equal(q.metadata.choiceSources.filter(c=>c.predicateMatches).length,1);
    }
  }
});

test('six domains and content identity survive all new safe weekly sets without mutating canonical input', () => {
  const before=JSON.stringify({drugData,policy});
  for(let week=1;week<=10;week++) {
    const q=generateFall2026Quiz({drugData,policy,quizWeek:week,mode:'week-focus',questionCount:10,seed:`faculty-focus-${week}`}).questions;
    assert.equal(new Set(q.map(x=>x.metadata.knowledgeDomain)).size,6);
    assert.equal(new Set(q.map(x=>x.id)).size,10);
    q.forEach(allowed);
  }
  assert.equal(JSON.stringify({drugData,policy}),before);
});

test('positive BBW forward, inverse and constrained fallback paths never offer None',()=>{
  const seen=new Set();
  for(let week=1;week<=10;week++) {
    const candidates=buildQuestionCandidates({drugData,policy,quizWeek:week,materialType:'new'}).filter(c=>c.domainId==='boxWarning');
    for(const candidate of candidates)for(let n=0;n<12;n++) {
      const result=materializeQuestionCandidate({drugData,policy,candidate,rng:createSeededRng(`bbw-${week}-${n}`)});
      assert.equal(result.status,'materialized');allowed(result.question);
      seen.add(result.question.metadata.questionVariant||'forward');
    }
  }
  assert.ok(seen.has('forward'));
  for(let week=1;week<=10;week++)for(let n=0;n<6;n++) {
    const round=generateFall2026Quiz({drugData,policy,quizWeek:week,mode:'week-focus',questionCount:10,seed:`bbw-calibrated-${week}-${n}`});
    for(const q of round.questions.filter(q=>q.metadata.knowledgeDomain==='boxWarning')) {allowed(q);seen.add(q.metadata.questionVariant);}
  }
  assert.ok(seen.has('boxWarningDrugRecognition'));
  // Only one positive warning value: forward warning choices cannot use None
  // to pad capacity. The supported inverse drug-choice fallback may still work.
  const fixture=structuredClone(drugData);
  for(const d of fixture.drugs)if(d.boxWarning.toLowerCase()!=='none')d.boxWarning='Supported warning';
  const source=fixture.drugs.find(d=>d.boxWarning==='Supported warning');
  const candidate={id:'constrained-bbw',sourceDrugId:source.id,sourceDrugIds:[source.id],sourceDrugQuizWeek:source.quizWeek,requestedQuizWeek:source.quizWeek,materialType:'new',domainId:'boxWarning',questionType:'mcq'};
  for(let n=0;n<12;n++) {
    const result=materializeQuestionCandidate({drugData:fixture,policy,candidate,rng:createSeededRng(`bbw-fallback-${n}`)});
    if(result.status==='materialized')allowed(result.question);
    else assert.equal(result.status,'unavailable');
  }
});
