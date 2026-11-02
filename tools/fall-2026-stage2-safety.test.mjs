import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateFall2026Quiz, buildQuestionCandidates, materializeQuestionCandidate, createSeededRng } from '../assets/js/fall-2026-quiz-generator.js';
import { getPerformanceKey, getQuestionFingerprint, buildAdaptiveSignals, buildConceptWeakness, classifyCandidate } from '../assets/js/fall-2026-adaptive-practice.js';
import { loadBrowserGlobal } from './browser-global-harness.mjs';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const drugData=JSON.parse(read('assets/data/fall-2026-p2-top-drugs.json'));
const policy=JSON.parse(read('assets/data/fall-2026-lab3-quiz-policy.json'));
const byId=new Map(drugData.drugs.map(d=>[d.id,d]));
const key=s=>String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const field={fdaIndication:'fdaIndications',topAdverseReactions:'adverseReactions'};
function safe(q){
 const m=q.metadata,source=byId.get(m.sourceDrugId),domain=m.knowledgeDomain;
 if(!field[domain])return;
 if(m.choicePredicate?.type==='arrayContains')for(const c of m.choiceSources.filter(c=>c.role==='distractor')){
  assert.notEqual(byId.get(c.sourceDrugId).drugClass,source.drugClass,`${q.id}: unsafe exact-class inverse distractor`);
 }
 if(m.stemReference){
  const forbidden=drugData.drugs.filter(d=>d.quizWeek<=m.requestedQuizWeek&&d.drugClass===source.drugClass).flatMap(d=>d[field[domain]]).map(key);
  for(const c of q.choices.filter(c=>c!==q.answer))assert.ok(!forbidden.includes(key(c)),`${q.id}: sibling fact ${c}`);
 }
}

test('exact-class exclusions survive raw, Standard 6+4, Focus and leakage rebuilds across all weeks',()=>{
 let inverse=0,forward=0;
 for(let w=1;w<=10;w++){
  for(const c of buildQuestionCandidates({drugData,policy,quizWeek:w,materialType:'new'})){
   if(!field[c.domainId])continue;
   const r=materializeQuestionCandidate({drugData,policy,candidate:c,rng:createSeededRng(c.id)});
   assert.equal(r.status,'materialized');safe(r.question);
  }
  for(let n=0;n<8;n++)for(const mode of ['standard','week-focus']){
   const options={drugData,policy,quizWeek:w,seed:`sibling-${w}-${n}-${mode}`,...(mode==='week-focus'?{mode,questionCount:10}:w===1?{mode:'practice',questionCount:10}:{})};
   const qs=generateFall2026Quiz(options).questions;
   assert.equal(qs.length,10);assert.equal(qs.filter(q=>q.metadata.sourceDrugQuizWeek===w).length,mode==='week-focus'||w===1?10:6);
   assert.equal(new Set(qs.map(q=>q.metadata.knowledgeDomain)).size,6);
   qs.forEach(q=>{safe(q);if(field[q.metadata.knowledgeDomain]){inverse+=!!q.metadata.choicePredicate;forward+=!!q.metadata.stemReference;}});
  }
 }
 assert.ok(inverse>50);assert.ok(forward>20);
});

test('Enalapril/angioedema and Metoprolol/angina are not fabricated negatives; exhausted classes fail closed',()=>{
 for(const [id,domain,wrong]of [['p2-fall-quiz-01-drug-01','topAdverseReactions','Angioedema'],['p2-fall-quiz-03-drug-03','fdaIndication','Chronic angina']]){
  const d=byId.get(id),c=buildQuestionCandidates({drugData,policy,quizWeek:d.quizWeek,materialType:'new'}).find(c=>c.sourceDrugId===id&&c.domainId===domain);
  assert.ok(c);
  for(let n=0;n<12;n++){
   const r=materializeQuestionCandidate({drugData,policy,candidate:c,rng:createSeededRng(`target-${n}`)});
   assert.equal(r.status,'materialized');safe(r.question);
   if(r.question.metadata.stemReference)assert.ok(!r.question.choices.filter(x=>x!==r.question.answer).map(key).includes(key(wrong)));
  }
 }
 const fixture=structuredClone(drugData);fixture.drugs.forEach(d=>d.drugClass='One exact canonical class');
 const candidates=buildQuestionCandidates({drugData:fixture,policy,quizWeek:3,materialType:'new'});
 assert.ok(candidates.every(c=>!field[c.domainId]));
 for(const domainId of Object.keys(field)){
  const candidate={id:'no-safe-negatives',sourceDrugId:fixture.drugs[20].id,sourceDrugIds:[fixture.drugs[20].id],sourceDrugQuizWeek:3,requestedQuizWeek:3,materialType:'new',domainId,questionType:'mcq'};
  assert.equal(materializeQuestionCandidate({drugData:fixture,policy,candidate,rng:createSeededRng(domainId)}).status,'unavailable');
 }
});

