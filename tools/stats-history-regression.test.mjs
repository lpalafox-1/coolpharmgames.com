// tools/stats-history-regression.test.mjs
// P2F-08 Stats & History Dashboard v2.
//
// Stats is a read-side surface: it interprets `pharmlet.history` more
// carefully, and never migrates or writes it back. These tests exercise
// assets/js/stats.js exactly as shipped through the browser-global harness,
// with no DOM library and no new dependencies.
//
// Timezone: pinned before any Date is constructed so a date-boundary fixture
// resolves identically here and on GitHub Actions UTC infrastructure. Every
// boundary is additionally built from constructed local dates rather than an
// opaque epoch literal, so the assertions stay correct in whatever zone is
// actually active.
process.env.TZ = "America/Chicago";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_KEY = "pharmlet.history";
const REVIEW_KEY = "pharmlet.review-queue";
const REPORTS_KEY = "pharmlet.question-reports";
const SIGNALS_KEY = "pharmlet.topDrugs.signals";
const FAVORITES_KEY = "pharmlet.favorites";
const RECENT_RUNS_KEY = "pharmlet.finalLab2.recentRuns";
const REMIX_REQUEST_KEY = "pharmlet.fall-2026-lab3.boss-remix-request";
const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(readFileSync(path.join(repoRoot, relativePath))).digest("hex");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Values produced inside the vm sandbox carry that realm's prototypes, so
// they are compared structurally rather than by reference identity.
function deepEqualAcrossRealms(actual, expected, message) {
  assert.deepEqual(plain(actual), expected, message);
}

// --- source-derived Fall Lab III contract ------------------------------------
// The attempt-kind literals and lineage field names come out of the engine
// itself, so this suite cannot drift from the runtime it is guarding.

const engineSource = read("assets/js/quizEngine.js");
const statsSource = read("assets/js/stats.js");

// The retention cap is read from Stats and corroborated against the engine
// writer that actually trims history, so the disclosure can never drift.
const HISTORY_RETENTION_LIMIT = (() => {
  const match = /const HISTORY_RETENTION_LIMIT = (\d+);/.exec(statsSource);
  assert.ok(match, "assets/js/stats.js must declare HISTORY_RETENTION_LIMIT");
  const limit = Number(match[1]);
  assert.ok(
    engineSource.includes(`history.slice(-${limit})`),
    "the Stats retention cap must match the engine's history writer"
  );
  return limit;
})();

function readEngineConstant(name) {
  const match = new RegExp(`const ${name} = "([^"]+)";`).exec(engineSource);
  assert.ok(match, `assets/js/quizEngine.js must still declare ${name}`);
  return match[1];
}

function readEngineFunction(name) {
  const start = engineSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `assets/js/quizEngine.js must still declare ${name}()`);
  const end = engineSource.indexOf("\n}", start);
  assert.ok(end > start, `${name}() must be readable from source`);
  return engineSource.slice(start, end);
}

const FALL_PRACTICE_KIND = readEngineConstant("FALL_LAB3_PRACTICE_KIND");
const FALL_BOSS_REMIX_KIND = readEngineConstant("FALL_LAB3_BOSS_REMIX_KIND");
// Boss Round has no named engine constant; it is the launch payload literal.
const FALL_BOSS_ROUND_KIND = (() => {
  const match = /kind: "([^"]+)"/.exec(readEngineFunction("launchBossRound"));
  assert.ok(match, "launchBossRound() must still stamp an attempt kind");
  return match[1];
})();

const LINEAGE_SOURCE = readEngineFunction("buildFallLab3HistoryLineage");
const LINEAGE_REQUIRED_FIELDS = Object.freeze([
  "attemptKind", "attemptId", "remixGeneration", "questionCount", "quizWeek", "sourceQuizId"
]);
const LINEAGE_OPTIONAL_FIELDS = Object.freeze([
  "parentAttemptId", "rootAttemptId", "curriculumId", "professionalYear", "semester", "lab", "seed"
]);

// --- browser-global harness --------------------------------------------------

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, "");
}

function createElementStub() {
  let html = "";
  let text = "";
  const element = {
    children: [],
    className: "",
    style: {},
    value: "",
    disabled: false,
    hidden: false,
    get innerHTML() { return html; },
    set innerHTML(value) { html = String(value ?? ""); text = stripTags(html); },
    get textContent() { return text; },
    set textContent(value) { text = String(value ?? ""); html = escapeHtml(text); },
    get innerText() { return text; },
    appendChild(child) { element.children.push(child); return child; },
    append(child) { element.children.push(child); return child; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    remove() {},
    click() {},
    focus() {}
  };
  return element;
}

// getElementById auto-vivifies, so every render path actually runs instead of
// bailing out on a null container.
function createDocument() {
  const elements = new Map();
  return {
    documentElement: { classList: { contains() { return false; }, toggle() {} } },
    body: createElementStub(),
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElementStub());
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return createElementStub(); },
    elements
  };
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    raw(key) { return values.get(key); },
    snapshot() { return JSON.stringify([...values.entries()].sort()); }
  };
}

