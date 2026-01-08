// assets/js/quizEngine.js
const params = new URLSearchParams(location.search);
const quizId = params.get("id");
const weekParam = parseInt(params.get("week") || "", 10);
const mode   = (params.get("mode") || "easy").toLowerCase();
const limitParam = parseInt(params.get("limit") || "", 10);
const seedParam  = parseInt(params.get("seed")  || "", 10);

let masterPoolData = null;

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

const QUIZ_CONFIG = {
  'log-lab-2-quiz-1': { newWeek: 1, reviewWeeks: [1, 2, 3] },
  'log-lab-2-quiz-2': { newWeek: 2, reviewWeeks: [4, 5, 6] },
  'log-lab-2-quiz-3': { newWeek: 3, reviewWeeks: [6, 7] },
  'log-lab-2-quiz-4': { newWeek: 4, reviewWeeks: [8] }, 
  'log-lab-2-quiz-5': { newWeek: 5, reviewWeeks: [9] },
  'log-lab-2-quiz-6': { newWeek: 6, reviewWeeks: [10, 11] },
  'log-lab-2-quiz-7': { newWeek: 7, reviewWeeks: 'ALL' },
  'log-lab-2-quiz-8': { newWeek: 8, reviewWeeks: 'ALL' },
  'log-lab-2-quiz-9': { newWeek: 9, reviewWeeks: 'ALL' },
  'log-lab-2-quiz-10': { newWeek: 10, reviewWeeks: 'ALL' },
  'log-lab-2-quiz-11': { newWeek: 11, reviewWeeks: 'ALL' }
};

const state = {
  title: "",
  questions: [],
  index: 0,
  score: 0,
  review: false,
  currentStreak: 0,
  bestStreak: 0,
  marked: new Set(),
  timerEnabled: false,
  timerSeconds: 0,
  timerHandle: null,
};

const STORAGE_KEY = () => `pharmlet.${quizId || 'week'+weekParam}.${mode}`;

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  if (els.themeToggle) {
    els.themeToggle.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      applyTheme(next); localStorage.setItem(THEME_KEY, next);
    });
  }
}

function applyTheme(mode){
  document.documentElement.classList.toggle("dark", mode === "dark");
  if (els.themeToggle) els.themeToggle.textContent = mode === "dark" ? "Light" : "Dark";
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  main().catch(handleError);
});

function handleError(err) {
  console.error(err);
  if (els.title) els.title.textContent = 'Quiz Error';
  if (els.card) els.card.innerHTML = `<div class="p-4"><p style="color:var(--muted)">Error: ${err.message}</p></div>`;
}

async function main() {
  if (!els.title || !els.card) return;
  if (weekParam) await loadDynamicQuiz();
  else if (quizId) await loadStaticQuiz();
  else throw new Error("Missing ?id=… or ?week=…");
  finalizeSetup();
}

