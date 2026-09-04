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
const questionReportsStore = window.PharmletQuestionReports;
let weakAreaPlaylistState = null;
let morningWarmupState = null;

// --- P2F-08: READ-ONLY RECORDED-ATTEMPT NORMALIZATION -----------------------
// Stats interprets `pharmlet.history` more carefully; it never rewrites it.
// Every helper below is pure over a raw record and returns a derived view, so
// a Stats visit leaves the stored value byte-identical. Data the persistence
// contract never recorded stays absent instead of being guessed or zero-filled.

// The engine keeps the most recent 200 attempts (quizEngine.js history.slice(-200)).
const HISTORY_RETENTION_LIMIT = 200;

// Fall Lab III attempt kinds, read from assets/js/quizEngine.js
// (FALL_LAB3_PRACTICE_KIND, the "boss-round" launch literal, and
// FALL_LAB3_BOSS_REMIX_KIND) and corroborated against
// tools/fall-2026-lab3-completion-continuation.test.mjs. Stats only reads them.
const FALL_LAB3_PRACTICE_KIND = "fall-2026-lab3-practice";
const FALL_LAB3_BOSS_ROUND_KIND = "boss-round";
const FALL_LAB3_BOSS_REMIX_KIND = "fall-2026-lab3-boss-remix";
const FALL_LAB3_ADAPTIVE_KIND = "fall-2026-lab3-adaptive";

const ATTEMPT_TYPES = Object.freeze([
  Object.freeze({ id: "fall-lab3-practice", label: "Fall Lab III Practice" }),
  Object.freeze({ id: "boss-rounds", label: "Boss Rounds" }),
  Object.freeze({ id: "boss-remixes", label: "Boss Remixes" }),
  Object.freeze({ id: "fall-lab3-adaptive", label: "Adaptive Practice" }),
  Object.freeze({ id: "adaptive-playlists", label: "Adaptive Playlists" }),
  Object.freeze({ id: "generated-sets", label: "Generated Sets / Morning Warm-Ups" }),
  Object.freeze({ id: "standard-practice", label: "Standard Practice" }),
  Object.freeze({ id: "unclassified", label: "Other / Unclassified" })
]);

const ATTEMPT_TYPE_LABELS = Object.freeze(
  ATTEMPT_TYPES.reduce((labels, type) => Object.assign(labels, { [type.id]: type.label }), {})
);

// Attempt kind to display category, expressed as data. An unknown future kind
// resolves to nothing here and falls through to mode, then to the catalog.
const ATTEMPT_KIND_TYPE_IDS = Object.freeze({
  [FALL_LAB3_PRACTICE_KIND]: "fall-lab3-practice",
  [FALL_LAB3_BOSS_ROUND_KIND]: "boss-rounds",
  [FALL_LAB3_BOSS_REMIX_KIND]: "boss-remixes",
  [FALL_LAB3_ADAPTIVE_KIND]: "fall-lab3-adaptive"
});

// History `mode` labels the engine writes for generated attempts. Only the
// modes that genuinely assert an attempt type are listed; "easy" and friends
// describe difficulty, not provenance, so they never classify an attempt.
const MODE_TYPE_IDS = Object.freeze({
  bossRemix: "boss-remixes",
  boss: "boss-rounds",
  playlist: "adaptive-playlists"
});

// Catalog stats categories that already imply an attempt type.
const CATALOG_CATEGORY_TYPE_IDS = Object.freeze({
  "Adaptive Playlists": "adaptive-playlists",
  "Boss Rounds": "boss-rounds",
  "Generated Sets": "generated-sets"
});

const HISTORY_DATE_RANGES = Object.freeze([
  Object.freeze({ id: "today", label: "Today", days: 1 }),
  Object.freeze({ id: "7d", label: "Last 7 days", days: 7 }),
  Object.freeze({ id: "14d", label: "Last 14 days", days: 14 }),
  Object.freeze({ id: "30d", label: "Last 30 days", days: 30 }),
  Object.freeze({ id: "90d", label: "Last 90 days", days: 90 }),
  Object.freeze({ id: "all", label: "All time", days: null }),
  Object.freeze({ id: "custom", label: "Custom range", days: null })
]);

