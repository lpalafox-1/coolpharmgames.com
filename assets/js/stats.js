// assets/js/stats.js
// Performance dashboard for tracking quiz history and progress

const THEME_KEY = "pharmlet.theme";
const HISTORY_KEY = "pharmlet.history";
const REVIEW_KEY = "pharmlet.review-queue";
const TOP_DRUGS_SIGNALS_KEY = "pharmlet.topDrugs.signals";
const FINAL_RECENT_RUNS_KEY = "pharmlet.finalLab2.recentRuns";
const FINAL_EXAM_ID = "log-lab-final-2";
const FINAL_EXAM_TOTAL = 110;
const QUESTION_REPORTS_KEY = "pharmlet.question-reports";
const LAST_ROUND_PREFIX = "pharmlet.session.lastRound.";
const PROGRESS_KEY_PREFIX = "pharmlet.";
const PROGRESS_BACKUP_VERSION = 2;
const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const PLAYLIST_LOOKBACK_DAYS = 7;
const WARMUP_REVIEW_LOOKBACK_DAYS = 14;
const reviewQueueStore = window.PharmletReviewQueueStore;
const quizCatalog = window.PharmletQuizCatalog;
let weakAreaPlaylistState = null;
let morningWarmupState = null;

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

  loadStats().catch((error) => {
    console.error("Unable to load stats:", error);
    setPlaylistStatus("Unable to load weak-area playlists right now.", "bad");
  });
  
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
  document.getElementById("morning-warmups")?.addEventListener("click", handleMorningWarmupClick);
  document.getElementById("weak-area-playlists")?.addEventListener("click", handleWeakPlaylistClick);
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

