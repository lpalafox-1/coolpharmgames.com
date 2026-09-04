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
    set innerHTML(value) { html = String(value ?? ""); text = stripTags(html); element.children.length = 0; },
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

function renderedHtml(element) {
  if (!element) return "";
  return element.innerHTML + element.children.map(renderedHtml).join("");
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

// --- T-20 unclassified disclosure count --------------------------------------

test("T-20 the disclosed excluded count equals the records the filter omitted", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const timestamp = localDate(2026, 8, 18).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp },
    { quizId: "generated-mystery-one", mode: "", score: 1, total: 4, timestamp },
    { quizId: "generated-mystery-two", mode: "", score: 2, total: 4, timestamp },
    { quizId: "generated-mystery-three", mode: "", score: 3, total: 4, timestamp },
    { quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10", mode: "easy", score: 9, total: 10, timestamp,
      attemptLineage: fallLineage() }
  ]);

  const unclassifiedTotal = records.filter((record) => !record.curriculumKnown).length;
  assert.equal(unclassifiedTotal, 3);

  // The default All view includes unclassified attempts and discloses nothing.
  const all = sandbox.filterHistoryRecords(records, { range: "all", curriculum: "all" });
  assert.equal(all.records.length, 5);
  assert.equal(all.excludedUnclassifiedCount, 0);

  for (const curriculum of ["P1", "P2"]) {
    const view = sandbox.filterHistoryRecords(records, { range: "all", curriculum });
    const omitted = records.length - view.records.length;
    const omittedUnclassified = records.filter(
      (record) => !record.curriculumKnown && !view.records.includes(record)
    ).length;
    assert.equal(view.excludedUnclassifiedCount, omittedUnclassified, `${curriculum} disclosure must match the omission`);
    assert.equal(view.excludedUnclassifiedCount, 3);
    assert.ok(omitted >= view.excludedUnclassifiedCount);
  }

  // Filtering *to* unclassified excludes nothing unclassified.
  const only = sandbox.filterHistoryRecords(records, { range: "all", curriculum: "unclassified" });
  assert.equal(only.records.length, 3);
  assert.equal(only.excludedUnclassifiedCount, 0);
});

test("T-20 the rendered disclosure states the live count, never a fixed one", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const timestamp = localDate(2026, 8, 18).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp },
    { quizId: "generated-mystery-one", mode: "", score: 1, total: 4, timestamp },
    { quizId: "generated-mystery-two", mode: "", score: 2, total: 4, timestamp }
  ]);

  sandbox.renderRecordedAttemptDashboard(records, { ...sandbox.getDefaultHistoryFilter(), curriculum: "P1" }, timestamp);
  const disclosure = sandbox.document.getElementById("history-disclosure").textContent;
  assert.match(disclosure, /^2 recorded attempts are unclassified and are not included in this filtered view\./);

  sandbox.renderRecordedAttemptDashboard(records.slice(0, 2), { ...sandbox.getDefaultHistoryFilter(), curriculum: "P1" }, timestamp);
  assert.match(
    sandbox.document.getElementById("history-disclosure").textContent,
    /^1 recorded attempt is unclassified and is not included in this filtered view\./
  );

  sandbox.renderRecordedAttemptDashboard(records, sandbox.getDefaultHistoryFilter(), timestamp);
  assert.equal(sandbox.document.getElementById("history-disclosure").textContent, "");
});

test("the retention disclosure appears only when the view reaches the oldest record", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  // One attempt per calendar day, so a Today window reaches only the newest.
  const build = (count) => sandbox.normalizeHistoryRecords(
    Array.from({ length: count }, (_, index) => ({
      quizId: "chapter1-review", mode: "easy", score: 8, total: 10,
      timestamp: localDate(2026, 8, 20, 9, 0 - ((count - 1 - index) * 24 * 60)).getTime()
    }))
  );
  const retentionPattern = new RegExp(`most recent ${HISTORY_RETENTION_LIMIT} recorded attempts`);
  const now = localDate(2026, 8, 20, 12, 0).getTime();

  sandbox.renderRecordedAttemptDashboard(build(HISTORY_RETENTION_LIMIT - 1), sandbox.getDefaultHistoryFilter(), now);
  assert.doesNotMatch(sandbox.document.getElementById("history-disclosure").textContent, retentionPattern);

  sandbox.renderRecordedAttemptDashboard(build(HISTORY_RETENTION_LIMIT), sandbox.getDefaultHistoryFilter(), now);
  assert.match(sandbox.document.getElementById("history-disclosure").textContent, retentionPattern);

  // A narrow window that stops short of the oldest record makes no claim.
  sandbox.renderRecordedAttemptDashboard(build(HISTORY_RETENTION_LIMIT), { ...sandbox.getDefaultHistoryFilter(), range: "today" }, now);
  assert.doesNotMatch(sandbox.document.getElementById("history-disclosure").textContent, retentionPattern);
});

