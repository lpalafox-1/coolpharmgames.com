import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { loadBrowserGlobal } from './browser-global-harness.mjs';

// Exercise the shipped timer/progress functions with a controlled clock. UI
// painting is stubbed; the browser acceptance covers the full player lifecycle.
function engine(exam = true) {
  const values = new Map();
  const storage = { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) };
  const e = loadBrowserGlobal('assets/js/quizEngine.js', {
    location: { search: `?id=custom-quiz${exam ? '&exam=1' : ''}`, href: '' },
    localStorage: storage, sessionStorage: storage,
    document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; },
      createElement() { return { innerHTML: '', get textContent() { return this.innerHTML; } }; },
      body: {style:{}}, documentElement:{style:{setProperty(){}}} },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, confirm() { return true; }
  });
  vm.runInContext(`
    var clock = 1793520000000, completions = 0;
    Date.now = () => clock;
    state.attemptMetadata = { kind:'fall-2026-lab3-final-balanced', finalPractice:{mode:'balanced',version:'fall-final100-v1'} };
    state.questions = [{id:'draft',type:'short',prompt:'Generic?',answer:'correct',_user:'correct',_answered:false}];
    state.generatedTimerSeconds=6000; state.progressKey='test-final';
    syncCurrentDraftFromDom=()=>{}; renderStreakMeter=()=>{}; renderAdaptiveFinalBanner=()=>{};
    renderQuizStatus=()=>{}; showQuizSessionNote=()=>{};
    showResults=()=>{ completions++; state.attemptCompleted=true; };
  `,e);
  return { e, run: code => vm.runInContext(code,e), storage };
}

test('True Final exam runs for 100 wall-clock minutes, cannot pause, and grades drafts only at expiry once',()=>{
  const {e,run}=engine(); e.startSmartTimer();
  assert.equal(run('state.timerSeconds'),6000);
  assert.equal(run('state.finalExamDeadline-clock'),6000000);
  e.toggleTimer(); assert.equal(run('state.timerPaused'),false);
  run('clock+=30000'); e.timerTick();
  assert.equal(run('state.timerSeconds'),5970);
  assert.equal(run('state.questions[0]._answered'),false);
  run('clock+=5970000'); e.timerTick(); e.timerTick();
  assert.equal(run('state.timerSeconds'),0);
  assert.equal(run('state.timedOut'),true);
  assert.equal(run('state.questions[0]._correct'),true);
  assert.equal(run('completions'),1);
});

test('Final resume preserves the deadline and draft, deducts away time, and supports older snapshots without a deadline',()=>{
  const {e,run}=engine(); e.startSmartTimer();
  e.snapshot=e.serializeQuizProgress(); const deadline=e.snapshot.finalExamDeadline;
  run('clock+=120000'); e.restoreSavedQuizProgress(e.snapshot); e.startRestoredTimer();
  assert.equal(run('state.finalExamDeadline'),deadline);
  assert.equal(run('state.timerSeconds'),5880);
  assert.equal(run('state.questions[0]._answered'),false);
  delete e.snapshot.finalExamDeadline;
  e.snapshot.timerPaused=true;
  e.restoreSavedQuizProgress(e.snapshot);
  assert.equal(run('state.finalExamDeadline'),deadline);
  assert.equal(run('state.timerPaused'),false);
  run('clock+=6000000');e.restoreSavedQuizProgress(e.snapshot);
  assert.equal(run('state.timerSeconds'),0);
  e.timerTick(); assert.equal(run('completions'),1);
});

test('Final study mode remains pausable and restores remaining time without deducting time away',()=>{
  const {e,run}=engine(false); e.startSmartTimer(); e.toggleTimer();
  assert.equal(run('state.timerPaused'),true);
  assert.equal(run('state.finalExamDeadline'),null);
  e.snapshot=e.serializeQuizProgress(); run('clock+=600000');
  e.restoreSavedQuizProgress(e.snapshot); e.startRestoredTimer();
  assert.equal(run('state.timerSeconds'),6000);
  assert.equal(run('state.timerPaused'),true);
  assert.equal(run('state.questions[0]._answered'),false);
});

test('expired Final resume finishes after setup so a later question render cannot overwrite results',()=>{
  const {e,run}=engine();e.startSmartTimer();
  e.snapshot=e.serializeQuizProgress();
  run(`
    clock+=6000001;
    var paints=[];
    loadSavedQuizProgress=()=>snapshot;
    hideQuizSessionNote=()=>{}; wireEvents=()=>{}; applyAttemptModeUI=()=>{};
    restoreAttemptTimerAffordance=()=>{};
    render=()=>paints.push('question');
    showResults=()=>{paints.push('results');state.attemptCompleted=true;};
    state.progressLifecycleBound=true;
  `);
  e.finishSetup(null);
  assert.deepEqual(Array.from(run('paints')),['question','results']);
  assert.equal(run('state.attemptCompleted'),true);
  assert.equal(run('state.timedOut'),true);
  assert.equal(run('state.questions[0]._correct'),true);
});
