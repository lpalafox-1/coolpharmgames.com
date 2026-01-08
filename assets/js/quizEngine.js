// assets/js/quizEngine.js
const params = new URLSearchParams(location.search);
const quizId = params.get("id");
const weekParam = parseInt(params.get("week") || "", 10);
const limitParam = parseInt(params.get("limit") || "", 10);

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
  card: document.getElementById("question-card"),
  navMap: document.getElementById("nav-map"), 
  timerReadout: document.getElementById("timer-readout"),
  mark: document.getElementById("mark"),
  hintBtn: document.getElementById("hint-btn"),
  revealBtn: document.getElementById("reveal-solution"),
  themeToggle: document.getElementById("theme-toggle")
};

const state = { 
  questions: [], index: 0, score: 0, title: "",
  timerSeconds: 0, timerHandle: null, marked: new Set()
};

const GAME_PLAN = {
  1: [1, 2, 3], 2: [4, 5, 6], 3: [6, 7], 4: [8],
  5: [9], 6: [10, 11], 7: 'ALL', 8: 'ALL', 9: 'ALL', 10: 'ALL', 11: 'ALL'
};

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  main().catch(console.error);
});

async function main() {
  if (weekParam) await loadDynamicQuiz();
  else if (quizId) await loadStaticQuiz();
  
  if (els.title) els.title.textContent = state.title;
  if (els.qtotal) els.qtotal.textContent = state.questions.length;
  
  startSmartTimer(); 
  wireEvents();
  render();
}

function startSmartTimer() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  const count = state.questions.length;
  
  if (weekParam) {
    state.timerSeconds = 600; // 10 mins
  } else {
    if (count <= 20) state.timerSeconds = 900;      // 15m
    else if (count <= 50) state.timerSeconds = 2700; // 45m
    else state.timerSeconds = 7200;                  // 2h
  }
  state.timerHandle = setInterval(timerTick, 1000);
}