// --- T-04 no-write invariant across filter interactions ----------------------

test("T-04 non-destructive filter changes leave every watched store byte-identical", () => {
  const timestamp = localDate(2026, 8, 18).getTime();
  const watched = {
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

  const history = [
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp },
    { quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6", mode: "bossRemix", score: 4, total: 6, timestamp,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_REMIX_KIND, questionCount: 6, remixGeneration: 1 }) },
    { quizId: "generated-mystery", mode: "", score: 1, total: 4, timestamp }
  ];

  const sandbox = loadStatsSandbox({ history, localExtras: watched, sessionExtras: { "pharmlet.session.lastRound.x": "1" } });
  const records = sandbox.normalizeHistoryRecords(sandbox.getHistory());
  sandbox.renderRecordedAttemptDashboard(records, sandbox.getDefaultHistoryFilter(), timestamp);

  const localBefore = sandbox.__localStorage.snapshot();
  const sessionBefore = sandbox.__sessionStorage.snapshot();

  for (const [key, value] of [
    ["range", "today"], ["range", "7d"], ["range", "30d"], ["range", "custom"],
    ["customStart", "2026-08-01"], ["customEnd", "2026-08-31"],
    ["curriculum", "P1"], ["curriculum", "P2"], ["curriculum", "unclassified"], ["curriculum", "all"],
    ["attemptType", "boss-remixes"], ["attemptType", "standard-practice"], ["attemptType", "all"],
    ["semester", "Fall 2026"], ["lab", "Lab III"], ["week", "3"],
    ["range", "all"]
  ]) {
    assert.doesNotThrow(() => sandbox.applyHistoryFilterChange(key, value), `changing ${key} must not throw`);
    assert.equal(sandbox.__localStorage.snapshot(), localBefore, `changing ${key} must not write local storage`);
    assert.equal(sandbox.__sessionStorage.snapshot(), sessionBefore, `changing ${key} must not write session storage`);
  }
});

// --- T-23 region scope --------------------------------------------------------

test("T-23 attempt filters never reach the Review Queue or Question Reports regions", async () => {
  const timestamp = localDate(2026, 8, 18).getTime();
  const sandbox = loadStatsSandbox({
    history: [
      { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp },
      { quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10", mode: "easy", score: 9, total: 10, timestamp,
        attemptLineage: fallLineage() }
    ],
    localExtras: {
      [REVIEW_KEY]: JSON.stringify([{
        quizId: "chapter1-review", type: "mcq", prompt: "Which drug is a statin?",
        answer: "Atorvastatin", userAnswer: "Lisinopril", timestamp: "2026-01-01T00:00:00.000Z"
      }]),
      [REPORTS_KEY]: JSON.stringify([{
        quizId: "chapter1-review", promptText: "A confusing prompt",
        correctAnswer: "A", userAnswer: "B", timestamp: "2026-01-02T00:00:00.000Z"
      }])
    }
  });

  await sandbox.loadStats();
  const missedBefore = renderedHtml(sandbox.document.getElementById("missed-stats"));
  const reportsBefore = renderedHtml(sandbox.document.getElementById("question-reports"));
  const quizStatsBefore = renderedHtml(sandbox.document.getElementById("quiz-stats"));
  assert.ok(missedBefore.includes("Atorvastatin"), "the Review Queue region must have rendered");
  assert.ok(reportsBefore.includes("A confusing prompt"), "the Question Reports region must have rendered");

  // A curriculum the slice really contains, so the history regions must move.
  const view = sandbox.applyHistoryFilterChange("curriculum", "P2");
  assert.equal(view.filter.curriculum, "P2", "the selected curriculum is genuinely available");
  assert.equal(view.records.length, 1, "the history slice narrowed");

  assert.notEqual(renderedHtml(sandbox.document.getElementById("quiz-stats")), quizStatsBefore, "history regions do follow the filter");
  assert.equal(renderedHtml(sandbox.document.getElementById("missed-stats")), missedBefore, "Most Missed must not follow attempt filters");
  assert.equal(renderedHtml(sandbox.document.getElementById("question-reports")), reportsBefore, "Question Reports must not follow attempt filters");
});

test("conditionally shown dashboard regions can actually be hidden", () => {
  const page = read("stats.html");
  // Tailwind's grid/flex utilities and .filter-field both set `display`, which
  // outranks the user-agent [hidden] rule; without this the custom-range and
  // empty scope fields stay visible after being hidden in JS.
  assert.match(page, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  for (const id of ["filter-custom-range", "filter-semester-field", "filter-lab-field", "filter-week-field", "fall-chain-section"]) {
    assert.ok(page.includes(`id="${id}"`), `#${id} must exist to be toggled`);
  }
  assert.match(statsSource, /function setFieldHidden\(/);
});

test("T-23 the page states which regions the attempt filters cover", () => {
  const page = read("stats.html");
  assert.match(page, /These filters apply to your saved attempt history only/);
  assert.match(page, /Lifetime Review Queue weakness memory\. The recorded-attempt filters above do not apply to this section\./);
  assert.match(page, /Boss Remix deliberately writes no Review Queue or adaptive weakness signals/);
  assert.match(page, /Saved separately from attempt history; the filters above do not apply here\./);
  assert.match(page, /not lifetime totals/);
});

// --- T-09 / T-10 reset semantics ---------------------------------------------

test("T-09 Clear All Stats stays global and keeps only the theme preference", () => {
  const sandbox = loadStatsSandbox({
    history: [LEGACY_MINIMAL_RECORD],
    localExtras: {
      "pharmlet.theme": "dark",
      [REVIEW_KEY]: "[]",
      [REPORTS_KEY]: "[]",
      [FAVORITES_KEY]: "[]",
      [SIGNALS_KEY]: "{}",
      "unrelated.key": "keep-me"
    },
    sessionExtras: { "pharmlet.session.lastRound.x": "1", "other.session": "keep-me" }
  });

  const result = sandbox.clearAllStudyData();
  assert.equal(result.local, 5, "every non-theme pharmlet local key is cleared");
  assert.equal(result.session, 1);
  assert.equal(sandbox.__localStorage.getItem("pharmlet.theme"), "dark", "theme preference survives");
  assert.equal(sandbox.__localStorage.getItem("unrelated.key"), "keep-me", "foreign keys are untouched");
  assert.equal(sandbox.__localStorage.getItem(HISTORY_KEY), null);
  assert.equal(sandbox.__sessionStorage.getItem("other.session"), "keep-me");
});

test("T-10 Reset Adaptive Memory keeps its narrow generator scope", () => {
  const sandbox = loadStatsSandbox({
    history: [LEGACY_MINIMAL_RECORD],
    localExtras: {
      [SIGNALS_KEY]: JSON.stringify({ version: 1 }),
      [RECENT_RUNS_KEY]: JSON.stringify([{ at: 1 }]),
      [REVIEW_KEY]: "[]",
      [FAVORITES_KEY]: "[]"
    },
    sessionExtras: {
      "pharmlet.session.lastRound.pharmlet.log-lab-final-2.easy": "1",
      "pharmlet.session.lastRound.pharmlet.lab1.week3.easy": "1",
      "pharmlet.session.lastRound.pharmlet.something-else": "1"
    }
  });

  const result = sandbox.clearTopDrugsGeneratorMemory();
  assert.equal(result.local, 2, "only the two adaptive Top Drugs keys are cleared");
  assert.equal(result.session, 2, "only Top Drugs last-round keys are cleared");
  assert.equal(sandbox.__localStorage.getItem(HISTORY_KEY), JSON.stringify([LEGACY_MINIMAL_RECORD]), "history survives");
  assert.equal(sandbox.__localStorage.getItem(REVIEW_KEY), "[]", "the review queue survives");
  assert.equal(sandbox.__localStorage.getItem(FAVORITES_KEY), "[]", "favorites survive");
  assert.equal(sandbox.__sessionStorage.getItem("pharmlet.session.lastRound.pharmlet.something-else"), "1");
});

// --- T-11 backup round trip ---------------------------------------------------

test("T-11 backup keeps version 2 and replace-style import semantics", () => {
  const historyRaw = JSON.stringify([LEGACY_MINIMAL_RECORD]);
  const sandbox = loadStatsSandbox({
    history: historyRaw,
    localExtras: { [FAVORITES_KEY]: JSON.stringify(["ceutics-practice-1"]), "unrelated.key": "ignored" },
    sessionExtras: { "pharmlet.session.lastRound.x": "1" }
  });

  const payload = sandbox.collectProgressBackupData();
  assert.equal(payload.app, "pharm-let");
  assert.equal(payload.version, 2, "the backup format stays at version 2");
  assert.equal(payload.localStorage[HISTORY_KEY], historyRaw);
  assert.equal(payload.localStorage[FAVORITES_KEY], JSON.stringify(["ceutics-practice-1"]));
  assert.equal(Object.hasOwn(payload.localStorage, "unrelated.key"), false, "only pharmlet keys are exported");
  assert.equal(payload.sessionStorage["pharmlet.session.lastRound.x"], "1");

  const parsed = sandbox.parseProgressBackup(JSON.stringify(plain(payload)));
  assert.equal(parsed.version, 2);
  assert.throws(() => sandbox.parseProgressBackup("[]"), /localStorage/);
  assert.throws(
    () => sandbox.parseProgressBackup(JSON.stringify({ localStorage: { "evil.key": "x" } })),
    /unexpected key/
  );

  // Import replaces the existing pharmlet keys rather than merging them.
  sandbox.confirm = () => true;
  sandbox.document.getElementById("progress-transfer-data").value = JSON.stringify({
    app: "pharm-let",
    version: 2,
    localStorage: { [HISTORY_KEY]: "[]" },
    sessionStorage: {}
  });
  sandbox.importProgressBackup();

  assert.equal(sandbox.__localStorage.getItem(HISTORY_KEY), "[]");
  assert.equal(sandbox.__localStorage.getItem(FAVORITES_KEY), null, "import replaces rather than merges");
  assert.equal(sandbox.__localStorage.getItem("unrelated.key"), "ignored", "foreign keys are left alone");
  assert.equal(sandbox.__sessionStorage.getItem("pharmlet.session.lastRound.x"), null);
});

// --- T-14 cache tokens --------------------------------------------------------

test("T-14 only the Stats cache token moved for P2F-08", () => {
  const statsPage = read("stats.html");
  const quizPage = read("quiz.html");

  const statsToken = /assets\/js\/stats\.js\?v=([^"'\s>]+)/.exec(statsPage)?.[1];
  assert.ok(statsToken, "stats.html must load Stats with a cache token");
  assert.match(statsToken, /^\d{8}[a-z]$/, "the Stats token follows the YYYYMMDD + letter convention");
  assert.notEqual(statsToken, "20260831a", "a changed Stats bundle needs a fresh token");

  // Every other bundle keeps the token it already had.
  assert.match(quizPage, /assets\/js\/quizEngine\.js\?v=20260901a/);
  assert.match(quizPage, /assets\/js\/curriculum-metadata\.js\?v=20260831b/);
  assert.match(statsPage, /assets\/js\/curriculum-metadata\.js\?v=20260831b/);
  assert.match(statsPage, /assets\/js\/quiz-catalog\.js\?v=20260831b/);
  assert.match(statsPage, /assets\/js\/question-reports\.js\?v=20260831b/);
  assert.match(statsPage, /assets\/js\/review-queue-store\.js\?v=20260903a/);
  assert.match(statsPage, /assets\/js\/top-drugs-data\.js\?v=20260419a/);

  // The adapter must be in place before Stats consumes it.
  assert.ok(
    statsPage.indexOf("assets/js/curriculum-metadata.js") < statsPage.indexOf("assets/js/stats.js"),
    "the curriculum adapter must load before Stats"
  );
});

// --- T-15 deep links ----------------------------------------------------------

test("T-15 both required Stats deep-link anchors survive", () => {
  const page = read("stats.html");
  for (const anchor of ["morning-warmup-section", "weak-area-playlists-section"]) {
    assert.ok(page.includes(`id="${anchor}"`), `#${anchor} must remain a stable deep link`);
  }

  // The launchers behind those anchors are still wired.
  assert.match(statsSource, /function launchMorningWarmup\(/);
  assert.match(statsSource, /function launchWeakAreaPlaylist\(/);
  assert.match(statsSource, /data-warmup-key/);
  assert.match(statsSource, /data-playlist-key/);
  for (const id of ["morning-warmups", "weak-area-playlists", "missed-stats", "question-reports", "category-stats"]) {
    assert.ok(page.includes(`id="${id}"`), `#${id} must remain available`);
  }
});

// --- T-16 no network ----------------------------------------------------------

test("T-16 Stats introduces no network behaviour", () => {
  for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/, /EventSource/, /navigator\.connection/]) {
    assert.doesNotMatch(statsSource, pattern, `Stats must not use ${pattern}`);
  }
  // The page's CSP still restricts connections to same-origin.
  assert.match(read("stats.html"), /connect-src 'self';/);
});

// --- T-17 protected hashes ----------------------------------------------------

test("T-17 every protected hash except the approved Stats baseline is unchanged", () => {
  const contract = read("tools/curriculum-metadata-contract.test.mjs");
  const readBaseline = (key) => {
    const match = new RegExp(`${key}: "([0-9a-f]{64})"`).exec(contract);
    assert.ok(match, `the contract suite must still pin a ${key} baseline`);
    return match[1];
  };

  // Values pinned before P2F-08; none of these files are in scope.
  const UNCHANGED = Object.freeze({
    fallSource: "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01",
    fallPolicy: "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171",
    masterPool: "1fb50e96e60252a9839406d53bc929e9569d76c0ddc2522aff43adf9bdf2a87c",
    fallGenerator: "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a",
    fallLauncher: "255ef32be7b47e3f12f3b02da5db5a91e9040a5ee9fe406f68029e783a98157c",
    quizEngine: "6dc5c2f6d467742e837435be1d120f1110eb9faacb9d985898efad52a5c8a507",
    reviewQueueStore: "169c528d77fe0a185b801c7bcc61949adad803eeb839be96fa1354dbe9937ba3",
    favorites: "b6fbd5bbca17ea150e34e9b29c9e6391b5ae7359d7b6afb18fe6c7e7caed781d"
  });
  const PATHS = Object.freeze({
    fallSource: "assets/data/fall-2026-p2-top-drugs.json",
    fallPolicy: "assets/data/fall-2026-lab3-quiz-policy.json",
    masterPool: "assets/data/master_pool.json",
    fallGenerator: "assets/js/fall-2026-quiz-generator.js",
    fallLauncher: "assets/js/fall-2026-lab3-launcher.js",
    quizEngine: "assets/js/quizEngine.js",
    reviewQueueStore: "assets/js/review-queue-store.js",
    favorites: "assets/js/favorites.js"
  });

  for (const [key, expected] of Object.entries(UNCHANGED)) {
    assert.equal(sha256(PATHS[key]), expected, `${PATHS[key]} must remain byte-identical`);
    assert.equal(readBaseline(key), expected, `the ${key} baseline must not be moved`);
  }

  // Stats is the single approved exception, and its baseline tracks the file.
  assert.equal(readBaseline("stats"), sha256("assets/js/stats.js"), "the Stats baseline must match the shipped file");
  assert.notEqual(
    readBaseline("stats"),
    "707fbf045dd1249989e3edb9c2c13666e9f2369dc75f2d2f52750b9f4688c034",
    "the Stats baseline moved with the intended change"
  );

  // Other in-scope modules are untouched by P2F-08.
  for (const untouched of ["assets/js/curriculum-metadata.js", "assets/js/quiz-catalog.js", "assets/js/question-reports.js"]) {
    assert.ok(sha256(untouched), `${untouched} must still exist`);
  }
  assert.equal(
    read("tools/fall-2026-lab3-completion-continuation.test.mjs").includes("assets/js/quizEngine.js?v="),
    true,
    "the F26-09 engine-token guard stays in place"
  );
});

// --- filter derivation --------------------------------------------------------

test("contextual scope options narrow with the selected higher-level slice", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "lab-1-week-2", mode: "easy", score: 8, total: 10, timestamp: now },
    { quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10", mode: "easy", score: 9, total: 10, timestamp: now,
      attemptLineage: fallLineage() }
  ]);

  const all = sandbox.resolveHistoryView(records, sandbox.getDefaultHistoryFilter(), now);
  deepEqualAcrossRealms(all.options.labs.map((o) => o.id), ["Lab I", "Lab III"]);

  const p2 = sandbox.resolveHistoryView(records, { ...sandbox.getDefaultHistoryFilter(), curriculum: "P2" }, now);
  deepEqualAcrossRealms(p2.options.labs.map((o) => o.id), ["Lab III"], "labs narrow to the selected curriculum");
  deepEqualAcrossRealms(p2.options.weeks.map((o) => o.id), ["3"]);
  assert.equal(p2.records.length, 1);

  // A selection that matches nothing is KEPT, not silently released, and is
  // surfaced instead of leaving the user to notice a control changed itself.
  const stale = sandbox.resolveHistoryView(records, { ...sandbox.getDefaultHistoryFilter(), curriculum: "P2", lab: "Lab I" }, now);
  assert.equal(stale.filter.lab, "Lab I", "the user's own selection survives");
  assert.equal(stale.filter.curriculum, "P2");
  assert.equal(stale.records.length, 0);
  // Neither choice is satisfiable given the other, so both are reported
  // rather than blaming whichever control happens to be narrower.
  deepEqualAcrossRealms(stale.unmatchedFilters.map((entry) => entry.key), ["curriculum", "lab"]);
  assert.ok(stale.options.labs.some((option) => option.id === "Lab I" && option.count === 0),
    "the unmatched choice stays visible in its control, counted honestly at zero");
});

test("B1 a scope filter discloses records that never recorded that dimension", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  // lab-quiz1 carries a lab; the chapter reviews are classified P1 but never
  // recorded one. Absence of the field is not evidence the attempt is out of
  // scope, so they must not vanish without a word.
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "lab-quiz1-antihypertensives", mode: "easy", score: 8, total: 10, timestamp: now },
    { quizId: "chapter1-review", mode: "easy", score: 7, total: 10, timestamp: now },
    { quizId: "chapter2-review", mode: "easy", score: 6, total: 10, timestamp: now }
  ]);
  assert.ok(records.every((record) => record.curriculumKnown), "all three are classified, so this is not the unclassified case");

  const view = sandbox.filterHistoryRecords(records, { range: "all", lab: "Lab I" }, now);
  assert.equal(view.records.length, 1);
  assert.equal(view.excludedUnclassifiedCount, 0, "these are classified; the unclassified note must not be borrowed");
  assert.equal(view.missingScopeCounts.lab, 2);
  assert.equal(view.excludedDisclosedCount, 2);

  sandbox.renderRecordedAttemptDashboard(records, { ...sandbox.getDefaultHistoryFilter(), lab: "Lab I" }, now);
  assert.match(sandbox.document.getElementById("history-disclosure").textContent,
    /2 recorded attempts have no saved lab, so they are not included in this filtered view\./);
});

test("B1 semester and week filters disclose their own missing dimension", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10", mode: "easy", score: 9, total: 10, timestamp: now,
      attemptLineage: fallLineage() },
    // Partial lineage (T-21 shape): recognized kind and week, no semester/lab.
    { quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6", mode: "bossRemix", score: 4, total: 6, timestamp: now,
      attemptLineage: { attemptKind: FALL_BOSS_REMIX_KIND, quizWeek: 3 } }
  ]);

  const bySemester = sandbox.filterHistoryRecords(records, { range: "all", semester: "Fall 2026" }, now);
  assert.equal(bySemester.records.length, 1);
  assert.equal(bySemester.missingScopeCounts.semester, 1);

  // Both attempts recorded week 3, so a week filter has nothing to disclose.
  const byWeek = sandbox.filterHistoryRecords(records, { range: "all", week: "3" }, now);
  assert.equal(byWeek.records.length, 2);
  assert.equal(byWeek.missingScopeCounts.week, undefined, "a dimension both records carry raises no note");
  assert.equal(byWeek.excludedDisclosedCount, 0);

  sandbox.renderRecordedAttemptDashboard(records, { ...sandbox.getDefaultHistoryFilter(), week: "3" }, now);
  assert.doesNotMatch(sandbox.document.getElementById("history-disclosure").textContent, /no saved week/);
});

