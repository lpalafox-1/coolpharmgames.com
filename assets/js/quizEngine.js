// assets/js/quizEngine.js
// Clean quiz runner with: seeded/random order, limit, review mode,
// explicit answer reveal, keyboard shortcuts, progress mini-map,
// mark-for-review, session timer, streak meter, a11y niceties.

const params = new URLSearchParams(location.search);
const quizId = params.get("id");
const mode   = (params.get("mode") || "easy").toLowerCase();
const limitParam = parseInt(params.get("limit") || "", 10);
const seedParam  = parseInt(params.get("seed")  || "", 10);

const els = {
  title: document.getElementById("quiz-title"),
  qnum: document.getElementById("qnum"),
  qtotal: document.getElementById("qtotal"),
  score: document.getElementById("score"),
  prompt: document.getElementById("prompt"),
  options: document.getElementById("options"),
  shortWrap: document.getElementById("short-wrap"),
  shortInput: document.getElementById("short-input"),
  explain: document.getElementById("explain"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  check: document.getElementById("check"),
  restart: document.getElementById("restart"),
  results: document.getElementById("results"),
  final: document.getElementById("final-score"),
  celebrate: document.getElementById("celebrate"),
  card: document.getElementById("question-card"),
  progressBar: document.getElementById("progress-bar"),
  fire: document.getElementById("fire-flame"),
  fireCount: document.getElementById("fire-count"),
  live: document.getElementById("live"),
  themeToggle: document.getElementById("theme-toggle"),
  navMap: document.getElementById("nav-map"),
  mark: document.getElementById("mark"),
  timerToggle: document.getElementById("timer-toggle"),
  timerReadout: document.getElementById("timer-readout"),
};

const THEME_KEY = "quiz-theme";
applyTheme(localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
els.themeToggle?.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(next); localStorage.setItem(THEME_KEY, next);
});
function applyTheme(mode){
  document.documentElement.classList.toggle("dark", mode === "dark");
  if (els.themeToggle) els.themeToggle.textContent = mode === "dark" ? "☀️ Light" : "🌙 Dark";
}

const state = {
  title: "",
  questions: [],
  index: 0,
  score: 0,
  review: false,
  currentStreak: 0,
  bestStreak: 0,
  marked: new Set(),
  // timer
  timerEnabled: false,
  timerSeconds: 0,
  timerHandle: null,
};

const STORAGE_KEY = () => `pharmlet.${quizId}.${mode}`;

main().catch(err => {
  console.error(err);
  if (els.title) els.title.textContent = 'Quiz not found';
  if (els.card) els.card.innerHTML = `<p style="color:var(--muted)">Could not load <code>quizzes/${sanitize(quizId)}.json</code>. Check the file name and path.</p>`;
});