function loadStatsSandbox({ history, localExtras = {}, sessionExtras = {}, withCurriculumAdapter = true } = {}) {
  const initialLocal = { ...localExtras };
  if (history !== undefined) {
    initialLocal[HISTORY_KEY] = typeof history === "string" ? history : JSON.stringify(history);
  }

  const localStorage = createStorage(initialLocal);
  const sessionStorage = createStorage(sessionExtras);
  const catalog = loadBrowserGlobal("assets/js/quiz-catalog.js").PharmletQuizCatalog;
  const reviewQueueStore = loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;
  const curriculumMetadata = withCurriculumAdapter
    ? loadBrowserGlobal("assets/js/curriculum-metadata.js", { PharmletQuizCatalog: catalog }).PharmletCurriculumMetadata
    : undefined;

  const globals = {
    document: createDocument(),
    localStorage,
    sessionStorage,
    matchMedia() { return { matches: false }; },
    setTimeout() { return 0; },
    clearTimeout() {},
    confirm() { return false; },
    alert() {},
    PharmletQuizCatalog: catalog,
    PharmletReviewQueueStore: reviewQueueStore,
    TopDrugsData: { loadPool: async () => ({ data: [] }) }
  };
  if (curriculumMetadata) globals.PharmletCurriculumMetadata = curriculumMetadata;

  const sandbox = loadBrowserGlobal("assets/js/stats.js", globals);
  sandbox.__localStorage = localStorage;
  sandbox.__sessionStorage = sessionStorage;
  return sandbox;
}

// --- fixtures ----------------------------------------------------------------

function localDate(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function fallLineage(overrides = {}) {
  return {
    attemptKind: FALL_PRACTICE_KIND,
    attemptId: "fall-2026-lab3:week-3:fall-2026-lab3-practice:seed-alpha",
    remixGeneration: 0,
    questionCount: 10,
    quizWeek: 3,
    sourceQuizId: "fall-2026-lab3-week-3-practice",
    rootAttemptId: "fall-2026-lab3:week-3:fall-2026-lab3-practice:seed-alpha",
    curriculumId: "p2-fall-2026-lab3",
    professionalYear: "P2",
    semester: "Fall 2026",
    lab: "Lab III",
    ...overrides
  };
}

const LEGACY_MINIMAL_RECORD = Object.freeze({
  quizId: "chapter1-review",
  mode: "easy",
  title: "Chapter 1 Review",
  score: 8,
  total: 10,
  timestamp: "2026-01-01T00:00:00.000Z"
});

// --- T-01 read tolerance ------------------------------------------------------

test("T-01 minimal legacy records normalize and render without inventing fields", () => {
  const sandbox = loadStatsSandbox({ history: [LEGACY_MINIMAL_RECORD] });
  const [record] = sandbox.normalizeHistoryRecords([LEGACY_MINIMAL_RECORD]);

  assert.equal(record.quizId, "chapter1-review");
  assert.equal(record.score, 8);
  assert.equal(record.total, 10);
  assert.equal(record.scoreRatio, 0.8);
  assert.equal(record.hasLineage, false);
  assert.equal(record.attemptKind, "");
  assert.equal(Object.hasOwn(record, "chain"), false, "an absent lineage must not fabricate a chain");

  // Optional history data the record never carried stays absent, not zero-filled.
  assert.equal(record.bestStreak, null);
  assert.equal(record.curriculum.quizWeek, undefined);

  assert.doesNotThrow(() => sandbox.renderRecordedAttemptDashboard([record]));
});

test("T-01 malformed and empty history shapes never throw", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  for (const input of [null, undefined, "not-an-array", 42, [], [null], [[]], [{}], [{ quizId: 7 }]]) {
    assert.doesNotThrow(() => {
      const records = sandbox.normalizeHistoryRecords(input);
      sandbox.renderRecordedAttemptDashboard(records);
      sandbox.summarizeHistoryRecords(records);
      sandbox.buildHistoryFamilies(records);
      sandbox.buildHistoryChains(records);
    }, `normalizing ${JSON.stringify(input)} must not throw`);
  }
});

// --- T-02 timestamp normalization --------------------------------------------

test("T-02 epoch, numeric-string, ISO, and Date timestamps normalize to one scale", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const moment = localDate(2026, 8, 14, 9, 30);
  const epoch = moment.getTime();

  assert.equal(sandbox.normalizeTimestamp(epoch), epoch);
  assert.equal(sandbox.normalizeTimestamp(String(epoch)), epoch);
  assert.equal(sandbox.normalizeTimestamp(moment.toISOString()), epoch);
  assert.equal(sandbox.normalizeTimestamp(moment), epoch, "a Date from another realm still normalizes");

  for (const value of [null, undefined, "", "   ", "not-a-date", Number.NaN, Infinity, {}, []]) {
    assert.equal(sandbox.normalizeTimestamp(value), null, `${JSON.stringify(value)} has no usable timestamp`);
  }
});

test("T-02 mixed timestamp shapes sort and bucket consistently", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const oldest = localDate(2026, 8, 1, 8, 0);
  const middle = localDate(2026, 8, 10, 8, 0);
  const newest = localDate(2026, 8, 20, 8, 0);

  const records = sandbox.normalizeHistoryRecords([
    { quizId: "a", mode: "easy", score: 1, total: 2, timestamp: middle.toISOString() },
    { quizId: "b", mode: "easy", score: 1, total: 2, timestamp: newest.getTime() },
    { quizId: "c", mode: "easy", score: 1, total: 2, timestamp: String(oldest.getTime()) },
    { quizId: "d", mode: "easy", score: 1, total: 2, timestamp: "unparseable" }
  ]);

  deepEqualAcrossRealms(
    sandbox.sortRecordsNewestFirst(records).map((record) => record.quizId),
    ["b", "a", "c", "d"],
    "undated attempts sort last instead of being treated as epoch zero"
  );

  const sameDay = sandbox.normalizeHistoryRecords([
    { quizId: "x", score: 1, total: 2, timestamp: middle.getTime() },
    { quizId: "y", score: 1, total: 2, timestamp: middle.toISOString() },
    { quizId: "z", score: 1, total: 2, timestamp: localDate(2026, 8, 10, 23, 59).getTime() }
  ]);
  assert.equal(new Set(sameDay.map((record) => record.dayKey)).size, 1, "one local day is one bucket");
  assert.equal(sandbox.summarizeHistoryRecords(sameDay).studyDays, 1);
});

// --- T-03 divisor guard -------------------------------------------------------

test("T-03 a zero or malformed total never produces NaN or Infinity", () => {
  const sandbox = loadStatsSandbox({ history: [] });

  for (const total of [0, -5, null, undefined, "", "abc", Number.NaN]) {
    assert.equal(sandbox.getScoreRatio(3, total), null, `total ${JSON.stringify(total)} must not divide`);
  }
  assert.equal(sandbox.formatRatioPercent(null), "—");
  assert.equal(sandbox.formatRatioPercent(Number.NaN), "—");
  assert.equal(sandbox.formatRatioPercent(0.5), "50.0%");
});

test("T-03 one malformed record does not poison the rest of the dashboard", () => {
  const timestamp = localDate(2026, 8, 12, 10, 0).getTime();
  const sandbox = loadStatsSandbox({ history: [] });
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 9, total: 10, bestStreak: 4, timestamp },
    { quizId: "chapter2-review", mode: "easy", score: 3, total: 0, bestStreak: 1, timestamp },
    { quizId: "chapter3-review", mode: "easy", score: 6, total: 10, bestStreak: 2, timestamp }
  ]);

  const summary = sandbox.summarizeHistoryRecords(records);
  assert.equal(summary.attempts, 3);
  assert.equal(summary.scoredAttempts, 2);
  assert.equal(summary.unscorableAttempts, 1);
  assert.equal(summary.totalQuestions, 20, "a zero-total attempt contributes no questions");
  assert.equal(summary.averageRatio, 0.75, "the average is taken over scorable attempts only");
  assert.equal(summary.bestStreak, 4);

  const rendered = JSON.stringify(plain(sandbox.buildHistoryFamilies(records)));
  assert.doesNotMatch(rendered, /NaN|Infinity/);

  sandbox.renderRecordedAttemptDashboard(records);
  const overview = ["total-questions", "avg-score", "best-streak", "study-days"]
    .map((id) => sandbox.document.getElementById(id).textContent)
    .join(" ");
  assert.doesNotMatch(overview, /NaN|Infinity/);
  assert.equal(sandbox.document.getElementById("avg-score").textContent, "75.0%");
});

// --- T-05 source-derived Fall attempt-kind mapping ----------------------------

test("T-05 the Fall attempt kinds Stats maps are the literals the engine writes", () => {
  assert.equal(FALL_PRACTICE_KIND, readEngineConstant("FALL_LAB3_PRACTICE_KIND"));
  assert.ok(FALL_BOSS_ROUND_KIND, "the Boss Round launch literal must be readable from source");
  assert.ok(FALL_BOSS_REMIX_KIND, "the Boss Remix kind constant must be readable from source");
  assert.equal(new Set([FALL_PRACTICE_KIND, FALL_BOSS_ROUND_KIND, FALL_BOSS_REMIX_KIND]).size, 3);

  // The launcher writes the practice kind that the engine reads back.
  assert.ok(
    read("assets/js/fall-2026-lab3-launcher.js").includes(`kind: "${FALL_PRACTICE_KIND}"`),
    "the Fall launcher must still stamp the practice kind"
  );

  const stats = read("assets/js/stats.js");
  for (const kind of [FALL_PRACTICE_KIND, FALL_BOSS_ROUND_KIND, FALL_BOSS_REMIX_KIND]) {
    assert.ok(stats.includes(`"${kind}"`), `Stats must recognize the source literal ${kind}`);
  }
});

test("T-05 normal Fall practice, Boss Round, and Boss Remix classify distinctly", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const timestamp = localDate(2026, 8, 18, 9, 0).getTime();

  const [practice, boss, remix] = sandbox.normalizeHistoryRecords([
    {
      quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10",
      mode: "easy", title: "Lab III Fall 2026 - Week 3 Practice", score: 8, total: 10, timestamp,
      attemptLineage: fallLineage()
    },
    {
      quizId: "generated-custom-quiz-boss-round-q5",
      mode: "boss", title: "Boss Round — Brand", score: 3, total: 5, timestamp,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_ROUND_KIND, questionCount: 5 })
    },
    {
      quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6",
      mode: "bossRemix", title: "Lab III Fall 2026 - Week 3 Boss Remix +1", score: 4, total: 6, timestamp,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_REMIX_KIND, questionCount: 6, remixGeneration: 1 })
    }
  ]);

  assert.equal(practice.attemptTypeId, "fall-lab3-practice");
  assert.equal(practice.attemptTypeLabel, "Fall Lab III Practice");
  assert.equal(boss.attemptTypeId, "boss-rounds");
  assert.equal(boss.attemptTypeLabel, "Boss Rounds");

  // Boss Remix no longer disappears into generic Generated Sets.
  assert.equal(remix.attemptTypeId, "boss-remixes");
  assert.equal(remix.attemptTypeLabel, "Boss Remixes");
  assert.equal(remix.attemptTypeSource, "lineage");
  assert.notEqual(remix.categoryLabel, remix.attemptTypeLabel);
  assert.equal(remix.categoryLabel, "Generated Sets", "the catalog heuristic alone would have lost the Remix");

  for (const record of [practice, boss, remix]) assert.equal(record.modeConflict, false);
});

test("T-05 an unknown future attempt kind falls back safely instead of throwing", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const [record] = sandbox.normalizeHistoryRecords([{
    quizId: "generated-custom-quiz-some-future-kind-q8",
    mode: "easy", score: 4, total: 8, timestamp: localDate(2026, 8, 18).getTime(),
    attemptLineage: fallLineage({ attemptKind: "fall-2027-lab9-time-trial" })
  }]);

  assert.equal(record.attemptTypeId, "generated-sets", "an unrecognized kind falls through to the catalog");
  assert.equal(record.attemptTypeSource, "catalog");
  assert.equal(record.attemptKind, "fall-2027-lab9-time-trial", "the raw kind is still preserved");
  assert.equal(record.modeConflict, false);
});

// --- T-06 mode versus lineage conflict ---------------------------------------

test("T-06 a recognized lineage kind outranks a disagreeing history mode", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const [record] = sandbox.normalizeHistoryRecords([{
    quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10",
    // The stored mode claims Boss Remix; the lineage says normal practice.
    mode: "bossRemix", score: 7, total: 10, timestamp: localDate(2026, 8, 18).getTime(),
    attemptLineage: fallLineage()
  }]);

  assert.equal(record.attemptTypeId, "fall-lab3-practice", "lineage controls the specific attempt type");
  assert.equal(record.attemptTypeSource, "lineage");
  assert.equal(record.modeConflict, true, "the disagreement is recorded so it stays testable");
  assert.equal(record.mode, "bossRemix", "the raw history mode is preserved verbatim");
  assert.equal(record.attemptKind, FALL_PRACTICE_KIND, "the raw lineage kind is preserved verbatim");
  assert.equal(record.raw.mode, "bossRemix", "the stored record itself is untouched");
});

test("T-06 mode is the fallback only when no recognized lineage kind exists", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const timestamp = localDate(2026, 8, 18).getTime();
  const [noLineage, unrecognizedKind] = sandbox.normalizeHistoryRecords([
    { quizId: "generated-custom-quiz-thing-q6", mode: "bossRemix", score: 3, total: 6, timestamp },
    {
      quizId: "generated-custom-quiz-thing-q6", mode: "boss", score: 3, total: 6, timestamp,
      attemptLineage: { attemptKind: "not-a-known-kind", quizWeek: 4 }
    }
  ]);

  assert.equal(noLineage.attemptTypeId, "boss-remixes");
  assert.equal(noLineage.attemptTypeSource, "mode");
  assert.equal(noLineage.modeConflict, false);

  assert.equal(unrecognizedKind.attemptTypeId, "boss-rounds");
  assert.equal(unrecognizedKind.attemptTypeSource, "mode");
  assert.equal(unrecognizedKind.modeConflict, false, "an unrecognized kind is not a conflict, just unknown");
});

// --- T-07 missing curriculum adapter -----------------------------------------

test("T-07 Stats still functions with PharmletCurriculumMetadata absent", async () => {
  const timestamp = localDate(2026, 8, 18).getTime();
  const history = [
    { ...LEGACY_MINIMAL_RECORD, timestamp },
    {
      quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6",
      mode: "bossRemix", title: "Boss Remix", score: 4, total: 6, timestamp,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_REMIX_KIND, questionCount: 6, remixGeneration: 1 })
    }
  ];

  const sandbox = loadStatsSandbox({ history, withCurriculumAdapter: false });
  assert.equal(sandbox.PharmletCurriculumMetadata, undefined);

  const records = sandbox.normalizeHistoryRecords(history);
  // The catalog still resolves P1 context for a known static quiz.
  assert.equal(records[0].curriculum.professionalYear, "P1");
  assert.equal(records[0].curriculumSource, "catalog");
  // Lineage answers for itself and needs no adapter at all.
  assert.equal(records[1].curriculum.professionalYear, "P2");
  assert.equal(records[1].curriculumSource, "lineage");
  assert.equal(records[1].attemptTypeId, "boss-remixes");

  await assert.doesNotReject(() => sandbox.loadStats());
});

// --- T-08 date filtering ------------------------------------------------------

test("T-08 Today, rolling windows, and custom ranges use local calendar bounds", () => {
  assert.equal(process.env.TZ, "America/Chicago", "the suite pins its own timezone");
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 15, 30).getTime();

  const today = sandbox.getHistoryDateBounds({ range: "today" }, now);
  assert.equal(today.start, localDate(2026, 8, 20, 0, 0).getTime());
  assert.equal(today.end, localDate(2026, 8, 21, 0, 0).getTime() - 1);

  const week = sandbox.getHistoryDateBounds({ range: "7d" }, now);
  assert.equal(week.start, localDate(2026, 8, 14, 0, 0).getTime(), "a 7-day window includes today plus six days");
  assert.equal(week.end, today.end);

  const all = sandbox.getHistoryDateBounds({ range: "all" }, now);
  deepEqualAcrossRealms(all, { start: null, end: null });

  const custom = sandbox.getHistoryDateBounds(
    { range: "custom", customStart: "2026-08-10", customEnd: "2026-08-12" },
    now
  );
  assert.equal(custom.start, localDate(2026, 8, 10, 0, 0).getTime());
  assert.equal(custom.end, localDate(2026, 8, 13, 0, 0).getTime() - 1, "a custom end date includes its whole day");
});

test("T-08 date filtering is inclusive at both local-day boundaries", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 15, 30).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "midnight-in", score: 1, total: 1, timestamp: localDate(2026, 8, 20, 0, 0).getTime() },
    { quizId: "last-second-in", score: 1, total: 1, timestamp: localDate(2026, 8, 21, 0, 0).getTime() - 1 },
    { quizId: "yesterday-out", score: 1, total: 1, timestamp: localDate(2026, 8, 20, 0, 0).getTime() - 1 },
    { quizId: "seven-day-edge", score: 1, total: 1, timestamp: localDate(2026, 8, 14, 0, 0).getTime() },
    { quizId: "eight-days-out", score: 1, total: 1, timestamp: localDate(2026, 8, 13, 23, 59).getTime() }
  ]);

  const today = sandbox.filterHistoryRecords(records, { range: "today" }, now);
  deepEqualAcrossRealms(today.records.map((r) => r.quizId), ["midnight-in", "last-second-in"]);

  const week = sandbox.filterHistoryRecords(records, { range: "7d" }, now);
  deepEqualAcrossRealms(
    week.records.map((r) => r.quizId),
    ["midnight-in", "last-second-in", "yesterday-out", "seven-day-edge"]
  );

  const all = sandbox.filterHistoryRecords(records, { range: "all" }, now);
  assert.equal(all.records.length, 5);
});

test("T-08 a rolling window stays seven local days across a DST transition", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  // US Central falls back on 2026-11-01; the window must still land on local midnight.
  const now = localDate(2026, 11, 3, 10, 0).getTime();
  const bounds = sandbox.getHistoryDateBounds({ range: "7d" }, now);
  assert.equal(bounds.start, localDate(2026, 10, 28, 0, 0).getTime());
  assert.equal(new Date(bounds.start).getHours(), 0, "the window still begins at local midnight");
});

test("T-08 undated attempts are excluded from bounded windows and disclosed", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 15, 30).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "dated", score: 1, total: 1, timestamp: now },
    { quizId: "undated", score: 1, total: 1 }
  ]);

  const bounded = sandbox.filterHistoryRecords(records, { range: "today" }, now);
  deepEqualAcrossRealms(bounded.records.map((r) => r.quizId), ["dated"]);
  assert.equal(bounded.excludedUndatedCount, 1);

  const all = sandbox.filterHistoryRecords(records, { range: "all" }, now);
  assert.equal(all.records.length, 2, "All time keeps attempts whose date was never recorded");
  assert.equal(all.excludedUndatedCount, 0);
});

// --- T-12 legacy no-migration contract ---------------------------------------

test("T-12 reading and rendering leaves raw history byte-identical", async () => {
  const history = [
    LEGACY_MINIMAL_RECORD,
    { quizId: "generated-custom-quiz-thing-q6", mode: "bossRemix", score: 3, total: 6, timestamp: Date.now() },
    { quizId: "broken", mode: "easy", score: 3, total: 0, timestamp: "nonsense" }
  ];
  const historyRaw = JSON.stringify(history);
  const sandbox = loadStatsSandbox({ history: historyRaw });

  assert.deepEqual(plain(sandbox.getHistory()), history);
  await sandbox.loadStats();

  assert.equal(sandbox.__localStorage.raw(HISTORY_KEY), historyRaw, "Stats reads must not migrate old history");
  const records = sandbox.normalizeHistoryRecords(sandbox.getHistory());
  assert.deepEqual(plain(records.map((record) => record.raw)), history, "normalization never rewrites the source");
});

// --- T-04 (initial processing and render) no-write invariant ------------------

test("T-04 initial processing and render write nothing to the watched stores", async () => {
  const watched = {
    [HISTORY_KEY]: JSON.stringify([LEGACY_MINIMAL_RECORD]),
    [REVIEW_KEY]: JSON.stringify([{
      quizId: "chapter1-review", type: "mcq", prompt: "Legacy prompt",
      answer: "A", userAnswer: "B", timestamp: "2026-01-01T00:00:00.000Z"
    }]),
    [REPORTS_KEY]: JSON.stringify([{ quizId: "chapter1-review", prompt: "Report", timestamp: "2026-01-02T00:00:00.000Z" }]),
    [FAVORITES_KEY]: JSON.stringify(["ceutics-practice-1"]),
    [SIGNALS_KEY]: JSON.stringify({ version: 1, updatedAt: 5, missedDrugs: { lisinopril: 2 } }),
    [RECENT_RUNS_KEY]: JSON.stringify([{ at: 1 }]),
    [REMIX_REQUEST_KEY]: JSON.stringify({ quizWeek: 3 }),
    [CUSTOM_QUIZ_KEY]: JSON.stringify({ id: "custom-quiz", questions: [] })
  };

  const sandbox = loadStatsSandbox({ localExtras: watched, sessionExtras: { "pharmlet.session.lastRound.x": "1" } });
  const localBefore = sandbox.__localStorage.snapshot();
  const sessionBefore = sandbox.__sessionStorage.snapshot();

  await sandbox.loadStats();
  sandbox.renderRecordedAttemptDashboard(sandbox.normalizeHistoryRecords(sandbox.getHistory()));

  assert.equal(sandbox.__localStorage.snapshot(), localBefore, "no local store may change during a Stats visit");
  assert.equal(sandbox.__sessionStorage.snapshot(), sessionBefore, "no session store may change during a Stats visit");
});

// --- T-13 global surface ------------------------------------------------------

test("T-13 Stats globals stay reachable through the browser-global harness", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const required = [
    "getHistory", "normalizeTimestamp", "normalizeHistoryRecord", "normalizeHistoryRecords",
    "getScoreRatio", "formatRatioPercent", "averageRatios", "getHistoryDateBounds",
    "filterHistoryRecords", "summarizeHistoryRecords", "buildHistoryFamilies", "buildHistoryChains",
    "sortRecordsNewestFirst", "isHistoryRetentionBoundaryReached", "getAvailableAttemptTypes",
    "getAvailableCurriculumOptions", "getAvailableScopeOptions", "renderRecordedAttemptDashboard"
  ];
  for (const name of required) {
    assert.equal(typeof sandbox[name], "function", `${name} must remain reachable`);
  }
  assert.equal(HISTORY_RETENTION_LIMIT, 200, "the documented retention cap is still 200 records");
});

// --- T-18 / T-19 / T-21 provenance resolution --------------------------------

test("T-18 verified lineage supplies Fall context without parsing the quiz id", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  for (const field of LINEAGE_REQUIRED_FIELDS) {
    assert.ok(LINEAGE_SOURCE.includes(field), `buildFallLab3HistoryLineage() must still record ${field}`);
  }

  const [record] = sandbox.normalizeHistoryRecords([{
    // A deliberately uninformative id: every Fall fact must come from lineage.
    quizId: "generated-opaque-identity",
    mode: "easy", title: "", score: 8, total: 10,
    timestamp: localDate(2026, 8, 18).getTime(),
    attemptLineage: fallLineage()
  }]);

  assert.equal(record.curriculumSource, "lineage");
  assert.equal(record.curriculum.professionalYear, "P2");
  assert.equal(record.curriculum.semester, "Fall 2026");
  assert.equal(record.curriculum.lab, "Lab III");
  assert.equal(record.curriculum.quizWeek, 3);
  assert.equal(record.curriculum.curriculumId, "p2-fall-2026-lab3");
  assert.equal(record.curriculumKnown, true);
  assert.equal(record.familyLabel, "Lab III Week 3");
});

test("T-19 pre-lineage records resolve from the catalog or stay honestly unclassified", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const timestamp = localDate(2026, 8, 18).getTime();
  const [staticQuiz, dynamicLab, generated] = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp },
    { quizId: "lab-2-week-4", mode: "easy", score: 8, total: 10, timestamp },
    // A pre-F26-09 generated Fall attempt: the week is NOT reverse-engineered.
    { quizId: "generated-custom-quiz-fall-2026-lab3-practice-from-fall-2026-lab3-week-7-practice-q10",
      mode: "easy", title: "Lab III Fall 2026 - Week 7 Practice", score: 8, total: 10, timestamp }
  ]);

  assert.equal(staticQuiz.curriculum.professionalYear, "P1");
  assert.equal(staticQuiz.curriculumKnown, true);

  assert.equal(dynamicLab.curriculum.professionalYear, "P1");
  assert.equal(dynamicLab.curriculum.lab, "Lab II");
  assert.equal(dynamicLab.curriculum.quizWeek, 4);

  assert.equal(generated.curriculumSource, "unknown");
  assert.equal(generated.curriculumKnown, false);
  deepEqualAcrossRealms(generated.curriculum, {}, "a generated-* identity must not manufacture curriculum context");
  assert.equal(generated.curriculum.quizWeek, undefined, "pre-lineage Fall weeks are never reverse-engineered");
});

test("T-21 missing optional lineage fields stay unknown and are never guessed", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  for (const field of LINEAGE_OPTIONAL_FIELDS) {
    assert.ok(LINEAGE_SOURCE.includes(field), `${field} must still be a known optional lineage field`);
  }

  const [record] = sandbox.normalizeHistoryRecords([{
    quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6",
    mode: "bossRemix", score: 4, total: 6, timestamp: localDate(2026, 8, 18).getTime(),
    // Partial lineage: a recognized kind and a week, and nothing else.
    attemptLineage: { attemptKind: FALL_BOSS_REMIX_KIND, quizWeek: 5 }
  }]);

  assert.equal(record.attemptTypeId, "boss-remixes", "a partial lineage still classifies by its kind");
  assert.equal(record.curriculum.quizWeek, 5);
  assert.equal(record.curriculum.professionalYear, undefined, "P2 is not inferred from a Fall kind");
  assert.equal(record.curriculum.lab, undefined);
  assert.equal(record.curriculum.semester, undefined);
  assert.equal(record.curriculumKnown, false);
  assert.equal(Object.hasOwn(record, "chain"), false, "no attempt ids means no chain identity");
});

// --- T-22 chain association without score merging ----------------------------

test("T-22 a Fall chain associates attempts without merging their scores", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const root = "fall-2026-lab3:week-3:fall-2026-lab3-practice:seed-alpha";
  const bossId = "fall-2026-lab3:week-3:boss-round:created-1";
  const base = localDate(2026, 8, 18, 9, 0).getTime();

  const records = sandbox.normalizeHistoryRecords([
    { quizId: "generated-a", mode: "easy", score: 8, total: 10, timestamp: base,
      attemptLineage: fallLineage() },
    { quizId: "generated-b", mode: "boss", score: 3, total: 5, timestamp: base + 60000,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_ROUND_KIND, attemptId: bossId, parentAttemptId: root, rootAttemptId: root, questionCount: 5 }) },
    { quizId: "generated-c", mode: "bossRemix", score: 2, total: 6, timestamp: base + 120000,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_REMIX_KIND, attemptId: "fall-2026-lab3:week-3:fall-2026-lab3-boss-remix:created-2", parentAttemptId: bossId, rootAttemptId: root, remixGeneration: 1, questionCount: 6 }) }
  ]);

  const chains = sandbox.buildHistoryChains(records);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].rootAttemptId, root);
  assert.equal(chains[0].attemptCount, 3);
  assert.equal(chains[0].quizWeek, 3);

  // Every attempt keeps its own score and question count.
  deepEqualAcrossRealms(
    chains[0].attempts.map((attempt) => `${attempt.score}/${attempt.total}`),
    ["2/6", "3/5", "8/10"]
  );

  // The 10-question practice and the 6-question Remix never share a family.
  const families = sandbox.buildHistoryFamilies(records);
  assert.equal(families.length, 3);
  for (const family of families) {
    assert.equal(family.attemptCount, 1);
    assert.equal(family.mixedQuestionCounts, false);
  }
  assert.equal(new Set(families.map((family) => family.attemptTypeId)).size, 3);
});

test("T-22 no chain is inferred where lineage is absent", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const timestamp = localDate(2026, 8, 18).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "generated-custom-quiz-thing-q10", mode: "easy", score: 8, total: 10, timestamp },
    { quizId: "generated-custom-quiz-thing-q6", mode: "boss", score: 3, total: 6, timestamp }
  ]);
  deepEqualAcrossRealms(sandbox.buildHistoryChains(records), []);
});

// --- family identity and retention disclosure --------------------------------

test("a display family survives a changing question-count suffix without merging scores", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const base = localDate(2026, 8, 18, 9, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "generated-custom-quiz-weak-area-playlist-list-brand-recovery-q10",
      mode: "playlist", title: "Brand Recovery — 10 Questions", score: 7, total: 10, timestamp: base },
    { quizId: "generated-custom-quiz-weak-area-playlist-list-brand-recovery-q20",
      mode: "playlist", title: "Brand Recovery — 20 Questions", score: 18, total: 20, timestamp: base + 60000 }
  ]);

  const families = sandbox.buildHistoryFamilies(records);
  assert.equal(families.length, 1, "the question-count suffix must not split one playlist family");
  assert.equal(families[0].attemptCount, 2);
  deepEqualAcrossRealms(families[0].questionCounts, [10, 20]);
  assert.equal(families[0].mixedQuestionCounts, true);
  assert.equal(families[0].averageRatio, null, "differently sized attempts never average into one score");
  assert.equal(families[0].bestRatio, 0.9);
  deepEqualAcrossRealms(families[0].attempts.map((a) => `${a.score}/${a.total}`), ["18/20", "7/10"]);
});

test("a static quiz id ending in a q-number keeps its own identity", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const [record] = sandbox.normalizeHistoryRecords([
    { quizId: "practice-q2", mode: "easy", score: 5, total: 10, timestamp: localDate(2026, 8, 18).getTime() }
  ]);
  assert.ok(record.familyKey.includes("practice-q2"), "only generated ids drop the question-count suffix");
});

test("the 200-record retention notice appears only at the retained boundary", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const base = localDate(2026, 8, 1, 9, 0).getTime();
  const build = (count) => sandbox.normalizeHistoryRecords(
    Array.from({ length: count }, (_, index) => ({
      quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp: base + (index * 60000)
    }))
  );

  const belowCap = build(HISTORY_RETENTION_LIMIT - 1);
  assert.equal(sandbox.isHistoryRetentionBoundaryReached(belowCap, belowCap), false);

  const atCap = build(HISTORY_RETENTION_LIMIT);
  assert.equal(sandbox.isHistoryRetentionBoundaryReached(atCap, atCap), true);
  assert.equal(
    sandbox.isHistoryRetentionBoundaryReached(atCap, atCap.slice(1)),
    false,
    "a view that stops short of the oldest retained record makes no retention claim"
  );
});

test("filter options are derived from the records actually in view", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const timestamp = localDate(2026, 8, 18).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp },
    { quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6", mode: "bossRemix", score: 4, total: 6, timestamp,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_REMIX_KIND, questionCount: 6, remixGeneration: 1 }) },
    { quizId: "generated-mystery-thing", mode: "", score: 1, total: 4, timestamp }
  ]);

  deepEqualAcrossRealms(
    sandbox.getAvailableAttemptTypes(records).map((type) => type.id),
    ["boss-remixes", "generated-sets", "standard-practice"]
  );
  deepEqualAcrossRealms(
    sandbox.getAvailableCurriculumOptions(records).map((option) => `${option.id}:${option.count}`),
    ["P1:1", "P2:1", "unclassified:1"]
  );
  deepEqualAcrossRealms(sandbox.getAvailableScopeOptions(records, "lab").map((o) => o.id), ["Lab III"]);
  deepEqualAcrossRealms(sandbox.getAvailableScopeOptions(records, "quizWeek").map((o) => o.label), ["Week 3"]);
});

test("assets/js/stats.js remains a plain top-level browser script", () => {
  const stats = read("assets/js/stats.js");
  assert.doesNotMatch(stats, /^\s*(import|export)\s/m, "Stats must not become an ES module");
  assert.doesNotMatch(stats, /^\(function\s*\(/m, "Stats must not become an IIFE");
  assert.doesNotMatch(stats, /require\(/, "Stats must not adopt a module loader");
});
