// assets/js/stats.js
// Performance dashboard for tracking quiz history and progress

const THEME_KEY = "pharmlet.theme";
const HISTORY_KEY = "pharmlet.history";
const REVIEW_KEY = "pharmlet.review-queue";
const TOP_DRUGS_SIGNALS_KEY = "pharmlet.topDrugs.signals";
const FINAL_RECENT_RUNS_KEY = "pharmlet.finalLab2.recentRuns";
const QUESTION_REPORTS_KEY = "pharmlet.question-reports";
const LAST_ROUND_PREFIX = "pharmlet.session.lastRound.";
const PROGRESS_KEY_PREFIX = "pharmlet.";
const PROGRESS_BACKUP_VERSION = 2;

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
    if (confirm("Clear all saved Pharm-let study data on this browser? This removes quiz history, review queue, saved scores, question reports, favorites, custom quiz progress, and adaptive memory. Theme preference stays.")) {
      const result = clearAllStudyData();
      alert(`Cleared ${result.local} local key(s) and ${result.session} session key(s).`);
      location.reload();
    }
  });

  document.getElementById("reset-generator-memory")?.addEventListener("click", () => {
    if (!confirm("Reset adaptive Top Drugs generator memory on this device/browser? This cannot be undone.")) {
      return;
    }

    const result = clearTopDrugsGeneratorMemory();
    alert(`Adaptive generator memory reset. Cleared ${result.local} local key(s) and ${result.session} session key(s).`);
  });

  document.getElementById("export-progress")?.addEventListener("click", exportProgressBackup);
  document.getElementById("import-progress")?.addEventListener("click", importProgressBackup);
  document.getElementById("import-progress-file")?.addEventListener("change", handleProgressBackupFile);
  document.getElementById("export-question-reports")?.addEventListener("click", exportQuestionReports);
  document.getElementById("clear-question-reports")?.addEventListener("click", clearQuestionReports);
});

function isTopDrugsLastRoundKey(key) {
  if (!key || !key.startsWith(LAST_ROUND_PREFIX)) return false;

  const suffix = key.slice(LAST_ROUND_PREFIX.length).toLowerCase();
  return (
    suffix === "pharmlet.log-lab-final-2.easy"
    || /pharmlet\.lab[12]\.week\d+\.easy/.test(suffix)
    || /pharmlet\.lab[12]\.weeks\d+-\d+\.easy/.test(suffix)
    || /pharmlet\.week\d+\.easy/.test(suffix)
    || /pharmlet\.weeks\d+-\d+\.easy/.test(suffix)
  );
}

function clearTopDrugsGeneratorMemory() {
  let clearedLocal = 0;
  let clearedSession = 0;

  for (const key of [TOP_DRUGS_SIGNALS_KEY, FINAL_RECENT_RUNS_KEY]) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      clearedLocal += 1;
    }
  }

  const sessionKeys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) sessionKeys.push(key);
  }

  for (const key of sessionKeys) {
    if (!isTopDrugsLastRoundKey(key)) continue;
    sessionStorage.removeItem(key);
    clearedSession += 1;
  }

  return { local: clearedLocal, session: clearedSession };
}

function clearAllStudyData() {
  let clearedLocal = 0;
  let clearedSession = 0;

  const localKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) localKeys.push(key);
  }

  for (const key of localKeys) {
    if (!key.startsWith(PROGRESS_KEY_PREFIX) || key === THEME_KEY) continue;
    localStorage.removeItem(key);
    clearedLocal += 1;
  }

  const sessionKeys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) sessionKeys.push(key);
  }

  for (const key of sessionKeys) {
    if (!key.startsWith(PROGRESS_KEY_PREFIX)) continue;
    sessionStorage.removeItem(key);
    clearedSession += 1;
  }

  return { local: clearedLocal, session: clearedSession };
}

function setProgressTransferStatus(message, tone = "muted") {
  const el = document.getElementById("progress-transfer-status");
  if (!el) return;

  const colors = {
    muted: "var(--muted)",
    good: "var(--good)",
    bad: "var(--bad)",
    accent: "var(--accent)"
  };

  el.textContent = message;
  el.style.color = colors[tone] || colors.muted;
}

function setQuestionReportStatus(message, tone = "muted") {
  const el = document.getElementById("question-report-status");
  if (!el) return;

  const colors = {
    muted: "var(--muted)",
    good: "var(--good)",
    bad: "var(--bad)",
    accent: "var(--accent)"
  };

  el.textContent = message;
  el.style.color = colors[tone] || colors.muted;
}

function collectProgressBackupData() {
  const collectStorage = (storage) => {
    const data = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(PROGRESS_KEY_PREFIX)) continue;
      data[key] = storage.getItem(key);
    }
    return data;
  };

  const localData = collectStorage(localStorage);
  const sessionData = collectStorage(sessionStorage);

  return {
    app: "pharm-let",
    version: PROGRESS_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    localStorage: localData,
    sessionStorage: sessionData
  };
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportProgressBackup() {
  const payload = collectProgressBackupData();
  const text = JSON.stringify(payload, null, 2);
  const textarea = document.getElementById("progress-transfer-data");
  if (textarea) textarea.value = text;

  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`pharmlet-progress-backup-${stamp}.json`, text);
  setProgressTransferStatus(`Exported ${Object.keys(payload.localStorage).length} local key(s) and ${Object.keys(payload.sessionStorage || {}).length} session key(s).`, "good");
}

