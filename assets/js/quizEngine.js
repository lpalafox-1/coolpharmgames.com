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

// --- TIMER ---
function startSmartTimer() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  const count = state.questions.length;
  if (weekParam) {
    state.timerSeconds = 600; 
  } else {
    if (count <= 20) state.timerSeconds = 900;
    else if (count <= 50) state.timerSeconds = 2700;
    else state.timerSeconds = 7200;
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

// --- DATA ---
async function loadDynamicQuiz() {
  const res = await fetch("assets/data/master_pool.json", { cache: "no-store" });
  const pool = await res.json();
  const reviewWeeks = GAME_PLAN[weekParam] || 'ALL';
  const newPool = pool.filter(d => Number(d.metadata?.lab) === 2 && Number(d.metadata?.week) === weekParam);
  const revPool = (reviewWeeks === 'ALL') ? pool.filter(d => Number(d.metadata?.lab) === 1) : pool.filter(d => Number(d.metadata?.lab) === 1 && reviewWeeks.includes(Number(d.metadata?.week)));
  const combined = [...shuffled(newPool).slice(0, 6), ...shuffled(revPool).slice(0, 4)];
  state.title = `Top Drug Quiz ${weekParam}`;
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
    return { type: "mcq", prompt: `Identify <b>Brand & Class</b> for <b>${drug.generic}</b>?`, choices: shuffled([`${singleBrand} / ${second}`, `${singleBrand} / ${getRandomVal(key)}`, `${getRandomVal('brand').split(/[,/]/)[0]} / ${second}`, `${getRandomVal('brand').split(/[,/]/)[0]} / ${getRandomVal(key)}`]), answer: `${singleBrand} / ${second}`, drugRef: drug };
  }
  if (r < 0.60) return { type: "short", prompt: `Generic for <b>${singleBrand}</b>?`, answer: drug.generic, drugRef: drug };
  if (r < 0.85) return { type: "short", prompt: `Brand for <b>${drug.generic}</b>?`, answer: singleBrand, drugRef: drug };
  const mcqTypes = [{l:'Classification', k:'class'}, {l:'Category', k:'category'}, {l:'MOA', k:'moa'}].filter(x => drug[x.k]);
  const t = mcqTypes[Math.floor(Math.random() * mcqTypes.length)];
  return { type: "mcq", prompt: `<b>${t.l}</b> for <b>${drug.generic}</b>?`, choices: shuffled([...distract(drug[t.k], t.k), drug[t.k]]), answer: drug[t.k], drugRef: drug };
}

