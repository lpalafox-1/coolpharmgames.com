const THEME_KEY = "pharmlet.theme";
const HISTORY_KEY = "pharmlet.history";
const TOP_DRUGS_SIGNALS_KEY = "pharmlet.topDrugs.signals";
const FINAL_EXAM_ID = "log-lab-final-2";
const FINAL_EXAM_TOTAL = 110;

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await renderDataVersionBadge();
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

async function renderDataVersionBadge() {
  try {
    const result = await window.TopDrugsData?.loadPool?.();
    if (result?.version) {
      window.TopDrugsData.renderVersionBadge("top-drugs-version-badge", result.version);
    }
  } catch (error) {
    console.warn("Unable to render Top Drugs version badge:", error);
  }
}

function renderFinalTrends() {
  const attempts = getFinalAttempts();
  renderSummary(attempts);
  renderTrendChart(attempts);
  renderAttemptCompare(attempts);
  renderRecentAttempts(attempts);
  renderSignalSnapshot();
}

function getFinalAttempts() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    return history
      .filter((entry) => entry?.quizId === FINAL_EXAM_ID && Number(entry?.total) === FINAL_EXAM_TOTAL)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
      .map((entry, index) => ({ ...entry, attemptNumber: index + 1 }));
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
            <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Attempt ${attempt.attemptNumber}</div>
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

function renderAttemptCompare(attempts) {
  const leftSelect = document.getElementById("compare-left");
  const rightSelect = document.getElementById("compare-right");
  const container = document.getElementById("attempt-compare");
  if (!leftSelect || !rightSelect || !container) return;

  if (attempts.length < 2) {
    leftSelect.innerHTML = "";
    rightSelect.innerHTML = "";
    container.innerHTML = `<p class="text-sm opacity-70">Complete at least two finals to unlock side-by-side attempt comparison.</p>`;
    return;
  }

  const optionsMarkup = attempts.map((attempt, index) => `
    <option value="${index}">Attempt ${attempt.attemptNumber} • ${formatDate(attempt.timestamp)} • ${attempt.score}/${attempt.total}</option>
  `).join("");

  leftSelect.innerHTML = optionsMarkup;
  rightSelect.innerHTML = optionsMarkup;

  if (!leftSelect.dataset.initialized) {
    leftSelect.value = String(Math.max(0, attempts.length - 2));
    rightSelect.value = String(attempts.length - 1);
    leftSelect.dataset.initialized = "true";
    rightSelect.dataset.initialized = "true";
  } else {
    leftSelect.value = attempts[leftSelect.value] ? leftSelect.value : String(Math.max(0, attempts.length - 2));
    rightSelect.value = attempts[rightSelect.value] ? rightSelect.value : String(attempts.length - 1);
  }

  const rerender = () => updateAttemptCompare(attempts);
  leftSelect.onchange = rerender;
  rightSelect.onchange = rerender;
  updateAttemptCompare(attempts);
}

function updateAttemptCompare(attempts) {
  const leftSelect = document.getElementById("compare-left");
  const rightSelect = document.getElementById("compare-right");
  const container = document.getElementById("attempt-compare");
  if (!leftSelect || !rightSelect || !container) return;

  const left = attempts[Number(leftSelect.value)];
  const right = attempts[Number(rightSelect.value)];
  if (!left || !right) {
    container.innerHTML = `<p class="text-sm opacity-70">Pick two attempts to compare.</p>`;
    return;
  }

  const leftPercent = Math.round((left.score / left.total) * 100);
  const rightPercent = Math.round((right.score / right.total) * 100);
  const scoreDelta = right.score - left.score;
  const percentDelta = rightPercent - leftPercent;

  container.innerHTML = `
    <div class="rounded-2xl border border-[var(--ring)] bg-[var(--card)] px-4 py-4">
      <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Compare Snapshot</div>
      <div class="mt-2 text-sm opacity-80">
        Score delta: <span class="font-semibold ${scoreDelta >= 0 ? "text-green-600" : "text-red-600"}">${scoreDelta >= 0 ? "+" : ""}${scoreDelta}</span>
        • Percent delta: <span class="font-semibold ${percentDelta >= 0 ? "text-green-600" : "text-red-600"}">${percentDelta >= 0 ? "+" : ""}${percentDelta}%</span>
      </div>
    </div>
    <div class="mt-5 grid gap-4 xl:grid-cols-2">
      ${buildCompareCard(left, "Attempt A")}
      ${buildCompareCard(right, "Attempt B")}
    </div>
  `;
}

function buildCompareCard(attempt, heading) {
  const percent = Math.round((attempt.score / attempt.total) * 100);
  const grade = attempt.letterGrade || getLetterGrade(attempt.score, attempt.total);
  const weakAreas = Array.isArray(attempt?.finalSummary?.weakAreas) ? attempt.finalSummary.weakAreas : [];
  const areas = Array.isArray(attempt?.finalSummary?.areas) ? attempt.finalSummary.areas : [];

  const areaMarkup = areas.length
    ? areas.map((area) => `
        <div class="rounded-xl border border-[var(--ring)] px-3 py-3">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-semibold">${escapeHtml(area.label || area.key || "Area")}</span>
            <span class="font-black text-[var(--accent)]">${Number(area.accuracy || 0)}%</span>
          </div>
          <div class="mt-2 text-xs opacity-70">${Number(area.correct || 0)}/${Number(area.total || 0)} correct</div>
        </div>
      `).join("")
    : `<p class="text-sm opacity-70">Saved area breakdown is not available for this older attempt.</p>`;

  return `
    <article class="rounded-3xl border border-[var(--ring)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">${heading}</div>
          <div class="mt-1 text-xl font-black">${formatDate(attempt.timestamp)}</div>
          <div class="mt-1 text-sm opacity-70">${attempt.examMode ? "True Exam Mode" : "Practice Final"}</div>
        </div>
        <div class="text-right">
          <div class="text-3xl font-black text-[var(--accent)]">${grade}</div>
          <div class="text-sm opacity-70">${attempt.score}/${attempt.total} • ${percent}%</div>
        </div>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="rounded-2xl bg-[var(--ring)]/35 px-4 py-3">
          <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Hints Used</div>
          <div class="mt-1 text-lg font-semibold">${Number(attempt.hintsUsed || 0)}</div>
        </div>
        <div class="rounded-2xl bg-[var(--ring)]/35 px-4 py-3">
          <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Weak Areas</div>
          <div class="mt-1 text-sm font-semibold">${weakAreas.length ? weakAreas.map((area) => area.label || area.key).join(" • ") : (areas.length ? "No weak areas saved" : "Saved breakdown unavailable")}</div>
        </div>
      </div>
      <div class="mt-5">
        <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Area Accuracy</div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          ${areaMarkup}
        </div>
      </div>
    </article>
  `;
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
            <div class="font-semibold">Attempt ${attempt.attemptNumber} • ${formatDate(attempt.timestamp)}</div>
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
  return window.TopDrugsData?.escapeHtml?.(value) || String(value || "");
}
