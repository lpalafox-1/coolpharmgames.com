// assets/js/quizEngine.js
// Clean quiz runner with: seeded/random order, limit, review mode,
// explicit answer reveal, keyboard shortcuts, progress mini-map,
// mark-for-review, session timer, streak meter, a11y niceties.
// NOW WITH DYNAMIC GENERATION!

const params = new URLSearchParams(location.search);
const quizId = params.get("id");
const weekParam = parseInt(params.get("week") || "", 10);
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
let masterPoolData = null; // Cache for dynamic restarts

// Wait for DOM to be ready before setting up theme
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

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

const STORAGE_KEY = () => `pharmlet.${quizId || 'week'+weekParam}.${mode}`;

// Wait for DOM to be ready before starting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    main().catch(handleError);
  });
} else {
  main().catch(handleError);
}

function handleError(err) {
  console.error(err);
  if (els.title) els.title.textContent = 'Quiz Error';
  if (els.card) els.card.innerHTML = `<div class="p-4"><p style="color:var(--muted)">Error loading quiz: ${err.message}</p></div>`;
}

async function main() {
  // Check if required DOM elements exist
  if (!els.title || !els.card) {
    throw new Error("Required DOM elements not found.");
  }

  if (weekParam) {
    // --- DYNAMIC MODE ---
    await loadDynamicQuiz();
  } else if (quizId) {
    // --- STATIC MODE ---
    await loadStaticQuiz();
  } else {
    throw new Error("Missing ?id=… or ?week=…");
  }

  finalizeSetup();
}

