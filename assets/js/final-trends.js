const THEME_KEY = "pharmlet.theme";
const HISTORY_KEY = "pharmlet.history";
const TOP_DRUGS_SIGNALS_KEY = "pharmlet.topDrugs.signals";
const FINAL_EXAM_ID = "log-lab-final-2";
const FINAL_EXAM_TOTAL = 110;

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderFinalTrends();
});

function initTheme() {
  const toggle = document.getElementById("theme-toggle");
  const label = document.getElementById("theme-label");
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const start = saved || (prefersDark ? "dark" : "light");

  document.documentElement.classList.toggle("dark", start === "dark");
  if (label) label.textContent = start === "dark" ? "Light" : "Dark";

  toggle?.addEventListener("click", () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(THEME_KEY, next);
    if (label) label.textContent = next === "dark" ? "Light" : "Dark";
  });
}

function renderFinalTrends() {
  const attempts = getFinalAttempts();
  renderSummary(attempts);
  renderTrendChart(attempts);
  renderRecentAttempts(attempts);
  renderSignalSnapshot();
}

function getFinalAttempts() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    return history
      .filter((entry) => entry?.quizId === FINAL_EXAM_ID && Number(entry?.total) === FINAL_EXAM_TOTAL)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  } catch {
    return [];
  }
}

function getLetterGrade(score, total) {
  if (!total) return "—";
  if (score >= Math.ceil(total * 0.9)) return "A";
  if (score >= Math.ceil(total * 0.8)) return "B";
  if (score >= Math.ceil(total * 0.7)) return "C";
  if (score >= Math.ceil(total * 0.6)) return "D";
  return "F";
}

function renderSummary(attempts) {
  const totalAttempts = attempts.length;
  const bestAttempt = attempts.reduce((best, attempt) => {
    if (!best) return attempt;
    return (attempt.score / attempt.total) > (best.score / best.total) ? attempt : best;
  }, null);
  const average = totalAttempts
    ? (attempts.reduce((sum, attempt) => sum + (attempt.score / attempt.total), 0) / totalAttempts) * 100
    : 0;
  const latest = totalAttempts ? attempts[attempts.length - 1] : null;
  const latestGrade = latest ? (latest.letterGrade || getLetterGrade(latest.score, latest.total)) : "—";

  document.getElementById("total-attempts").textContent = String(totalAttempts);
  document.getElementById("avg-score").textContent = `${average.toFixed(1)}%`;
  document.getElementById("best-score").textContent = bestAttempt ? `${bestAttempt.score}/${bestAttempt.total}` : "0/110";
  document.getElementById("latest-grade").textContent = latestGrade;
}

function renderTrendChart(attempts) {
  const container = document.getElementById("trend-chart");
  if (!container) return;

  if (!attempts.length) {
    container.innerHTML = `<p class="text-sm opacity-70">No final attempts recorded yet.</p>`;
    return;
  }

  container.innerHTML = attempts.map((attempt, index) => {
    const percent = Math.round((attempt.score / attempt.total) * 100);
    const previous = index > 0 ? attempts[index - 1] : null;
    const delta = previous ? percent - Math.round((previous.score / previous.total) * 100) : null;
    const deltaText = delta === null
      ? "First recorded attempt"
      : `${delta > 0 ? "+" : ""}${delta}% vs previous`;
    const grade = attempt.letterGrade || getLetterGrade(attempt.score, attempt.total);

    return `
      <div class="rounded-2xl border border-[var(--ring)] p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Attempt ${index + 1}</div>
            <div class="mt-1 font-semibold">${formatDate(attempt.timestamp)}</div>
            <div class="mt-1 text-sm opacity-70">${attempt.examMode ? "True Exam Mode" : "Practice Final"} • Grade ${grade}</div>
          </div>
          <div class="text-left sm:text-right">
            <div class="text-2xl font-black text-[var(--accent)]">${attempt.score}/${attempt.total}</div>
            <div class="text-sm opacity-70">${percent}% • ${deltaText}</div>
          </div>
        </div>
        <div class="mt-4 h-3 rounded-full bg-[var(--ring)] overflow-hidden">
          <div class="h-full rounded-full bg-[var(--accent)]" style="width:${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRecentAttempts(attempts) {
  const container = document.getElementById("recent-attempts");
  if (!container) return;

  if (!attempts.length) {
    container.innerHTML = `<p class="text-sm opacity-70">No recent attempts yet.</p>`;
    return;
  }

  const recent = [...attempts].reverse().slice(0, 8);
  container.innerHTML = recent.map((attempt) => {
    const percent = Math.round((attempt.score / attempt.total) * 100);
    const grade = attempt.letterGrade || getLetterGrade(attempt.score, attempt.total);

    return `
      <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold">${formatDate(attempt.timestamp)}</div>
            <div class="mt-1 text-sm opacity-70">${attempt.examMode ? "True Exam Mode" : "Practice Final"} • Hints used: ${Number(attempt.hintsUsed || 0)}</div>
          </div>
          <div class="text-right">
            <div class="text-xl font-black text-[var(--accent)]">${grade}</div>
            <div class="text-sm opacity-70">${attempt.score}/${attempt.total} • ${percent}%</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderSignalSnapshot() {
  const signals = loadSignals();
  renderSignalList(
    "weak-categories",
    getSignalLeaders(signals.seenCategories, signals.missedCategories),
    "Adaptive category data will show up after a few attempts."
  );
  renderSignalList(
    "weak-brands",
    getSignalLeaders(signals.seenBrands, signals.missedBrands),
    "Adaptive brand data will show up after a few attempts."
  );
  renderSignalList(
    "weak-drugs",
    getSignalLeaders(signals.seenDrugs, signals.missedDrugs),
    "Adaptive drug data will show up after a few attempts."
  );
}

function loadSignals() {
  try {
    const raw = localStorage.getItem(TOP_DRUGS_SIGNALS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getSignalLeaders(seenCounter = {}, missedCounter = {}, limit = 5) {
  return Object.entries(seenCounter)
    .map(([label, seen]) => {
      const misses = Number(missedCounter?.[label] || 0);
      const missRate = seen ? Math.round((misses / seen) * 100) : 0;
      return { label, seen: Number(seen) || 0, misses, missRate };
    })
    .filter((entry) => entry.seen > 0 && entry.misses > 0)
    .sort((a, b) => b.missRate - a.missRate || b.misses - a.misses || b.seen - a.seen)
    .slice(0, limit);
}

function renderSignalList(containerId, items, emptyMessage) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<p class="text-sm opacity-70">${emptyMessage}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => `
    <div class="rounded-2xl border border-[var(--ring)] px-4 py-3">
      <div class="flex items-start justify-between gap-3">
        <div class="font-semibold">${escapeHtml(toDisplayTitle(item.label))}</div>
        <div class="text-right">
          <div class="font-black text-[var(--accent)]">${item.missRate}%</div>
          <div class="text-xs opacity-60">${item.misses}/${item.seen}</div>
        </div>
      </div>
    </div>
  `).join("");
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toDisplayTitle(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
