// assets/js/stats.js
// Performance dashboard for tracking quiz history and progress

const THEME_KEY = "quiz-theme";
const HISTORY_KEY = "pharmlet.history";

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

  loadStats();
  
  document.getElementById("clear-stats")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all your quiz statistics? This cannot be undone.")) {
      localStorage.removeItem(HISTORY_KEY);
      location.reload();
    }
  });
});

function loadStats() {
  const history = getHistory();
  
  if (history.length === 0) {
    return; // Show default empty state
  }

  // Calculate overview stats
  const totalQuestions = history.reduce((sum, h) => sum + h.total, 0);
  const avgScore = history.length > 0 
    ? (history.reduce((sum, h) => sum + (h.score / h.total), 0) / history.length * 100).toFixed(1)
    : 0;
  const bestStreak = Math.max(0, ...history.map(h => h.bestStreak || 0));
  const studyDays = new Set(history.map(h => new Date(h.timestamp).toDateString())).size;

  document.getElementById("total-questions").textContent = totalQuestions;
  document.getElementById("avg-score").textContent = `${avgScore}%`;
  document.getElementById("best-streak").textContent = bestStreak;
  document.getElementById("study-days").textContent = studyDays;

  // Performance by quiz
  const quizMap = new Map();
  history.forEach(h => {
    const key = `${h.quizId}-${h.mode}`;
    if (!quizMap.has(key)) {
      quizMap.set(key, { quizId: h.quizId, mode: h.mode, title: h.title, attempts: [], scores: [] });
    }
    const quiz = quizMap.get(key);
    quiz.attempts.push(h);
    quiz.scores.push((h.score / h.total) * 100);
  });

  const quizStatsEl = document.getElementById("quiz-stats");
  if (quizMap.size > 0) {
    quizStatsEl.innerHTML = "";
    Array.from(quizMap.values())
      .sort((a, b) => b.attempts.length - a.attempts.length)
      .forEach(quiz => {
        const avgQuizScore = (quiz.scores.reduce((a, b) => a + b, 0) / quiz.scores.length).toFixed(1);
        const bestScore = Math.max(...quiz.scores).toFixed(1);
        
        const div = document.createElement("div");
        div.className = "flex justify-between items-center p-3 rounded-lg";
        div.style.background = "var(--accent-light, rgba(139,30,63,0.1))";
        div.innerHTML = `
          <div>
            <div class="font-semibold">${sanitize(quiz.title || quiz.quizId)}</div>
            <div class="text-sm" style="color:var(--muted)">Mode: ${sanitize(quiz.mode)} · ${quiz.attempts.length} attempt${quiz.attempts.length === 1 ? '' : 's'}</div>
          </div>
          <div class="text-right">
            <div class="font-semibold" style="color:var(--accent)">${avgQuizScore}%</div>
            <div class="text-sm" style="color:var(--muted)">Best: ${bestScore}%</div>
          </div>
        `;
        quizStatsEl.appendChild(div);
      });
  }

  // Recent activity
  const recentActivityEl = document.getElementById("recent-activity");
  const recentHistory = history.slice(-10).reverse();
  if (recentHistory.length > 0) {
    recentActivityEl.innerHTML = "";
    recentHistory.forEach(h => {
      const date = new Date(h.timestamp);
      const timeAgo = getTimeAgo(date);
      const scorePercent = ((h.score / h.total) * 100).toFixed(0);
      
      const div = document.createElement("div");
      div.className = "flex justify-between items-center";
      div.innerHTML = `
        <div>
          <span class="font-semibold">${sanitize(h.title || h.quizId)}</span>
          <span class="text-sm" style="color:var(--muted)"> · ${sanitize(h.mode)}</span>
        </div>
        <div class="text-sm" style="color:var(--muted)">
          ${h.score}/${h.total} (${scorePercent}%) · ${timeAgo}
        </div>
      `;
      recentActivityEl.appendChild(div);
    });
  }

  // Category breakdown
  const categoryMap = new Map();
  history.forEach(h => {
    const category = getCategoryFromQuizId(h.quizId);
    if (!categoryMap.has(category)) {
      categoryMap.set(category, { scores: [], total: 0, correct: 0 });
    }
    const cat = categoryMap.get(category);
    cat.scores.push((h.score / h.total) * 100);
    cat.total += h.total;
    cat.correct += h.score;
  });

  const categoryStatsEl = document.getElementById("category-stats");
  if (categoryMap.size > 0) {
    categoryStatsEl.innerHTML = "";
    Array.from(categoryMap.entries()).forEach(([category, data]) => {
      const avgScore = (data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1);
      const overallPercent = ((data.correct / data.total) * 100).toFixed(1);
      
      const div = document.createElement("div");
      div.className = "stat-card";
      div.innerHTML = `
        <div class="stat-label">${sanitize(category)}</div>
        <div class="stat-value">${avgScore}%</div>
        <div class="text-sm mt-2" style="color:var(--muted)">
          ${data.correct}/${data.total} questions correct
        </div>
      `;
      categoryStatsEl.appendChild(div);
    });
  }
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getCategoryFromQuizId(quizId) {
  if (quizId.startsWith("chapter")) return "Chapter Reviews";
  if (quizId.startsWith("practice-")) return "Exam Practice";
  if (quizId.startsWith("lab-quiz")) return "Lab Quizzes";
  if (quizId.startsWith("cumulative")) return "Cumulative";
  if (quizId.startsWith("popp")) return "POPP";
  if (quizId.startsWith("basis")) return "Basis";
  if (quizId.startsWith("ceutics")) return "Pharmaceutics";
  if (quizId.includes("top-drugs")) return "Final Review";
  if (quizId.includes("latin") || quizId.includes("sig")) return "Fun Modes";
  return "Other";
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
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

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