test("B1 shown + disclosed + genuinely out-of-scope always equals the slice", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "lab-quiz1-antihypertensives", mode: "easy", score: 8, total: 10, timestamp: now },
    { quizId: "chapter1-review", mode: "easy", score: 7, total: 10, timestamp: now },
    { quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10", mode: "easy", score: 9, total: 10, timestamp: now,
      attemptLineage: fallLineage() },
    { quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6", mode: "bossRemix", score: 4, total: 6, timestamp: now,
      attemptLineage: { attemptKind: FALL_BOSS_REMIX_KIND, quizWeek: 3 } }
  ]);

  const scopeField = { semester: "semester", lab: "lab", week: "quizWeek" };
  const combinations = [
    { lab: "Lab III" }, { lab: "Lab I" }, { semester: "Fall 2026" }, { week: "3" },
    { curriculum: "P1" }, { curriculum: "P2" }, { curriculum: "unclassified" },
    { curriculum: "P2", lab: "Lab III" }, { semester: "Fall 2026", lab: "Lab III", week: "3" }
  ];

  for (const combination of combinations) {
    const filter = { ...sandbox.getDefaultHistoryFilter(), ...combination };
    const view = sandbox.filterHistoryRecords(records, filter, now);
    const active = Object.keys(scopeField).filter((key) => filter[key] !== "all");

    // A dropped record is legitimately out of scope only when it actually
    // recorded every dimension being filtered on; anything else owes the
    // reader an explanation.
    const outOfScope = records.filter((record) => !view.records.includes(record)
      && record.curriculumKnown
      && active.every((key) => {
        const value = record.curriculum[scopeField[key]];
        return value !== undefined && value !== null && String(value) !== "";
      }));

    assert.equal(
      view.records.length + view.excludedDisclosedCount + outOfScope.length,
      records.length,
      `every record is shown, disclosed, or provably out of scope for ${JSON.stringify(combination)}`
    );
  }
});

