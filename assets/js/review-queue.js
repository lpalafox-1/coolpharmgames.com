// assets/js/review-queue.js
// Smart review queue for wrong answers

const THEME_KEY = "quiz-theme";
const REVIEW_KEY = "pharmlet.review-queue";

const QUIZ_TITLES = {
  "chapter1-review": "Chapter 1 Review",
  "chapter2-review": "Chapter 2 Review",
  "chapter3-review": "Chapter 3 Review",
  "chapter4-review": "Chapter 4 Review",
  "chapter5-review": "Chapter 5 Review",
  "practice-e1-exam1-prep-ch1-4": "Practice E1",
  "practice-e2a-exam2-prep-ch1-5": "Practice E2A",
  "lab-quiz1-antihypertensives": "Lab Quiz 1",
  "lab-quiz2-antihypertensives": "Lab Quiz 2",
  "lab-quiz3-antilipemics": "Lab Quiz 3",
  "lab-quiz4-anticoagulants": "Lab Quiz 4",
  "lab-quiz5-antiarrhythmics": "Lab Quiz 5",
  "cumulative-quiz1-2": "Cumulative 1–2",
  "cumulative-quiz1-3": "Cumulative 1–3",
  "cumulative-quiz1-4": "Cumulative 1–4",
  "cumulative-quiz1-5": "Cumulative 1–5",
  "top-drugs-final-mockA": "Final Mock A",
  "top-drugs-final-mockB": "Final Mock B",
  "top-drugs-final-mockC": "Final Mock C",
  "top-drugs-final-mockD": "Final Mock D",
  "top-drugs-final-mockE": "Final Mock E"
};

document.addEventListener("DOMContentLoaded", () => {
  // Theme toggle
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

  loadReviewQueue();
  
  document.getElementById("start-review-quiz")?.addEventListener("click", () => startReviewQuiz(20));
  document.getElementById("start-full-review")?.addEventListener("click", () => startReviewQuiz(null));
  document.getElementById("filter-quiz")?.addEventListener("change", loadReviewQueue);
  document.getElementById("clear-queue")?.addEventListener("click", clearQueue);
});