async function main() {
  if (!quizId) throw new Error("Missing ?id=…");

  const res = await fetch(`quizzes/${quizId}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const allPool = (data.pools && data.pools[mode]) || data.questions || [];
  const poolCopy = [...allPool];
  if (Number.isFinite(seedParam)) seededShuffle(poolCopy, seedParam);
  else shuffleInPlace(poolCopy);

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : null;
  const pool = limit ? poolCopy.slice(0, Math.min(limit, poolCopy.length)) : poolCopy;

  state.title = data.title || "Quiz";
  state.questions = pool.map((q, i) => ({
    ...q,
    _answered:false, _correct:false, _user:null,
    _choices: Array.isArray(q.choices) ? shuffledCopy(q.choices) : (q.type === "tf" ? ["True","False"] : null),
    _id: i
  }));

  // restore saved session if present (and same length)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY()) || "null");
    if (saved && Array.isArray(saved.questions) && saved.questions.length === state.questions.length) {
      Object.assign(state, saved, { review:false, timerHandle:null }); // never resume in review; no running timer
      state.marked = new Set(saved.marked || []);
    }
  } catch {}

  if (els.title) els.title.textContent = `${state.title} — ${capitalize(mode)}`;
  if (els.qtotal) els.qtotal.textContent = state.questions.length;

  wireEvents();
  render();
}

/* ---------- events ---------- */
function wireEvents(){
  els.prev?.addEventListener("click", () => { if (state.index>0) { state.index--; render(); save(); } });
  els.next?.addEventListener("click", () => {
    if (state.index < state.questions.length - 1) { state.index++; render(); save(); }
    else { showResults(); }
  });
  els.check?.addEventListener("click", () => {
    const q = currentQ();
    if (!q) return;
    if (q.type === "mcq" || q.type === "tf") {
      const chosen = els.options.querySelector("input[type='radio']:checked");
      if (!chosen) return;
      scoreCurrent(chosen.value);
    } else if (q.type === "short") {
      scoreCurrent(els.shortInput.value);
    }
  });
  els.restart?.addEventListener("click", restart);

  // Mark for review ⭐
  els.mark?.addEventListener("click", () => {
    const idx = state.index;
    if (state.marked.has(idx)) state.marked.delete(idx);
    else state.marked.add(idx);
    renderNavMap();
    updateMarkButton();
    save();
  });

  // Timer ⏱
  els.timerToggle?.addEventListener("click", toggleTimer);

  // Keyboard shortcuts
  window.addEventListener('keydown', (e)=>{
    // don't intercept while typing short answers
    if (document.activeElement === els.shortInput) return;

    const key = e.key;
    if (key === 'ArrowRight') { e.preventDefault(); if (!els.next.classList.contains('hidden')) els.next.click(); }
    if (key === 'ArrowLeft')  { e.preventDefault(); els.prev.click(); }
    if (key === 'Enter')      { e.preventDefault(); if (!els.check.classList.contains('hidden')) els.check.click(); else if (!els.next.classList.contains('hidden')) els.next.click(); }

    // number keys 1..9 select that choice
    const num = Number(key);
    if (num >= 1 && num <= 9) {
      const radios = els.options.querySelectorAll("input[type='radio']");
      const choice = radios[num-1];
      if (choice && !choice.disabled) {
        choice.checked = true;
        enableCheckIfChoiceSelected();
      }
    }
  });
}

/* ---------- render & score ---------- */
function render(){
  const q = currentQ();
  if (!q) return showResults();

  els.results.classList.add("hidden"); els.card.classList.remove("hidden");
  els.qnum.textContent = state.index + 1; els.score.textContent = state.score;
  els.prompt.innerHTML = sanitize(q.prompt || "Question");
  els.options.innerHTML = ""; els.shortWrap.classList.add("hidden");
  els.explain.innerHTML = ""; els.explain.classList.remove("show");
  els.card.classList.remove("correct","wrong");

  // controls
  els.prev.disabled = state.index === 0;
  els.next.classList.toggle("hidden", !(q._answered || state.review));
  els.check.classList.toggle("hidden", !!(q._answered || state.review));
  els.next.textContent = state.index === state.questions.length - 1 ? "View Final Score" : "Next";

  if (q.type === "mcq" || q.type === "tf") {
    const group = `q${state.index}`;
    const choices = q._choices || [];
    choices.forEach((choice, idx) => {
      const id = `${group}c${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "flex items-center gap-2";
      wrap.setAttribute("for", id);
      wrap.setAttribute("role", "radio");
      wrap.setAttribute("aria-checked", "false");
      wrap.innerHTML = `<input id="${id}" type="radio" name="${group}" value="${choice}"><span>${sanitize(choice)}</span>`;
      const input = wrap.querySelector("input");
      input.addEventListener('change', enableCheckIfChoiceSelected);

      if (q._answered || state.review) {
        input.disabled = true;
        const ok = isCorrectChoice(q, choice);
        if (ok) wrap.classList.add("correct");
        if (q._user && equalFold(q._user, choice) && !q._correct) wrap.classList.add("wrong");
        // answer fade: dim wrong options
        if (!ok) wrap.style.opacity = ".65";
        wrap.setAttribute("aria-checked", equalFold(q._user, choice) ? "true" : "false");
        wrap.setAttribute("aria-disabled", "true");
      }
      els.options.appendChild(wrap);
    });
  } else if (q.type === "short") {
    els.shortWrap.classList.remove("hidden");
    els.shortInput.value = q._user || "";
    els.shortInput.disabled = q._answered || state.review;
    // enable/disable Check based on presence
    els.check.disabled = !q._answered && !(els.shortInput.value.trim().length > 0);
    els.shortInput.oninput = () => {
      if (state.review || q._answered) return;
      els.check.disabled = els.shortInput.value.trim().length === 0;
    };
  } else {
    els.options.innerHTML = `<p style="color:var(--muted)">Unsupported question type.</p>`;
  }

  // ensure "Check" disabled until a selection is present
  if (q.type === "mcq" || q.type === "tf") {
    const anyChecked = !!els.options.querySelector("input[type='radio']:checked");
    els.check.disabled = !anyChecked;
  }

  // explicit answer reveal when answered or in review
  if (q._answered || state.review) {
    renderAnswerReveal(q);
  }

  // mark button
  updateMarkButton();

  // progress
  renderNavMap();
  updateProgressAndFlame();

  save();
}