async function loadDynamicQuiz() {
  if (!masterPoolData) {
    const res = await fetch("assets/data/master_pool.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load master pool`);
    masterPoolData = await res.json();
  }
  window.masterPool = masterPoolData;
  const dynamicQuizId = `log-lab-2-quiz-${weekParam}`;
  const selectedDrugs = generateQuiz(dynamicQuizId);
  const questions = selectedDrugs.map(drug => createQuestion(drug, masterPoolData));

  state.title = `Log Lab 2 Week ${weekParam}`;
  state.questions = questions.map((q, i) => ({
    ...q,
    _answered:false, _correct:false, _user:null,
    _choices: Array.isArray(q.choices) ? shuffledCopy(q.choices) : (q.type === "tf" ? ["True","False"] : null),
    _id: i
  }));
}

async function loadStaticQuiz() {
  const res = await fetch(`quizzes/${quizId}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  let allPool = data.pools ? Object.values(data.pools).flat() : (data.questions || []);
  
  const poolCopy = [...allPool];
  shuffleInPlace(poolCopy);
  const limit = limitParam > 0 ? limitParam : poolCopy.length;
  const pool = poolCopy.slice(0, limit);

  state.title = data.title || "Quiz";
  state.questions = pool.map((q, i) => ({
    ...q,
    _answered:false, _correct:false, _user:null,
    _choices: Array.isArray(q.choices) ? shuffledCopy(q.choices) : (q.type === "tf" ? ["True","False"] : null),
    _id: i
  }));
}

function finalizeSetup() {
  if (els.title) els.title.textContent = state.title;
  if (els.qtotal) els.qtotal.textContent = state.questions.length;
  wireEvents();
  render();
}

function generateQuiz(quizId) {
  const config = QUIZ_CONFIG[quizId];
  if (!config) return [];
  const pool = window.masterPool || [];
  
  let newMaterial = pool.filter(d => Number(d.metadata?.lab) === 2 && Number(d.metadata?.week) === config.newWeek);
  let reviewPool = (config.reviewWeeks === 'ALL') 
    ? pool.filter(d => Number(d.metadata?.lab) === 1)
    : pool.filter(d => Number(d.metadata?.lab) === 1 && config.reviewWeeks.includes(Number(d.metadata?.week)));

  const selected = shuffledCopy(newMaterial).slice(0, 6);
  const review = shuffledCopy(reviewPool).slice(0, 10 - selected.length);
  return [...selected, ...review];
}

function createQuestion(drug, allDrugs) {
  const types = [];
  if (drug.brand) types.push("brand-generic", "generic-brand");
  if (drug.class) types.push("class");
  if (drug.category) types.push("category");
  if (drug.moa) types.push("moa");

  const type = types[Math.floor(Math.random() * types.length)];
  const distract = (val, key) => getDistractors(val, allDrugs, d => d[key], 3);

  if (type === "brand-generic") return { type: "short", prompt: `Generic name for <b>${drug.brand}</b>?`, answer: drug.generic };
  if (type === "generic-brand") return { type: "short", prompt: `Brand name for <b>${drug.generic}</b>?`, answer: drug.brand };
  if (type === "class") return createMCQ(`Class of ${drug.generic}?`, drug.class, distract(drug.class, 'class'));
  if (type === "category") return createMCQ(`Category of ${drug.generic}?`, drug.category, distract(drug.category, 'category'));
  if (type === "moa") return createMCQ(`MOA of ${drug.generic}?`, drug.moa, distract(drug.moa, 'moa'));
  return { type: "short", prompt: "Error", answer: "error" };
}

function createMCQ(prompt, answer, distractors) {
  return { type: "mcq", prompt, choices: [...distractors, answer], answer: [answer] };
}

function getDistractors(correct, all, extractor, count) {
  const vals = [...new Set(all.map(extractor).filter(v => v && v !== correct))];
  return shuffledCopy(vals).slice(0, count);
}

function wireEvents(){
  els.next?.addEventListener("click", () => {
    if (state.index < state.questions.length - 1) { state.index++; render(); }
    else showResults();
  });
  els.prev?.addEventListener("click", () => { if (state.index > 0) { state.index--; render(); } });
  els.check?.addEventListener("click", () => {
    const q = currentQ();
    if (q.type === "short") scoreCurrent(els.shortInput.value);
    else {
      const sel = els.options.querySelector("input:checked");
      if (sel) scoreCurrent(sel.value);
    }
  });
  els.restart?.addEventListener("click", () => location.reload());
}

function render(){
  const q = currentQ();
  if (!q) return;
  els.qnum.textContent = state.index + 1;
  els.prompt.innerHTML = q.prompt;
  els.options.innerHTML = "";
  els.shortWrap.classList.add("hidden");
  els.explain.classList.remove("show");

  if (q.type === "mcq") {
    q._choices.forEach(c => {
      const btn = document.createElement("label");
      btn.className = "flex items-center gap-2 p-2 border rounded cursor-pointer";
      btn.innerHTML = `<input type="radio" name="opt" value="${c}"> ${c}`;
      els.options.appendChild(btn);
    });
  } else {
    els.shortWrap.classList.remove("hidden");
    els.shortInput.value = "";
    els.shortInput.focus();
  }
  
  els.check.classList.remove("hidden");
  els.next.classList.add("hidden");
}

function scoreCurrent(val) {
  const q = currentQ();
  const isCorrect = isCorrectChoice(q, val);
  q._answered = true;
  q._correct = isCorrect;
  state.score += isCorrect ? 1 : 0;
  
  renderAnswerReveal(q);
  els.check.classList.add("hidden");
  els.next.classList.remove("hidden");
}

function isCorrectChoice(q, val) {
  const ans = Array.isArray(q.answer) ? q.answer[0] : q.answer;
  return val.trim().toLowerCase() === ans.trim().toLowerCase();
}

function renderAnswerReveal(q) {
  els.explain.innerHTML = `<b>Answer:</b> ${Array.isArray(q.answer) ? q.answer[0] : q.answer}`;
  els.explain.classList.add("show");
}

function showResults() {
  els.card.classList.add("hidden");
  els.results.classList.remove("hidden");
  els.final.textContent = `${state.score} / ${state.questions.length}`;
}

function currentQ() { return state.questions[state.index]; }
function shuffleInPlace(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function shuffledCopy(a){ const b=[...a]; shuffleInPlace(b); return b; }
function sanitize(s=""){ return s; }