function getCurriculumAdapter() {
  // Read lazily so Stats still works when the adapter script is unavailable.
  return window.PharmletCurriculumMetadata || null;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// One timestamp normalizer for every Stats sort, filter, bucket, and label.
// Accepts epoch numbers, numeric strings, ISO strings, and Date-like objects
// (duck-typed so a Date built in another realm still normalizes).
function normalizeTimestamp(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "object" && typeof value.getTime === "function") {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^-?\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function startOfLocalDay(value) {
  const ms = normalizeTimestamp(value);
  if (ms === null) return null;

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// Day arithmetic goes through setDate so a DST shift keeps local midnight
// aligned instead of drifting an hour into the neighbouring day.
function shiftLocalDays(value, days) {
  const start = startOfLocalDay(value);
  if (start === null) return null;

  const date = new Date(start);
  date.setDate(date.getDate() + Number(days || 0));
  return date.getTime();
}

function endOfLocalDay(value) {
  const nextDay = shiftLocalDays(value, 1);
  return nextDay === null ? null : nextDay - 1;
}

function getLocalDayKey(value) {
  const ms = normalizeTimestamp(value);
  if (ms === null) return "";

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Local calendar day from a "YYYY-MM-DD" control value. The numeric Date
// constructor is deliberate: `new Date("2026-09-01")` would parse as UTC and
// shift the boundary for anyone west of Greenwich.
function parseLocalDayInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function toFiniteNumber(value) {
  if (typeof value === "boolean" || value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// Every Stats score calculation goes through this guard, so one malformed
// record can never render NaN%, Infinity, or a poisoned average.
function getScoreRatio(score, total) {
  const numericTotal = toFiniteNumber(total);
  const numericScore = toFiniteNumber(score);
  if (numericTotal === null || numericTotal <= 0) return null;
  if (numericScore === null) return null;
  return numericScore / numericTotal;
}

function formatRatioPercent(ratio, digits = 1) {
  return Number.isFinite(ratio) ? `${(ratio * 100).toFixed(digits)}%` : "—";
}

function averageRatios(ratios) {
  const usable = (ratios || []).filter((ratio) => Number.isFinite(ratio));
  if (!usable.length) return null;
  return usable.reduce((sum, ratio) => sum + ratio, 0) / usable.length;
}

function getHistoryLineage(raw) {
  return isPlainRecord(raw?.attemptLineage) ? raw.attemptLineage : null;
}

function readLineageText(lineage, field) {
  const value = lineage?.[field];
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function readLineageInteger(lineage, field, { minimum = 0 } = {}) {
  const value = lineage?.[field];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= minimum ? numeric : null;
}

// Provenance precedence: a recognized lineage kind wins, history `mode` is the
// fallback, and the catalog heuristic comes last. Both raw values survive.
function resolveAttemptType(raw, lineage) {
  const attemptKind = readLineageText(lineage, "attemptKind");
  const rawMode = typeof raw?.mode === "string" ? raw.mode.trim() : "";
  const lineageTypeId = ATTEMPT_KIND_TYPE_IDS[attemptKind] || "";
  const modeTypeId = MODE_TYPE_IDS[rawMode] || "";

  if (lineageTypeId) {
    return {
      typeId: lineageTypeId,
      source: "lineage",
      attemptKind,
      rawMode,
      // Stored history is never repaired; the disagreement is recorded instead.
      modeConflict: Boolean(modeTypeId) && modeTypeId !== lineageTypeId
    };
  }

  if (modeTypeId) {
    return { typeId: modeTypeId, source: "mode", attemptKind, rawMode, modeConflict: false };
  }

  const category = getCategoryFromQuizId(raw?.quizId);
  const catalogTypeId = CATALOG_CATEGORY_TYPE_IDS[category] || "";
  if (catalogTypeId) {
    return { typeId: catalogTypeId, source: "catalog", attemptKind, rawMode, modeConflict: false };
  }

  if (category && category !== "Other") {
    return { typeId: "standard-practice", source: "catalog", attemptKind, rawMode, modeConflict: false };
  }

  return { typeId: "unclassified", source: "none", attemptKind, rawMode, modeConflict: false };
}

// A lineage record answers from its own recorded fields only. Whatever F26-09
// did not store stays unknown; nothing is back-filled from the quiz id, the
// title, or a sibling field that merely implies it.
function readLineageCurriculumScope(lineage) {
  const scope = {};
  for (const field of ["professionalYear", "semester", "lab", "curriculumId"]) {
    const value = readLineageText(lineage, field);
    if (value) scope[field] = value;
  }

  const quizWeek = readLineageInteger(lineage, "quizWeek", { minimum: 1 });
  if (quizWeek !== null) scope.quizWeek = quizWeek;
  return scope;
}

function readCatalogCurriculumScope(quizId) {
  const id = String(quizId ?? "").trim();
  if (!id) return {};

  let context = null;
  const adapter = getCurriculumAdapter();
  if (typeof adapter?.normalizeCurriculumMetadata === "function") {
    try {
      context = adapter.normalizeCurriculumMetadata({ quizId: id })?.quiz || null;
    } catch (error) {
      console.warn("Curriculum metadata lookup failed for a history record:", error);
      context = null;
    }
  }

  if (!isPlainRecord(context)) context = quizCatalog?.getCurriculumContext?.(id) || null;
  if (!isPlainRecord(context)) return {};

  const scope = {};
  for (const field of ["professionalYear", "semester", "lab", "curriculumId", "course"]) {
    const value = context[field];
    if (typeof value === "string" && value.trim()) scope[field] = value.trim();
  }

  const quizWeek = Number(context.quizWeek);
  if (Number.isInteger(quizWeek) && quizWeek > 0) scope.quizWeek = quizWeek;
  return scope;
}

function resolveRecordCurriculum(raw, lineage) {
  if (lineage) {
    const scope = readLineageCurriculumScope(lineage);
    if (Object.keys(scope).length) return { scope, source: "lineage" };
  }

  const scope = readCatalogCurriculumScope(raw?.quizId);
  if (Object.keys(scope).length) return { scope, source: "catalog" };

  // Neither source proves curriculum context, so Stats says so.
  return { scope: {}, source: "unknown" };
}

function readLineageChain(lineage) {
  if (!lineage) return null;

  const chain = {};
  for (const field of ["attemptId", "parentAttemptId", "rootAttemptId", "sourceQuizId"]) {
    const value = readLineageText(lineage, field);
    if (value) chain[field] = value;
  }

  const remixGeneration = readLineageInteger(lineage, "remixGeneration");
  if (remixGeneration !== null) chain.remixGeneration = remixGeneration;

  const questionCount = readLineageInteger(lineage, "questionCount", { minimum: 1 });
  if (questionCount !== null) chain.questionCount = questionCount;

  return Object.keys(chain).length ? chain : null;
}

// Generated history ids end in the attempt's question count, which would split
// one practice family into a "-q10" and a "-q6" row. The count is dropped from
// the family identity only; it is still carried on every attempt.
function stripGeneratedQuestionCount(quizId) {
  const value = String(quizId ?? "").trim();
  return value.startsWith("generated-") ? value.replace(/-q\d+$/, "") : value;
}

function buildHistoryFamilyKey(record, chain) {
  const sourceQuizId = chain?.sourceQuizId || "";
  if (sourceQuizId) return `lineage:${sourceQuizId}:${record.attemptTypeId}`;

  const base = stripGeneratedQuestionCount(record.quizId) || "unknown-quiz";
  return `history:${base}:${record.mode}`;
}

function buildHistoryFamilyLabel(record) {
  const week = record.curriculum.quizWeek;
  if (record.hasLineage && week) {
    return record.curriculum.lab ? `${record.curriculum.lab} Week ${week}` : `Week ${week}`;
  }

  return record.title
    || quizCatalog?.buildDynamicQuizLabel?.(record.quizId)
    || record.quizId
    || "Recorded attempt";
}

function normalizeHistoryRecord(raw, index = 0) {
  const source = isPlainRecord(raw) ? raw : {};
  const lineage = getHistoryLineage(source);
  const attemptType = resolveAttemptType(source, lineage);
  const curriculum = resolveRecordCurriculum(source, lineage);
  const timestampMs = normalizeTimestamp(source.timestamp);
  const chain = readLineageChain(lineage);

  const record = {
    index,
    raw: source,
    quizId: String(source.quizId ?? "").trim(),
    mode: attemptType.rawMode,
    title: String(source.title ?? "").trim(),
    score: toFiniteNumber(source.score),
    total: toFiniteNumber(source.total),
    scoreRatio: getScoreRatio(source.score, source.total),
    bestStreak: toFiniteNumber(source.bestStreak),
    timestampMs,
    dayKey: getLocalDayKey(timestampMs),
    hasLineage: Boolean(lineage),
    attemptKind: attemptType.attemptKind,
    attemptTypeId: attemptType.typeId,
    attemptTypeLabel: ATTEMPT_TYPE_LABELS[attemptType.typeId] || ATTEMPT_TYPE_LABELS.unclassified,
    attemptTypeSource: attemptType.source,
    modeConflict: attemptType.modeConflict,
    curriculum: curriculum.scope,
    curriculumSource: curriculum.source,
    curriculumKnown: Boolean(curriculum.scope.professionalYear),
    categoryLabel: getCategoryFromQuizId(source.quizId)
  };

  if (chain) record.chain = chain;
  record.familyKey = buildHistoryFamilyKey(record, chain);
  record.familyLabel = buildHistoryFamilyLabel(record);
  return record;
}

function normalizeHistoryRecords(history) {
  return (Array.isArray(history) ? history : []).map((raw, index) => normalizeHistoryRecord(raw, index));
}

function compareRecordsNewestFirst(a, b) {
  const aTime = a?.timestampMs;
  const bTime = b?.timestampMs;
  if (aTime === null && bTime === null) return b.index - a.index;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  return bTime - aTime || b.index - a.index;
}

function sortRecordsNewestFirst(records) {
  return [...(records || [])].sort(compareRecordsNewestFirst);
}

function getHistoryDateBounds(filter = {}, now = Date.now()) {
  const rangeId = String(filter?.range || "all");

  if (rangeId === "custom") {
    const start = parseLocalDayInput(filter?.customStart);
    const rawEnd = parseLocalDayInput(filter?.customEnd);
    return { start, end: rawEnd === null ? null : endOfLocalDay(rawEnd) };
  }

  const range = HISTORY_DATE_RANGES.find((candidate) => candidate.id === rangeId);
  const days = Number(range?.days);
  if (!Number.isInteger(days) || days <= 0) return { start: null, end: null };

  return { start: shiftLocalDays(now, -(days - 1)), end: endOfLocalDay(now) };
}

function matchesHistoryDateBounds(record, bounds) {
  if (bounds.start === null && bounds.end === null) return true;
  // An attempt with no usable timestamp cannot be proved to sit inside a
  // bounded window, so it is disclosed as excluded rather than assumed in.
  if (record.timestampMs === null) return false;
  if (bounds.start !== null && record.timestampMs < bounds.start) return false;
  if (bounds.end !== null && record.timestampMs > bounds.end) return false;
  return true;
}

// The curriculum-scope dimensions a record may or may not have recorded. A
// record that never stored one of these must not be quietly dropped when that
// dimension is filtered: absence of the field is not evidence of exclusion.
const HISTORY_SCOPE_FILTERS = Object.freeze([
  Object.freeze({ key: "semester", field: "semester", noun: "semester" }),
  Object.freeze({ key: "lab", field: "lab", noun: "lab" }),
  Object.freeze({ key: "week", field: "quizWeek", noun: "week" })
]);

function hasScopeValue(record, field) {
  const value = record?.curriculum?.[field];
  return value !== undefined && value !== null && String(value) !== "";
}

function getActiveScopeFilters(filter) {
  return HISTORY_SCOPE_FILTERS.filter((scope) => String(filter?.[scope.key] || "all") !== "all");
}

function matchesCurriculumScope(record, filter) {
  const semester = String(filter?.semester || "all");
  const lab = String(filter?.lab || "all");
  const week = String(filter?.week || "all");

  if (semester !== "all" && (record.curriculum.semester || "") !== semester) return false;
  if (lab !== "all" && (record.curriculum.lab || "") !== lab) return false;
  if (week !== "all" && String(record.curriculum.quizWeek ?? "") !== week) return false;

  const curriculum = String(filter?.curriculum || "all");
  if (curriculum === "all") return true;
  if (curriculum === "unclassified") return !record.curriculumKnown;
  return record.curriculumKnown && record.curriculum.professionalYear === curriculum;
}

// The excluded-record disclosure is computed from the live slice: date and
// attempt-type filters are applied first, then whatever the curriculum-side
// filters drop for want of proven context is counted exactly.
function filterHistoryRecords(records, filter = {}, now = Date.now()) {
  const bounds = getHistoryDateBounds(filter, now);
  const attemptType = String(filter?.attemptType || "all");

  const undated = [];
  const baseSlice = [];

  for (const record of records || []) {
    if (attemptType !== "all" && record.attemptTypeId !== attemptType) continue;
    if (!matchesHistoryDateBounds(record, bounds)) {
      if (record.timestampMs === null) undated.push(record);
      continue;
    }
    baseSlice.push(record);
  }

  const kept = baseSlice.filter((record) => matchesCurriculumScope(record, filter));
  const keptSet = new Set(kept);
  const activeScopes = getActiveScopeFilters(filter);

  // Two independent reasons an excluded record deserves an explanation:
  // its curriculum was never proven, or it is classified but never recorded
  // the dimension being filtered on. A record can qualify for both; each
  // sentence is individually true, and `excludedDisclosedCount` counts the
  // distinct records so callers can assert shown + disclosed + genuinely
  // out-of-scope == the slice.
  const excludedUnclassified = [];
  const missingScopeCounts = {};
  const disclosed = new Set();

  for (const record of baseSlice) {
    if (keptSet.has(record)) continue;

    if (!record.curriculumKnown) {
      excludedUnclassified.push(record);
      disclosed.add(record);
    }

    for (const scope of activeScopes) {
      if (hasScopeValue(record, scope.field)) continue;
      missingScopeCounts[scope.key] = (missingScopeCounts[scope.key] || 0) + 1;
      disclosed.add(record);
    }
  }

  return {
    records: kept,
    bounds,
    excludedUnclassifiedCount: excludedUnclassified.length,
    missingScopeCounts,
    excludedMissingScopeCount: Object.values(missingScopeCounts).reduce((sum, count) => sum + count, 0),
    excludedDisclosedCount: disclosed.size,
    excludedUndatedCount: undated.length
  };
}

function summarizeHistoryRecords(records) {
  const days = new Set();
  let totalQuestions = 0;
  let bestStreak = 0;
  let unscorableAttempts = 0;
  const ratios = [];

  for (const record of records || []) {
    if (Number.isFinite(record.total) && record.total > 0) totalQuestions += record.total;
    if (record.scoreRatio === null) unscorableAttempts += 1;
    else ratios.push(record.scoreRatio);
    if (Number.isFinite(record.bestStreak)) bestStreak = Math.max(bestStreak, record.bestStreak);
    if (record.dayKey) days.add(record.dayKey);
  }

  return {
    attempts: (records || []).length,
    totalQuestions,
    averageRatio: averageRatios(ratios),
    scoredAttempts: ratios.length,
    unscorableAttempts,
    bestStreak,
    studyDays: days.size
  };
}

// True only when history is actually at the retention cap and the current view
// reaches the oldest record still retained.
function isHistoryRetentionBoundaryReached(allRecords, visibleRecords) {
  if ((allRecords || []).length < HISTORY_RETENTION_LIMIT) return false;
  return (visibleRecords || []).some((record) => record.index === 0);
}

function buildHistoryFamilies(records) {
  const families = new Map();

  for (const record of records || []) {
    if (!families.has(record.familyKey)) {
      families.set(record.familyKey, {
        key: record.familyKey,
        label: record.familyLabel,
        attemptTypeId: record.attemptTypeId,
        attemptTypeLabel: record.attemptTypeLabel,
        mode: record.mode,
        attempts: []
      });
    }
    families.get(record.familyKey).attempts.push(record);
  }

  return [...families.values()]
    .map((family) => {
      const attempts = sortRecordsNewestFirst(family.attempts);
      const ratios = attempts.map((attempt) => attempt.scoreRatio).filter((ratio) => ratio !== null);
      const questionCounts = [...new Set(
        attempts.map((attempt) => attempt.total).filter((total) => Number.isFinite(total) && total > 0)
      )].sort((a, b) => a - b);

      return {
        ...family,
        attempts,
        attemptCount: attempts.length,
        questionCounts,
        // A single averaged score is only honest when every attempt in the
        // family asked the same number of questions.
        mixedQuestionCounts: questionCounts.length > 1,
        averageRatio: questionCounts.length > 1 ? null : averageRatios(ratios),
        bestRatio: ratios.length ? Math.max(...ratios) : null,
        latestTimestampMs: attempts.find((attempt) => attempt.timestampMs !== null)?.timestampMs ?? null
      };
    })
    .sort((a, b) => b.attemptCount - a.attemptCount || a.label.localeCompare(b.label));
}

// Chains associate attempts through the recorded root identity. Scores are
// never merged, and a chain is never inferred where lineage is absent.
function buildHistoryChains(records) {
  const chains = new Map();

  for (const record of records || []) {
    const rootAttemptId = record.chain?.rootAttemptId || record.chain?.attemptId || "";
    if (!rootAttemptId) continue;
    if (!chains.has(rootAttemptId)) chains.set(rootAttemptId, { rootAttemptId, attempts: [] });
    chains.get(rootAttemptId).attempts.push(record);
  }

  return [...chains.values()]
    .filter((chain) => chain.attempts.length > 1)
    .map((chain) => {
      const attempts = sortRecordsNewestFirst(chain.attempts);
      return {
        ...chain,
        attempts,
        attemptCount: attempts.length,
        quizWeek: attempts.find((attempt) => attempt.curriculum.quizWeek)?.curriculum.quizWeek ?? null,
        latestTimestampMs: attempts.find((attempt) => attempt.timestampMs !== null)?.timestampMs ?? null
      };
    })
    .sort((a, b) => (b.latestTimestampMs ?? 0) - (a.latestTimestampMs ?? 0));
}

function countBy(records, resolve) {
  const counts = new Map();
  for (const record of records || []) {
    const key = resolve(record);
    if (key === "" || key === null || key === undefined) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function getAvailableAttemptTypes(records) {
  const counts = countBy(records, (record) => record.attemptTypeId);
  return ATTEMPT_TYPES
    .filter((type) => counts.has(type.id))
    .map((type) => ({ ...type, count: counts.get(type.id) }));
}

function getAvailableCurriculumOptions(records) {
  const counts = countBy(records, (record) => record.curriculum.professionalYear || "unclassified");
  const known = [...counts.keys()]
    .filter((key) => key !== "unclassified")
    .sort()
    .map((key) => ({ id: key, label: key, count: counts.get(key) }));

  if (counts.has("unclassified")) {
    known.push({ id: "unclassified", label: "Unclassified", count: counts.get("unclassified") });
  }
  return known;
}

// Scope controls are derived from the slice already in view, so they never
// advertise a semester, lab, or week with no records behind it.
function getAvailableScopeOptions(records, field) {
  const counts = countBy(records, (record) => {
    const value = record.curriculum[field];
    return value === undefined || value === null ? "" : String(value);
  });

  return [...counts.entries()]
    .sort((a, b) => (field === "quizWeek" ? Number(a[0]) - Number(b[0]) : a[0].localeCompare(b[0])))
    .map(([id, count]) => ({ id, label: field === "quizWeek" ? `Week ${id}` : id, count }));
}

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

  initHistoryFilterControls();

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

  // Same rule as the Review Queue page: no positive wrong-answer count means
  // no wrong-answer claim. A bare lastUserAnswer is not a substitute.
  if (temptingWrong) {
    parts.push(`Most tempting wrong answer: ${temptingWrong}`);
  }

  parts.push(`Missed ${missCount} time${missCount === 1 ? "" : "s"}`);
  return parts.join(" • ");
}

function buildReviewQueuePlaylistQuestion(entry) {
  const quizId = String(entry?.quizId || "").trim();
  const sourceTitle = reviewQueueStore?.getDisplayTitle
    ? reviewQueueStore.getDisplayTitle(entry)
    : (entry.title || quizCatalog?.getEntry?.(quizId)?.title || quizCatalog?.buildDynamicQuizLabel?.(quizId) || quizId || "Review Queue");

  const question = {
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

  // A strict fill-in-the-blank must score identically whether it was launched
  // from the Review Queue page or from here. The marker is copied only when it
  // is actually valid, and accepted answers only alongside it, so a missing or
  // malformed marker can never broaden matching.
  const answerMatching = entry?.metadata?.answerMatching;
  if (answerMatching?.spellingSensitive === true
      && answerMatching?.capitalizationSensitive === false) {
    question.metadata = {
      answerMatching: {
        spellingSensitive: true,
        capitalizationSensitive: false
      }
    };
    if (Array.isArray(entry?._acceptedAnswers)) {
      question._acceptedAnswers = [...entry._acceptedAnswers];
    }
  }

  return question;
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
  renderRecordedAttemptDashboard(normalizeHistoryRecords(history));
}

// --- P2F-08: RECORDED-ATTEMPT DASHBOARD -------------------------------------
// Filters here scope history-derived regions only. The Review Queue, Most
// Missed, and Question Reports are separate stores answering a different
// question, and are never touched by these controls.

let historyDashboardState = null;

const HISTORY_FILTER_CONTROLS = Object.freeze([
  Object.freeze({ id: "filter-date", key: "range" }),
  Object.freeze({ id: "filter-curriculum", key: "curriculum" }),
  Object.freeze({ id: "filter-attempt-type", key: "attemptType" }),
  Object.freeze({ id: "filter-semester", key: "semester" }),
  Object.freeze({ id: "filter-lab", key: "lab" }),
  Object.freeze({ id: "filter-week", key: "week" }),
  Object.freeze({ id: "filter-custom-start", key: "customStart" }),
  Object.freeze({ id: "filter-custom-end", key: "customEnd" })
]);

function getDefaultHistoryFilter() {
  return {
    range: "all",
    curriculum: "all",
    attemptType: "all",
    semester: "all",
    lab: "all",
    week: "all",
    customStart: "",
    customEnd: ""
  };
}

function initHistoryFilterControls() {
  for (const control of HISTORY_FILTER_CONTROLS) {
    document.getElementById(control.id)?.addEventListener("change", (event) => {
      applyHistoryFilterChange(control.key, event?.target?.value);
    });
  }

  document.getElementById("reset-history-filters")?.addEventListener("click", () => {
    if (!historyDashboardState) return;
    renderRecordedAttemptDashboard(historyDashboardState.records, getDefaultHistoryFilter());
  });
}

// Changing a filter only re-derives the view; it never writes anything.
function applyHistoryFilterChange(key, value) {
  if (!historyDashboardState) return null;
  const filter = { ...historyDashboardState.filter, [key]: String(value ?? "") };
  return renderRecordedAttemptDashboard(historyDashboardState.records, filter);
}

// Every control's options are counted against all the OTHER active filters
// (faceted), so an option never advertises records the current view cannot
// actually show. A selection is never cleared behind the user's back: one that
// matches nothing is kept exactly as set, shown with a zero count, and
// disclosed, so narrowing then widening always returns the user's own choices.
function resolveHistoryView(records, rawFilter, now = Date.now()) {
  const filter = { ...getDefaultHistoryFilter(), ...(rawFilter || {}) };

  // A <select> whose current option list no longer contains its value reports
  // "" on change. An empty value is the absence of a choice, not a filter, so
  // it normalizes to "all" instead of rendering as a phantom active filter.
  for (const key of ["range", "curriculum", "attemptType", "semester", "lab", "week"]) {
    if (!String(filter[key] ?? "").trim()) filter[key] = "all";
  }

  const facet = (key) => filterHistoryRecords(records, { ...filter, [key]: "all" }, now).records;

  const unmatchedFilters = [];
  const keepSelection = (options, key, noun, labelFor) => {
    const selected = String(filter[key] || "all");
    if (selected === "all" || options.some((option) => option.id === selected)) return options;

    const label = labelFor(selected);
    unmatchedFilters.push({ key, noun, label });
    return [...options, { id: selected, label, count: 0, unmatched: true }];
  };

  const options = {
    attemptTypes: keepSelection(
      getAvailableAttemptTypes(facet("attemptType")),
      "attemptType", "attempt type", (id) => ATTEMPT_TYPE_LABELS[id] || id
    ),
    curricula: keepSelection(
      getAvailableCurriculumOptions(facet("curriculum")),
      "curriculum", "curriculum", (id) => (id === "unclassified" ? "Unclassified" : id)
    ),
    semesters: keepSelection(
      getAvailableScopeOptions(facet("semester"), "semester"),
      "semester", "semester", (id) => id
    ),
    labs: keepSelection(
      getAvailableScopeOptions(facet("lab"), "lab"),
      "lab", "lab", (id) => id
    ),
    weeks: keepSelection(
      getAvailableScopeOptions(facet("week"), "quizWeek"),
      "week", "week", (id) => `Week ${id}`
    )
  };

  const result = filterHistoryRecords(records, filter, now);
  return {
    ...result,
    filter,
    options,
    unmatchedFilters,
    summary: summarizeHistoryRecords(result.records),
    retentionBoundaryReached: isHistoryRetentionBoundaryReached(records, result.records)
  };
}

function renderRecordedAttemptDashboard(records, rawFilter, now = Date.now()) {
  const view = resolveHistoryView(records, rawFilter || getDefaultHistoryFilter(), now);
  historyDashboardState = { records, filter: view.filter };

  renderHistoryFilterControls(view);
  renderHistoryScope(view, records);
  renderHistoryOverview(view.summary);
  const hasAnyRecords = (records || []).length > 0;
  renderHistoryFamilies(buildHistoryFamilies(view.records), hasAnyRecords);
  renderAttemptTypePerformance(view.records, hasAnyRecords);
  renderHistoryChains(buildHistoryChains(view.records));
  renderRecentActivity(sortRecordsNewestFirst(view.records).slice(0, 10), hasAnyRecords);
  renderCategoryPerformance(view.records);
  return view;
}

function setTextContent(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setFieldHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.hidden = Boolean(hidden);
}

function fillSelect(id, options, selected) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = options
    .map((option) => `<option value="${sanitize(option.id)}"${option.id === selected ? " selected" : ""}>${sanitize(option.label)}</option>`)
    .join("");
  el.value = selected;
}

function withCount(label, count) {
  return Number.isFinite(count) ? `${label} (${count})` : label;
}

function renderHistoryFilterControls(view) {
  const { filter, options } = view;

  fillSelect("filter-date", HISTORY_DATE_RANGES.map((range) => ({ id: range.id, label: range.label })), filter.range);
  setFieldHidden("filter-custom-range", filter.range !== "custom");

  const customStart = document.getElementById("filter-custom-start");
  if (customStart) customStart.value = filter.customStart || "";
  const customEnd = document.getElementById("filter-custom-end");
  if (customEnd) customEnd.value = filter.customEnd || "";

  fillSelect("filter-curriculum", [
    { id: "all", label: "All" },
    ...options.curricula.map((option) => ({ id: option.id, label: withCount(option.label, option.count) }))
  ], filter.curriculum);

  fillSelect("filter-attempt-type", [
    { id: "all", label: "All" },
    ...options.attemptTypes.map((option) => ({ id: option.id, label: withCount(option.label, option.count) }))
  ], filter.attemptType);

  const scopeFields = [
    ["filter-semester", "filter-semester-field", options.semesters, filter.semester],
    ["filter-lab", "filter-lab-field", options.labs, filter.lab],
    ["filter-week", "filter-week-field", options.weeks, filter.week]
  ];

  for (const [selectId, fieldId, scopeOptions, selected] of scopeFields) {
    // A dimension with nothing behind it is hidden rather than implying that
    // every recorded attempt carries metadata it never had.
    setFieldHidden(fieldId, scopeOptions.length === 0);
    fillSelect(selectId, [
      { id: "all", label: "All" },
      ...scopeOptions.map((option) => ({ id: option.id, label: withCount(option.label, option.count) }))
    ], selected);
  }
}

function buildHistoryScopeSummary(view, allRecords) {
  const total = (allRecords || []).length;
  if (!total) return "No recorded attempts yet.";

  const parts = [`Showing ${view.records.length} of ${total} recorded attempt${total === 1 ? "" : "s"}`];
  parts.push(HISTORY_DATE_RANGES.find((range) => range.id === view.filter.range)?.label || "All time");
  if (view.filter.curriculum !== "all") {
    parts.push(view.filter.curriculum === "unclassified" ? "Unclassified" : view.filter.curriculum);
  }
  if (view.filter.attemptType !== "all") {
    parts.push(ATTEMPT_TYPE_LABELS[view.filter.attemptType] || view.filter.attemptType);
  }
  if (view.filter.semester !== "all") parts.push(view.filter.semester);
  if (view.filter.lab !== "all") parts.push(view.filter.lab);
  if (view.filter.week !== "all") parts.push(`Week ${view.filter.week}`);
  return parts.join(" · ");
}

// Every disclosed count is computed from the live slice, never hardcoded.
function buildHistoryDisclosure(view) {
  const notes = [];

  if (view.excludedUnclassifiedCount > 0) {
    const count = view.excludedUnclassifiedCount;
    notes.push(`${count} recorded attempt${count === 1 ? " is" : "s are"} unclassified and ${count === 1 ? "is" : "are"} not included in this filtered view.`);
  }

  for (const scope of HISTORY_SCOPE_FILTERS) {
    const count = view.missingScopeCounts?.[scope.key] || 0;
    if (count <= 0) continue;
    notes.push(`${count} recorded attempt${count === 1 ? " has" : "s have"} no saved ${scope.noun}, so ${count === 1 ? "it is" : "they are"} not included in this filtered view.`);
  }

  for (const unmatched of view.unmatchedFilters || []) {
    notes.push(`No recorded attempts in this view match the selected ${unmatched.noun} "${unmatched.label}". That choice was kept as you set it — widen or reset the filters to see more.`);
  }

  if (view.excludedUndatedCount > 0) {
    const count = view.excludedUndatedCount;
    notes.push(`${count} recorded attempt${count === 1 ? " has" : "s have"} no saved date, so ${count === 1 ? "it cannot" : "they cannot"} be placed in a date range.`);
  }

  if (view.retentionBoundaryReached) {
    notes.push(`This view reaches the oldest attempt still saved: Pharm-let keeps up to the most recent ${HISTORY_RETENTION_LIMIT} recorded attempts on this browser.`);
  }

  const conflicts = view.records.filter((record) => record.modeConflict).length;
  if (conflicts > 0) {
    notes.push(`${conflicts} recorded attempt${conflicts === 1 ? "" : "s"} stored a mode that disagrees with its saved attempt type; the saved attempt type was used and both values were left untouched.`);
  }

  return notes.join(" ");
}

function renderHistoryScope(view, allRecords) {
  setTextContent("history-filter-summary", buildHistoryScopeSummary(view, allRecords));
  setTextContent("history-disclosure", buildHistoryDisclosure(view));

  const summary = view.summary;
  let scopeNote = summary.attempts
    ? `Metrics for the ${summary.attempts} recorded attempt${summary.attempts === 1 ? "" : "s"} in the selected view, not lifetime totals.`
    : getEmptyHistoryMessage((allRecords || []).length > 0);
  if (summary.unscorableAttempts > 0) {
    scopeNote += ` ${summary.unscorableAttempts} attempt${summary.unscorableAttempts === 1 ? "" : "s"} had no usable score and ${summary.unscorableAttempts === 1 ? "is" : "are"} left out of the average.`;
  }
  setTextContent("overview-scope", scopeNote);
}

function getEmptyHistoryMessage(hasAnyRecords) {
  return hasAnyRecords
    ? "No recorded attempts match the selected filters."
    : "No recorded attempts yet. Finish a quiz and it will appear here.";
}

function renderHistoryOverview(summary) {
  setTextContent("total-questions", String(summary.totalQuestions));
  setTextContent("avg-score", formatRatioPercent(summary.averageRatio));
  setTextContent("best-streak", String(summary.bestStreak));
  setTextContent("study-days", String(summary.studyDays));
}

function describeAttempt(record) {
  const score = record.scoreRatio === null
    ? "Score unavailable"
    : `${record.score}/${record.total} (${formatRatioPercent(record.scoreRatio, 0)})`;
  const when = record.timestampMs === null ? "date not recorded" : getTimeAgo(new Date(record.timestampMs));
  const notes = [];
  if (record.chain?.remixGeneration) notes.push(`Remix generation ${record.chain.remixGeneration}`);
  if (record.modeConflict) notes.push(`stored mode "${record.mode}"`);
  return { score, when, notes: notes.join(" · ") };
}

function renderHistoryFamilies(families, hasAnyRecords) {
  const container = document.getElementById("quiz-stats");
  if (!container) return;

  if (!families.length) {
    container.innerHTML = `<p style="color:var(--muted)">${sanitize(getEmptyHistoryMessage(hasAnyRecords))}</p>`;
    return;
  }

  container.innerHTML = "";
  families.forEach((family) => {
    // Differently sized attempts never collapse into one averaged score.
    const headline = family.mixedQuestionCounts
      ? `Best ${formatRatioPercent(family.bestRatio)}`
      : formatRatioPercent(family.averageRatio);
    const detail = family.mixedQuestionCounts
      ? `Mixed sizes: ${family.questionCounts.join(", ")} questions`
      : `Best: ${formatRatioPercent(family.bestRatio)}`;
    const modeLabel = family.mode ? `Mode: ${sanitize(family.mode)} · ` : "";
    const attemptRows = family.attempts.map((attempt) => {
      const described = describeAttempt(attempt);
      return `<div class="attempt-row">
          <span>${sanitize(described.score)}</span>
          <span class="attempt-meta">${sanitize([described.when, described.notes].filter(Boolean).join(" · "))}</span>
        </div>`;
    }).join("");

    const div = document.createElement("div");
    div.className = "p-3 rounded-lg";
    div.style.background = "var(--accent-light, rgba(139,30,63,0.1))";
    div.innerHTML = `
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div class="min-w-0">
          <div class="font-semibold">${sanitize(family.label)}</div>
          <div class="mt-1"><span class="attempt-badge">${sanitize(family.attemptTypeLabel)}</span></div>
          <div class="text-sm mt-1" style="color:var(--muted)">${modeLabel}${family.attemptCount} attempt${family.attemptCount === 1 ? "" : "s"}</div>
        </div>
        <div class="text-right">
          <div class="font-semibold" style="color:var(--accent)">${sanitize(headline)}</div>
          <div class="text-sm" style="color:var(--muted)">${sanitize(detail)}</div>
        </div>
      </div>
      <div class="mt-3">${attemptRows}</div>
    `;
    container.appendChild(div);
  });
}

function buildAttemptTypeStats(records) {
  const groups = new Map();
  for (const record of records || []) {
    if (!groups.has(record.attemptTypeId)) groups.set(record.attemptTypeId, []);
    groups.get(record.attemptTypeId).push(record);
  }

  return ATTEMPT_TYPES
    .filter((type) => groups.has(type.id))
    .map((type) => {
      const attempts = groups.get(type.id);
      const ratios = attempts.map((attempt) => attempt.scoreRatio).filter((ratio) => ratio !== null);
      return {
        id: type.id,
        label: type.label,
        attemptCount: attempts.length,
        averageRatio: averageRatios(ratios),
        bestRatio: ratios.length ? Math.max(...ratios) : null,
        totalQuestions: attempts.reduce(
          (sum, attempt) => sum + (Number.isFinite(attempt.total) && attempt.total > 0 ? attempt.total : 0),
          0
        )
      };
    });
}

function renderAttemptTypePerformance(records, hasAnyRecords) {
  const container = document.getElementById("attempt-type-stats");
  if (!container) return;

  const stats = buildAttemptTypeStats(records);
  if (!stats.length) {
    container.innerHTML = `<p style="color:var(--muted)">${sanitize(getEmptyHistoryMessage(hasAnyRecords))}</p>`;
    return;
  }

  container.innerHTML = "";
  stats.forEach((stat) => {
    const div = document.createElement("div");
    div.className = "stat-card";
    div.innerHTML = `
      <div class="stat-label">${sanitize(stat.label)}</div>
      <div class="stat-value">${formatRatioPercent(stat.averageRatio)}</div>
      <div class="text-sm mt-2" style="color:var(--muted)">
        ${stat.attemptCount} attempt${stat.attemptCount === 1 ? "" : "s"} · ${stat.totalQuestions} question${stat.totalQuestions === 1 ? "" : "s"} · best ${formatRatioPercent(stat.bestRatio)}
      </div>
    `;
    container.appendChild(div);
  });
}

function describeChainMember(record, chain) {
  const parts = [record.attemptTypeLabel];
  const attemptId = record.chain?.attemptId || "";
  const parentAttemptId = record.chain?.parentAttemptId || "";

  if (attemptId && attemptId === chain.rootAttemptId) {
    parts.push("start of chain");
  } else if (parentAttemptId) {
    const parent = chain.attempts.find((candidate) => candidate.chain?.attemptId === parentAttemptId);
    parts.push(parent ? `follows ${parent.attemptTypeLabel}` : "continues the chain");
  }

  if (record.chain?.remixGeneration) parts.push(`Remix generation ${record.chain.remixGeneration}`);
  return parts.join(" · ");
}

function renderHistoryChains(chains) {
  const section = document.getElementById("fall-chain-section");
  const container = document.getElementById("fall-chains");
  if (section) section.hidden = chains.length === 0;
  if (!container) return;

  if (!chains.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = "";
  chains.forEach((chain) => {
    // Chains read chronologically, oldest attempt first.
    const members = [...chain.attempts].reverse().map((record) => {
      const described = describeAttempt(record);
      return `<div class="attempt-row">
          <span>${sanitize(described.score)}</span>
          <span class="attempt-meta">${sanitize(describeChainMember(record, chain))}</span>
        </div>`;
    }).join("");

    const heading = chain.quizWeek ? `Week ${chain.quizWeek} chain` : "Challenge chain";
    const div = document.createElement("div");
    div.className = "rounded-xl border border-[var(--ring)] p-4";
    div.style.background = "var(--accent-light, rgba(139,30,63,0.06))";
    div.innerHTML = `
      <div class="font-semibold">${sanitize(heading)} · ${chain.attemptCount} attempt${chain.attemptCount === 1 ? "" : "s"}</div>
      <div class="mt-2">${members}</div>
    `;
    container.appendChild(div);
  });
}

function renderRecentActivity(records, hasAnyRecords) {
  const container = document.getElementById("recent-activity");
  if (!container) return;

  if (!records.length) {
    container.innerHTML = `<p style="color:var(--muted)">${sanitize(hasAnyRecords ? "No recent activity in the selected view." : "No recent activity yet.")}</p>`;
    return;
  }

  container.innerHTML = "";
  records.forEach((record) => {
    const described = describeAttempt(record);
    const div = document.createElement("div");
    div.className = "flex flex-wrap justify-between items-center gap-2";
    div.innerHTML = `
      <div class="min-w-0">
        <span class="font-semibold">${sanitize(record.title || record.quizId)}</span>
        <span class="text-sm" style="color:var(--muted)"> · ${sanitize(record.attemptTypeLabel)}</span>
      </div>
      <div class="text-sm" style="color:var(--muted)">
        ${sanitize(described.score)} · ${sanitize(described.when)}
      </div>
    `;
    container.appendChild(div);
  });
}

function renderCategoryPerformance(records) {
  const container = document.getElementById("category-stats");
  if (!container) return;

  const categories = new Map();
  for (const record of records) {
    const category = record.categoryLabel || "Other";
    if (!categories.has(category)) categories.set(category, { ratios: [], total: 0, correct: 0 });

    const bucket = categories.get(category);
    if (record.scoreRatio !== null) {
      bucket.ratios.push(record.scoreRatio);
      bucket.total += record.total;
      bucket.correct += record.score;
    }
  }

  container.innerHTML = "";
  for (const [category, bucket] of categories.entries()) {
    const overallRatio = getScoreRatio(bucket.correct, bucket.total);
    const div = document.createElement("div");
    div.className = "stat-card";
    div.innerHTML = `
      <div class="stat-label">${sanitize(category)}</div>
      <div class="stat-value">${formatRatioPercent(averageRatios(bucket.ratios))}</div>
      <div class="text-sm mt-2" style="color:var(--muted)">
        ${bucket.total > 0 ? `${bucket.correct}/${bucket.total} questions correct (${formatRatioPercent(overallRatio)})` : "No scorable attempts recorded"}
      </div>
    `;
    container.appendChild(div);
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
    const legacyMetaParts = [
      report.title || report.quizId || "",
      report.mode || "",
      report.questionFamily || "",
      report.drugGeneric ? `Drug: ${report.drugGeneric}` : ""
    ].filter(Boolean).map((part) => sanitize(part));
    const timestamp = report.timestamp ? new Date(report.timestamp) : null;
    const when = timestamp && !Number.isNaN(timestamp.getTime()) ? getTimeAgo(timestamp) : "saved locally";
    const reasonLabel = questionReportsStore?.getReasonLabel?.(report.reportReason) || "";
    const sourceMaterial = toPlainText(report.sourceMaterial);
    const answerMatching = report.answerMatching && typeof report.answerMatching === "object"
      ? [
        report.answerMatching.spellingSensitive === true
          ? "spelling-sensitive"
          : report.answerMatching.spellingSensitive === false
            ? "spelling-tolerant"
            : "",
        report.answerMatching.capitalizationSensitive === true
          ? "capitalization-sensitive"
          : report.answerMatching.capitalizationSensitive === false
            ? "capitalization-insensitive"
            : ""
      ].filter(Boolean).join(", ")
      : "";
    const traceEntries = [
      ["Week", report.requestedQuizWeek],
      ["Domain", report.knowledgeDomain],
      ["Material", sourceMaterial ? sourceMaterial.charAt(0).toUpperCase() + sourceMaterial.slice(1) : ""],
      ["Source drug", report.sourceDrugId],
      ["Source drug records", Array.isArray(report.sourceDrugIds) && report.sourceDrugIds.length > 1 ? report.sourceDrugIds.join(", ") : ""],
      ["Variant", report.questionVariant],
      ["Seed", report.seed],
      ["Question ID", report.questionId],
      ["Generator", report.generatorId],
      ["Answer matching", answerMatching]
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim());
    const traceMarkup = traceEntries.length
      ? `<dl class="mt-3 grid gap-2 sm:grid-cols-2">${traceEntries.map(([label, value]) => `
          <div class="min-w-0 rounded-lg border border-[var(--ring)] px-3 py-2">
            <dt class="text-[10px] font-black uppercase tracking-[0.12em]" style="color:var(--muted)">${sanitize(label)}</dt>
            <dd class="mt-1 break-words text-xs font-semibold">${sanitize(toPlainText(value))}</dd>
          </div>`).join("")}</dl>`
      : "";

    div.innerHTML = `
      <div class="space-y-2">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="font-semibold">${prompt || "Untitled question report"}</div>
          ${reasonLabel ? `<span class="shrink-0 self-start rounded-full border border-[var(--ring)] px-2.5 py-1 text-xs font-bold">${sanitize(reasonLabel)}</span>` : `<span class="shrink-0 self-start rounded-full border border-[var(--ring)] px-2.5 py-1 text-xs" style="color:var(--muted)">Legacy report</span>`}
        </div>
        <div class="text-sm" style="color:var(--muted)">Expected answer: <span class="font-medium" style="color:var(--text)">${correctAnswer}</span></div>
        <div class="text-sm" style="color:var(--muted)">Your answer: <span class="font-medium" style="color:var(--bad)">${userAnswer}</span></div>
        ${note ? `<div class="text-sm" style="color:var(--muted)">Note: <span class="font-medium" style="color:var(--text)">${note}</span></div>` : ""}
        ${traceMarkup}
        <div class="text-xs" style="color:var(--muted)">${legacyMetaParts.join(" · ")}${legacyMetaParts.length ? " · " : ""}${sanitize(when)}</div>
        <div class="flex flex-col gap-2 pt-2 sm:flex-row">
          <button type="button" class="copy-question-report btn btn-blue" aria-label="Copy report for ${prompt || "this question"}">Copy Report</button>
          <button type="button" class="delete-question-report btn btn-ghost" aria-label="Delete report for ${prompt || "this question"}">Delete</button>
        </div>
      </div>
    `;

    div.querySelector(".copy-question-report")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (!questionReportsStore?.copyReport) throw new Error("Question report copying is unavailable.");
        await questionReportsStore.copyReport(report);
        button.textContent = "Copied";
        setQuestionReportStatus("Copied a concise question report to the clipboard.", "good");
      } catch (error) {
        setQuestionReportStatus(error?.message || "Unable to copy this report.", "bad");
      } finally {
        window.setTimeout(() => {
          button.textContent = "Copy Report";
          button.disabled = false;
        }, 1200);
      }
    });

    div.querySelector(".delete-question-report")?.addEventListener("click", () => {
      if (!confirm("Delete this question report from this browser?")) return;
      if (!questionReportsStore?.deleteReport) {
        setQuestionReportStatus("Question report deletion is unavailable.", "bad");
        return;
      }
      questionReportsStore.deleteReport(report);
      const nextReports = getQuestionReports();
      renderQuestionReports(nextReports);
      setQuestionReportStatus("Question report deleted.", "good");
    });

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
  if (questionReportsStore?.loadReports) {
    return questionReportsStore.loadReports()
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }
  try {
    const raw = localStorage.getItem(QUESTION_REPORTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((report) => report && typeof report === "object" && !Array.isArray(report))
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
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

  if (questionReportsStore?.clearReports) questionReportsStore.clearReports();
  else localStorage.removeItem(QUESTION_REPORTS_KEY);
  renderQuestionReports([]);
  setQuestionReportStatus("Question reports cleared.", "good");
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