function enableCheckIfChoiceSelected() {
  const sel = els.options.querySelector("input[type='radio']:checked");
  els.check.disabled = !sel;
}

function scoreCurrent(userValRaw){
  const q = currentQ(); const userVal = (userValRaw ?? "").toString().trim();
  let correct = false;
  if (q.type === "mcq" || q.type === "tf") {
    correct = isCorrectChoice(q, userVal);
  } else if (q.type === "short") {
    correct = shortAnswerMatches(q, userVal);
  }
  if (!q._answered) {
    q._answered = true; q._correct = !!correct; q._user = userVal;
    if (correct) { state.score += 1; state.currentStreak += 1; state.bestStreak = Math.max(state.bestStreak, state.currentStreak); }
    else { state.currentStreak = 0; }
  }

  renderAnswerReveal(q);

  els.card.classList.toggle("correct", correct);
  els.card.classList.toggle("wrong", !correct);

  els.check.classList.add("hidden"); els.next.classList.remove("hidden");

  announce(`Question ${state.index+1} ${correct ? 'correct' : 'wrong'}. Score ${state.score} of ${state.questions.length}.`);
  render(); // re-render to apply dimming, button states, streak, etc.
}

function showResults(){
  els.card.classList.add("hidden");
  els.results.classList.remove("hidden");
  els.final.textContent = `${state.score} / ${state.questions.length}`;

  // Add compact breakdown
  const made = state.questions.filter(q=>q._answered).length;
  const wrong = made - state.score;
  const summaryId = "res-summary";
  let sum = document.getElementById(summaryId);
  if (!sum) {
    sum = document.createElement("div");
    sum.id = summaryId;
    sum.className = "mt-3 text-sm";
    els.results.appendChild(sum);
  }
  sum.innerHTML = `✅ Correct: <strong>${state.score}</strong> &nbsp; • &nbsp; ❌ Wrong: <strong>${wrong}</strong> &nbsp; • &nbsp; 🔥 Best streak: <strong>${state.bestStreak}</strong>${state.timerSeconds>0 ? ` &nbsp; • &nbsp; ⏱ Time: <strong>${formatTime(state.timerSeconds)}</strong>` : ""}`;

  const pct = state.score / state.questions.length;
  els.celebrate.classList.toggle("hidden", !(pct === 1 || pct >= 0.9));

  // Review button
  let btn = els.results.querySelector('#review-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'review-btn';
    btn.className = 'btn btn-ghost mt-4';
    btn.textContent = 'Review questions';
    btn.onclick = () => { state.review = true; state.index = 0; render(); };
    els.results.appendChild(btn);
  }

  stopTimer();
  try { localStorage.removeItem(STORAGE_KEY()); } catch {}
}

function restart(){
  state.index = 0; state.score = 0; state.review = false;
  state.currentStreak = 0; state.bestStreak = 0;
  state.marked = new Set();
  state.questions.forEach(q => Object.assign(q, {_answered:false,_correct:false,_user:null}));
  els.results.classList.add("hidden");
  els.card.classList.remove("hidden");
  els.check.classList.remove("hidden");
  els.next.classList.add("hidden");
  // reset timer readout but keep setting off
  state.timerSeconds = 0; stopTimer(); updateTimerReadout();
  render();
}

/* ---------- helpers ---------- */
function currentQ(){ return state.questions[state.index]; }

function renderNavMap(){
  if (!els.navMap) return;
  els.navMap.innerHTML = "";
  state.questions.forEach((q, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = String(i+1);
    b.className = "btn btn-ghost";
    b.setAttribute("aria-label", `Go to question ${i+1}`);
    // styling states
    if (i === state.index) b.style.outline = `2px solid var(--accent)`;
    if (state.marked.has(i)) b.textContent += "⭐";
    if (q._answered) b.style.opacity = ".9";
    if (q._answered && !q._correct) b.style.borderColor = "var(--bad)";
    b.addEventListener("click", () => { state.index = i; render(); save(); });
    els.navMap.appendChild(b);
  });
}

function updateMarkButton(){
  if (!els.mark) return;
  const marked = state.marked.has(state.index);
  els.mark.textContent = marked ? "⭐ Unmark" : "⭐ Mark";
  els.mark.setAttribute("aria-pressed", marked ? "true" : "false");
}