test("B2 filter options are faceted against every other active filter", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp: now },
    { quizId: "generated-custom-quiz-fall-2026-lab3-boss-remix-q6", mode: "bossRemix", score: 4, total: 6, timestamp: now,
      attemptLineage: fallLineage({ attemptKind: FALL_BOSS_REMIX_KIND, questionCount: 6, remixGeneration: 1 }) }
  ]);

  // The Boss Remix attempt is P2, so a P1 view must not advertise it at all.
  const p1 = sandbox.resolveHistoryView(records, { ...sandbox.getDefaultHistoryFilter(), curriculum: "P1" }, now);
  assert.ok(!p1.options.attemptTypes.some((option) => option.id === "boss-remixes"),
    "an attempt type with no records under the selected curriculum is not offered");
  deepEqualAcrossRealms(p1.options.attemptTypes.map((option) => option.id), ["standard-practice"]);

  // Faceting is symmetric: the curriculum control is counted against the
  // selected attempt type, and every offered count is the count you get.
  const remix = sandbox.resolveHistoryView(records, { ...sandbox.getDefaultHistoryFilter(), attemptType: "boss-remixes" }, now);
  deepEqualAcrossRealms(remix.options.curricula.map((option) => `${option.id}:${option.count}`), ["P2:1"]);

  for (const option of remix.options.curricula) {
    const probe = sandbox.resolveHistoryView(records, { ...remix.filter, curriculum: option.id }, now);
    assert.equal(probe.records.length, option.count, `selecting ${option.id} must yield exactly its advertised count`);
  }
});

