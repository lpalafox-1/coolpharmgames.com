// Reusable quiz engine with 🔥 at ≥80% accuracy (after 5 answered)
const params = new URLSearchParams(location.search);
const quizId = params.get("id");
const mode   = (params.get("mode") || "easy").toLowerCase();

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
};

// Week-2-style theme toggle with persistence
const THEME_KEY = "quiz-theme";
applyTheme(localStorage.getItem(THEME_KEY) || "light");
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(next); localStorage.setItem(THEME_KEY, next);
});
function applyTheme(mode){
  document.documentElement.classList.toggle("dark", mode === "dark");
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = mode === "dark" ? "☀️ Light" : "🌙 Dark";
}

const state = { title: "", questions: [], index: 0, score: 0 };

main().catch(err => {
  console.error(err);
  els.prompt.textContent = "Failed to load quiz.";
});

async function main() {
  if (!quizId) throw new Error("Missing ?id=…");
   // Choose pool by mode
  const allPool =
    (data.pools && data.pools[mode]) ||
    data.questions ||
    [];

  // Optional limit via URL: ?limit=5|10|20 (after shuffling)
  const limitParam = parseInt(new URLSearchParams(location.search).get("limit") || "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : null;

  // Copy + shuffle so we don't mutate the original
  const poolCopy = [...allPool];
  shuffleInPlace(poolCopy);

  // Apply limit (if any)
  const pool = limit ? poolCopy.slice(0, Math.min(limit, poolCopy.length)) : poolCopy;

  state.title = data.title || "Quiz";
  state.questions = pool.map(q => ({ ...q, _answered:false, _correct:false, _user:null }));
  shuffleInPlace(state.questions);
  els.title.textContent = `${state.title} — ${capitalize(mode)}`;
  els.qtotal.textContent = state.questions.length;
  wireEvents(); render();
}

function wireEvents(){
  els.prev.addEventListener("click", () => { if (state.index>0) state.index--; render(); });
  els.next.addEventListener("click", () => {
    if (state.index < state.questions.length - 1) { state.index++; render(); }
    else { showResults(); }
  });
  els.check.addEventListener("click", () => {
    const q = currentQ();
    if (q.type === "mcq" || q.type === "tf") {
      const chosen = els.options.querySelector("input[type='radio']:checked");
      if (!chosen) return; scoreCurrent(chosen.value);
    } else if (q.type === "short") {
      scoreCurrent(els.shortInput.value);
    }
  });
  els.restart.addEventListener("click", () => {
    state.index = 0; state.score = 0;
    state.questions.forEach(q => Object.assign(q,{_answered:false,_correct:false,_user:null}));
    els.results.classList.add("hidden");
    els.card.classList.remove("hidden");
    els.check.classList.remove("hidden");
    els.next.classList.add("hidden");
    render();
  });
}

function render(){
  const q = currentQ(); if (!q) return showResults();
  els.results.classList.add("hidden"); els.card.classList.remove("hidden");
  els.qnum.textContent = state.index + 1; els.score.textContent = state.score;
  els.prompt.innerHTML = sanitize(q.prompt || "Question");
  els.options.innerHTML = ""; els.shortWrap.classList.add("hidden");
  els.explain.textContent = q.explain || ""; els.explain.classList.toggle("show", q._answered);
  els.card.classList.remove("correct","wrong");
  els.prev.disabled = state.index === 0;
  els.next.classList.toggle("hidden", !q._answered);
  els.check.classList.toggle("hidden", !!q._answered);
  els.next.textContent = state.index === state.questions.length - 1 ? "View Final Score" : "Next";

  if (q.type === "mcq" || q.type === "tf") {
    const group = `q${state.index}`;
    const choices = Array.isArray(q.choices) ? q.choices : (q.type === "tf" ? ["True","False"] : []);
    choices.forEach((choice, idx) => {
      const id = `${group}c${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "flex items-center gap-2"; wrap.setAttribute("for", id);
      wrap.innerHTML = `<input id="${id}" type="radio" name="${group}" value="${choice}"><span>${sanitize(choice)}</span>`;
      if (q._answered) {
        wrap.querySelector("input").disabled = true;
        const ok = isCorrectChoice(q, choice);
        if (ok) wrap.classList.add("correct");
        if (q._user && equalFold(q._user, choice) && !q._correct) wrap.classList.add("wrong");
      }
      els.options.appendChild(wrap);
    });
  } else if (q.type === "short") {
    els.shortWrap.classList.remove("hidden");
    els.shortInput.value = q._user || ""; els.shortInput.disabled = q._answered;
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
  q._answered = true; q._correct = !!correct; q._user = userVal;
  if (correct) state.score += 1;
  els.explain.classList.toggle("show", !!q.explain);
  els.card.classList.toggle("correct", correct);
  els.card.classList.toggle("wrong", !correct);
  els.check.classList.add("hidden"); els.next.classList.remove("hidden");
  render();
}

function showResults(){
  els.card.classList.add("hidden"); els.results.classList.remove("hidden");
  els.final.textContent = `${state.score} / ${state.questions.length}`;
  const pct = state.score / state.questions.length;
  els.celebrate.classList.toggle("hidden", !(pct === 1 || pct >= 0.9));
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
    const extra = Math.max(0, acc - 0.80); const scale = 1 + extra * 2.5;
    els.fire.style.setProperty("--flame-scale", scale.toFixed(2));
  } else {
    els.fire.classList.add("hidden");
  }
}

/* helpers */
function currentQ(){ return state.questions[state.index]; }
function sanitize(s=""){ return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function equalFold(a,b){ return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
function isCorrectChoice(q, choice){
  const ans = q.answer ?? q.answerText ?? q.answerIndex;
  if (Array.isArray(ans)) return ans.some(a => equalFold(a, choice));
  if (typeof ans === "string") return equalFold(ans, choice);
  return Number(choice) === Number(ans);
}
function shuffleInPlace(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function capitalize(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }
