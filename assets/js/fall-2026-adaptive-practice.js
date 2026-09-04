// Performance-Guided Adaptive Practice for Fall 2026 Lab III (F26-10).
//
// This module never generates question material of its own. It asks the
// existing, unmodified Fall generator for a broad deterministic candidate pool
// and then ranks and selects from that pool using longitudinal performance
// signals. Question text, choices, answers, and answer contracts are passed
// through untouched, so selection can never change what is correct.
//
// Trust boundary: historical `wrongCounts` is deliberately NOT read anywhere in
// this file. Pre-P2F-09 values may contain normalization inflation, and there
// is no way to separate genuine events from phantom folds without guessing, so
// answer-frequency magnitude never influences selection. The signals used here
// (`missCount`, `reviewMissCount`, `clearStreak`, archived/refresh-due state,
// miss recency, exposure, and recent attempt history) were unaffected by that
// bug.

import { generateFall2026Quiz } from "./fall-2026-quiz-generator.js?v=20260827a";

export const ADAPTIVE_KIND = "fall-2026-lab3-adaptive";
export const ADAPTIVE_MEMORY_KEY = "pharmlet.fall-2026-lab3.adaptive-memory";
export const ADAPTIVE_MEMORY_VERSION = 1;
export const ADAPTIVE_ROUND_SIZE = 10;
export const ADAPTIVE_MIN_WEEK = 1;
export const ADAPTIVE_MAX_WEEK = 10;
export const ADAPTIVE_TIMER_SECONDS = 10 * 60;
export const ADAPTIVE_GENERATOR_ID = "fall-2026-p2-lab3-deterministic-generator";

// Remembered rounds used for anti-repetition. Short on purpose: long memory
// would starve the pool and turn "avoid repeats" into "never revisit".
export const ADAPTIVE_MEMORY_ROUNDS = 5;

// Selection targets, not quotas. A bucket that cannot be filled safely gives
// its remaining slots back rather than inventing material.
export const ADAPTIVE_BUCKET_TARGETS = Object.freeze({
  weakness: 4,
  refresh: 2,
  coverage: 2,
  balanced: 2
});

export const ADAPTIVE_BUCKET_ORDER = Object.freeze(["weakness", "refresh", "coverage", "balanced"]);

const MASTERED_STREAK_TARGET = 3;
const MASTERED_REFRESH_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;
const MASTERED_REFRESH_MS = MASTERED_REFRESH_DAYS * DAY_MS;

// Scoring weights. Positive terms raise priority, negative terms lower it.
export const ADAPTIVE_WEIGHTS = Object.freeze({
  itemMiss: 3.0,          // this exact question has been missed
  itemReviewMiss: 2.0,    // and missed again inside a review round
  missRecency: 1.5,       // recent misses matter more than old ones
  drugWeakness: 1.1,      // other questions about the same drug are weak
  domainWeakness: 0.6,    // this knowledge domain is weak generally
  freshCoverage: 1.2,     // no weakness evidence and not served recently
  refreshDue: 2.4,        // mastered long enough ago to be worth revisiting
  masteryPenalty: 2.2,    // currently strong material steps aside
  repeatFingerprint: 5.0, // served very recently as the identical item
  repeatConcept: 1.0      // same drug+domain served very recently
});

// --- small deterministic helpers ---------------------------------------------

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashString(seed) || 1;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return stripHtml(value).toLowerCase();
}

function serializeAnswer(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).sort().join("||");
  }
  return normalizeText(value);
}

function toTimestamp(value) {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(numeric) ? numeric : 0;
}

function positiveInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertAdaptiveWeek(targetWeek) {
  const week = Number(targetWeek);
  if (!Number.isInteger(week) || week < ADAPTIVE_MIN_WEEK || week > ADAPTIVE_MAX_WEEK) {
    throw new Error(`Adaptive Practice is available for Weeks ${ADAPTIVE_MIN_WEEK}-${ADAPTIVE_MAX_WEEK}.`);
  }
  return week;
}

// --- question identity --------------------------------------------------------

// Whitespace-free comparison form. A candidate's prompt is read as HTML and a
// stored Review Queue entry's `promptText` has already had its tags removed by
// the store, which does not insert a space where a tag was. That makes
// "dizziness ?" and "dizziness?" the same question written two ways, so every
// space is dropped before comparing rather than merely collapsed.
function toComparableText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

// Adaptive identity is CONTENT, never a generator id. Preferring `question.id`
// would tie deduplication and anti-repetition to whether generator ids happen
// to be stable, positional, or seed-dependent - two seeds can emit the same
// question under different ids, and adaptive would then serve it twice. The
// generator and its ids are unchanged; adaptive simply does not depend on them.
function buildContentKey(source) {
  const prompt = toComparableText(source?.promptText || source?.prompt);
  const rawAnswer = source?.answer !== undefined ? source.answer : source?.answerText;
  const answer = Array.isArray(rawAnswer)
    ? serializeAnswer(rawAnswer).replace(/\s+/g, "")
    : toComparableText(rawAnswer);
  if (!prompt || !answer) return "";
  return `${prompt}||${answer}`;
}

// Exact-question identity, used to avoid serving the same question twice.
// Same prompt+answer is the same adaptive question even under different ids;
// different prompt+answer stays distinct even if ids collide.
export function getQuestionFingerprint(question) {
  return buildContentKey(question);
}

// Coarser identity: the drug/knowledge-domain pairing being tested. Used to
// keep a round from circling one concept even when the wording differs.
export function getQuestionConceptKey(question) {
  const metadata = isRecord(question?.metadata) ? question.metadata : {};
  const drug = String(metadata.sourceDrugId || "").trim();
  const domain = String(metadata.knowledgeDomain || "").trim();
  if (!drug && !domain) return "";
  return `${drug}::${domain}`;
}

// The key a Review Queue entry and a candidate question share when they are
// the same question. Prompt plus answer only - never an inferred drug match,
// and the same content basis adaptive uses for question identity.
export function getPerformanceKey(source) {
  return buildContentKey(source);
}

export function getQuestionWeek(question) {
  return positiveInt(question?.metadata?.requestedQuizWeek);
}

// Every week a question depends on, for hard week-ceiling enforcement.
export function getQuestionSourceWeeks(question) {
  const metadata = isRecord(question?.metadata) ? question.metadata : {};
  const weeks = [
    metadata.requestedQuizWeek,
    metadata.sourceDrugQuizWeek,
    metadata.testedFact?.sourceDrugQuizWeek,
    ...(Array.isArray(metadata.choiceSources)
      ? metadata.choiceSources.map((choice) => choice?.sourceDrugQuizWeek)
      : [])
  ];
  return weeks.map(positiveInt).filter((week) => week > 0);
}

export function isWithinAdaptiveWeekCeiling(question, targetWeek) {
  const ceiling = Number(targetWeek);
  const weeks = getQuestionSourceWeeks(question);
  if (!weeks.length) return false;
  return weeks.every((week) => week <= ceiling);
}

// --- adaptive memory (additive, never migrated) --------------------------------

export function createEmptyAdaptiveMemory() {
  return { version: ADAPTIVE_MEMORY_VERSION, rounds: [], updatedAt: 0 };
}

export function normalizeAdaptiveMemory(raw) {
  const parsed = typeof raw === "string"
    ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
    : raw;
  if (!isRecord(parsed)) return createEmptyAdaptiveMemory();

  const rounds = (Array.isArray(parsed.rounds) ? parsed.rounds : [])
    .filter(isRecord)
    .map((round) => ({
      at: toTimestamp(round.at),
      targetWeek: positiveInt(round.targetWeek),
      fingerprints: [...new Set((Array.isArray(round.fingerprints) ? round.fingerprints : [])
        .map((value) => String(value ?? "").trim()).filter(Boolean))],
      conceptKeys: [...new Set((Array.isArray(round.conceptKeys) ? round.conceptKeys : [])
        .map((value) => String(value ?? "").trim()).filter(Boolean))]
    }))
    .filter((round) => round.fingerprints.length || round.conceptKeys.length)
    .slice(-ADAPTIVE_MEMORY_ROUNDS);

  return {
    version: ADAPTIVE_MEMORY_VERSION,
    rounds,
    updatedAt: toTimestamp(parsed.updatedAt)
  };
}

// Pure: returns the next memory value. Persisting it is the caller's job.
export function recordAdaptiveRound({ memory, questions, targetWeek, at = Date.now() } = {}) {
  const current = normalizeAdaptiveMemory(memory);
  const round = {
    at: toTimestamp(at) || Date.now(),
    targetWeek: positiveInt(targetWeek),
    fingerprints: [...new Set((questions || []).map(getQuestionFingerprint).filter(Boolean))],
    conceptKeys: [...new Set((questions || []).map(getQuestionConceptKey).filter(Boolean))]
  };
  if (!round.fingerprints.length && !round.conceptKeys.length) return current;

  return {
    version: ADAPTIVE_MEMORY_VERSION,
    rounds: [...current.rounds, round].slice(-ADAPTIVE_MEMORY_ROUNDS),
    updatedAt: round.at
  };
}

