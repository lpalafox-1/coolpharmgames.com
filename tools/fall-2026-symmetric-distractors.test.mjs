import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {buildQuestionCandidates,materializeQuestionCandidate,createSeededRng} from '../assets/js/fall-2026-quiz-generator.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const drugData=JSON.parse(read('assets/data/fall-2026-p2-top-drugs.json'));
const policy=JSON.parse(read('assets/data/fall-2026-lab3-quiz-policy.json'));
// Exercise the shipped private helpers without adding a runtime test export.
// This module is pure JS; only ESM export keywords are removed for node:vm.
const api=vm.createContext({});
vm.runInContext(read('assets/js/fall-2026-quiz-generator.js').replace(/^export /gm,''),api);
const named=name=>drugData.drugs.find(d=>d.genericName===name);
const cases=[
 {value:'Hypercholesterolemia',domain:'fdaIndication',source:'Ezetimibe',negative:'Pravastatin',sibling:'Lovastatin'},
 {value:'Hyperlipidemia',domain:'fdaIndication',source:'Gemfibrozil',negative:'Lovastatin',sibling:'Pravastatin'},
 {value:'Hypotension',domain:'topAdverseReactions',source:'Bisoprolol',negative:'Enalapril',sibling:'Lisinopril'}
];
for(const c of cases)test(`${c.value}: distractor's own classmates protect pools, cache, capacity and leakage rebuild with or without a predicate source`,()=>{
 const context=api.createContext(drugData,policy),source=named(c.source),negative=named(c.negative),sibling=named(c.sibling),week=source.quizWeek;
 assert.ok(source&&negative&&sibling);
 assert.notEqual(source.drugClass,negative.drugClass,'this must not be caught only by the answer-class safeguard');
 assert.equal(negative.drugClass,sibling.drugClass);
 const predicate=api.withMaterialChoiceWeekRange(api.createArrayContainsPredicate(c.domain,c.value,source),'new',week);
 assert.equal(api.drugMatchesChoicePredicate(source,predicate),true);
 assert.equal(api.drugMatchesChoicePredicate(negative,predicate),false,'negative omits the fact itself');
 assert.equal(api.drugMatchesChoicePredicate(sibling,predicate),true,'a real canonical classmate supplies the omitted fact');
 for(const p of[predicate,{...predicate,sourceDrugId:undefined}]){
  assert.equal(api.drugIsSafePredicateNonmatch(negative,p,context,week),false);
  const pool=api.getPredicateChoicePools(context,p,week);
  assert.equal(api.getPredicateChoicePools(context,p,week),pool,'the existing predicate cache is used');
  assert.ok(!pool.nonmatching.some(d=>d.id===negative.id));
  assert.ok(pool.nonmatching.length>=3,'safe capacity must actually remain');
  assert.equal(api.hasSingleAnswerPredicateCapacity(context,source,p,week,true),true);
 }
 const candidate={id:`symmetric-${c.value}`,sourceDrugId:source.id,sourceDrugIds:[source.id],sourceDrugQuizWeek:week,requestedQuizWeek:week,materialType:'new',domainId:c.domain,questionType:'mcq'};
 const generated=api.materializePredicateDrugQuestion({context,candidate,sourceDrug:source,predicate,answerWhenMatches:true,questionVariant:c.domain==='fdaIndication'?'atomicFdaIndicationRecognition':'atomicAdverseReactionRecognition',prompt:`Which drug has ${c.value}?`,rng:createSeededRng(c.value)});
 assert.equal(generated?.status,'materialized');
 const q=generated.question,index=q.metadata.choiceSources.findIndex(x=>x.role==='distractor');
 assert.ok(index>=0);
 // Model a pre-fix question entering the existing leakage rebuild. Its old
 // distractor is unprotected by brand answers, so only clinical safety removes it.
 const unsafe=api.createPredicateDrugChoiceEntry(context,negative,predicate,week,'distractor');
 assert.ok(unsafe);q.metadata.choiceSources[index]=unsafe;q.choices[index]=unsafe.value;
 delete q.metadata.choicePredicate.sourceDrugId;
 const rebuilt=api.rebuildPredicateChoicesForProtections(context,q,new Map());
 assert.ok(rebuilt,'the rebuild must produce four safe options rather than disappear');
 assert.equal(rebuilt.choices.length,4);
 assert.ok(!rebuilt.metadata.choiceSources.some(x=>x.sourceDrugId===negative.id));
});

test('own-class safety uses records through the requested week, beyond the material cohort, and excludes future facts',()=>{
 const source=named('Bisoprolol'),negative=named('Enalapril'),sibling={...named('Lisinopril'),quizWeek:2};
 const context={semester:source.semester,drugs:[source,negative,sibling],drugsById:new Map([[source.id,source],[negative.id,negative],[sibling.id,sibling]]),availableDrugsByWeek:new Map()};
 const predicate={...api.createArrayContainsPredicate('topAdverseReactions','Hypotension'),eligibleChoiceQuizWeekRange:[1,1]};
 assert.equal(predicate.sourceDrugId,undefined);
 assert.equal(api.drugIsSafePredicateNonmatch(negative,predicate,context,1),true,'Week 2 classmate must not leak backward');
 assert.equal(api.drugIsSafePredicateNonmatch(negative,predicate,context,2),false,'known Week 2 classmate remains protective even outside the Week 1 choice cohort');
});

test('symmetric nonmatches participate in fail-closed capacity checks',()=>{
 const fixture=structuredClone(drugData),source=fixture.drugs.find(d=>d.genericName==='Ezetimibe');
 fixture.drugs.forEach(d=>d.drugClass=d.id===source.id?'Answer class':'Distractor class');
 const context=api.createContext(fixture,policy),predicate=api.withMaterialChoiceWeekRange(api.createArrayContainsPredicate('fdaIndication','Hypercholesterolemia',source),'new',4);
 assert.equal(api.drugMatchesChoicePredicate(source,predicate),true);
 assert.equal(api.getPredicateChoicePools(context,predicate,4).nonmatching.length,0);
 assert.equal(api.hasSingleAnswerPredicateCapacity(context,source,predicate,4,true),false);
});

test('all existing new-material candidates retain raw materialization capacity after symmetric exclusions',()=>{
 const expected=[55,57,54,51,53,50,51,43,47,52]; // captured from reviewed #91 head 46ef4d76
 let checked=0;
 for(let week=1;week<=10;week++){
  const candidates=buildQuestionCandidates({drugData,policy,quizWeek:week,materialType:'new'});
  assert.equal(candidates.length,expected[week-1]);
  for(const candidate of candidates){assert.equal(materializeQuestionCandidate({drugData,policy,candidate,rng:createSeededRng(candidate.id)}).status,'materialized');checked++;}
 }
 assert.equal(checked,513);
});