async function loadDynamicQuiz() {
  if (!masterPoolData) {
    const res = await fetch("assets/data/master_pool.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load master pool: ${res.status}`);
    masterPoolData = await res.json();
  }

  const generated = generateQuizFromPool(masterPoolData, weekParam);
  state.title = generated.title;
  state.questions = generated.questions.map((q, i) => ({
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

  let allPool = [];
  // Stratified sampling support via blueprint
  if (data.blueprint && data.blueprint[mode]) {
    const rules = data.blueprint[mode];
    rules.forEach(rule => {
      const sourcePool = data.pools[rule.source] || [];
      const subPool = shuffledCopy(sourcePool);
      const count = typeof rule.count === 'number' ? rule.count : sourcePool.length;
      allPool.push(...subPool.slice(0, count));
    });
  } else if (data.pools) {
    const keys = Object.keys(data.pools || {});
    if (mode === 'all' || mode === 'mix') {
      allPool = keys.reduce((acc,k)=> acc.concat(Array.isArray(data.pools[k])?data.pools[k]:[]), []);
    } else if (data.pools[mode]) {
      allPool = data.pools[mode] || [];
    } else {
      allPool = keys.reduce((acc,k)=> acc.concat(Array.isArray(data.pools[k])?data.pools[k]:[]), []);
    }
  } else {
    allPool = data.questions || [];
  }

  if (!Array.isArray(allPool) || allPool.length === 0) {
    throw new Error(`No questions found for mode "${mode}"`);
  }

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
}

function finalizeSetup() {
  // restore saved session if present (and same length)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY()) || "null");
    if (saved && Array.isArray(saved.questions) && saved.questions.length === state.questions.length) {
      Object.assign(state, saved, { review:false, timerHandle:null });
      state.marked = new Set(saved.marked || []);
    }
  } catch {}

  if (els.title) els.title.textContent = `${state.title}`;
  if (els.qtotal) els.qtotal.textContent = state.questions.length;

  wireEvents();
  render();
}

/* ---------- DYNAMIC GENERATION LOGIC ---------- */

function generateQuizFromPool(masterPool, week) {
  // 1. Define Review Schedule (Lab 1)
  let lab1Filter;
  if (week === 1) lab1Filter = d => d.metadata.lab === 1 && d.metadata.week >= 1 && d.metadata.week <= 3;
  else if (week === 2) lab1Filter = d => d.metadata.lab === 1 && d.metadata.week >= 4 && d.metadata.week <= 6;
  else if (week === 3) lab1Filter = d => d.metadata.lab === 1 && d.metadata.week >= 6 && d.metadata.week <= 7;
  else if (week === 4) lab1Filter = d => d.metadata.lab === 1 && d.metadata.week === 8;
  else if (week === 5) lab1Filter = d => d.metadata.lab === 1 && d.metadata.week === 9;
  else if (week === 6) lab1Filter = d => d.metadata.lab === 1 && d.metadata.week >= 10 && d.metadata.week <= 11;
  else if (week >= 7 && week <= 11) lab1Filter = d => d.metadata.lab === 1 && d.metadata.week >= 1 && d.metadata.week <= 15;
  else lab1Filter = d => d.metadata.lab === 1 && d.metadata.quiz <= week; // Fallback

  // 2. Define New Schedule (Lab 2)
  // Lab 2 items are tagged with week: X (previously quiz: X)
  const lab2Filter = d => d.metadata.lab === 2 && d.metadata.week === week;

  // 3. Filter Pools
  const lab1Pool = masterPool.filter(lab1Filter);
  const lab2Pool = masterPool.filter(lab2Filter);

  // 4. Select Items (6 New, 4 Review)
  const selectedLab2 = shuffledCopy(lab2Pool).slice(0, 6);
  const selectedLab1 = shuffledCopy(lab1Pool).slice(0, 4);
  const selectedDrugs = [...selectedLab2, ...selectedLab1];

  // 5. Generate Questions
  const questions = selectedDrugs.map(drug => createQuestion(drug, masterPool));

  return {
    title: `Log Lab 2 Week ${week}`,
    questions: questions
  };
}

function createQuestion(drug, allDrugs) {
  // Determine question types based on available data
  const types = [];
  if (drug.brand) { types.push("brand-generic", "generic-brand"); }
  if (drug.class) { types.push("class"); }
  if (drug.category) { types.push("category"); }
  if (drug.moa) { types.push("moa"); }

  if (types.length === 0) {
      // Fallback
      return { type: "short", prompt: `Error: No data for ${drug.generic}`, answer: "error" };
  }

  const type = types[Math.floor(Math.random() * types.length)];
  let q = {};

  switch (type) {
    case "brand-generic":
      // ENFORCE: Brand/Generic Questions Must ALWAYS be Fill-in-the-Blank (Input)
      q = {
        type: "short",
        prompt: `What is the generic name for <strong>${drug.brand}</strong>?`,
        answerText: [drug.generic.toLowerCase()],
        mapping: { generic: drug.generic, brand: drug.brand }
      };
      break;
    case "generic-brand":
      // ENFORCE: Brand/Generic Questions Must ALWAYS be Fill-in-the-Blank (Input)
      q = {
        type: "short",
        prompt: `What is the brand name for <strong>${drug.generic}</strong>?`,
        answerText: [drug.brand.toLowerCase()],
        mapping: { generic: drug.generic, brand: drug.brand }
      };
      break;
    case "class":
      // ENFORCE: Class Questions Must ALWAYS be Multiple Choice (Radio)
      q = createMCQ(
        `Which class does <strong>${drug.generic}</strong> belong to?`,
        drug.class,
        getDistractors(drug.class, allDrugs, d => d.class, 3)
      );
      break;
    case "category":
      // ENFORCE: Category Questions Must ALWAYS be Multiple Choice (Radio)
      q = createMCQ(
        `What is the category of <strong>${drug.generic}</strong>?`,
        drug.category,
        getDistractors(drug.category, allDrugs, d => d.category, 3)
      );
      break;
    case "moa":
      // ENFORCE: MOA Questions Must ALWAYS be Multiple Choice (Radio)
      q = createMCQ(
        `What is the MOA of <strong>${drug.generic}</strong>?`,
        drug.moa,
        getDistractors(drug.moa, allDrugs, d => d.moa, 3)
      );
      break;
  }
  return q;
}

function createMCQ(prompt, answer, distractors) {
  const choices = shuffledCopy([...distractors, answer]);
  return {
    type: "mcq",
    prompt: prompt,
    choices: choices,
    answer: [answer]
  };
}

function getDistractors(correct, allDrugs, extractor, count) {
  const unique = new Set();
  allDrugs.forEach(d => {
    const val = extractor(d);
    if (val && val !== correct) unique.add(val);
  });
  const list = Array.from(unique);
  return shuffledCopy(list).slice(0, count);
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
    } else if (q.type === "mcq-multiple") {
      const checked = Array.from(els.options.querySelectorAll("input[type='checkbox']:checked"));
      if (checked.length === 0) return;
      const answers = checked.map(cb => cb.value);
      scoreCurrent(answers);
    } else if (q.type === "short") {
      scoreCurrent(els.shortInput.value);
    }
  });
  els.restart?.addEventListener("click", restart);
  els.mark?.addEventListener("click", () => {
    const idx = state.index;
    if (state.marked.has(idx)) state.marked.delete(idx);
    else state.marked.add(idx);
    renderNavMap();
    updateMarkButton();
    save();
  });
  els.timerToggle?.addEventListener("click", toggleTimer);
  const hintBtn = document.getElementById('hint-btn');
  const revealBtn = document.getElementById('reveal-solution');
  hintBtn?.addEventListener('click', () => { showHintFor(currentQ()); });
  revealBtn?.addEventListener('click', () => { toggleRevealSolution(); });

  window.addEventListener('keydown', (e)=>{
    if (document.activeElement === els.shortInput) return;
    const key = e.key;
    if (key === 'ArrowRight') { e.preventDefault(); if (!els.next.classList.contains('hidden')) els.next.click(); }
    if (key === 'ArrowLeft')  { e.preventDefault(); els.prev.click(); }
    if (key === 'Enter')      { e.preventDefault(); if (!els.check.classList.contains('hidden')) els.check.click(); else if (!els.next.classList.contains('hidden')) els.next.click(); }
    const num = Number(key);
    if (num >= 1 && num <= 9) {
      const q = currentQ();
      if (q && (q.type === "mcq" || q.type === "tf")) {
        const radios = els.options.querySelectorAll("input[type='radio']");
        const choice = radios[num-1];
        if (choice && !choice.disabled) {
          choice.checked = true;
          enableCheckIfChoiceSelected();
        }
      } else if (q && q.type === "mcq-multiple") {
        const checkboxes = els.options.querySelectorAll("input[type='checkbox']");
        const choice = checkboxes[num-1];
        if (choice && !choice.disabled) {
          choice.checked = !choice.checked;
          enableCheckIfChoiceSelected();
        }
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
        if (!ok) wrap.style.opacity = ".65";
        wrap.setAttribute("aria-checked", equalFold(q._user, choice) ? "true" : "false");
        wrap.setAttribute("aria-disabled", "true");
      }
      els.options.appendChild(wrap);
    });
  } else if (q.type === "mcq-multiple") {
    const group = `q${state.index}`;
    const choices = q._choices || [];
    choices.forEach((choice, idx) => {
      const id = `${group}c${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "flex items-center gap-2";
      wrap.setAttribute("for", id);
      wrap.setAttribute("role", "checkbox");
      wrap.setAttribute("aria-checked", "false");
      wrap.innerHTML = `<input id="${id}" type="checkbox" name="${group}" value="${choice}"><span>${sanitize(choice)}</span>`;
      const input = wrap.querySelector("input");
      input.addEventListener('change', enableCheckIfChoiceSelected);
      if (Array.isArray(q._user) && q._user.includes(choice)) {
        input.checked = true;
        wrap.setAttribute("aria-checked", "true");
      }
      if (q._answered || state.review) {
        input.disabled = true;
        const ok = isCorrectChoice(q, choice);
        const userSelected = Array.isArray(q._user) && q._user.includes(choice);
        if (ok) wrap.classList.add("correct");
        if (userSelected && !q._correct) wrap.classList.add("wrong");
        if (!ok) wrap.style.opacity = ".65";
        wrap.setAttribute("aria-checked", userSelected ? "true" : "false");
        wrap.setAttribute("aria-disabled", "true");
      }
      els.options.appendChild(wrap);
    });
  } else if (q.type === "short") {
    els.shortWrap.classList.remove("hidden");
    els.shortInput.value = q._user || "";
    els.shortInput.disabled = q._answered || state.review;
    els.check.disabled = !q._answered && !(els.shortInput.value.trim().length > 0);
    els.shortInput.oninput = () => {
      if (state.review || q._answered) return;
      els.check.disabled = els.shortInput.value.trim().length === 0;
    };
  } else {
    els.options.innerHTML = `<p style="color:var(--muted)">Unsupported question type.</p>`;
  }

  if (q.type === "mcq" || q.type === "tf") {
    const anyChecked = !!els.options.querySelector("input[type='radio']:checked");
    els.check.disabled = !anyChecked;
  } else if (q.type === "mcq-multiple") {
    const anyChecked = !!els.options.querySelector("input[type='checkbox']:checked");
    els.check.disabled = !anyChecked;
  }

  if (q._answered || state.review) {
    renderAnswerReveal(q);
  }

  updateMarkButton();
  const hintBtn = document.getElementById('hint-btn');
  const revealBtn = document.getElementById('reveal-solution');
  if (hintBtn) hintBtn.disabled = !(q && (q.hints || q.hint));
  if (revealBtn) revealBtn.disabled = !(q && (q.solution || q.explain));

  renderNavMap();
  updateProgressAndFlame();
  save();
}

function enableCheckIfChoiceSelected() {
  const q = currentQ();
  if (!q) return;
  if (q.type === "mcq" || q.type === "tf") {
    const sel = els.options.querySelector("input[type='radio']:checked");
    els.check.disabled = !sel;
  } else if (q.type === "mcq-multiple") {
    const checked = els.options.querySelectorAll("input[type='checkbox']:checked");
    els.check.disabled = checked.length === 0;
  }
}

function scoreCurrent(userValRaw){
  const q = currentQ(); 
  let correct = false;
  let userVal = userValRaw;
  
  if (q.type === "mcq" || q.type === "tf") {
    userVal = (userValRaw ?? "").toString().trim();
    correct = isCorrectChoice(q, userVal);
  } else if (q.type === "mcq-multiple") {
    if (Array.isArray(userValRaw)) {
      userVal = userValRaw;
      correct = isCorrectMultipleChoice(q, userVal);
    } else {
      userVal = [];
      correct = false;
    }
  } else if (q.type === "short") {
    userVal = (userValRaw ?? "").toString().trim();
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
  render();
}

function showResults(){
  els.card.classList.add("hidden");
  els.results.classList.remove("hidden");
  els.final.textContent = `${state.score} / ${state.questions.length}`;
  savePerformanceHistory();
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
  sum.innerHTML = `Correct: <strong>${state.score}</strong> &nbsp; • &nbsp; Wrong: <strong>${wrong}</strong> &nbsp; • &nbsp; Best streak: <strong>${state.bestStreak}</strong>${state.timerSeconds>0 ? ` &nbsp; • &nbsp; Time: <strong>${formatTime(state.timerSeconds)}</strong>` : ""}`;
  const pct = state.score / state.questions.length;
  els.celebrate.classList.toggle("hidden", !(pct === 1 || pct >= 0.9));
  if (pct === 1) triggerConfetti();
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
  
  if (weekParam && masterPoolData) {
    // --- DYNAMIC RESTART ---
    const generated = generateQuizFromPool(masterPoolData, weekParam);
    state.questions = generated.questions.map((q, i) => ({
      ...q,
      _answered:false, _correct:false, _user:null,
      _choices: Array.isArray(q.choices) ? shuffledCopy(q.choices) : (q.type === "tf" ? ["True","False"] : null),
      _id: i
    }));
  } else {
    // --- STATIC RESTART ---
    shuffleInPlace(state.questions);
    state.questions.forEach(q => {
      Object.assign(q, {_answered:false,_correct:false,_user:null});
      if (Array.isArray(q.choices)) {
        q._choices = shuffledCopy(q.choices);
      }
    });
  }
  
  els.results.classList.add("hidden");
  els.card.classList.remove("hidden");
  els.check.classList.remove("hidden");
  els.next.classList.add("hidden");
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
    if (i === state.index) b.style.outline = `2px solid var(--accent)`;
    if (state.marked.has(i)) b.textContent += "*";
    if (q._answered) b.style.opacity = ".9";
    if (q._answered && !q._correct) b.style.borderColor = "var(--bad)";
    b.addEventListener("click", () => { state.index = i; render(); save(); });
    els.navMap.appendChild(b);
  });
}
function updateMarkButton(){
  if (!els.mark) return;
  const marked = state.marked.has(state.index);
  els.mark.textContent = marked ? "Unmark" : "Mark";
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
function isCorrectMultipleChoice(q, userChoices) {
  const ans = q.answer ?? q.answerText ?? q.answerIndex;
  if (!Array.isArray(ans)) return false;
  if (!Array.isArray(userChoices)) return false;
  if (ans.length !== userChoices.length) return false;
  return ans.every(a => userChoices.some(uc => equalFold(a, uc))) &&
         userChoices.every(uc => ans.some(a => equalFold(a, uc)));
}
function shortAnswerMatches(q, userVal) {
  const answerSource = q.answerText || q.answer;
  const answers = Array.isArray(answerSource) ? answerSource : [answerSource];
  const normUser = norm(userVal);
  const userNum = parseNumber(normUser);
  const explicitTol = Number.isFinite(Number(q.tolerance)) ? Number(q.tolerance) : null;
  return answers.filter(Boolean).some(a => {
    const na = String(a).trim();
    const answerNum = parseNumber(na);
    if (Number.isFinite(answerNum) && Number.isFinite(userNum)) {
      if (Number.isFinite(explicitTol)) {
        return Math.abs(answerNum - userNum) <= explicitTol;
      }
      if (Number(answerNum) === Number(userNum)) return true;
    }
    const range = parseRange(na);
    if (range && Number.isFinite(userNum)) {
      return userNum >= range.min && userNum <= range.max;
    }
    const naNorm = norm(na);
    return naNorm === normUser || softEq(naNorm, normUser);
  });
}
function parseNumber(s){
  if (s === null || s === undefined) return NaN;
  const cleaned = String(s).trim();
  if (!/[0-9]/.test(cleaned)) return NaN;
  const filtered = cleaned.replace(/[^0-9\.\-\+eE]/g,'').trim();
  const n = Number(filtered);
  return Number.isFinite(n) ? n : NaN;
}
function parseRange(s){
  if (!s) return null;
  const tolMatch = s.match(/^\s*([+-]?[0-9]*\.?[0-9]+)\s*[±+]\s*([0-9]*\.?[0-9]+)\s*$/);
  if (tolMatch) {
    const val = Number(tolMatch[1]); const tol = Number(tolMatch[2]);
    if (Number.isFinite(val) && Number.isFinite(tol)) return { min: val - tol, max: val + tol };
  }
  const dashMatch = s.match(/^\s*([+-]?[0-9]*\.?[0-9]+)\s*-\s*([+-]?[0-9]*\.?[0-9]+)\s*$/);
  if (dashMatch) {
    const a = Number(dashMatch[1]); const b = Number(dashMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return { min: Math.min(a,b), max: Math.max(a,b) };
  }
  return null;
}
function norm(s=""){
  return String(s).toLowerCase().replace(/\s+/g, " ").replace(/[’'`]/g, "'").replace(/[\.,;:\-\{\}]/g, "").trim();
}
function softEq(a, b){
  if (a === b) return true;
  const ap = a.endsWith("s") ? a.slice(0,-1) : a + "s";
  const bp = b.endsWith("s") ? b.slice(0,-1) : b + "s";
  return ap === b || bp === a || ap === bp;
}
function getCorrectAnswers(q){
  if (q.type === "short" && Array.isArray(q.answerText) && q.answerText.length > 1) {
    return q.answerText.map(String);
  }
  if (Array.isArray(q.answer)) return q.answer.map(String);
  if (typeof q.answer === "string") return [ q.answer ];
  if (Array.isArray(q.answerText)) return q.answerText.map(String);
  if (typeof q.answerText === "string") return [ q.answerText ];
  if (typeof q.answerIndex === "number" && Array.isArray(q.choices)) {
    return [ String(q.choices[q.answerIndex]) ];
  }
  return [];
}
function renderAnswerReveal(q){
  const answers = getCorrectAnswers(q);
  const answerLine = answers.length
    ? `<div><strong>Correct answer:</strong> ${answers.map(sanitize).join(" • ")}</div>`
    : "";
  const explainLine = q.explain ? `<div class="mt-1">${sanitize(q.explain)}</div>` : "";
  const solutionLine = q.solution ? `<div class="mt-1"><strong>Solution:</strong> ${sanitize(q.solution)}</div>` : "";
  const html = `${answerLine}${explainLine}${solutionLine}`;
  els.explain.innerHTML = html || `<div style="color:var(--muted)">No explanation provided.</div>`;
  els.explain.classList.add("show");
}
function showHintFor(q){
  if (!q) return;
  const hints = q.hints || q.hint;
  if (!hints) return;
  const arr = Array.isArray(hints) ? hints : [hints];
  const existing = els.explain.innerHTML || "";
  const hintHtml = `<div class="mt-1 mini-hint"><strong>Hint:</strong> ${sanitize(arr[0])}</div>`;
  els.explain.innerHTML = existing + hintHtml;
  els.explain.classList.add('show');
}
function toggleRevealSolution(){
  const q = currentQ(); if (!q) return;
  const btn = document.getElementById('reveal-solution');
  const revealed = btn && btn.getAttribute('aria-pressed') === 'true';
  if (btn) btn.setAttribute('aria-pressed', revealed ? 'false' : 'true');
  if (!revealed) {
    const sol = q.solution ? `<div class="mt-2"><strong>Solution:</strong> ${sanitize(q.solution)}</div>` : '';
    const expl = q.explain ? `<div class="mt-1">${sanitize(q.explain)}</div>` : '';
    els.explain.innerHTML = (els.explain.innerHTML || '') + sol + expl;
    els.explain.classList.add('show');
  } else {
    render();
  }
}
function toggleTimer(){
  state.timerEnabled = !state.timerEnabled;
  els.timerToggle?.setAttribute("aria-pressed", state.timerEnabled ? "true" : "false");
  els.timerToggle.textContent = state.timerEnabled ? "Pause Timer" : "Start Timer";
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
function savePerformanceHistory(){
  try {
    const HISTORY_KEY = "pharmlet.history";
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const wrongAnswers = state.questions.filter(q => q._answered && !q._correct).map(q => ({
        quizId: quizId || ('week'+weekParam),
        mode,
        questionId: q._id,
        prompt: q.prompt,
        type: q.type,
        choices: q.choices || null,
        answer: q.answer || q.answerText || q.answerIndex,
        userAnswer: q._user,
        timestamp: new Date().toISOString()
      }));
    if (wrongAnswers.length > 0) {
      const REVIEW_KEY = "pharmlet.review-queue";
      const reviewQueue = JSON.parse(localStorage.getItem(REVIEW_KEY) || "[]");
      reviewQueue.push(...wrongAnswers);
      if (reviewQueue.length > 500) reviewQueue.splice(0, reviewQueue.length - 500);
      localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewQueue));
    }
    history.push({
      quizId: quizId || ('week'+weekParam),
      mode,
      title: state.title,
      score: state.score,
      total: state.questions.length,
      bestStreak: state.bestStreak,
      timeSeconds: state.timerSeconds,
      timestamp: new Date().toISOString()
    });
    if (history.length > 100) history.shift();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}
function triggerConfetti(){
  const colors = ['#8b1e3f', '#3e6990', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
  const confettiCount = 50;
  for (let i = 0; i < confettiCount; i++) {
    setTimeout(() => {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = Math.random() * 0.5 + 's';
      confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 5000);
    }, i * 30);
  }
}
function announce(msg){ if (els.live) els.live.textContent = msg; }
