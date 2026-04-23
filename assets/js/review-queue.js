// assets/js/review-queue.js
// Smart review queue for wrong answers

const THEME_KEY = "pharmlet.theme";
const REVIEW_KEY = "pharmlet.review-queue";
const reviewQueueStore = window.PharmletReviewQueueStore;

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
  "top-drugs-final-mockE": "Final Mock E",
  "log-lab-final-2": "Top Drugs Final Lab 2",
  "bdt-unit10-quiz8": "Basis II Quiz 8 — Endocrine System",
  "bdt-unit10-exam4": "Basis II Exam 4 — Endocrine Draft",
  "bdt-unit10-exam4-high-yield": "Basis II Exam 4 — High-Yield Draft"
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
  const activeQueue = reviewQueueStore ? reviewQueueStore.getActiveEntries(queue) : queue;
  const filterQuizId = document.getElementById("filter-quiz")?.value || "";

  populateQuizFilter(queue, filterQuizId);

  if (activeQueue.length === 0) {
    const masteredCount = Math.max(0, queue.length);
    document.getElementById("total-review").textContent = "0";
    document.getElementById("unique-quizzes").textContent = "0";
    document.getElementById("week-added").textContent = "0";
    document.getElementById("avg-age").textContent = "0d";
    document.getElementById("review-list").innerHTML = `
      <div class="text-center py-12" style="color:var(--muted)">
        <p class="text-lg">${masteredCount > 0 ? "Review queue is clear." : "No questions to review yet!"}</p>
        <p class="mt-2">${masteredCount > 0 ? `You have ${masteredCount} mastered review card${masteredCount === 1 ? "" : "s"} resting in the archive.` : "Wrong answers from quizzes will appear here for targeted practice."}</p>
        <a href="index.html" class="btn btn-blue mt-4 inline-block">Start a Quiz</a>
      </div>
    `;
    return;
  }

  // Calculate stats
  const uniqueQuizzes = new Set(activeQueue.map(q => q.quizId)).size;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAdded = activeQueue.filter((q) => new Date(q.lastMissedAt || q.createdAt || Date.now()) >= weekAgo).length;

  const avgAgeMs = activeQueue.reduce((sum, q) => {
    const timestamp = new Date(q.lastMissedAt || q.createdAt || Date.now()).getTime();
    return sum + Math.max(0, Date.now() - timestamp);
  }, 0) / activeQueue.length;
  const avgAgeDays = Math.floor(avgAgeMs / (1000 * 60 * 60 * 24));

  document.getElementById("total-review").textContent = activeQueue.length;
  document.getElementById("unique-quizzes").textContent = uniqueQuizzes;
  document.getElementById("week-added").textContent = weekAdded;
  document.getElementById("avg-age").textContent = avgAgeDays + "d";

  // Filter
  const filtered = filterQuizId ? activeQueue.filter((q) => q.quizId === filterQuizId) : activeQueue;

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
    
    const title = reviewQueueStore ? reviewQueueStore.getDisplayTitle(questions[0], QUIZ_TITLES) : (QUIZ_TITLES[quizId] || quizId);
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
      
      const promptText = reviewQueueStore ? reviewQueueStore.toPlainText(q.prompt) : q.prompt;
      const promptPreview = promptText.length > 90 ? promptText.substring(0, 90) + "..." : promptText;
      const timeAgo = getTimeAgo(new Date(q.lastMissedAt || q.createdAt || Date.now()));
      const mastery = reviewQueueStore ? reviewQueueStore.getMasterySummary(q) : { label: "Fresh miss" };
      const commonWrong = reviewQueueStore ? reviewQueueStore.getCommonWrongAnswer(q) : "";
      const missCount = reviewQueueStore ? reviewQueueStore.getEntryMissCount(q) : 1;
      
      div.innerHTML = `
        <div class="font-medium">${sanitize(promptPreview)}</div>
        <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1" style="color:var(--muted)">
          <span>${timeAgo}</span>
          <span>${missCount} miss${missCount === 1 ? "" : "es"}</span>
          <span>${sanitize(mastery.label)}</span>
          ${commonWrong ? `<span>Tempting wrong answer: ${sanitize(commonWrong)}</span>` : ""}
        </div>
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
    const parsed = JSON.parse(localStorage.getItem(REVIEW_KEY) || "[]");
    return reviewQueueStore ? reviewQueueStore.normalizeQueue(parsed) : parsed;
  } catch {
    return [];
  }
}

function startReviewQuiz(limit) {
  const queue = getReviewQueue();
  const filterQuizId = document.getElementById("filter-quiz")?.value || "";

  let questions = reviewQueueStore ? reviewQueueStore.getActiveEntries(queue) : queue;
  if (filterQuizId) {
    questions = questions.filter((q) => q.quizId === filterQuizId);
  }
  
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
    title: filterQuizId && questions[0]
      ? `Review Quiz — ${reviewQueueStore ? reviewQueueStore.getDisplayTitle(questions[0], QUIZ_TITLES) : (QUIZ_TITLES[filterQuizId] || filterQuizId)}`
      : "Review Quiz — Missed Questions",
    pools: {
      easy: questions.map(q => ({
        type: q.type,
        prompt: q.prompt,
        choices: q.choices,
        answer: q.answer,
        answerText: q.answerText ?? q.answer,
        sourceQuizId: q.quizId || q.sourceQuizId || "",
        sourceTitle: reviewQueueStore ? reviewQueueStore.getDisplayTitle(q, QUIZ_TITLES) : (QUIZ_TITLES[q.quizId] || q.title || q.quizId || "Review Queue"),
        hint: reviewQueueStore
          ? `Mastery progress: ${reviewQueueStore.getMasterySummary(q).label}.`
          : "Review your previous answer carefully.",
        solution: buildReviewSolutionText(q)
      }))
    }
  };

  localStorage.setItem("pharmlet.custom-quiz", JSON.stringify(customQuiz));
  window.location.href = `quiz.html?id=review-quiz&mode=easy&limit=${limit || ''}`;
}

function populateQuizFilter(queue, selectedValue) {
  const filterSelect = document.getElementById("filter-quiz");
  if (!filterSelect) return;

  const options = [`<option value="">All Topics</option>`];
  const quizMap = new Map();

  queue.forEach((entry) => {
    if (!entry?.quizId || quizMap.has(entry.quizId)) return;
    const label = reviewQueueStore ? reviewQueueStore.getDisplayTitle(entry, QUIZ_TITLES) : (QUIZ_TITLES[entry.quizId] || entry.quizId);
    quizMap.set(entry.quizId, label);
  });

  Array.from(quizMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([quizId, label]) => {
      options.push(`<option value="${sanitize(quizId)}">${sanitize(label)}</option>`);
    });

  filterSelect.innerHTML = options.join("");
  filterSelect.value = selectedValue && quizMap.has(selectedValue) ? selectedValue : "";
}

function buildReviewSolutionText(entry) {
  const parts = [];
  const temptingWrong = reviewQueueStore ? reviewQueueStore.getCommonWrongAnswer(entry) : "";
  const lastWrong = entry.lastUserAnswer || "";
  const missCount = reviewQueueStore ? reviewQueueStore.getEntryMissCount(entry) : 1;

  if (temptingWrong) {
    parts.push(`Most tempting wrong answer: ${temptingWrong}`);
  } else if (lastWrong) {
    parts.push(`Last wrong answer: ${lastWrong}`);
  }

  parts.push(`Missed ${missCount} time${missCount === 1 ? "" : "s"}`);
  return parts.join(" • ");
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
