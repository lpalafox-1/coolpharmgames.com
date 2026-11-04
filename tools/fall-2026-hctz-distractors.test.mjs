import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {buildQuestionCandidates, materializeQuestionCandidate, createSeededRng} from '../assets/js/fall-2026-quiz-generator.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const data=JSON.parse(read('assets/data/fall-2026-p2-top-drugs.json'));
const policy=JSON.parse(read('assets/data/fall-2026-lab3-quiz-policy.json'));
const api=vm.createContext({});
vm.runInContext(read('assets/js/fall-2026-quiz-generator.js').replace(/^export /gm,''),api);
const h=data.drugs.find(d=>d.genericName==='Hydrochlorothiazide');
const chl=data.drugs.find(d=>d.genericName==='Chlorthalidone');

test('HCTZ hyperuricemia is an exclusion, never an invented canonical answer or FDA fact',()=>{
 const before=JSON.stringify(data),c=api.createContext(data,policy);
 assert.ok(!h.adverseReactions.includes('Hyperuricemia'));
 assert.ok(chl.adverseReactions.includes('Hyperuricemia'));
 assert.equal(api.isLabelSupportedHctzHyperuricemia(h,'fdaIndication','Hyperuricemia'),false);
 assert.equal(api.isLabelSupportedHctzHyperuricemia({...h,id:'unrelated'},'topAdverseReactions','Hyperuricemia'),false);
 for(let w=2;w<=10;w++){
  const options=api.getSourceAtomicFactOptions(c,h,'topAdverseReactions',w,w===2?'new':'review');
  assert.ok(options.distractors.length>=3);
  assert.ok(options.distractors.every(e=>e.value!=='Hyperuricemia'));
  assert.deepEqual([...options.facts],h.adverseReactions);
  assert.equal(api.getSourceAtomicFactOptions(c,h,'topAdverseReactions',w,w===2?'new':'review'),options);
 }
 assert.equal(JSON.stringify(data),before);
});

test('HCTZ reverse exclusion survives cached pools and leakage rebuild without a predicate source ID',()=>{
 const c=api.createContext(data,policy),p=api.withMaterialChoiceWeekRange(api.createArrayContainsPredicate('topAdverseReactions','Hyperuricemia',chl),'new',2);
 const candidate={id:'hctz-rebuild',sourceDrugId:chl.id,sourceDrugIds:[chl.id],sourceDrugQuizWeek:2,requestedQuizWeek:2,materialType:'new',domainId:'topAdverseReactions',questionType:'mcq'};
 for(const predicate of [p,{...p,sourceDrugId:undefined}]){
  assert.equal(api.drugMatchesChoicePredicate(h,predicate),false);
  assert.equal(api.drugIsSafePredicateNonmatch(h,predicate,c,2),false);
  const pool=api.getPredicateChoicePools(c,predicate,2);
  assert.ok(!pool.nonmatching.some(d=>d.id===h.id));
  assert.ok(pool.nonmatching.length>=3);
 }
 const result=api.materializePredicateDrugQuestion({context:c,candidate,sourceDrug:chl,predicate:p,answerWhenMatches:true,questionVariant:'atomicAdverseReactionRecognition',prompt:'Clinical exclusion regression',rng:createSeededRng('hctz')});
 assert.equal(result?.status,'materialized');
 const q=result.question,i=q.metadata.choiceSources.findIndex(e=>e.role==='distractor');
 const unsafe=api.createPredicateDrugChoiceEntry(c,h,p,2,'distractor');
 q.metadata.choiceSources[i]=unsafe;q.choices[i]=unsafe.value;delete q.metadata.choicePredicate.sourceDrugId;
 const rebuilt=api.rebuildPredicateChoicesForProtections(c,q,new Map());
 assert.ok(rebuilt);assert.equal(rebuilt.choices.length,4);
 assert.ok(!rebuilt.metadata.choiceSources.some(e=>e.sourceDrugId===h.id));
});

test('real HCTZ forward questions retain canonical answers and four choices; pair eligibility stays unchanged',()=>{
 const c=api.createContext(data,policy);
 assert.equal(api.getPairwiseClassCoherence(h,chl),null);
 assert.equal(api.getPairwiseSharedAdr(h,chl),null,'two shared canonical facts do not qualify for this variant');
 const candidate=buildQuestionCandidates({drugData:data,policy,quizWeek:2,materialType:'new'}).find(c=>c.sourceDrugId===h.id&&c.domainId==='topAdverseReactions');
 assert.ok(candidate);
 for(let n=0;n<30;n++){
  const result=api.materializeSourceAtomicFact(c,candidate,h,createSeededRng(`hctz-forward-${n}`));
  assert.equal(result.status,'materialized');assert.equal(result.question.choices.length,4);
  assert.ok(h.adverseReactions.includes(result.question.answer));
  assert.ok(!result.question.choices.includes('Hyperuricemia'));
 }
});

test('all 513 raw candidates retain materialization and the exact per-week capacity',()=>{
 const counts=[];
 for(let w=1;w<=10;w++){
  const cs=buildQuestionCandidates({drugData:data,policy,quizWeek:w,materialType:'new'});counts.push(cs.length);
  for(const candidate of cs)assert.equal(materializeQuestionCandidate({drugData:data,policy,candidate,rng:createSeededRng(candidate.id)}).status,'materialized');
 }
 assert.deepEqual(counts,[55,57,54,51,53,50,51,43,47,52]);
});
