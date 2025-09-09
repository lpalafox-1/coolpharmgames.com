// Reusable quiz engine with flame, limit, seeded shuffle, keyboard shortcuts,
// review mode, resume state, shuffled answers, a11y announcements, and friendly errors.

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
  live: document.getElementById("live"),
  themeToggle: document.getElementById("theme-toggle"),
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

const state = { title: "", questions: [], index: 0, score: 0, review:false };
const STORAGE_KEY = () => `pharmlet.${quizId}.${mode}`;

main().catch(err => {
  console.error(err);
  els.title.textContent = 'Quiz not found';
  els.card.innerHTML = `<p style="color:var(--muted)">Could not load <code>quizzes/${quizId}.json</code>. Check the file name and path.</p>`;
});

async function main() {
  if (!quizId) throw new Error("Missing ?id=…");

  let data;
  try {
    const res = await fetch(`quizzes/${quizId}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    throw e;
  }

  const allPool = (data.pools && data.pools[mode]) || data.questions || [];
  const poolCopy = [...allPool];
  if (Number.isFinite(seedParam)) seededShuffle(poolCopy, seedParam);
  else shuffleInPlace(poolCopy);

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : null;
  const pool = limit ? poolCopy.slice(0, Math.min(limit, poolCopy.length)) : poolCopy;

  state.title = data.title || "Quiz";
  state.questions = pool.map(q => ({
    ...q,
    _answered:false, _correct:false, _user:null,
    _choices: Array.isArray(q.choices) ? shuffledCopy(q.choices) : null // shuffle answer choices
  }));

  // restore saved session if present (and same length)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY()) || "null");
    if (saved && Array.isArray(saved.questions) && saved.questions.length === state.questions.length) {
      Object.assign(state, saved, { review:false }); // never resume in review
    }
  } catch {}

  els.title.textContent = `${state.title} — ${capitalize(mode)}`;
  els.qtotal.textContent = state.questions.length;

  wireEvents(); render();
}

/* ---------- events ---------- */
function wireEvents(){
  els.prev.addEventListener("click", () => { if (state.index>0) state.index--; render(); save(); });
  els.next.addEventListener("click", () => {
    if (state.index < state.questions.length - 1) { state.index++; render(); save(); }
    else { showResults(); }
  });
  els.check.addEventListener("click", () => {
    const q = currentQ();
    if (q.type === "mcq" || q.type === "tf") {
      const chosen = els.options.querySelector("input[type='radio']:checked");
      if (!chosen) return;
      scoreCurrent(chosen.value);
    } else if (q.type === "short") {
      scoreCurrent(els.shortInput.value);
    }
  });
  els.restart.addEventListener("click", restart);

  // Keyboard shortcuts
  window.addEventListener('keydown', (e)=>{
    const k = e.key.toLowerCase();
    if (k === 'n' && !els.next.classList.contains('hidden')) els.next.click();
    if (k === 'p') els.prev.click();
    if (k === 'c' && !els.check.classList.contains('hidden')) els.check.click();
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
  els.explain.textContent = q.explain || ""; els.explain.classList.toggle("show", q._answered || state.review);
  els.card.classList.remove("correct","wrong");

  // controls
  els.prev.disabled = state.index === 0;
  els.next.classList.toggle("hidden", !(q._answered || state.review));
  els.check.classList.toggle("hidden", !!(q._answered || state.review));
  els.next.textContent = state.index === state.questions.length - 1 ? "View Final Score" : "Next";

  if (q.type === "mcq" || q.type === "tf") {
    const group = `q${state.index}`;
    const choices = q._choices || (q.type === "tf" ? ["True","False"] : []);
    choices.forEach((choice, idx) => {
      const id = `${group}c${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "flex items-center gap-2"; wrap.setAttribute("for", id);
      wrap.innerHTML = `<input id="${id}" type="radio" name="${group}" value="${choice}"><span>${sanitize(choice)}</span>`;
      if (q._answered || state.review) {
        wrap.querySelector("input").disabled = true;
        const ok = isCorrectChoice(q, choice);
        if (ok) wrap.classList.add("correct");
        if (q._user && equalFold(q._user, choice) && !q._correct) wrap.classList.add("wrong");
      }
      els.options.appendChild(wrap);
    });
  } else if (q.type === "short") {
    els.shortWrap.classList.remove("hidden");
    els.shortInput.value = q._user || ""; els.shortInput.disabled = q._answered || state.review;
  } else {
    els.options.innerHTML = `<p style="color:var(--muted)">Unsupported question type.</p>`;
  }

  updateProgressAndFlame();
}

function scoreCurrent(userValRaw){
  const q = currentQ(); const userVal = (userValRaw ?? "").toString().trim();
  let correct = false;
  if (q.type === "mcq" || q.type === "tf") {
    correct = isCorrectChoice(q, userVal);
  } else if (q.type === "short") {
    const answers = Array.isArray(q.answerText) ? q.answerText : [q.answerText];
    correct = answers.filter(Boolean).some(a => equalFold(a, userVal));
  }
  if (!q._answered) {
    q._answered = true; q._correct = !!correct; q._user = userVal;
    if (correct) state.score += 1;
  }
  els.explain.classList.toggle("show", !!q.explain);
  els.card.classList.toggle("correct", correct);
  els.card.classList.toggle("wrong", !correct);
  els.check.classList.add("hidden"); els.next.classList.remove("hidden");

  announce(`Question ${state.index+1} ${correct ? 'correct' : 'wrong'}. Score ${state.score} of ${state.questions.length}.`);
  render(); save();
}

function showResults(){
  els.card.classList.add("hidden");
  els.results.classList.remove("hidden");
  els.final.textContent = `${state.score} / ${state.questions.length}`;
  const pct = state.score / state.questions.length;
  els.celebrate.classList.toggle("hidden", !(pct === 1 || pct >= 0.9));

  // Add Review button
  let btn = els.results.querySelector('#review-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'review-btn';
    btn.className = 'btn btn-ghost mt-4';
    btn.textContent = 'Review questions';
    btn.onclick = () => { state.review = true; state.index = 0; render(); };
    els.results.appendChild(btn);
  }

  // Clear saved session on finish to avoid stale resumes
  try { localStorage.removeItem(STORAGE_KEY()); } catch {}
}

/* ---------- helpers ---------- */
function currentQ(){ return state.questions[state.index]; }

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
    const extra = Math.max(0, acc - 0.80); const scale = 1 + extra * 2.5;
    els.fire.style.setProperty("--flame-scale", scale.toFixed(2));
  } else {
    els.fire.classList.add("hidden");
  }
}

function isCorrectChoice(q, choice){
  const ans = q.answer ?? q.answerText ?? q.answerIndex;
  if (Array.isArray(ans)) return ans.some(a => equalFold(a, choice));
  if (typeof ans === "string") return equalFold(ans, choice);
  return Number(choice) === Number(ans);
}

function sanitize(s=""){ return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function equalFold(a,b){ return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
function shuffleInPlace(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function shuffledCopy(a){ const b=[...a]; shuffleInPlace(b); return b; }
function seededShuffle(arr, seed=1){ let s=seed; const rand=()=> (s=(s*9301+49297)%233280)/233280;
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }

function capitalize(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }
function save(){ try { localStorage.setItem(STORAGE_KEY(), JSON.stringify(state)); } catch {} }
function announce(msg){ if (els.live) els.live.textContent = msg; }
