// assets/js/custom-quiz.js
// Custom quiz builder - combine questions from multiple quizzes

const THEME_KEY = "quiz-theme";
const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";

const state = {
  availableQuizzes: [],
  selectedQuizzes: new Set(),
};

// Theme toggle
document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("theme-toggle");
  const themeLabel = document.getElementById("theme-label");
  
  if (themeToggle && themeLabel) {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const start = saved || (prefersDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", start === "dark");
    themeLabel.textContent = start === "dark" ? "Light" : "Dark";
    
    themeToggle.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      themeLabel.textContent = next === "dark" ? "Light" : "Dark";
    });
  }

  loadAvailableQuizzes();
  
  document.getElementById("quiz-filter")?.addEventListener("input", filterQuizzes);
  document.getElementById("start-quiz")?.addEventListener("click", startCustomQuiz);
  document.getElementById("clear-selection")?.addEventListener("click", clearSelection);
});

async function loadAvailableQuizzes() {
  // Hardcoded list of available quizzes (could be generated dynamically)
  const quizIds = [
    "chapter1-review", "chapter2-review", "chapter3-review", "chapter4-review", "chapter5-review",
    "practice-e1-exam1-prep-ch1-4", "practice-e2a-exam2-prep-ch1-5",
    "lab-quiz1-antihypertensives", "lab-quiz2-antihypertensives", "lab-quiz3-antilipemics",
    "lab-quiz4-anticoagulants", "lab-quiz5-antiarrhythmics",
    "cumulative-quiz1-2", "cumulative-quiz1-3", "cumulative-quiz1-4", "cumulative-quiz1-5",
    "popp-practice-exam1", "popp-practice-law", "popp-practice-mock-E1",
    "basis-practice-exam1", "basis-practice-mock-E1",
    "top-drugs-final-mockA", "top-drugs-final-mockB", "top-drugs-final-mockC",
    "top-drugs-final-mockD", "top-drugs-final-mockE",
    "sig-wildcards", "latin-fun"
  ];

  const quizList = document.getElementById("quiz-list");
  quizList.innerHTML = "";

  for (const quizId of quizIds) {
    try {
      const res = await fetch(`quizzes/${quizId}.json`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      
      const quizInfo = {
        id: quizId,
        title: data.title || quizId,
        pools: data.pools || {},
        questionCount: calculateQuestionCount(data)
      };
      
      state.availableQuizzes.push(quizInfo);
      renderQuizCard(quizInfo);
    } catch (e) {
      console.warn(`Failed to load ${quizId}:`, e);
    }
  }

  if (state.availableQuizzes.length === 0) {
    quizList.innerHTML = '<div class="text-center py-8" style="color:var(--muted)">No quizzes available.</div>';
  }
}

function calculateQuestionCount(data) {
  if (data.pools && typeof data.pools === 'object') {
    return Object.values(data.pools).reduce((sum, pool) => {
      return sum + (Array.isArray(pool) ? pool.length : 0);
    }, 0);
  } else if (Array.isArray(data.questions)) {
    return data.questions.length;
  }
  return 0;
}

function renderQuizCard(quiz) {
  const quizList = document.getElementById("quiz-list");
  
  const div = document.createElement("div");
  div.className = "quiz-selector";
  div.dataset.quizId = quiz.id;
  
  div.innerHTML = `
    <label class="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" class="quiz-checkbox mt-1" value="${quiz.id}" />
      <div class="flex-1">
        <div class="font-semibold">${sanitize(quiz.title)}</div>
        <div class="text-sm mt-1" style="color:var(--muted)">
          ${quiz.questionCount} question${quiz.questionCount === 1 ? '' : 's'}
          ${Object.keys(quiz.pools).length > 0 ? ` · Modes: ${Object.keys(quiz.pools).join(', ')}` : ''}
        </div>
      </div>
    </label>
  `;
  
  const checkbox = div.querySelector(".quiz-checkbox");
  checkbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      state.selectedQuizzes.add(quiz.id);
      div.classList.add("selected");
    } else {
      state.selectedQuizzes.delete(quiz.id);
      div.classList.remove("selected");
    }
    updateSelectedSummary();
  });
  
  quizList.appendChild(div);
}

function filterQuizzes() {
  const filter = document.getElementById("quiz-filter").value.toLowerCase();
  const cards = document.querySelectorAll(".quiz-selector");
  
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(filter) ? "" : "none";
  });
}

function updateSelectedSummary() {
  const summary = document.getElementById("selected-summary");
  const startBtn = document.getElementById("start-quiz");
  
  if (state.selectedQuizzes.size === 0) {
    summary.style.color = "var(--muted)";
    summary.textContent = "No quizzes selected yet.";
    startBtn.disabled = true;
    return;
  }
  
  const selectedQuizzes = state.availableQuizzes.filter(q => state.selectedQuizzes.has(q.id));
  const totalQuestions = selectedQuizzes.reduce((sum, q) => sum + q.questionCount, 0);
  
  summary.style.color = "";
  summary.innerHTML = `
    <strong>${state.selectedQuizzes.size}</strong> quiz${state.selectedQuizzes.size === 1 ? '' : 'zes'} selected · 
    <strong>${totalQuestions}</strong> total questions available
  `;
  
  startBtn.disabled = false;
}

function clearSelection() {
  state.selectedQuizzes.clear();
  document.querySelectorAll(".quiz-checkbox").forEach(cb => {
    cb.checked = false;
  });
  document.querySelectorAll(".quiz-selector").forEach(card => {
    card.classList.remove("selected");
  });
  updateSelectedSummary();
}

async function startCustomQuiz() {
  if (state.selectedQuizzes.size === 0) {
    alert("Please select at least one quiz.");
    return;
  }
  
  const mode = document.getElementById("difficulty-mode").value;
  const limit = document.getElementById("question-limit").value;
  
  // Load all selected quizzes and combine questions
  const allQuestions = [];
  const quizTitles = [];
  
  for (const quizId of state.selectedQuizzes) {
    try {
      const res = await fetch(`quizzes/${quizId}.json`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      
      quizTitles.push(data.title || quizId);
      
      if (data.pools && typeof data.pools === 'object') {
        if (mode === 'mix') {
          // Combine all pools
          Object.values(data.pools).forEach(pool => {
            if (Array.isArray(pool)) allQuestions.push(...pool);
          });
        } else if (data.pools[mode]) {
          // Use specific difficulty
          allQuestions.push(...data.pools[mode]);
        }
      } else if (Array.isArray(data.questions)) {
        allQuestions.push(...data.questions);
      }
    } catch (e) {
      console.warn(`Failed to load ${quizId}:`, e);
    }
  }
  
  if (allQuestions.length === 0) {
    alert("No questions found for the selected difficulty mode. Try 'Mix All Difficulties'.");
    return;
  }
  
  // Save custom quiz to localStorage
  const customQuiz = {
    id: "custom-quiz",
    title: `Custom: ${quizTitles.slice(0, 3).join(", ")}${quizTitles.length > 3 ? ` +${quizTitles.length - 3} more` : ''}`,
    pools: {
      [mode]: allQuestions
    }
  };
  
  localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(customQuiz));
  
  // Redirect to quiz page
  const url = new URL("quiz.html", window.location.origin);
  url.searchParams.set("id", "custom-quiz");
  url.searchParams.set("mode", mode);
  if (limit) url.searchParams.set("limit", limit);
  
  window.location.href = url.toString();
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