function timerTick() {
  if (state.timerSeconds <= 0) {
    clearInterval(state.timerHandle);
    if (els.timerReadout) els.timerReadout.classList.add("text-red-500", "font-bold");
    return;
  }
  state.timerSeconds--;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  if (els.timerReadout) {
    els.timerReadout.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

async function loadDynamicQuiz() {
  const res = await fetch("assets/data/master_pool.json", { cache: "no-store" });
  const pool = await res.json();
  const reviewWeeks = GAME_PLAN[weekParam] || 'ALL';
  const newPool = pool.filter(d => Number(d.metadata?.lab) === 2 && Number(d.metadata?.week) === weekParam);
  const revPool = (reviewWeeks === 'ALL') ? pool.filter(d => Number(d.metadata?.lab) === 1) : pool.filter(d => Number(d.metadata?.lab) === 1 && reviewWeeks.includes(Number(d.metadata?.week)));
  const combined = [...shuffled(newPool).slice(0, 6), ...shuffled(revPool).slice(0, 4)];
  state.title = `Log Lab 2 Week ${weekParam}`;
  state.questions = shuffled(combined).map((d, i) => ({ ...createQuestion(d, pool), _id: i, drugRef: d }));
}

async function loadStaticQuiz() {
  const res = await fetch(`quizzes/${quizId}.json`, { cache: "no-store" });
  const data = await res.json();
  const pool = data.pools ? Object.values(data.pools).flat() : (data.questions || []);
  const limit = limitParam > 0 ? Math.min(limitParam, pool.length) : pool.length;
  state.title = data.title || "Quiz";
  state.questions = shuffled(pool).slice(0, limit).map((q, i) => ({ ...q, _id: i }));
}

function createQuestion(drug, all) {
  const getRandomVal = (key) => {
    const vals = all.map(d => d[key]).filter(v => v && v !== drug[key]);
    return vals[Math.floor(Math.random() * vals.length)];
  };
  const distract = (val, key) => [...new Set(all.map(d => d[key]).filter(v => v && v !== val))].sort(() => 0.5 - Math.random()).slice(0, 3);
  const brandList = drug.brand ? drug.brand.split(/[,/]/).map(b => b.trim()) : ["N/A"];
  const singleBrand = brandList[Math.floor(Math.random() * brandList.length)];
  const r = Math.random();

  if (r < 0.25 && (drug.class || drug.category)) {
    const second = drug.class || drug.category;
    const key = drug.class ? 'class' : 'category';
    return { type: "mcq", prompt: `Identify the <b>Brand</b> and <b>Class</b> for <b>${drug.generic}</b>?`, choices: shuffled([`${singleBrand} / ${second}`, `${singleBrand} / ${getRandomVal(key)}`, `${getRandomVal('brand').split(/[,/]/)[0]} / ${second}`, `${getRandomVal('brand').split(/[,/]/)[0]} / ${getRandomVal(key)}`]), answer: `${singleBrand} / ${second}`, drugRef: drug };
  }
  if (r < 0.60) return { type: "short", prompt: `Generic for <b>${singleBrand}</b>?`, answer: drug.generic, drugRef: drug };
  if (r < 0.85) return { type: "short", prompt: `Brand for <b>${drug.generic}</b>?`, answer: singleBrand, drugRef: drug };
  const mcqTypes = [{l:'Classification', k:'class'}, {l:'Category', k:'category'}, {l:'MOA', k:'moa'}].filter(x => drug[x.k]);
  const t = mcqTypes[Math.floor(Math.random() * mcqTypes.length)];
  return { type: "mcq", prompt: `<b>${t.l}</b> for <b>${drug.generic}</b>?`, choices: shuffled([...distract(drug[t.k], t.k), drug[t.k]]), answer: drug[t.k], drugRef: drug };
}

function wireEvents() {
  els.next.onclick = () => { if (state.index < state.questions.length - 1) { state.index++; render(); } else showResults(); };
  els.prev.onclick = () => { if (state.index > 0) { state.index--; render(); } };
  els.check.onclick = () => {
    const q = state.questions[state.index];
    const val = (q.type === "mcq") ? els.options.querySelector("input:checked")?.value : els.shortInput.value;
    if (val) scoreCurrent(val);
  };
  els.restart.onclick = () => location.reload();

  // MOBILE & T-KEY TIMER PAUSE
  if (els.timerReadout) {
    els.timerReadout.style.cursor = "pointer";
    els.timerReadout.onclick = () => {
      if (state.timerHandle) {
        clearInterval(state.timerHandle);
        state.timerHandle = null;
        els.timerReadout.classList.add("opacity-30", "animate-pulse");
      } else {
        state.timerHandle = setInterval(timerTick, 1000);
        els.timerReadout.classList.remove("opacity-30", "animate-pulse");
      }
    };
  }
  
  els.mark.onclick = () => {
    if (state.marked.has(state.index)) state.marked.delete(state.index);
    else state.marked.add(state.index);
    renderNavMap();
  };

  els.hintBtn.onclick = () => {
    const q = state.questions[state.index];
    alert(`Hint: Starts with "${q.answer[0]}". Class: ${q.drugRef?.class || 'N/A'}`);
  };

  els.revealBtn.onclick = () => {
    const q = state.questions[state.index];
    if (!q._answered) scoreCurrent("SKIPPED_REVEALED");
  };

  window.onkeydown = (e) => {
    if (document.activeElement.tagName === 'INPUT' && e.key !== 'Enter') return;
    if (e.key === "ArrowRight") { if (state.index < state.questions.length - 1) { state.index++; render(); } } 
    else if (e.key === "ArrowLeft") { if (state.index > 0) { state.index--; render(); } } 
    else if (e.key.toLowerCase() === "t") { if (els.timerReadout) els.timerReadout.click(); } 
    else if (e.key === "Enter") { if (!state.questions