function parseProgressBackup(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Backup data is not a valid object.");
  }

  if (!parsed.localStorage || typeof parsed.localStorage !== "object" || Array.isArray(parsed.localStorage)) {
    throw new Error("Backup is missing a valid localStorage payload.");
  }

  const invalidKey = Object.keys(parsed.localStorage).find((key) => !key.startsWith(PROGRESS_KEY_PREFIX));
  if (invalidKey) {
    throw new Error(`Backup contains an unexpected key: ${invalidKey}`);
  }

  if (parsed.sessionStorage !== undefined) {
    if (typeof parsed.sessionStorage !== "object" || parsed.sessionStorage === null || Array.isArray(parsed.sessionStorage)) {
      throw new Error("Backup contains an invalid sessionStorage payload.");
    }

    const invalidSessionKey = Object.keys(parsed.sessionStorage).find((key) => !key.startsWith(PROGRESS_KEY_PREFIX));
    if (invalidSessionKey) {
      throw new Error(`Backup contains an unexpected session key: ${invalidSessionKey}`);
    }
  }

  return parsed;
}

function importProgressBackup() {
  const textarea = document.getElementById("progress-transfer-data");
  const rawText = textarea?.value?.trim();
  if (!rawText) {
    setProgressTransferStatus("Paste a backup JSON block or load a backup file before importing.", "bad");
    return;
  }

  let parsed;
  try {
    parsed = parseProgressBackup(rawText);
  } catch (error) {
    setProgressTransferStatus(error.message, "bad");
    return;
  }

  const localKeys = Object.keys(parsed.localStorage);
  const sessionKeys = Object.keys(parsed.sessionStorage || {});
  if (!confirm(`Import this backup and replace ${PROGRESS_KEY_PREFIX} progress on this browser? (${localKeys.length} local key(s), ${sessionKeys.length} session key(s))`)) {
    return;
  }

  const existingLocalKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PROGRESS_KEY_PREFIX)) existingLocalKeys.push(key);
  }

  const existingSessionKeys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(PROGRESS_KEY_PREFIX)) existingSessionKeys.push(key);
  }

  existingLocalKeys.forEach((key) => localStorage.removeItem(key));
  existingSessionKeys.forEach((key) => sessionStorage.removeItem(key));

  localKeys.forEach((key) => {
    localStorage.setItem(key, parsed.localStorage[key]);
  });
  sessionKeys.forEach((key) => {
    sessionStorage.setItem(key, parsed.sessionStorage[key]);
  });

  setProgressTransferStatus(`Imported ${localKeys.length} local key(s) and ${sessionKeys.length} session key(s). Reloading with restored progress...`, "good");
  setTimeout(() => location.reload(), 700);
}

function handleProgressBackupFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const textarea = document.getElementById("progress-transfer-data");
    if (textarea) textarea.value = text;
    setProgressTransferStatus(`Loaded backup file "${file.name}". Review it below, then import when ready.`, "accent");
  };
  reader.onerror = () => {
    setProgressTransferStatus(`Unable to read "${file.name}".`, "bad");
  };
  reader.readAsText(file);
}

