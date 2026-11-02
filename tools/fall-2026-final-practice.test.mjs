import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildFall2026FinalPayload, buildFinalCandidatePool, assertFinalInvariants, isRejectedFinalForm, FINAL_DOMAINS } from '../assets/js/fall-2026-final-practice.js';
import { getQuestionFingerprint, getQuestionConceptKey, getPerformanceKey } from '../assets/js/fall-2026-adaptive-practice.js';
import { loadBrowserGlobal } from './browser-global-harness.mjs';
import { launchFall2026Lab3Final } from '../assets/js/fall-2026-lab3-launcher.js';
const read = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const drugData=JSON.parse(read('assets/data/fall-2026-p2-top-drugs.json'));
const policy=JSON.parse(read('assets/data/fall-2026-lab3-quiz-policy.json'));
const plain=x=>JSON.parse(JSON.stringify(x));
const normalize=x=>String(x).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const words=x=>String(x).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const options={drugData,policy,seed:'final-contract',now:1793120400000};
const balanced=buildFall2026FinalPayload(options);
function independentInvariants(payload) {
 const qs=payload.questions;assert.equal(qs.length,100);
 assert.equal(new Set(qs.map(q=>q.id)).size,100);
 assert.equal(new Set(qs.map(getQuestionFingerprint)).size,100);
 assert.equal(new Set(qs.map(getQuestionConceptKey)).size,100);
 assert.equal(new Set(qs.map(q=>normalize(q.prompt))).size,100);
 const ids=new Set(drugData.drugs.map(d=>d.id)),uses=new Map();
 for(let w=1;w<=10;w++) {
  const week=qs.filter(q=>q.metadata.sourceDrugQuizWeek===w);assert.equal(week.length,10);
  assert.deepEqual([...new Set(week.map(q=>q.metadata.knowledgeDomain))].sort(),[...FINAL_DOMAINS].sort());
 }
 for(const q of qs) {
  assert.equal(isRejectedFinalForm(q),false);assert.equal(q.metadata.generatorId,'fall-2026-p2-lab3-deterministic-generator');
  for(const id of new Set(q.metadata.pairwiseSharedAdr?.sourceDrugIds||q.metadata.sourceDrugIds)) {assert.ok(ids.has(id));uses.set(id,(uses.get(id)||0)+1);}
  for(const entry of q.metadata.choiceSources||[])assert.ok(ids.has(entry.sourceDrugId));
  if(q.metadata.pairwiseSharedAdr)assert.ok(['exactCanonicalClass','approvedFamily'].includes(q.metadata.pairwiseSharedAdr.classCoherence.rule));
 }
 assert.ok(Math.max(...uses.values())<=2);
 assert.ok(qs.filter(q=>q.metadata.pairwiseSharedAdr).length<=5);
 assert.ok(qs.filter(q=>/\bNOT\b|\bEXCEPT\b/.test(q.prompt)).length<=3);
 // Independent complete-100-set check of the shared generator's protected
 // Brand/Generic contract, including every accepted answer and all choices.
 for(const q of qs.filter(q=>q.type==='short'&&q.metadata.knowledgeDomain==='brandGeneric'))for(const a of [q.answer,...(q._acceptedAnswers||[])])for(const other of qs)if(other.id!==q.id)assert.ok(!` ${words([other.prompt,...(other.choices||[])].join(' '))} `.includes(` ${words(a)} `),`${q.id} leaks through ${other.id}`);
 for(let i=1;i<qs.length;i++) {
  assert.notEqual(qs[i].metadata.sourceDrugQuizWeek,qs[i-1].metadata.sourceDrugQuizWeek);
  const a=qs[i].metadata.pairwiseSharedAdr?.sourceDrugIds||qs[i].metadata.sourceDrugIds;
  const b=qs[i-1].metadata.pairwiseSharedAdr?.sourceDrugIds||qs[i-1].metadata.sourceDrugIds;
  assert.ok(!a.some(id=>b.includes(id)));
  if(i>1)assert.ok(!(qs[i].metadata.knowledgeDomain===qs[i-1].metadata.knowledgeDomain&&qs[i].metadata.knowledgeDomain===qs[i-2].metadata.knowledgeDomain));
 }
 assert.deepEqual(payload.metadata.finalPractice.orderedFingerprints,qs.map(getQuestionFingerprint));
 assertFinalInvariants(qs,payload.metadata.finalPractice.envelope);
}
test('100 seeded cumulative sets preserve ten per week, six domains, concepts, caps, source and complete-set leakage safety',()=>{
 for(let n=0;n<100;n++) independentInvariants(buildFall2026FinalPayload({...options,seed:`final-distribution-${n}`,mode:n%2?'adaptive':'balanced'}));
});
test('Balanced never reads weakness evidence or time; frozen inputs reproduce full payload and ordering',()=>{
 const poisoned={...options};for(const key of ['reviewEntries','historyEntries','memory','now'])Object.defineProperty(poisoned,key,{get(){throw Error(`Balanced read ${key}`);}});
 assert.deepEqual(buildFall2026FinalPayload(poisoned),balanced);
 assert.deepEqual(buildFall2026FinalPayload(options),balanced);
 independentInvariants(balanced);
 assert.deepEqual(drugData,JSON.parse(read('assets/data/fall-2026-p2-top-drugs.json')));
});
test('Adaptive signals change eligible selection without moving any envelope slot or importing weekly 6+4',()=>{
 const pool=buildFinalCandidatePool(options);
 const unselected=pool.filter(q=>!balanced.questions.some(x=>getQuestionConceptKey(x)===getQuestionConceptKey(q)));
 const reviewEntries=unselected.slice(0,30).map(q=>({prompt:q.prompt,answer:q.answer,missCount:20,lastMissedAt:options.now,createdAt:options.now}));
 const adaptive=buildFall2026FinalPayload({...options,mode:'adaptive',reviewEntries});
 assert.deepEqual(adaptive.metadata.finalPractice.envelope,balanced.metadata.finalPractice.envelope);
 assert.notDeepEqual(adaptive.questions.map(getQuestionConceptKey),balanced.questions.map(getQuestionConceptKey));
 assert.ok(adaptive.questions.filter(q=>reviewEntries.some(e=>getPerformanceKey(e)===getPerformanceKey(q))).length>balanced.questions.filter(q=>reviewEntries.some(e=>getPerformanceKey(e)===getPerformanceKey(q))).length);
 assert.deepEqual(buildFall2026FinalPayload({...options,mode:'adaptive',reviewEntries}),adaptive);
 independentInvariants(adaptive);
});
test('insufficient safe capacity fails closed before saving, and storage quota failure never navigates',async()=>{
 const short=structuredClone(drugData);for(const drug of short.drugs)drug.boxWarning='none';
 assert.throws(()=>buildFall2026FinalPayload({...options,drugData:short}),/Final capacity/);
 const oldStorage=globalThis.localStorage,oldWindow=globalThis.window;
 let assigned=false;const saved=new Map([['pharmlet.custom-quiz','existing-attempt']]);let writes=0;
 globalThis.window={location:{assign(){assigned=true;}}};
 globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem(){writes++;throw Error('quota');}};
 try {await assert.rejects(launchFall2026Lab3Final('balanced',{...options,drugData:short}));assert.equal(writes,0);await assert.rejects(launchFall2026Lab3Final('balanced',options),/quota/);assert.equal(writes,1);assert.equal(assigned,false);assert.equal(saved.get('pharmlet.custom-quiz'),'existing-attempt');}
 finally{globalThis.localStorage=oldStorage;globalThis.window=oldWindow;}
});
test('Final history, completion, review identity and score remain distinct from weekly and P1',()=>{
 const map=new Map();const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const e=loadBrowserGlobal('assets/js/quizEngine.js',{document:{addEventListener(){},createElement(){return{innerHTML:'',get textContent(){return this.innerHTML.replace(/<[^>]*>/g,'');}}}},location:{search:'?id=custom-quiz',href:'http://localhost/quiz.html?id=custom-quiz'},localStorage:storage,sessionStorage:storage});
 e.payload=balanced;
 vm.runInContext('state.attemptMetadata=payload.metadata; state.title=payload.title; state.questions=payload.questions.map(q=>({...q,_answered:true,_correct:true,_user:q.answer}));state.score=100;state.generatedAttemptIdentity=buildGeneratedAttemptIdentity(payload);',e);
 assert.equal(vm.runInContext('getHistoryModeLabel()',e),'final-balanced');
 assert.equal(e.buildFallLab3HistoryLineage().attemptKind,'fall-2026-lab3-final-balanced');
 assert.equal(e.buildFallLab3FinalBreakdown().weeks['10'].total,10);
 e.saveQuizHistory();e.saveQuizHistory();const history=JSON.parse(map.get('pharmlet.history'));assert.equal(history.length,1);assert.equal(history[0].score,100);assert.equal(history[0].total,100);assert.equal(history[0].fallFinalSummary.domains.boxWarning.total,balanced.questions.filter(q=>q.metadata.knowledgeDomain==='boxWarning').length);
 for(const reviewMode of [false,true]){
  const actions=e.getCompletionContinuationActions({reviewMode,missedCount:2,fall:{active:true,quizWeek:10},finalPractice:{active:true,mode:'balanced'}});
  assert.deepEqual(Array.from(actions,a=>a.id),['review-missed','new-final-practice','retry-attempt','lab3-hub']);
 }
 vm.runInContext('state.reviewMode=true;state.resultsRecorded=false;',e);e.saveQuizHistory();assert.equal(JSON.parse(map.get('pharmlet.history')).length,1);
});
test('cache chain includes the Final composer, both source parents, engine and Stats',()=>{
 assert.match(read('assets/js/fall-2026-lab3-launcher.js'),/fall-2026-final-practice\.js\?v=20261101d/);
 for(const p of ['assets/js/fall-2026-final-practice.js','assets/js/fall-2026-adaptive-practice.js','assets/js/fall-2026-lab3-launcher.js'])assert.match(read(p),/fall-2026-quiz-generator\.js\?v=20261101d/);
 assert.match(read('quiz.html'),/quizEngine\.js\?v=20261101d/);assert.match(read('stats.html'),/stats\.js\?v=20261101d/);
});

test('Stats distinguishes Balanced and Adaptive Finals through lineage and exam/practice mode IDs',()=>{
 const stats=loadBrowserGlobal('assets/js/stats.js',{document:{addEventListener(){}}});
 for(const mode of ['balanced','adaptive'])for(const exam of ['', '-exam']){
  const raw={mode:`final-${mode}${exam}`};
  assert.equal(stats.resolveAttemptType(raw,{}).typeId,`fall-lab3-final-${mode}`);
  assert.equal(stats.resolveAttemptType(raw,{attemptKind:`fall-2026-lab3-final-${mode}`}).typeId,`fall-lab3-final-${mode}`);
 }
});
