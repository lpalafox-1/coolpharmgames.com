import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {buildFall2026FinalPayload} from '../assets/js/fall-2026-final-practice.js';
import {loadBrowserGlobal} from './browser-global-harness.mjs';
const read=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const payload=buildFall2026FinalPayload({drugData:read('assets/data/fall-2026-p2-top-drugs.json'),policy:read('assets/data/fall-2026-lab3-quiz-policy.json'),seed:'stage2-storage'});
const NOW=1793520000000,TTL=12*60*60*1000;
const plain=x=>JSON.parse(JSON.stringify(x));
function storage(){const values=new Map();return{values,failKey:null,readHook:null,get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem(k){this.readHook?.(k);return values.get(k)??null;},setItem(k,v){if(this.failKey===k)throw Error('quota');values.set(k,String(v));},removeItem:k=>values.delete(k)};}
function engine({local=storage(),session=storage(),confirm=true}={}){
 const nodes=new Map(),node=()=>{const classes=new Set();return{style:{setProperty(){}},dataset:{},innerHTML:'',textContent:'',value:'',hidden:false,classList:{add:(...s)=>s.forEach(x=>classes.add(x)),remove:(...s)=>s.forEach(x=>classes.delete(x)),contains:s=>classes.has(s),toggle(s,force){const yes=force??!classes.has(s);yes?classes.add(s):classes.delete(s);}},addEventListener(){},setAttribute(){},querySelector(){return null;},querySelectorAll(){return[];},closest(){return null;},appendChild(){},scrollIntoView(){}};};
 const document={documentElement:node(),body:node(),head:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelectorAll(){return[];},querySelector(){return null;},addEventListener(){},createElement(){const n=node();Object.defineProperty(n,'textContent',{get(){return n.innerHTML.replace(/<[^>]*>/g,'');},set(){}});return n;}};
 const e=loadBrowserGlobal('assets/js/quizEngine.js',{document,location:{search:'?id=custom-quiz&exam=1',href:'http://localhost/quiz.html?id=custom-quiz&exam=1'},localStorage:local,sessionStorage:session,performance:{getEntriesByType:()=>[{type:'reload'}]},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},addEventListener(){},confirm(msg){e.lastPrompt=msg;return confirm;},alert(){},console:{warn(){},log(){}}});
 e.payload=plain(payload);e.clock=NOW;
 const run=code=>vm.runInContext(code,e);
 run(`Date.now=()=>clock;state.attemptMetadata=payload.metadata;state.finalPracticePayload=payload;state.title=payload.title;
 state.questions=payload.questions.map((q,i)=>({...q,_id:i,_user:q.answer,_answered:false}));state.generatedTimerSeconds=6000;state.progressKey=getQuizProgressKey();
 syncCurrentDraftFromDom=()=>{};var queueWrites=0;saveMissedQuestionsToReviewQueue=()=>{queueWrites++;};recordTopDrugsSignalsFromQuestions=()=>{};`);
 return{e,run,local,session,nodes};
}
function complete(run){run(`state.questions.forEach((q,i)=>{q._answered=true;q._correct=i>=2;q._user=i>=2?q.answer:'wrong';});state.score=98;state.pointScore=98;`);}

test('compact progress stores the canonical set once, preserves exact retry, answers and review subsets, and reads legacy snapshots',()=>{
 const{e,run}=engine();run('state.originalQuestions=state.questions.slice(0,2);');
 const compact=e.serializeQuizProgress(),expanded=e.expandFinalProgress(compact);
 assert.equal(compact.finalProgressFormat,2);assert.ok(compact.questions.every(q=>q.sourceIndex!==undefined&&!q.prompt));
 assert.deepEqual(plain(expanded.questions),plain(run('state.questions')));assert.deepEqual(plain(expanded.originalQuestions),plain(run('state.originalQuestions')));
 assert.deepEqual(plain(expanded.finalPracticePayload),payload);
 const legacy={...plain(expanded),finalProgressFormat:undefined};
 assert.equal(e.expandFinalProgress(legacy),legacy);
 const legacySize=JSON.stringify(legacy).length,compactSize=JSON.stringify(compact).length;
 assert.ok(compactSize<legacySize*0.6,`${compactSize}/${legacySize}`);
 const bad=plain(compact);bad.questions[0].sourceIndex=100;assert.equal(e.expandFinalProgress(bad),null);
});