test("B2 an empty control value is absence of a filter, not a phantom filter", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp: now },
    { quizId: "chapter2-review", mode: "easy", score: 6, total: 10, timestamp: now }
  ]);

  // A <select> reports "" when its value is no longer among its options.
  const view = sandbox.resolveHistoryView(records, { ...sandbox.getDefaultHistoryFilter(), attemptType: "", lab: "" }, now);
  assert.equal(view.filter.attemptType, "all");
  assert.equal(view.filter.lab, "all");
  assert.equal(view.records.length, 2, "an empty value must not filter anything out");
  deepEqualAcrossRealms(view.unmatchedFilters, [], "absence of a choice is not an unmatched choice");

  sandbox.renderRecordedAttemptDashboard(records, { ...sandbox.getDefaultHistoryFilter(), attemptType: "" }, now);
  const summary = sandbox.document.getElementById("history-filter-summary").textContent;
  assert.doesNotMatch(summary, /·\s*$/, "no trailing separator for a filter that is not set");
  assert.equal(summary, "Showing 2 of 2 recorded attempts · All time");
});

test("B2 narrowing then widening never loses a selection the user made", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp: now },
    { quizId: "generated-custom-quiz-fall-2026-lab3-practice-q10", mode: "easy", score: 9, total: 10, timestamp: now,
      attemptLineage: fallLineage() }
  ]);

  sandbox.renderRecordedAttemptDashboard(records, { ...sandbox.getDefaultHistoryFilter(), curriculum: "P2", lab: "Lab III" }, now);

  // Narrow onto a combination with nothing behind it...
  const narrowed = sandbox.applyHistoryFilterChange("attemptType", "boss-remixes");
  assert.equal(narrowed.records.length, 0);
  assert.equal(narrowed.filter.curriculum, "P2", "the curriculum choice is not collateral damage");
  assert.equal(narrowed.filter.lab, "Lab III");
  assert.match(sandbox.document.getElementById("history-disclosure").textContent,
    /No recorded attempts in this view match the selected attempt type/);

  // ...then widen back and the user's own choices are still exactly as set.
  const widened = sandbox.applyHistoryFilterChange("attemptType", "all");
  assert.equal(widened.filter.curriculum, "P2");
  assert.equal(widened.filter.lab, "Lab III");
  assert.equal(widened.records.length, 1);
});