function loadReviewQueue() {
  const queue = getReviewQueue();
  const filterQuizId = document.getElementById("filter-quiz")?.value || "";
  
  if (queue.length === 0) {
    document.getElementById("total-review").textContent = "0";
    document.getElementById("unique-quizzes").textContent = "0";
    document.getElementById("week-added").textContent = "0";
    document.getElementById("avg-age").textContent = "0d";
    document.getElementById("review-list").innerHTML = `
      <div class="text-center py-12" style="color:var(--muted)">
        <p class="text-lg">No questions to review yet!</p>
        <p class="mt-2">Wrong answers from quizzes will appear here for targeted practice.</p>
        <a href="index.html" class="btn btn-blue mt-4 inline-block">Start a Quiz</a>
      </div>
    `;
    return;
  }

  // Calculate stats
  const uniqueQuizzes = new Set(queue.map(q => q.quizId)).size;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAdded = queue.filter(q => new Date(q.timestamp) >= weekAgo).length;
  
  const avgAgeMs = queue.reduce((sum, q) => sum + (Date.now() - new Date(q.timestamp)), 0) / queue.length;
  const avgAgeDays = Math.floor(avgAgeMs / (1000 * 60 * 60 * 24));

  document.getElementById("total-review").textContent = queue.length;
  document.getElementById("unique-quizzes").textContent = uniqueQuizzes;
  document.getElementById("week-added").textContent = weekAdded;
  document.getElementById("avg-age").textContent = avgAgeDays + "d";

  // Group by quiz
  const byQuiz = {};
  queue.forEach(q => {
    if (!byQuiz[q.quizId]) {
      byQuiz[q.quizId] = [];
    }
    byQuiz[q.quizId].push(q);
  });

  // Populate filter dropdown
  const filterSelect = document.getElementById("filter-quiz");
  if (filterSelect && filterSelect.options.length === 1) {
    Object.keys(byQuiz).forEach(quizId => {
      const option = document.createElement("option");
      option.value = quizId;
      option.textContent = QUIZ_TITLES[quizId] || quizId;
      filterSelect.appendChild(option);
    });
  }

  // Filter
  const filtered = filterQuizId ? byQuiz[filterQuizId] || [] : queue;

  // Display
  const container = document.getElementById("review-list");
  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center py-8" style="color:var(--muted)">No questions match this filter.</div>`;
    return;
  }

  // Group filtered by quiz
  const filteredByQuiz = {};
  filtered.forEach(q => {
    if (!filteredByQuiz[q.quizId]) {
      filteredByQuiz[q.quizId] = [];
    }
    filteredByQuiz[q.quizId].push(q);
  });

  Object.entries(filteredByQuiz).forEach(([quizId, questions]) => {
    const section = document.createElement("div");
    section.className = "card p-4";
    
    const title = QUIZ_TITLES[quizId] || quizId;
    section.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <h4 class="font-semibold text-lg">${sanitize(title)}</h4>
        <span class="text-sm" style="color:var(--muted)">${questions.length} question${questions.length === 1 ? '' : 's'}</span>
      </div>
      <div class="space-y-2" id="questions-${quizId}"></div>
    `;
    
    const questionsContainer = section.querySelector(`#questions-${quizId}`);
    questions.slice(0, 5).forEach((q, idx) => {
      const div = document.createElement("div");
      div.className = "text-sm p-2 rounded" ;
      div.style.background = "var(--accent-light, rgba(139,30,63,0.05))";
      
      const promptPreview = q.prompt.length > 80 ? q.prompt.substring(0, 80) + "..." : q.prompt;
      const timeAgo = getTimeAgo(new Date(q.timestamp));
      
      div.innerHTML = `
        <div class="font-medium">${sanitize(promptPreview)}</div>
        <div class="mt-1" style="color:var(--muted)">${timeAgo}</div>
      `;
      questionsContainer.appendChild(div);
    });

    if (questions.length > 5) {
      const more = document.createElement("div");
      more.className = "text-sm text-center pt-2";
      more.style.color = "var(--muted)";
      more.textContent = `+ ${questions.length - 5} more`;
      questionsContainer.appendChild(more);
    }

    container.appendChild(section);
  });
}

function getReviewQueue() {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_KEY) || "[]");
  } catch {
    return [];
  }
}

function startReviewQuiz(limit) {
  const queue = getReviewQueue();
  const filterQuizId = document.getElementById("filter-quiz")?.value || "";
  
  let questions = filterQuizId ? queue.filter(q => q.quizId === filterQuizId) : queue;
  
  if (questions.length === 0) {
    alert("No questions available for review.");
    return;
  }

  // Shuffle and limit
  questions = shuffleArray([...questions]);
  if (limit && questions.length > limit) {
    questions = questions.slice(0, limit);
  }

  // Create a custom quiz
  const customQuiz = {
    id: "review-quiz",
    title: "Review Quiz — Missed Questions",
    pools: {
      easy: questions.map(q => ({
        type: q.type,
        prompt: q.prompt,
        choices: q.choices,
        answer: q.answer,
        answerText: q.answer,
        answerIndex: q.answer,
        hint: "Review your previous answer carefully.",
        solution: `You previously answered: ${q.userAnswer}`
      }))
    }
  };

  localStorage.setItem("pharmlet.custom-quiz", JSON.stringify(customQuiz));
  window.location.href = `quiz.html?id=review-quiz&mode=easy&limit=${limit || ''}`;
}

function clearQueue() {
  if (confirm("Clear all review questions? This cannot be undone.")) {
    localStorage.removeItem(REVIEW_KEY);
    loadReviewQueue();
  }
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = {
    day: 86400,
    hour: 3600,
    minute: 60
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