function setPlaylistStatus(message, tone = "muted") {
  const el = document.getElementById("playlist-status");
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

function setWarmupStatus(message, tone = "muted") {
  const el = document.getElementById("warmup-status");
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

function normalizeDrugKey(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitBrandNames(brandValue) {
  if (!brandValue || normalizeDrugKey(brandValue) === "n/a") return [];

  const seen = new Set();
  const values = [];

  String(brandValue)
    .split(/[;,/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const key = normalizeDrugKey(part);
      if (!key || seen.has(key)) return;
      seen.add(key);
      values.push(part);
    });

  return values;
}

function createEmptyTopDrugsSignals() {
  return {
    version: 1,
    updatedAt: 0,
    seenDrugs: {},
    missedDrugs: {},
    seenClasses: {},
    missedClasses: {},
    seenCategories: {},
    missedCategories: {},
    seenBrands: {},
    missedBrands: {}
  };
}

function loadTopDrugsSignals() {
  try {
    const raw = localStorage.getItem(TOP_DRUGS_SIGNALS_KEY);
    if (!raw) return createEmptyTopDrugsSignals();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createEmptyTopDrugsSignals();

    return {
      ...createEmptyTopDrugsSignals(),
      ...parsed,
      seenDrugs: parsed.seenDrugs || {},
      missedDrugs: parsed.missedDrugs || {},
      seenClasses: parsed.seenClasses || {},
      missedClasses: parsed.missedClasses || {},
      seenCategories: parsed.seenCategories || {},
      missedCategories: parsed.missedCategories || {},
      seenBrands: parsed.seenBrands || {},
      missedBrands: parsed.missedBrands || {}
    };
  } catch {
    return createEmptyTopDrugsSignals();
  }
}

function getCounterValue(counter, key) {
  return Number(counter?.[normalizeDrugKey(key)] || 0);
}

function getWeaknessScore(seenCount, missedCount) {
  const seen = Number(seenCount || 0);
  const missed = Number(missedCount || 0);
  if (seen <= 0 && missed <= 0) return 0;

  const missRate = missed / Math.max(1, seen);
  return Math.min(4, (missed * 0.35) + (missRate * 1.25) - (seen * 0.02));
}

function getFieldWeaknessScore(signals, field, rawValue) {
  const fieldMap = {
    class: ["seenClasses", "missedClasses"],
    category: ["seenCategories", "missedCategories"],
    generic: ["seenDrugs", "missedDrugs"]
  };

  const [seenKey, missedKey] = fieldMap[field] || [];
  if (!seenKey || !missedKey) return 0;
  return getWeaknessScore(getCounterValue(signals[seenKey], rawValue), getCounterValue(signals[missedKey], rawValue));
}

function getBrandWeaknessScore(drug, signals) {
  const brands = splitBrandNames(drug?.brand);
  if (!brands.length) return 0;

  let maxScore = 0;
  for (const brand of brands) {
    const seen = getCounterValue(signals.seenBrands, brand);
    const missed = getCounterValue(signals.missedBrands, brand);
    const underPracticedBoost = Math.max(0, 3 - seen) * 0.12;
    const score = getWeaknessScore(seen, missed) + underPracticedBoost;
    if (score > maxScore) maxScore = score;
  }

  return maxScore;
}

function getDrugWeaknessScore(drug, signals) {
  return (
    getFieldWeaknessScore(signals, "generic", drug?.generic) * 0.7 +
    getFieldWeaknessScore(signals, "class", drug?.class) * 0.45 +
    getFieldWeaknessScore(signals, "category", drug?.category) * 0.45
  );
}

function getPlaylistPreview(items, formatter, limit = 3) {
  return (items || [])
    .slice(0, limit)
    .map((item) => formatter(item))
    .filter(Boolean)
    .join(" • ");
}

function getPlaylistButtonSpecs(count) {
  if (count <= 0) return [];
  if (count <= 10) return [{ size: count, label: "Play All" }];
  if (count <= 20) {
    return [
      { size: 10, label: "Play 10" },
      { size: count, label: "Play All" }
    ];
  }

  return [
    { size: 10, label: "Play 10" },
    { size: 20, label: "Play 20" }
  ];
}

function sortCandidates(candidates) {
  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.missed - a.missed || a.drug.generic.localeCompare(b.drug.generic));
}

function buildTopDrugPlaylistCandidates(pool, signals) {
  const brand = sortCandidates(pool.map((drug) => ({
    drug,
    score: getBrandWeaknessScore(drug, signals),
    missed: splitBrandNames(drug.brand).reduce((sum, brandName) => sum + getCounterValue(signals.missedBrands, brandName), 0)
  })));

  const classRecovery = sortCandidates(pool.map((drug) => ({
    drug,
    score: getFieldWeaknessScore(signals, "class", drug?.class) + (getDrugWeaknessScore(drug, signals) * 0.18),
    missed: getCounterValue(signals.missedClasses, drug?.class)
  })));

  const categoryRecovery = sortCandidates(pool.map((drug) => ({
    drug,
    score: getFieldWeaknessScore(signals, "category", drug?.category) + (getDrugWeaknessScore(drug, signals) * 0.16),
    missed: getCounterValue(signals.missedCategories, drug?.category)
  })));

  const moa = sortCandidates(pool
    .filter((drug) => String(drug?.moa || "").trim())
    .map((drug) => ({
      drug,
      score: getDrugWeaknessScore(drug, signals) + (getCounterValue(signals.missedDrugs, drug?.generic) * 0.18),
      missed: getCounterValue(signals.missedDrugs, drug?.generic)
    })));

  const mixed = sortCandidates(pool.map((drug) => ({
    drug,
    score: getDrugWeaknessScore(drug, signals) + (getBrandWeaknessScore(drug, signals) * 0.3),
    missed: getCounterValue(signals.missedDrugs, drug?.generic)
      + getCounterValue(signals.missedClasses, drug?.class)
      + getCounterValue(signals.missedCategories, drug?.category)
  })));

  return { brand, classRecovery, categoryRecovery, moa, mixed };
}

function buildWeakAreaPlaylistModels(pool, signals, reviewQueue) {
  const candidateMap = buildTopDrugPlaylistCandidates(pool, signals);
  const activeReviewQueue = reviewQueueStore ? reviewQueueStore.getActiveEntries(reviewQueue) : reviewQueue;
  const recentCutoff = Date.now() - (PLAYLIST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentReviewEntries = activeReviewQueue
    .filter((entry) => new Date(entry.lastMissedAt || entry.createdAt || 0).getTime() >= recentCutoff)
    .sort((a, b) => {
      const aTime = new Date(a.lastMissedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastMissedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

  return [
    {
      key: "brand-recovery",
      type: "top-drugs",
      promptFocus: "brand",
      title: "Brand Recovery",
      description: "Short-answer brand drills for the drug names that still trip you up.",
      items: candidateMap.brand.map((candidate) => candidate.drug),
      preview: getPlaylistPreview(candidateMap.brand, (candidate) => candidate.drug.generic)
    },
    {
      key: "class-recovery",
      type: "top-drugs",
      promptFocus: "class",
      title: "Class Recovery",
      description: "Class-only MCQs built from your shakiest therapeutic groups.",
      items: candidateMap.classRecovery.map((candidate) => candidate.drug),
      preview: getPlaylistPreview(candidateMap.classRecovery, (candidate) => candidate.drug.class || candidate.drug.generic)
    },
    {
      key: "category-recovery",
      type: "top-drugs",
      promptFocus: "category",
      title: "Category Recovery",
      description: "Focused category prompts for the drug buckets you miss most often.",
      items: candidateMap.categoryRecovery.map((candidate) => candidate.drug),
      preview: getPlaylistPreview(candidateMap.categoryRecovery, (candidate) => candidate.drug.category || candidate.drug.generic)
    },
    {
      key: "moa-recovery",
      type: "top-drugs",
      promptFocus: "moa",
      title: "MOA Recovery",
      description: "MOA-only drills pulled from the drugs where your understanding is still sticky.",
      items: candidateMap.moa.map((candidate) => candidate.drug),
      preview: getPlaylistPreview(candidateMap.moa, (candidate) => candidate.drug.generic)
    },
    {
      key: "most-missed-mix",
      type: "top-drugs",
      promptFocus: "mixed",
      title: "Most Missed Mix",
      description: "A mixed playlist across brand, class, category, and MOA from your highest-friction drugs.",
      items: candidateMap.mixed.map((candidate) => candidate.drug),
      preview: getPlaylistPreview(candidateMap.mixed, (candidate) => candidate.drug.generic)
    },
    {
      key: "recent-misses-week",
      type: "review-queue",
      promptFocus: "review",
      title: "Fresh Misses This Week",
      description: "Recent missed questions from the last 7 days so you can clean them up fast.",
      items: recentReviewEntries,
      preview: getPlaylistPreview(recentReviewEntries, (entry) => {
        const prompt = reviewQueueStore ? reviewQueueStore.toPlainText(entry.prompt) : toPlainText(entry.prompt);
        return prompt.length > 28 ? `${prompt.slice(0, 28)}...` : prompt;
      })
    }
  ].map((playlist) => ({
    ...playlist,
    availableCount: playlist.items.length,
    buttonSpecs: getPlaylistButtonSpecs(playlist.items.length)
  }));
}

async function loadTopDrugsPoolState() {
  try {
    const loader = window.TopDrugsData?.loadPool;
    if (typeof loader !== "function") {
      throw new Error("Top Drugs pool loader is unavailable.");
    }

    const loaded = await loader();
    return {
      pool: Array.isArray(loaded?.data) ? loaded.data : [],
      poolLoadFailed: false
    };
  } catch (error) {
    console.warn("Unable to load Top Drugs pool for stats:", error);
    return {
      pool: [],
      poolLoadFailed: true
    };
  }
}

function getWarmupButtonSpecs(count, preferredSizes) {
  const available = Math.max(0, Number(count) || 0);
  if (!available) return [];

  const unique = new Set();
  const specs = [];

  preferredSizes.forEach((size) => {
    const numericSize = Number(size) || 0;
    if (numericSize > 0 && available >= numericSize && !unique.has(numericSize)) {
      unique.add(numericSize);
      specs.push({ size: numericSize, label: `Play ${numericSize}` });
    }
  });

  if (!unique.has(available)) {
    unique.add(available);
    specs.push({ size: available, label: "Play All" });
  }

  return specs;
}

function getLatestCompletedFinalAttempt(history) {
  return [...history]
    .filter((entry) => entry?.quizId === FINAL_EXAM_ID && Number(entry?.total) === FINAL_EXAM_TOTAL)
    .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0))[0] || null;
}

function buildMorningWarmupDrugCandidates(pool, signals, latestFinalAttempt) {
  const weakAreas = Array.isArray(latestFinalAttempt?.finalSummary?.weakAreas)
    ? latestFinalAttempt.finalSummary.weakAreas
    : [];

  return pool
    .map((drug) => {
      const brandScore = getBrandWeaknessScore(drug, signals);
      const classScore = getFieldWeaknessScore(signals, "class", drug?.class);
      const categoryScore = getFieldWeaknessScore(signals, "category", drug?.category);
      const moaScore = drug?.moa
        ? getDrugWeaknessScore(drug, signals) + (getCounterValue(signals.missedDrugs, drug?.generic) * 0.18)
        : 0;
      const genericScore = getFieldWeaknessScore(signals, "generic", drug?.generic);
      const focusScores = {
        brand: brandScore,
        class: classScore,
        category: categoryScore,
        moa: moaScore,
        generic: genericScore
      };

      let score = (getDrugWeaknessScore(drug, signals) * 0.7) + (brandScore * 0.3) + (genericScore * 0.25);
      weakAreas.forEach((area, index) => {
        const weight = index === 0 ? 0.95 : index === 1 ? 0.62 : 0.4;
        score += Math.max(0, Number(focusScores[area?.key]) || 0) * weight;
      });

      score += Math.max(brandScore, classScore, categoryScore, moaScore, 0) * 0.16;

      return {
        drug,
        score,
        focusScores,
        missed: getCounterValue(signals.missedDrugs, drug?.generic)
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.missed - a.missed || a.drug.generic.localeCompare(b.drug.generic));
}

function buildMorningWarmupReviewEntries(reviewQueue) {
  const activeEntries = reviewQueueStore ? reviewQueueStore.getActiveEntries(reviewQueue) : reviewQueue;
  const recentCutoff = Date.now() - (WARMUP_REVIEW_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const getMissCount = (entry) => reviewQueueStore
    ? reviewQueueStore.getEntryMissCount(entry)
    : Math.max(0, Number(entry?.missCount) || 0);
  const getLatestActivity = (entry) => reviewQueueStore
    ? reviewQueueStore.getLatestActivityTimestamp(entry)
    : new Date(entry?.lastMissedAt || entry?.createdAt || 0).getTime();

  return activeEntries
    .filter((entry) => {
      const prompt = reviewQueueStore ? reviewQueueStore.toPlainText(entry.prompt) : toPlainText(entry.prompt);
      return Boolean(prompt);
    })
    .sort((a, b) => {
      const aRecent = getLatestActivity(a) >= recentCutoff;
      const bRecent = getLatestActivity(b) >= recentCutoff;
      if (aRecent !== bRecent) return Number(bRecent) - Number(aRecent);

      const missDiff = getMissCount(b) - getMissCount(a);
      if (missDiff !== 0) return missDiff;

      return getLatestActivity(b) - getLatestActivity(a);
    });
}

function buildMorningWarmupModels(pool, signals, reviewQueue, history) {
  const latestFinalAttempt = getLatestCompletedFinalAttempt(history);
  const weakAreas = Array.isArray(latestFinalAttempt?.finalSummary?.weakAreas)
    ? latestFinalAttempt.finalSummary.weakAreas
    : [];
  const warmupCandidates = buildMorningWarmupDrugCandidates(pool, signals, latestFinalAttempt);
  const reviewEntries = buildMorningWarmupReviewEntries(reviewQueue);
  const focusText = weakAreas.length
    ? weakAreas.slice(0, 2).map((area) => area.label || area.key || "Focus").join(" + ")
    : "adaptive weak-drug memory";

  return [
    {
      key: "adaptive-final-warmup",
      type: "top-drugs",
      promptFocus: weakAreas[0]?.key || "mixed",
      title: "Adaptive Final Warm-Up",
      description: `Short mixed Top Drugs prep leaning into ${focusText} before you start a longer run.`,
      items: warmupCandidates.map((candidate) => candidate.drug),
      preview: getPlaylistPreview(warmupCandidates, (candidate) => candidate.drug.generic),
      availableCount: warmupCandidates.length,
      buttonSpecs: getWarmupButtonSpecs(warmupCandidates.length, [15, 25])
    },
    {
      key: "rapid-cleanup-warmup",
      type: "review-queue",
      promptFocus: "review",
      title: "Rapid Cleanup",
      description: `Clear your highest-friction missed questions and tempting wrong answers from the last ${WARMUP_REVIEW_LOOKBACK_DAYS} days.`,
      items: reviewEntries,
      preview: getPlaylistPreview(reviewEntries, (entry) => {
        const prompt = reviewQueueStore ? reviewQueueStore.toPlainText(entry.prompt) : toPlainText(entry.prompt);
        return prompt.length > 28 ? `${prompt.slice(0, 28)}...` : prompt;
      }),
      availableCount: reviewEntries.length,
      buttonSpecs: getWarmupButtonSpecs(reviewEntries.length, [10, 20])
    }
  ];
}

function renderMorningWarmups(reviewQueue, history, poolState) {
  const container = document.getElementById("morning-warmups");
  if (!container) return;

  const { pool = [], poolLoadFailed = false } = poolState || {};
  const signals = loadTopDrugsSignals();
  const models = buildMorningWarmupModels(pool, signals, reviewQueue, history);
  morningWarmupState = { models };

  const liveModels = models.filter((model) => model.availableCount > 0);
  if (!liveModels.length) {
    container.innerHTML = `
      <div class="rounded-xl border border-[var(--ring)] p-4 md:col-span-2" style="background:var(--accent-light, rgba(139,30,63,0.06)); color:var(--muted)">
        Finish a few more quizzes first. Morning warm-ups unlock once the site has enough weak-area or missed-question data to target.
      </div>
    `;
    setWarmupStatus(poolLoadFailed ? "Top Drugs warm-up data is offline right now, so only review-driven warm-ups were checked." : "No morning warm-ups are ready yet.", poolLoadFailed ? "bad" : "muted");
    return;
  }

  container.innerHTML = "";
  models.forEach((model) => {
    const card = document.createElement("div");
    card.className = "rounded-xl border border-[var(--ring)] p-4";
    card.style.background = "linear-gradient(135deg, rgba(15, 23, 42, 0.03) 0%, rgba(139, 30, 63, 0.08) 100%)";

    const countLabel = model.availableCount > 0
      ? `${model.availableCount} ready`
      : "Need more data";
    const preview = model.preview
      ? `<div class="text-xs mt-3" style="color:var(--muted)">Preview: ${sanitize(model.preview)}</div>`
      : "";
    const buttonMarkup = model.buttonSpecs.length
      ? model.buttonSpecs.map((spec) => `
          <button
            type="button"
            class="btn btn-blue"
            data-warmup-key="${sanitize(model.key)}"
            data-warmup-size="${spec.size}"
          >
            ${sanitize(spec.label)}
          </button>
        `).join("")
      : `<button type="button" class="btn btn-ghost opacity-60 cursor-not-allowed" disabled>Locked</button>`;

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">${model.type === "review-queue" ? "Fast Cleanup" : "Adaptive Top Drugs"}</div>
          <h3 class="text-lg font-semibold mt-1">${sanitize(model.title)}</h3>
        </div>
        <div class="text-xs font-semibold whitespace-nowrap" style="color:var(--muted)">${sanitize(countLabel)}</div>
      </div>
      <p class="text-sm mt-3" style="color:var(--muted)">${sanitize(model.description)}</p>
      ${preview}
      <div class="flex flex-wrap gap-2 mt-4">
        ${buttonMarkup}
      </div>
    `;
    container.appendChild(card);
  });

  const reviewCount = models.find((model) => model.key === "rapid-cleanup-warmup")?.availableCount || 0;
  const topDrugsCount = models.find((model) => model.key === "adaptive-final-warmup")?.availableCount || 0;
  const statusMessage = poolLoadFailed
    ? `Warm-up mode is partially ready. Review cleanup is available, but Top Drugs pool data could not be loaded for the adaptive warm-up.`
    : `Ready: ${liveModels.length} warm-up track${liveModels.length === 1 ? "" : "s"} using ${topDrugsCount} adaptive Top Drugs targets and ${reviewCount} cleanup cards.`;
  setWarmupStatus(statusMessage, poolLoadFailed ? "accent" : "good");
}

async function renderWeakAreaPlaylists(reviewQueue, poolState) {
  const container = document.getElementById("weak-area-playlists");
  if (!container) return;

  const { pool = [], poolLoadFailed = false } = poolState || {};

  const signals = loadTopDrugsSignals();
  const playlists = buildWeakAreaPlaylistModels(pool, signals, reviewQueue);
  weakAreaPlaylistState = { playlists };

  const livePlaylists = playlists.filter((playlist) => playlist.availableCount > 0);
  if (!livePlaylists.length) {
    container.innerHTML = `
      <div class="rounded-xl border border-[var(--ring)] p-4 md:col-span-2 xl:col-span-3" style="background:var(--accent-light, rgba(139,30,63,0.06)); color:var(--muted)">
        Build a little more history first. Once you miss some prompts or finish more Top Drugs quizzes, focused playlists will unlock here.
      </div>
    `;
    setPlaylistStatus(poolLoadFailed ? "Top Drugs playlist data could not load, so only saved-review playlists were checked." : "No weak-area playlists are ready yet.", poolLoadFailed ? "bad" : "muted");
    return;
  }

  container.innerHTML = "";
  playlists.forEach((playlist) => {
    const card = document.createElement("div");
    card.className = "rounded-xl border border-[var(--ring)] p-4";
    card.style.background = "var(--accent-light, rgba(139,30,63,0.06))";

    const countLabel = playlist.availableCount > 0
      ? `${playlist.availableCount} ready`
      : "Need more data";
    const preview = playlist.preview
      ? `<div class="text-xs mt-3" style="color:var(--muted)">Preview: ${sanitize(playlist.preview)}</div>`
      : "";
    const buttonMarkup = playlist.buttonSpecs.length
      ? playlist.buttonSpecs.map((spec) => `
          <button
            type="button"
            class="btn btn-blue"
            data-playlist-key="${sanitize(playlist.key)}"
            data-playlist-size="${spec.size}"
          >
            ${sanitize(spec.label)}
          </button>
        `).join("")
      : `<button type="button" class="btn btn-ghost opacity-60 cursor-not-allowed" disabled>Locked</button>`;

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">${playlist.type === "review-queue" ? "Review Queue" : "Top Drugs"}</div>
          <h3 class="text-lg font-semibold mt-1">${sanitize(playlist.title)}</h3>
        </div>
        <div class="text-xs font-semibold whitespace-nowrap" style="color:var(--muted)">${sanitize(countLabel)}</div>
      </div>
      <p class="text-sm mt-3" style="color:var(--muted)">${sanitize(playlist.description)}</p>
      ${preview}
      <div class="flex flex-wrap gap-2 mt-4">
        ${buttonMarkup}
      </div>
    `;
    container.appendChild(card);
  });

  const readyCount = livePlaylists.length;
  const recentCount = playlists.find((playlist) => playlist.key === "recent-misses-week")?.availableCount || 0;
  const signalDrivenCount = playlists
    .filter((playlist) => playlist.type === "top-drugs")
    .reduce((sum, playlist) => sum + playlist.availableCount, 0);
  const tone = poolLoadFailed ? "accent" : "good";
  const message = poolLoadFailed
    ? `Playlist ideas are ready from saved review data. Top Drugs pool loading failed, so some playlists may stay locked until that file is reachable.`
    : `Ready: ${readyCount} playlist${readyCount === 1 ? "" : "s"} using ${signalDrivenCount} weak-drug candidates and ${recentCount} recent missed review card${recentCount === 1 ? "" : "s"}.`;
  setPlaylistStatus(message, tone);
}

function buildReviewQueuePlaylistSolution(entry) {
  const parts = [];
  const temptingWrong = reviewQueueStore ? reviewQueueStore.getCommonWrongAnswer(entry) : "";
  const missCount = reviewQueueStore ? reviewQueueStore.getEntryMissCount(entry) : 1;

  if (temptingWrong) {
    parts.push(`Most tempting wrong answer: ${temptingWrong}`);
  } else if (entry.lastUserAnswer) {
    parts.push(`Last wrong answer: ${entry.lastUserAnswer}`);
  }

  parts.push(`Missed ${missCount} time${missCount === 1 ? "" : "s"}`);
  return parts.join(" • ");
}

function buildReviewQueuePlaylistQuestion(entry) {
  const quizId = String(entry?.quizId || "").trim();
  const sourceTitle = reviewQueueStore?.getDisplayTitle
    ? reviewQueueStore.getDisplayTitle(entry)
    : (entry.title || quizCatalog?.getEntry?.(quizId)?.title || quizCatalog?.buildDynamicQuizLabel?.(quizId) || quizId || "Review Queue");

  return {
    type: entry.type,
    prompt: entry.prompt,
    choices: entry.choices,
    answer: entry.answer,
    answerText: entry.answerText ?? entry.answer,
    sourceQuizId: entry.quizId || "",
    sourceTitle,
    hint: reviewQueueStore
      ? `Mastery progress: ${reviewQueueStore.getMasterySummary(entry).label}.`
      : "Review your previous answer carefully.",
    solution: buildReviewQueuePlaylistSolution(entry)
  };
}

function resolvePlaylistSize(playlist, requestedSize) {
  const available = Math.max(0, Number(playlist?.availableCount) || 0);
  const numericSize = Number(requestedSize) || available;
  return Math.min(available, Math.max(1, numericSize));
}

function launchMorningWarmup(warmupKey, requestedSize) {
  const model = morningWarmupState?.models?.find((item) => item.key === warmupKey);
  if (!model || !model.availableCount) return;

  const size = resolvePlaylistSize(model, requestedSize);
  if (!size) return;

  if (model.type === "review-queue") {
    const questions = model.items
      .slice(0, size)
      .map(buildReviewQueuePlaylistQuestion);

    const payload = {
      id: "custom-quiz",
      title: `${model.title} - ${size} Question${size === 1 ? "" : "s"}`,
      metadata: {
        generatedFrom: "stats",
        kind: "morning-warmup",
        generator: "review-queue-warmup",
        playlistKey: model.key,
        createdAt: Date.now(),
        requestedSize: size
      },
      questions
    };

    localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
    window.location.href = "quiz.html?id=custom-quiz";
    return;
  }

  const payload = {
    id: "custom-quiz",
    title: `${model.title} - ${size} Question${size === 1 ? "" : "s"}`,
    metadata: {
      generatedFrom: "stats",
      kind: "morning-warmup",
      generator: "top-drugs-playlist",
      playlistKey: model.key,
      promptFocus: model.promptFocus,
      createdAt: Date.now(),
      requestedSize: size
    },
    items: model.items.slice(0, size)
  };

  localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
  window.location.href = "quiz.html?id=custom-quiz";
}

function launchWeakAreaPlaylist(playlistKey, requestedSize) {
  const playlist = weakAreaPlaylistState?.playlists?.find((item) => item.key === playlistKey);
  if (!playlist || !playlist.availableCount) return;

  const size = resolvePlaylistSize(playlist, requestedSize);
  if (!size) return;

  if (playlist.type === "review-queue") {
    const questions = playlist.items
      .slice(0, size)
      .map(buildReviewQueuePlaylistQuestion);

    const payload = {
      id: "custom-quiz",
      title: `${playlist.title} — ${size} Question${size === 1 ? "" : "s"}`,
      metadata: {
        generatedFrom: "stats",
        kind: "weak-area-playlist",
        generator: "review-queue-playlist",
        playlistKey: playlist.key,
        createdAt: Date.now(),
        requestedSize: size
      },
      questions
    };

    localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
    window.location.href = "quiz.html?id=custom-quiz";
    return;
  }

  const payload = {
    id: "custom-quiz",
    title: `${playlist.title} — ${size} Question${size === 1 ? "" : "s"}`,
    metadata: {
      generatedFrom: "stats",
      kind: "weak-area-playlist",
      generator: "top-drugs-playlist",
      playlistKey: playlist.key,
      promptFocus: playlist.promptFocus,
      createdAt: Date.now(),
      requestedSize: size
    },
    items: playlist.items.slice(0, size)
  };

  localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
  window.location.href = "quiz.html?id=custom-quiz";
}

function handleWeakPlaylistClick(event) {
  const button = event.target.closest("[data-playlist-key]");
  if (!button) return;

  const playlistKey = button.getAttribute("data-playlist-key");
  const playlistSize = button.getAttribute("data-playlist-size");
  if (!playlistKey) return;

  launchWeakAreaPlaylist(playlistKey, playlistSize);
}

function handleMorningWarmupClick(event) {
  const button = event.target.closest("[data-warmup-key]");
  if (!button) return;

  const warmupKey = button.getAttribute("data-warmup-key");
  const warmupSize = button.getAttribute("data-warmup-size");
  if (!warmupKey) return;

  launchMorningWarmup(warmupKey, warmupSize);
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

async function loadStats() {
  const history = getHistory();
  const reviewQueue = getReviewQueue();
  const questionReports = getQuestionReports();
  const poolState = await loadTopDrugsPoolState();

  renderMostMissedQuestions(reviewQueue);
  renderQuestionReports(questionReports);
  renderMorningWarmups(reviewQueue, history, poolState);
  await renderWeakAreaPlaylists(reviewQueue, poolState);
  
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
            Tempting wrong answer: <span class="font-medium" style="color:var(--bad)">${sanitize(item.commonWrong || "—")}</span>${item.commonWrongCount ? ` <span class="opacity-70">(${item.commonWrongCount}x)</span>` : ""}
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
  if (reviewQueueStore) {
    return reviewQueueStore.getMostMissedQuestions(reviewQueue);
  }

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
    const parsed = raw ? JSON.parse(raw) : [];
    return reviewQueueStore ? reviewQueueStore.normalizeQueue(parsed) : parsed;
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
  return quizCatalog?.resolveStatsCategory?.(quizId) || "Other";
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
