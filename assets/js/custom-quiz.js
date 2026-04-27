// assets/js/custom-quiz.js
// Custom quiz builder - combine questions from multiple quizzes

const THEME_KEY = "pharmlet.theme";
const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const quizCatalog = window.PharmletQuizCatalog;

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
  const quizList = document.getElementById("quiz-list");
  quizList.innerHTML = "";
  state.availableQuizzes = [];

  const builderEntries = quizCatalog?.listCustomBuilderEntries?.() || [];
  if (!builderEntries.length) {
    quizList.innerHTML = '<div class="text-center py-8" style="color:var(--muted)">Quiz catalog unavailable.</div>';
    return;
  }

  for (const entry of builderEntries) {
    try {
      const data = await (async () => {
        const res = await fetch(entry.sourcePath, { cache: "no-store" });
        if (!res.ok) return null;
        return res.json();
      })();
      if (!data) continue;
      
      const quizInfo = {
        id: entry.id,
        title: data.title || entry.title || entry.id,
        pools: data.pools || {},
        questionCount: calculateQuestionCount(data),
        sourcePath: entry.sourcePath
      };
      
      state.availableQuizzes.push(quizInfo);
      renderQuizCard(quizInfo);
    } catch (e) {
      console.warn(`Failed to load ${entry.id}:`, e);
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
    const selectedQuiz = state.availableQuizzes.find((quiz) => quiz.id === quizId);
    const sourcePath = selectedQuiz?.sourcePath || `quizzes/${quizId}.json`;

    try {
      const res = await fetch(sourcePath, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      
      quizTitles.push(data.title || quizId);
      
      if (data.pools && typeof data.pools === 'object') {
        if (mode === 'mix') {
          // Combine all pools
          Object.values(data.pools).forEach(pool => {
            if (Array.isArray(pool)) {
              allQuestions.push(...pool.map(item => ({
                ...item,
                sourceQuizId: quizId,
                sourceTitle: data.title || quizId
              })));
            }
          });
        } else if (data.pools[mode]) {
          // Use specific difficulty
          allQuestions.push(...data.pools[mode].map(item => ({
            ...item,
            sourceQuizId: quizId,
            sourceTitle: data.title || quizId
          })));
        }
      } else if (Array.isArray(data.questions)) {
        allQuestions.push(...data.questions.map(item => ({
          ...item,
          sourceQuizId: quizId,
          sourceTitle: data.title || quizId
        })));
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