test("a filtered overview reports the selected view, not lifetime totals", () => {
  const sandbox = loadStatsSandbox({ history: [] });
  const now = localDate(2026, 8, 20, 12, 0).getTime();
  const records = sandbox.normalizeHistoryRecords([
    { quizId: "chapter1-review", mode: "easy", score: 10, total: 10, bestStreak: 10, timestamp: now },
    { quizId: "chapter2-review", mode: "easy", score: 2, total: 10, bestStreak: 2, timestamp: localDate(2026, 7, 1, 12, 0).getTime() }
  ]);

  sandbox.renderRecordedAttemptDashboard(records, { ...sandbox.getDefaultHistoryFilter(), range: "today" }, now);
  const readOverview = (id) => sandbox.document.getElementById(id).textContent;
  assert.equal(readOverview("total-questions"), "10", "questions come from the selected attempts only");
  assert.equal(readOverview("avg-score"), "100.0%");
  assert.equal(readOverview("best-streak"), "10", "the best streak is the best among the selected attempts");
  assert.equal(readOverview("study-days"), "1", "a Today filter may legitimately show one study day");
  assert.match(sandbox.document.getElementById("overview-scope").textContent, /not lifetime totals/);

  sandbox.applyHistoryFilterChange("range", "all");
  assert.equal(readOverview("total-questions"), "20");
  assert.equal(readOverview("avg-score"), "60.0%");
  assert.equal(readOverview("study-days"), "2");
});

// --- P2F-09 Stats-side Review Queue gates ------------------------------------

function strictFitbEntry(overrides = {}) {
  return {
    quizId: "chapter1-review",
    title: "Chapter 1 Review",
    type: "fitb",
    prompt: "Generic name for Lopressor?",
    answer: "Metoprolol",
    answerText: "Metoprolol",
    userAnswer: "metaprolol",
    missCount: 2,
    wrongCounts: { metaprolol: 2 },
    lastUserAnswer: "metaprolol",
    timestamp: "2026-08-01T12:00:00.000Z",
    metadata: { answerMatching: { spellingSensitive: true, capitalizationSensitive: false } },
    _acceptedAnswers: ["Metoprolol", "Metoprolol tartrate"],
    ...overrides
  };
}