// Recency-weighted exposure: the most recent round suppresses hardest.
function buildExposure(memory) {
  const rounds = normalizeAdaptiveMemory(memory).rounds;
  const fingerprints = new Map();
  const concepts = new Map();

  rounds.forEach((round, index) => {
    // rounds are oldest-first; the last one is the most recent.
    const recency = (index + 1) / rounds.length;
    round.fingerprints.forEach((key) => {
      fingerprints.set(key, Math.max(fingerprints.get(key) || 0, recency));
    });
    round.conceptKeys.forEach((key) => {
      concepts.set(key, Math.max(concepts.get(key) || 0, recency));
    });
  });

  const lastRound = rounds[rounds.length - 1];
  return {
    fingerprints,
    concepts,
    roundCount: rounds.length,
    lastRoundFingerprints: new Set(lastRound ? lastRound.fingerprints : [])
  };
}

// --- signals ------------------------------------------------------------------

// Number() maps null, "", [] and true onto finite numbers, so coercing first
// would silently read a missing score as 0% - a substantive claim invented from
// absent data. Only a real number, or a non-empty numeric string, counts.
function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// Returns a clamped ratio, or null when the record cannot be trusted at all.
function toAttemptRatio(entry) {
  const score = toFiniteNumber(entry?.score);
  const total = toFiniteNumber(entry?.total);
  if (score === null || total === null || total <= 0) return null;
  return Math.max(0, Math.min(1, score / total));
}

function isMastered(entry) {
  return Boolean(entry?.archived) || positiveInt(entry?.clearStreak) >= MASTERED_STREAK_TARGET;
}

function getMasteryAge(entry, now) {
  const stamp = Math.max(
    toTimestamp(entry?.masteredAt),
    toTimestamp(entry?.lastReviewedAt),
    toTimestamp(entry?.lastMissedAt),
    toTimestamp(entry?.createdAt)
  );
  return stamp ? Math.max(0, now - stamp) : 0;
}

function isRefreshDue(entry, now) {
  return isMastered(entry) && getMasteryAge(entry, now) >= MASTERED_REFRESH_MS;
}

// Fall attempt kinds that count as recent Fall performance.
const FALL_HISTORY_KINDS = new Set([
  "fall-2026-lab3-practice",
  "boss-round",
  "fall-2026-lab3-boss-remix",
  ADAPTIVE_KIND
]);

export function buildAdaptiveSignals({ reviewEntries = [], historyEntries = [], memory = null, now = Date.now() } = {}) {
  const byPerformanceKey = new Map();

  // The same prompt+answer can hold SEPARATE Review Queue entries, because the
  // queue keys on quizId and normal Week Practice, Boss rounds, and Adaptive
  // Practice carry different source ids. Miss counts are cumulative evidence
  // and are summed, but mastery is a point-in-time state: OR-ing it across
  // duplicates would let a stale mastered copy mask a newer active miss and
  // hide material the student is currently getting wrong. Mastery, clear
  // streak, and refresh-due therefore come from the most recently active
  // duplicate only.
  for (const entry of reviewEntries) {
    if (!isRecord(entry)) continue;
    const key = getPerformanceKey(entry);
    if (!key) continue;

    const lastMissedAt = toTimestamp(entry.lastMissedAt);
    const activityAt = Math.max(
      lastMissedAt,
      toTimestamp(entry.lastReviewedAt),
      toTimestamp(entry.masteredAt),
      toTimestamp(entry.createdAt)
    );
    const entryMastered = isMastered(entry);
    const existing = byPerformanceKey.get(key);

    // Newer state wins. On an exact tie the ACTIVE state wins, so a duplicate
    // never hides current weakness through timestamp coincidence.
    const stateWins = !existing
      || activityAt > existing.activityAt
      || (activityAt === existing.activityAt && existing.mastered && !entryMastered);

    byPerformanceKey.set(key, {
      missCount: (existing?.missCount || 0) + positiveInt(entry.missCount),
      reviewMissCount: (existing?.reviewMissCount || 0) + positiveInt(entry.reviewMissCount),
      lastMissedAt: Math.max(existing?.lastMissedAt || 0, lastMissedAt),
      activityAt: Math.max(existing?.activityAt || 0, activityAt),
      clearStreak: stateWins ? positiveInt(entry.clearStreak) : existing.clearStreak,
      mastered: stateWins ? entryMastered : existing.mastered,
      refreshDue: stateWins ? isRefreshDue(entry, now) : existing.refreshDue
    });
  }

  // Recent Fall attempt performance, used only to modulate emphasis.
  const fallAttempts = (historyEntries || [])
    .filter(isRecord)
    .filter((entry) => {
      const kind = String(entry?.attemptLineage?.attemptKind || "").trim();
      return kind ? FALL_HISTORY_KINDS.has(kind) : false;
    })
    .map((entry) => ({ at: toTimestamp(entry.timestamp), ratio: toAttemptRatio(entry) }))
    // A record only contributes when BOTH values are finite and total > 0. A
    // valid total with a nonnumeric score previously produced NaN here, which
    // propagated into recentAccuracy and then into every candidate score.
    .filter((entry) => entry.ratio !== null)
    .sort((a, b) => b.at - a.at);

  const recent = fallAttempts.slice(0, 5);
  const recentAccuracy = recent.length
    ? recent.reduce((sum, entry) => sum + entry.ratio, 0) / recent.length
    : null;

  return {
    byPerformanceKey,
    exposure: buildExposure(memory),
    recentAccuracy,
    recentFallAttempts: fallAttempts.length,
    now
  };
}