test('cleanup bounds abandoned compact Finals and expires old legacy Finals while preserving current/live/legacy/unrelated data',()=>{
 const{e,run,local}=engine(),snapshot=plain(e.serializeQuizProgress()),current=run('state.progressKey');
 const put=(key,s)=>local.setItem(key,JSON.stringify(s));
 for(let n=0;n<6;n++)put(`pharmlet.quiz-progress.old-${n}`,{...snapshot,savedAt:NOW-10000+n});
 put(current,{...snapshot,savedAt:NOW-1});
 const active='pharmlet.quiz-progress.other-tab';put(active,{...snapshot,savedAt:NOW-TTL-1});
 put('pharmlet.final-progress-lease.other',{progressKey:active,expiresAt:NOW+TTL});
 const legacy={...plain(e.expandFinalProgress(snapshot)),finalProgressFormat:undefined};
 put('pharmlet.quiz-progress.legacy-recent',{...legacy,savedAt:NOW-1000});put('pharmlet.quiz-progress.legacy-expired',{...legacy,savedAt:NOW-TTL-1});
 put('pharmlet.quiz-progress.standard',{questions:[{prompt:'keep'}],savedAt:NOW-TTL-1});local.setItem('pharmlet.history','existing-history');
 const activeBytes=local.getItem(active),standard=local.getItem('pharmlet.quiz-progress.standard');
 assert.equal(e.cleanupAbandonedFinalProgress(NOW),5);
 assert.ok(local.getItem('pharmlet.quiz-progress.old-4'));assert.ok(local.getItem('pharmlet.quiz-progress.old-5'));
 assert.equal(local.getItem(active),activeBytes);assert.ok(local.getItem(current));assert.ok(local.getItem('pharmlet.quiz-progress.legacy-recent'));
 assert.equal(local.getItem('pharmlet.quiz-progress.standard'),standard);assert.equal(local.getItem('pharmlet.history'),'existing-history');
});

test('cleanup rechecks bytes before eviction and leases protect another tab without changing its snapshot',()=>{
 const{e,local}=engine(),s=plain(e.serializeQuizProgress());
 for(let n=0;n<4;n++)local.setItem(`pharmlet.quiz-progress.race-${n}`,JSON.stringify({...s,savedAt:NOW+n}));
 let reads=0;local.readHook=k=>{if(k==='pharmlet.quiz-progress.race-0'&&++reads===2)local.values.set(k,JSON.stringify({...s,savedAt:NOW+100}));};
 e.cleanupAbandonedFinalProgress(NOW+200);
 assert.equal(JSON.parse(local.getItem('pharmlet.quiz-progress.race-0')).savedAt,NOW+100);
 const other=engine({local});other.e.maintainFinalProgressLease();const leaseKeys=[...local.values.keys()].filter(k=>k.startsWith('pharmlet.final-progress-lease.'));
 assert.equal(leaseKeys.length,1);other.e.maintainFinalProgressLease(false);assert.equal(local.getItem(leaseKeys[0]),null);
});

test('progress quota failure preserves previous bytes and surfaces a save failure',()=>{
 const{e,run,local,nodes}=engine(),key=run('state.progressKey');local.setItem(key,'previous-progress');local.failKey=key;
 e.persistQuizProgress(true);assert.equal(local.getItem(key),'previous-progress');assert.equal(nodes.get('quiz-session-note-title').textContent,'Progress not saved');
});