// --- EVENTS ---
function wireEvents() {
  els.next.onclick = () => { if (state.index < state.questions.length - 1) { state.index++; render(); } else showResults(); };
  els.prev.onclick = () => { if (state.index > 0) { state.index--; render(); } };
  els.check.onclick = () => {
    const q = state.questions[state.index];
    let val = (q.type === "mcq") ? els.options.querySelector("input:checked")?.value : els.shortInput.value;
    if (val) scoreCurrent(val);
  };
  els.restart.onclick = () => location.reload();

  // Mobile-Optimized Timer
  if (els.timerReadout) {
    els.timerReadout.style.cursor = "pointer";
    els.timerReadout.style.webkitTapHighlightColor = "transparent";
    els.timerReadout.onclick = (e) => {
      e.preventDefault();
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

  // Mastery Keyboard Shortcuts
  window.onkeydown = (e) => {
    if (document.activeElement.tagName === 'INPUT' && e.key !== 'Enter') return;
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (state.questions[idx]) { state.index = idx; render(); }
    } else if (e.key === '0') {
      if (state.questions[9]) { state.index = 9; render(); }
    }
    if (e.key === "ArrowRight") { if (state.index < state.questions.length - 1) { state.index++; render(); } } 
    else if (e.key === "ArrowLeft") { if (state.index > 0) { state.index--; render(); } } 
    else if (e.key.toLowerCase() === "t") { if (els.timerReadout) els.timerReadout.click(); } 
    else if (e.key.toLowerCase() === "m") { if (els.mark) els.mark.click(); }
    else if (e.key === "Enter") { 
      if (!state.questions[state.index]._answered) els.check.click(); 
      else if (state.index < state.questions.length - 1) els.next.click(); 
    }
  };
}

function render() {
  const q = state.questions[state.index];
  if (!q) return;
  els.qnum.textContent = state.index + 1;
  els.prompt.innerHTML = q.prompt;
  els.options.innerHTML = "";
  els.shortWrap.classList.add("hidden");
  els.explain.classList.remove("show");
  els.prev.disabled = (state.index === 0);
  els.check.classList.toggle("hidden", !!q._answered);
  els.next.classList.toggle("hidden", !q._answered);

  if (q.type === "mcq") {
    q.choices.forEach(c => {
      const lbl = document.createElement("label");
      lbl.className = `flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all active:scale-[0.98] mb-2 ${q._user === c ? 'ring-2 ring-[#8b1e3f] bg-[#8b1e3f]/5' : 'border-[var(--ring)]'}`;
      lbl.style.webkitTapHighlightColor = "transparent";
      
      lbl.innerHTML = `
        <input type="radio" name="opt" value="${c}" class="w-5 h-5 accent-[#8b1e3f]" ${q._user === c ? 'checked' : ''} ${q._answered ? 'disabled' : ''}>
        <span class="flex-1 text-base leading-tight">${c}</span>
      `;

      lbl.onclick = () => {
        if (!q._answered) {
          const rad = lbl.querySelector('input');
          if (rad) rad.checked = true;
          q._user_temp = c; 
          document.querySelectorAll('#options label').forEach(l => l.classList.remove('ring-2', 'ring-[#8b1e3f]', 'bg-[#8b1e3f]/5'));
          lbl.classList.add('ring-2', 'ring-[#8b1e3f]', 'bg-[#8b1e3f]/5');
        }
      };
      els.options.appendChild(lbl);
    });
  } else {
    els.shortWrap.classList.remove("hidden");
    els.shortInput.value = q._user || "";
    q._answered ? els.shortInput.setAttribute("disabled", "true") : els.shortInput.removeAttribute("disabled");
  }
  if (q._answered) renderAnswerReveal(q);
  renderNavMap(); 
}

function renderNavMap() {
  if (!els.navMap) return;
  els.navMap.innerHTML = "";
  state.questions.forEach((q, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    let colorClass = "bg-gray-200 text-gray-600";
    if (q._answered) colorClass = q._correct ? "bg-green-500 text-white" : "bg-red-500 text-white";
    else if (state.marked.has(i)) colorClass = "bg-yellow-400 text-black ring-2 ring-yellow-600";
    btn.className = `w-8 h-8 rounded-lg text-xs font-bold transition-all ${i === state.index ? 'ring-2 ring-blue-500' : ''} ${colorClass}`;
    btn.textContent = i + 1;
    btn.onclick = () => { state.index = i; render(); };
    els.navMap.appendChild(btn);
  });
}

function scoreCurrent(val) {
  const q = state.questions[state.index];
  const isCorrect = val.trim().toLowerCase() === q.answer.toLowerCase();
  q._answered = true; q._user = (val === "SKIPPED_REVEALED") ? "Revealed" : val;
  q._correct = isCorrect;
  if (isCorrect) state.score++;
  
  const storageKey = weekParam ? `pharmlet.week${weekParam}.easy` : `pharmlet.${quizId}.easy`;
  localStorage.setItem(storageKey, JSON.stringify({score: state.score, total: state.questions.length}));
  
  render();
}

function renderAnswerReveal(q) {
  els.explain.innerHTML = `<div class="p-3 rounded-lg ${q._correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"><b>${q._correct ? 'Correct!' : 'Answer:'}</b> <b>${q.answer}</b></div>`;
  els.explain.classList.add("show");
}

function showResults() {
  els.card.classList.add("hidden");
  els.results.classList.remove("hidden");
  els.final.textContent = `${state.score} / ${state.questions.length}`;
}

function initTheme() {
  const isDark = localStorage.getItem("quiz-theme") === "dark";
  document.documentElement.classList.toggle("dark", isDark);
}

function shuffled(a) { return [...a].sort(() => 0.5 - Math.random()); }