// Roll per-question evidence up to the drug and domain the candidate tests, so
// a student weak on one Enalapril fact sees more Enalapril material. The
// rollup is built from exact prompt matches only - never inferred from text.
export function buildConceptWeakness(candidates, signals) {
  const drugs = new Map();
  const domains = new Map();

  for (const candidate of candidates) {
    const performance = signals.byPerformanceKey.get(getPerformanceKey(candidate));
    if (!performance) continue;

    // Material whose CURRENT recency-resolved state is mastered stops feeding
    // the active rollup. Its historical misses stay stored and the item itself
    // remains eligible through the mastery/refresh path, but old evidence must
    // not make sibling questions about that drug or domain look weak forever.
    if (performance.mastered) continue;

    const misses = performance.missCount + performance.reviewMissCount;
    if (misses <= 0) continue;

    const metadata = isRecord(candidate.metadata) ? candidate.metadata : {};
    const drug = String(metadata.sourceDrugId || "").trim();
    const domain = String(metadata.knowledgeDomain || "").trim();
    if (drug) drugs.set(drug, (drugs.get(drug) || 0) + misses);
    if (domain) domains.set(domain, (domains.get(domain) || 0) + misses);
  }

  return { drugs, domains };
}

function saturate(value, scale) {
  const numeric = Math.max(0, Number(value) || 0);
  return numeric / (numeric + scale);
}

// Buckets describe what the evidence supports, not what the student has lived
// through. "coverage" means: nothing on record marks this as a weakness, and
// adaptive has not served it recently - so it is good breadth material. It is
// NOT a claim that the question has never been practiced, which this app has
// no trustworthy curriculum-safe way to know.
export function classifyCandidate(candidate, signals, conceptWeakness) {
  const performance = signals.byPerformanceKey.get(getPerformanceKey(candidate));
  if (performance?.refreshDue) return "refresh";
  if (performance && (performance.missCount + performance.reviewMissCount) > 0 && !performance.mastered) {
    return "weakness";
  }

  if (!performance) {
    const conceptKey = getQuestionConceptKey(candidate);
    const servedRecently = signals.exposure.concepts.get(conceptKey) || 0;
    const drug = String(candidate?.metadata?.sourceDrugId || "").trim();
    const drugIsWeak = (conceptWeakness?.drugs.get(drug) || 0) > 0;
    if (!servedRecently && !drugIsWeak) return "coverage";
  }

  return "balanced";
}