function loadStats() {
  const history = getHistory();
  const reviewQueue = getReviewQueue();
  const questionReports = getQuestionReports();

  renderMostMissedQuestions(reviewQueue);
  renderQuestionReports(questionReports);
  
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

function renderQuestionReports(reports) {
  const container = document.getElementById("question-reports");
  if (!container) return;

  const items = Array.isArray(reports) ? reports.slice(0, 10) : [];
  if (items.length === 0) {
    container.innerHTML = `<p style="color:var(--muted)">No question reports yet. Use "Report This Question" after answering a quiz item to save it here for later cleanup.</p>`;
    return;
  }

  container.innerHTML = "";
  items.forEach((report) => {
    const div = document.createElement("div");
    div.className = "rounded-xl border border-[var(--ring)] p-4";
    div.style.background = "var(--accent-light, rgba(139,30,63,0.06))";

    const prompt = sanitize(report.promptText || toPlainText(report.prompt || ""));
    const correctAnswer = sanitize(toPlainText(report.correctAnswer || "—"));
    const userAnswer = sanitize(toPlainText(report.userAnswer || "—"));
    const note = sanitize(toPlainText(report.note || ""));
    const metaParts = [
      report.title || report.quizId || "",
      report.mode || "",
      report.questionFamily || "",
      report.drugGeneric ? `Drug: ${report.drugGeneric}` : ""
    ].filter(Boolean).map((part) => sanitize(part));
    const when = report.timestamp ? getTimeAgo(new Date(report.timestamp)) : "saved just now";

    div.innerHTML = `
      <div class="space-y-2">
        <div class="font-semibold">${prompt || "Untitled question report"}</div>
        <div class="text-sm" style="color:var(--muted)">Expected answer: <span class="font-medium" style="color:var(--text)">${correctAnswer}</span></div>
        <div class="text-sm" style="color:var(--muted)">Your answer: <span class="font-medium" style="color:var(--bad)">${userAnswer}</span></div>
        ${note ? `<div class="text-sm" style="color:var(--muted)">Note: <span class="font-medium" style="color:var(--text)">${note}</span></div>` : ""}
        <div class="text-xs" style="color:var(--muted)">${metaParts.join(" · ")}${metaParts.length ? " · " : ""}${sanitize(when)}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderMostMissedQuestions(reviewQueue) {
  const container = document.getElementById("missed-stats");
  if (!container) return;

  const missedItems = getMostMissedQuestions(reviewQueue).slice(0, 5);

  if (missedItems.length === 0) {
    container.innerHTML = `<p style="color:var(--muted)">No missed-question data yet. Wrong answers will appear here with the correct answer and your most common wrong pick.</p>`;
    return;
  }

  container.innerHTML = "";
  missedItems.forEach(item => {
    const div = document.createElement("div");
    div.className = "rounded-xl border border-[var(--ring)] p-4";
    div.style.background = "var(--accent-light, rgba(139,30,63,0.06))";
    div.innerHTML = `
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-1">
          <div class="font-semibold">${sanitize(toPlainText(item.prompt))}</div>
          <div class="text-sm" style="color:var(--muted)">
            Correct answer: <span class="font-medium" style="color:var(--text)">${sanitize(toPlainText(item.answer))}</span>
          </div>
          <div class="text-sm" style="color:var(--muted)">
            Most common wrong answer: <span class="font-medium" style="color:var(--bad)">${sanitize(item.commonWrong || "—")}</span>
          </div>
        </div>
        <div class="text-sm lg:text-right" style="color:var(--muted)">
          <div>${item.misses} miss${item.misses === 1 ? "" : "es"}</div>
          <div>${item.quizCount} quiz${item.quizCount === 1 ? "" : "zes"}</div>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function getMostMissedQuestions(reviewQueue) {
  const groups = new Map();

  reviewQueue.forEach(entry => {
    const prompt = toPlainText(entry.prompt || "");
    const answer = toPlainText(entry.answer || entry.answerText || "");
    if (!prompt || !answer) return;

    const key = `${normalizeText(prompt)}||${normalizeText(answer)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        prompt,
        answer,
        misses: 0,
        wrongCounts: new Map(),
        latest: 0,
        quizIds: new Set()
      });
    }

    const group = groups.get(key);
    group.misses++;

    const wrongAnswer = toPlainText(entry.userAnswer || entry.user || entry.selected || "");
    if (wrongAnswer) {
      group.wrongCounts.set(wrongAnswer, (group.wrongCounts.get(wrongAnswer) || 0) + 1);
    }

    const timestamp = new Date(entry.timestamp).getTime();
    if (!Number.isNaN(timestamp)) {
      group.latest = Math.max(group.latest, timestamp);
    }

    if (entry.quizId) {
      group.quizIds.add(entry.quizId);
    }
  });

  return Array.from(groups.values())
    .map(group => {
      const commonWrong = Array.from(group.wrongCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "";

      return {
        prompt: group.prompt,
        answer: group.answer,
        misses: group.misses,
        commonWrong,
        quizCount: group.quizIds.size,
        latest: group.latest
      };
    })
    .sort((a, b) => b.misses - a.misses || b.latest - a.latest);
}

function getReviewQueue() {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getQuestionReports() {
  try {
    const raw = localStorage.getItem(QUESTION_REPORTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      : [];
  } catch {
    return [];
  }
}

function toPlainText(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value ?? "");
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return toPlainText(value).toLowerCase();
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
  if (quizId.startsWith("week") || quizId.startsWith("weeks")) return "Top Drugs";
  if (quizId.startsWith("cumulative")) return "Cumulative";
  if (quizId.startsWith("popp")) return "POPP";
  if (quizId.startsWith("basis")) return "Basis";
  if (quizId.startsWith("ceutics")) return "Pharmaceutics";
  if (quizId.includes("final") || quizId.includes("top-drugs")) return "Final Review";
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

function exportQuestionReports() {
  const reports = getQuestionReports();
  const payload = {
    app: "pharm-let",
    version: 1,
    exportedAt: new Date().toISOString(),
    reports
  };

  const text = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`pharmlet-question-reports-${stamp}.json`, text);
  setQuestionReportStatus(`Exported ${reports.length} question report(s).`, reports.length ? "good" : "accent");
}

function clearQuestionReports() {
  const reports = getQuestionReports();
  if (!reports.length) {
    setQuestionReportStatus("No saved question reports to clear.", "accent");
    return;
  }

  if (!confirm(`Clear ${reports.length} saved question report(s) from this browser? This cannot be undone.`)) {
    return;
  }

  localStorage.removeItem(QUESTION_REPORTS_KEY);
  renderQuestionReports([]);
  setQuestionReportStatus("Question reports cleared.", "good");
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