// Captured from main 01c25ef (before #91), using its actual generator. These
// unchanged positive facts must retain prompt+answer identity, not broad aliases.
const legacy=[
 ['Which drug has an ADR of <b>Depression</b>?','Bisoprolol'],
 ['Which drug has an ADR of <b>Increased SCr</b>?','Enalapril'],
 ['Which drug is indicated for <b>Heart failure</b>?','Fosinopril'],
 ['Which drug is indicated for <b>Heart failure</b>?','Lisinopril'],
 ['Which of the following is an FDA indication for <b>Cardicor</b>?','Hypertension'],
 ['Which of the following is an FDA indication for <b>Maxzide</b>?','Edema'],
 ['Which of the following is a common ADR of <b>α/β-Adrenergic Blocker</b>?','Dizziness'],
 ['Which of the following is a common ADR of <b>GLP-1 Receptor Agonist</b>?','Nausea'],
 ['Which adverse reaction is listed for both <b>Telmisartan</b> and <b>Valsartan</b>?','Dizziness'],
 ['Which adverse reaction is listed for both <b>Losartan</b> and <b>Olmesartan</b>?','Hyperkalemia']
].map(([prompt,answer])=>({prompt,answer}));

test('pre-#91 positive fact signals match real revised questions and still classify as weakness without mutating stored evidence',()=>{
 const current=new Map();
 for(let w=1;w<=10;w++)for(let s=0;s<30;s++)for(const q of generateFall2026Quiz({drugData,policy,quizWeek:w,mode:'week-focus',questionCount:10,seed:`continuity-${w}-${s}`}).questions)current.set(getPerformanceKey(q),q);
 const entries=legacy.map(q=>({...q,missCount:4,reviewMissCount:2,lastMissedAt:1000}));
 const before=JSON.stringify(entries),signals=buildAdaptiveSignals({reviewEntries:entries,now:2000});
 for(const old of legacy){
  const revised=current.get(getPerformanceKey(old));assert.ok(revised,old.prompt);
  assert.equal(getQuestionFingerprint(revised),getQuestionFingerprint(old));
  assert.equal(classifyCandidate(revised,signals,buildConceptWeakness([revised],signals)),'weakness');
 }
 assert.equal(JSON.stringify(entries),before);
 const atomic=[...current.values()].find(q=>q.metadata.questionVariant==='singleFdaIndicationRecognition');
 assert.ok(atomic);assert.notEqual(getPerformanceKey(atomic),getPerformanceKey({...atomic,prompt:'Which full FDA indication list is recorded for <b>Example</b>?'}));
 assert.notEqual(getPerformanceKey(legacy[0]),getPerformanceKey({...legacy[0],answer:'Different drug'}));
});

test('source-scope and single-week display are render-only for historical prompts and metadata-free Queue copies',()=>{
 const e=loadBrowserGlobal('assets/js/quizEngine.js',{document:{addEventListener(){},createElement(){return{innerHTML:'',get textContent(){return this.innerHTML.replace(/<[^>]*>/g,'');}}}},location:{search:'?id=custom-quiz'},localStorage:{getItem(){return null;}},sessionStorage:{getItem(){return null;}}});
 for(const old of legacy.slice(0,8)){
  const q={...old,sourceQuizId:'fall-2026-lab3-practice',metadata:{generatorId:'fall-2026-p2-lab3-deterministic-generator',closedGroup:{eligibleChoiceQuizWeekRange:[3,3]}}};
  const before=JSON.stringify(q),display=e.getFallLab3StudentFacingPromptHtml(q);
  assert.equal(JSON.stringify(q),before);
  if(/^Which drug (has an ADR|is indicated)/.test(old.prompt))assert.match(display,/recorded.*Fall source/);
  if(old.prompt.includes('common ADR')){assert.match(display,/source group in Week 3\?/);assert.doesNotMatch(display,/Weeks 3–3|common ADR of/);}
 }
 const q={prompt:'Which ADR is listed for every member of the <b>Group</b> source group in Weeks 3–3?',sourceQuizId:'fall-2026-lab3-week-3-practice'};
 assert.match(e.getFallLab3StudentFacingPromptHtml(q),/in Week 3\?/);
});