export function scoreCandidate(candidate, signals, conceptWeakness) {
  const weights = ADAPTIVE_WEIGHTS;
  const performance = signals.byPerformanceKey.get(getPerformanceKey(candidate));
  const metadata = isRecord(candidate.metadata) ? candidate.metadata : {};
  const drug = String(metadata.sourceDrugId || "").trim();
  const domain = String(metadata.knowledgeDomain || "").trim();

  let score = 0;

  if (performance) {
    score += weights.itemMiss * saturate(performance.missCount, 2);
    score += weights.itemReviewMiss * saturate(performance.reviewMissCount, 2);

    if (performance.lastMissedAt > 0) {
      const ageDays = Math.max(0, (signals.now - performance.lastMissedAt) / DAY_MS);
      score += weights.missRecency * Math.exp(-ageDays / 14);
    }

    if (performance.refreshDue) score += weights.refreshDue;
    else if (performance.mastered) score -= weights.masteryPenalty;
    else score -= weights.masteryPenalty * 0.25 * saturate(performance.clearStreak, 2);
  } else {
    // No Review Queue entry means no RECORDED WEAKNESS EVIDENCE. It does not
    // prove the student never practiced this: a normal Week Practice item
    // answered correctly never enters the queue at all. The boost is therefore
    // for coverage breadth, not for a claim about lifetime exposure.
    score += weights.freshCoverage;
  }

  score += weights.drugWeakness * saturate(conceptWeakness.drugs.get(drug) || 0, 3);
  score += weights.domainWeakness * saturate(conceptWeakness.domains.get(domain) || 0, 6);

  const fingerprintExposure = signals.exposure.fingerprints.get(getQuestionFingerprint(candidate)) || 0;
  const conceptExposure = signals.exposure.concepts.get(getQuestionConceptKey(candidate)) || 0;
  score -= weights.repeatFingerprint * fingerprintExposure;
  score -= weights.repeatConcept * conceptExposure;

  // A struggling student gets more weakness emphasis; a strong one gets more
  // breadth. Bounded and deterministic - it shifts emphasis, never eligibility.
  if (Number.isFinite(signals.recentAccuracy) && performance) {
    score += (1 - signals.recentAccuracy) * 0.5;
  }

  return score;
}

// --- candidate pool ------------------------------------------------------------

// Ask the unmodified generator for material across every eligible week. Weeks
// above the target are never requested, so future-week material cannot enter
// the pool in the first place; the ceiling filter below is a second guard.
export function buildAdaptiveCandidatePool({ drugData, policy, targetWeek, seed, roundsPerWeek = 4 } = {}) {
  const week = assertAdaptiveWeek(targetWeek);
  const pool = [];
  const seen = new Set();

  for (let eligibleWeek = ADAPTIVE_MIN_WEEK; eligibleWeek <= week; eligibleWeek += 1) {
    for (let round = 0; round < roundsPerWeek; round += 1) {
      const generated = generateFall2026Quiz({
        drugData,
        policy,
        quizWeek: eligibleWeek,
        seed: `${seed}::adaptive-pool::week-${eligibleWeek}::round-${round}`,
        ...(eligibleWeek === 1 ? { mode: "practice", questionCount: ADAPTIVE_ROUND_SIZE } : {})
      });
      if (generated.status !== "generated") continue;

      for (const question of generated.questions) {
        if (!isWithinAdaptiveWeekCeiling(question, week)) continue;
        const fingerprint = getQuestionFingerprint(question);
        if (!fingerprint || seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        pool.push(question);
      }
    }
  }

  return pool;
}

// --- selection ------------------------------------------------------------------

export function selectAdaptiveRound({
  candidates = [],
  signals,
  seed = "",
  size = ADAPTIVE_ROUND_SIZE,
  targets = ADAPTIVE_BUCKET_TARGETS
} = {}) {
  const conceptWeakness = buildConceptWeakness(candidates, signals);
  const rng = createRng(`${seed}::selection`);

  const ranked = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      fingerprint: getQuestionFingerprint(candidate),
      conceptKey: getQuestionConceptKey(candidate),
      bucket: classifyCandidate(candidate, signals, conceptWeakness),
      score: scoreCandidate(candidate, signals, conceptWeakness),
      jitter: rng()
    }))
    // Stable, deterministic ordering: score, then a seeded tiebreak, then index.
    .sort((a, b) => b.score - a.score || a.jitter - b.jitter || a.index - b.index);

  const chosen = [];
  const usedFingerprints = new Set();
  const usedConcepts = new Set();
  const counts = { weakness: 0, refresh: 0, coverage: 0, balanced: 0 };

  const servedLastRound = signals.exposure.lastRoundFingerprints || new Set();

  const take = (entry) => {
    chosen.push(entry);
    usedFingerprints.add(entry.fingerprint);
    if (entry.conceptKey) usedConcepts.add(entry.conceptKey);
    counts[entry.bucket] += 1;
  };

  const eligible = (entry, { allowRepeat, allowConceptReuse }) => {
    if (usedFingerprints.has(entry.fingerprint)) return false;
    if (!allowRepeat && servedLastRound.has(entry.fingerprint)) return false;
    if (!allowConceptReuse && entry.conceptKey && usedConcepts.has(entry.conceptKey)) return false;
    return true;
  };

  const fillBuckets = (options) => {
    for (const bucket of ADAPTIVE_BUCKET_ORDER) {
      const target = Math.max(0, Number(targets[bucket]) || 0);
      for (const entry of ranked) {
        if (chosen.length >= size || counts[bucket] >= target) break;
        if (entry.bucket !== bucket) continue;
        if (!eligible(entry, options)) continue;
        take(entry);
      }
    }
  };

  const backfill = (options) => {
    for (const entry of ranked) {
      if (chosen.length >= size) break;
      if (!eligible(entry, options)) continue;
      take(entry);
    }
  };

  // Fill buckets from material the student did not just see. A weakness bucket
  // with only a couple of candidates would otherwise pin those items into
  // every round no matter how large the repeat penalty grew.
  fillBuckets({ allowRepeat: false, allowConceptReuse: false });
  backfill({ allowRepeat: false, allowConceptReuse: false });

  // Only now may last round's items return, best-scoring first, so a genuine
  // weakness still comes back rather than being exiled.
  fillBuckets({ allowRepeat: true, allowConceptReuse: false });
  backfill({ allowRepeat: true, allowConceptReuse: false });

  // Last resort for a concept-poor pool. Fingerprints stay unique throughout.
  backfill({ allowRepeat: true, allowConceptReuse: true });

  return {
    questions: chosen.map((entry) => entry.candidate),
    selection: chosen.map((entry) => ({
      fingerprint: entry.fingerprint,
      conceptKey: entry.conceptKey,
      bucket: entry.bucket,
      score: entry.score
    })),
    bucketCounts: counts,
    poolSize: candidates.length
  };
}