// G12 Stats strict-FITB parity.
test("G12 a Stats-launched review question keeps the strict FITB contract", () => {
  const sandbox = loadStatsSandbox({ history: [], localExtras: { [REVIEW_KEY]: JSON.stringify([strictFitbEntry()]) } });
  const [entry] = sandbox.getReviewQueue();
  const question = sandbox.buildReviewQueuePlaylistQuestion(entry);

  assert.equal(question.answer, "Metoprolol", "the expected answer is preserved exactly");
  assert.equal(question.metadata.answerMatching.spellingSensitive, true);
  assert.equal(question.metadata.answerMatching.capitalizationSensitive, false);
  deepEqualAcrossRealms(question._acceptedAnswers, ["Metoprolol", "Metoprolol tartrate"],
    "every accepted answer survives the launch");
});

test("G12 a missing or malformed strict marker never broadens matching", () => {
  const malformed = [
    { metadata: undefined },
    { metadata: {} },
    { metadata: { answerMatching: {} } },
    { metadata: { answerMatching: { spellingSensitive: false, capitalizationSensitive: false } } },
    { metadata: { answerMatching: { spellingSensitive: true, capitalizationSensitive: true } } },
    { metadata: { answerMatching: { spellingSensitive: "true", capitalizationSensitive: false } } }
  ];

  for (const overrides of malformed) {
    const sandbox = loadStatsSandbox({
      history: [],
      localExtras: { [REVIEW_KEY]: JSON.stringify([strictFitbEntry(overrides)]) }
    });
    const [entry] = sandbox.getReviewQueue();
    const question = sandbox.buildReviewQueuePlaylistQuestion(entry);
    assert.equal(Object.hasOwn(question, "metadata"), false,
      `${JSON.stringify(overrides)} must not produce a strict marker`);
    assert.equal(Object.hasOwn(question, "_acceptedAnswers"), false,
      `${JSON.stringify(overrides)} must not carry accepted answers`);
  }

  // A valid marker with a non-array accepted-answer value keeps the marker but
  // adds no accepted answers.
  const sandbox = loadStatsSandbox({
    history: [],
    localExtras: { [REVIEW_KEY]: JSON.stringify([strictFitbEntry({ _acceptedAnswers: "Metoprolol" })]) }
  });
  const [entry] = sandbox.getReviewQueue();
  const question = sandbox.buildReviewQueuePlaylistQuestion(entry);
  assert.equal(question.metadata.answerMatching.spellingSensitive, true);
  assert.equal(Object.hasOwn(question, "_acceptedAnswers"), false);
});

// G11/G12 parity: the two launch paths must agree.
test("G11 direct and Stats launches build the same strict scoring contract", () => {
  const reviewSource = read("assets/js/review-queue.js");
  const statsSource = read("assets/js/stats.js");

  // Both gate on the same validated marker shape before copying anything.
  for (const [name, source] of [["review-queue.js", reviewSource], ["stats.js", statsSource]]) {
    assert.match(source, /answerMatching\?\.spellingSensitive === true/, `${name} validates spelling sensitivity`);
    assert.match(source, /answerMatching\?\.capitalizationSensitive === false/, `${name} validates capitalization`);
    assert.match(source, /Array\.isArray\([^)]*_acceptedAnswers\)/, `${name} copies accepted answers only as an array`);
  }
});

// G13 Stats read-only boundary for the review queue.
test("G13 Stats never writes pharmlet.review-queue", () => {
  const queue = [strictFitbEntry(), { ...strictFitbEntry(), quizId: "chapter2-review", prompt: "Another prompt?" }];
  const raw = JSON.stringify(queue);
  const sandbox = loadStatsSandbox({
    history: [
      { quizId: "chapter1-review", mode: "easy", score: 8, total: 10, timestamp: Date.now() },
      { quizId: "chapter2-review", mode: "easy", score: 5, total: 10, timestamp: Date.now() - 86400000 }
    ],
    localExtras: { [REVIEW_KEY]: raw }
  });

  const readBack = () => sandbox.__localStorage.raw(REVIEW_KEY);
  assert.equal(readBack(), raw, "loading Stats leaves the queue untouched");

  sandbox.renderMostMissedQuestions(sandbox.getReviewQueue());
  assert.equal(readBack(), raw, "rendering Most Missed leaves the queue untouched");

  const records = sandbox.normalizeHistoryRecords(sandbox.getHistory());
  for (const change of [["range", "7"], ["curriculum", "P1"], ["attemptType", "all"], ["range", "all"]]) {
    sandbox.renderRecordedAttemptDashboard(records, { ...sandbox.getDefaultHistoryFilter(), [change[0]]: change[1] });
    assert.equal(readBack(), raw, `filter ${change[0]}=${change[1]} leaves the queue untouched`);
  }

  // Building a playlist reads the queue but must not rewrite it.
  sandbox.buildReviewQueuePlaylistQuestion(sandbox.getReviewQueue()[0]);
  assert.equal(readBack(), raw, "playlist construction leaves the queue untouched");
});