test('failed history save stays visible with completed recovery; retry saves once without duplicating miss signals',()=>{
 const{e,run,local,nodes}=engine();complete(run);local.failKey='pharmlet.history';e.showResults();
 assert.equal(run('state.resultsRecorded'),false);assert.equal(run('state.historySaveFailed'),true);assert.equal(run('queueWrites'),1);
 assert.match(nodes.get('question-card').innerHTML,/History could not be saved|not yet in Stats/);
 const recovery=JSON.parse(local.getItem(run('state.progressKey')));assert.equal(recovery.completedFinal,true);assert.equal(recovery.finalArtifactsRecorded,true);
 local.failKey=null;nodes.get('retry-final-history').onclick();nodes.get('retry-final-history').onclick();
 const history=JSON.parse(local.getItem('pharmlet.history'));assert.equal(history.length,1);assert.equal(history[0].score,98);assert.equal(history[0].finalSaveId,recovery.finalSaveId);
 assert.equal(run('queueWrites'),1);assert.equal(local.getItem(run('state.progressKey')),null);
});

test('completed recovery reload preserves the full score and does not replay Queue writes',()=>{
 const original=engine();complete(original.run);original.local.failKey='pharmlet.history';original.e.showResults();
 const saved=JSON.parse(original.local.getItem(original.run('state.progressKey')));original.local.failKey=null;
 const resumed=engine({local:original.local,session:original.session});resumed.e.restoreSavedQuizProgress(saved);resumed.e.showResults();
 assert.equal(resumed.run('state.score'),98);assert.equal(resumed.run('queueWrites'),0);assert.equal(JSON.parse(original.local.getItem('pharmlet.history')).length,1);
});

test('a tab reload selects its own payload after another tab overwrites custom-quiz, including Review progress',()=>{
 const{e,run,local,session}=engine();run('state.reviewMode=true;state.questions=state.questions.slice(0,2);state.generatedTimerSeconds=0;state.progressKey=getQuizProgressKey();');
 e.persistQuizProgress(true);const own=run('state.progressKey');
 const resumed=engine({local,session}),fallback={...payload,metadata:{...payload.metadata,seed:'other-tab'}};
 const restoredPayload=resumed.e.loadTabFinalResumePayload(fallback);assert.equal(restoredPayload.metadata.seed,payload.metadata.seed);
 resumed.run('state.progressKey=state.finalResumeProgressKey;');
 const snapshot=resumed.e.loadSavedQuizProgress();assert.ok(snapshot);resumed.e.restoreSavedQuizProgress(snapshot);
 assert.equal(resumed.run('state.questions.length'),2);assert.equal(resumed.run('state.reviewMode'),true);assert.equal(resumed.run('state.progressKey'),own);
});

test('True Exam completion shows authoritative score and retires resume/banner/countdown; resume cancel names a new clock',()=>{
 const{e,run,nodes}=engine();complete(run);e.showResults();
 assert.equal(nodes.get('score').textContent,98);assert.equal(nodes.get('mode-banner').classList.contains('hidden'),true);
 assert.equal(nodes.get('quiz-session-note').classList.contains('hidden'),true);assert.equal(nodes.get('timer-readout').hidden,true);
 e.exitCompletedAttemptUi();assert.equal(nodes.get('timer-readout').hidden,false);
 const fresh=engine({confirm:false});fresh.e.startSmartTimer();fresh.e.snapshot=fresh.e.serializeQuizProgress();
 fresh.run('loadSavedQuizProgress=()=>snapshot;wireEvents=()=>{};render=()=>{};');fresh.e.finishSetup(null);
 assert.match(fresh.e.lastPrompt,/OK resumes the same attempt and deadline/);assert.match(fresh.e.lastPrompt,/Cancel abandons.*new 100-minute clock/);
 assert.equal(fresh.run('state.finalExamDeadline-clock'),6000000);assert.match(fresh.nodes.get('quiz-session-note-text').textContent,/Saved exam abandoned/);
});