// --- payload --------------------------------------------------------------------

export function buildFall2026AdaptivePayload({
  drugData,
  policy,
  targetWeek,
  seed,
  reviewEntries = [],
  historyEntries = [],
  memory = null,
  now = Date.now(),
  roundsPerWeek = 4
} = {}) {
  const week = assertAdaptiveWeek(targetWeek);
  const candidates = buildAdaptiveCandidatePool({ drugData, policy, targetWeek: week, seed, roundsPerWeek });
  const signals = buildAdaptiveSignals({ reviewEntries, historyEntries, memory, now });
  const round = selectAdaptiveRound({ candidates, signals, seed });

  if (!round.questions.length) {
    throw new Error(`Adaptive Practice could not assemble a round for Week ${week}.`);
  }

  // Belt and braces: nothing beyond the target week may leave this function.
  for (const question of round.questions) {
    if (!isWithinAdaptiveWeekCeiling(question, week)) {
      throw new Error(`Adaptive Practice produced material beyond Week ${week}.`);
    }
  }

  const title = `Lab III Fall 2026 - Adaptive Practice - Through Week ${week}`;
  const sourceQuizId = `fall-2026-lab3-week-${week}-adaptive`;

  return {
    id: "custom-quiz",
    title,
    metadata: {
      kind: ADAPTIVE_KIND,
      generator: ADAPTIVE_GENERATOR_ID,
      generatedFrom: sourceQuizId,
      sourceTitle: title,
      quizWeek: week,
      adaptiveTargetWeek: week,
      seed,
      timerSeconds: ADAPTIVE_TIMER_SECONDS,
      adaptive: {
        targetWeek: week,
        roundSize: round.questions.length,
        poolSize: round.poolSize,
        bucketCounts: { ...round.bucketCounts },
        bucketTargets: { ...ADAPTIVE_BUCKET_TARGETS },
        signalBasis: {
          reviewEntries: reviewEntries.length,
          fallAttempts: signals.recentFallAttempts,
          rememberedRounds: signals.exposure.roundCount,
          recentAccuracy: signals.recentAccuracy
        }
      }
    },
    questions: round.questions.map((question) => ({
      ...question,
      sourceQuizId,
      sourceTitle: title
    })),
    selection: round.selection
  };
}