function updateProgressAndFlame(){
  const answered = state.questions.filter(q=>q._answered).length;
  const total    = state.questions.length;
  const correct  = state.questions.filter(q=>q._answered && q._correct).length;
  if (els.progressBar) els.progressBar.style.width = `${Math.min(100,(answered/total)*100)}%`;
  const acc = answered ? (correct/answered) : 0;

  const hot = answered >= 5 && acc >= 0.80;
  if (!els.fire) return;
  if (hot){
    els.fire.classList.remove("hidden");
    if (els.fireCount) {
      const streak = Math.max(0, state.currentStreak);
      els.fireCount.textContent = `×${streak}`;
      els.fireCount.classList.toggle("hidden", streak < 2);
    }
    const extra = Math.max(0, acc - 0.80); const scale = 1 + extra * 2.5;
    els.fire.style.setProperty("--flame-scale", scale.toFixed(2));
  } else {
    els.fire.classList.add("hidden");
    els.fireCount?.classList.add("hidden");
  }
}

function isCorrectChoice(q, choice){
  const ans = q.answer ?? q.answerText ?? q.answerIndex;
  if (Array.isArray(ans)) return ans.some(a => equalFold(a, choice));
  if (typeof ans === "string") return equalFold(ans, choice);
  if (typeof ans === "number") {
    return Array.isArray(q.choices) && equalFold(String(q.choices[ans]), choice);
  }
  return false;
}

// short answer matching with light normalization
function shortAnswerMatches(q, userVal) {
  const answers = Array.isArray(q.answerText) ? q.answerText : [q.answerText];
  const normUser = norm(userVal);
  return answers.filter(Boolean).some(a => {
    const na = norm(a);
    return na === normUser || softEq(na, normUser);
  });
}
function norm(s=""){
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’'`]/g, "'")
    .replace(/[\.\,\;\:\-$begin:math:text$$end:math:text$$begin:math:display$$end:math:display$\{\}]/g, "")
    .trim();
}
// allow plural/singular and minor variants: "beta blocker" == "beta blockers"
function softEq(a, b){
  if (a === b) return true;
  const ap = a.endsWith("s") ? a.slice(0,-1) : a + "s";
  const bp = b.endsWith("s") ? b.slice(0,-1) : b + "s";
  return ap === b || bp === a || ap === bp;
}

// answer reveal helpers
function getCorrectAnswers(q){
  if (Array.isArray(q.answer)) return q.answer.map(String);
  if (Array.isArray(q.answerText)) return q.answerText.map(String);
  if (typeof q.answerIndex === "number" && Array.isArray(q.choices)) {
    return [ String(q.choices[q.answerIndex]) ];
  }
  if (typeof q.answer === "string") return [ q.answer ];
  if (typeof q.answerText === "string") return [ q.answerText ];
  return [];
}
function renderAnswerReveal(q){
  const answers = getCorrectAnswers(q);
  const answerLine = answers.length
    ? `<div><strong>Correct answer:</strong> ${answers.map(sanitize).join(" • ")}</div>`
    : "";
  const explainLine = q.explain ? `<div class="mt-1">${sanitize(q.explain)}</div>` : "";
  const html = `${answerLine}${explainLine}`;
  els.explain.innerHTML = html || `<div style="color:var(--muted)">No explanation provided.</div>`;
  els.explain.classList.add("show");
}

function toggleTimer(){
  state.timerEnabled = !state.timerEnabled;
  els.timerToggle?.setAttribute("aria-pressed", state.timerEnabled ? "true" : "false");
  els.timerToggle.textContent = state.timerEnabled ? "⏸ Pause Timer" : "⏱ Start Timer";
  if (state.timerEnabled) startTimer(); else stopTimer();
}
function startTimer(){
  if (state.timerHandle) return;
  state.timerHandle = setInterval(() => {
    state.timerSeconds += 1;
    updateTimerReadout();
  }, 1000);
}
function stopTimer(){
  if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
}
function updateTimerReadout(){
  if (els.timerReadout) els.timerReadout.textContent = formatTime(state.timerSeconds);
}
function formatTime(sec){
  const m = Math.floor(sec/60); const s = sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ---------- utils ---------- */
function sanitize(s=""){ return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function equalFold(a,b){ return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
function shuffleInPlace(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function shuffledCopy(a){ const b=[...a]; shuffleInPlace(b); return b; }
function seededShuffle(arr, seed=1){ let s=seed; const rand=()=> (s=(s*9301+49297)%233280)/233280;
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
function capitalize(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }
function save(){
  try {
    const toSave = {...state, marked:[...state.marked]};
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(toSave));
  } catch {}
}
function announce(msg){ if (els.live) els.live.textContent = msg; }