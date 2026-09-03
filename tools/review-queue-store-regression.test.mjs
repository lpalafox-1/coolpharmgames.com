import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeSource = readFileSync(path.join(repoRoot, "assets/js/review-queue-store.js"), "utf8");

function loadStore() {
  return loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;
}

function missedRecord(overrides = {}) {
  return {
    quizId: "chapter1-review",
    title: "Chapter 1 Review",
    type: "mcq",
    prompt: "Metoprolol is which class?",
    answer: "Beta blocker",
    userAnswer: "ACE inhibitor",
    timestamp: "2026-07-01T12:00:00.000Z",
    ...overrides
  };
}

test("store exposes the full expected API surface", () => {
  const store = loadStore();
  const expected = [
    "STORAGE_VERSION", "MASTERED_STREAK_TARGET", "MASTERED_REFRESH_DAYS", "MAX_QUEUE_ITEMS",
    "toPlainText", "serializeAnswerValue", "normalizeQueue", "mergeMissedEntries",
    "applyReviewResults", "getActiveEntries", "isMasteryRefreshDue", "getMasteryAgeMs",
    "getEntryMissCount", "getLatestActivityTimestamp", "getCommonWrongAnswer",
    "getCommonWrongAnswerCount", "getMasterySummary", "getDisplayTitle", "getMostMissedQuestions"
  ];
  for (const name of expected) {
    assert.ok(name in store, `missing export: ${name}`);
  }
  assert.equal(store.STORAGE_VERSION, 2);
  assert.equal(store.MASTERED_STREAK_TARGET, 3);
  assert.equal(store.MASTERED_REFRESH_DAYS, 21);
  assert.equal(store.MAX_QUEUE_ITEMS, 500);
});

test("a missed question creates a v2 entry with the documented key grammar", () => {
  const store = loadStore();
  const queue = store.mergeMissedEntries([], [missedRecord()]);

  assert.equal(queue.length, 1);
  const entry = queue[0];
  assert.equal(entry.key, "chapter1-review::metoprolol is which class?::beta blocker");
  assert.equal(entry.version, 2);
  assert.equal(entry.missCount, 1);
  assert.equal(entry.clearStreak, 0);
  assert.equal(entry.archived, false);
  assert.equal(entry.lastUserAnswer, "ACE inhibitor");
  // P2F-09: one genuine miss records exactly one wrong-answer event. The entry
  // is built with aggregate counters present, so the legacy alias is never
  // folded on top of the miss itself.
  // (Spread copies the vm-realm object so deep-equal compares same-realm prototypes.)
  assert.deepEqual({ ...entry.wrongCounts }, { "ACE inhibitor": 1 });
  assert.equal(entry.lastMissedAt, "2026-07-01T12:00:00.000Z");
  assert.equal(Object.hasOwn(entry, "metadata"), false, "legacy entries must not gain strict metadata");
  assert.equal(Object.hasOwn(entry, "_acceptedAnswers"), false, "legacy entries must not gain accepted-answer fields");
});

test("strict scoring metadata and accepted answers survive queue normalization and updates", () => {
  const store = loadStore();
  const strictRecord = missedRecord({
    type: "short",
    prompt: "Brand for Semaglutide?",
    answer: "Ozempic",
    _acceptedAnswers: ["Rybelsus", "Wegovy"],
    metadata: {
      answerMatching: {
        spellingSensitive: true,
        capitalizationSensitive: false
      }
    }
  });

  let queue = store.mergeMissedEntries([], [strictRecord]);
  assert.deepEqual({ ...queue[0].metadata.answerMatching }, {
    spellingSensitive: true,
    capitalizationSensitive: false
  });
  assert.deepEqual([...queue[0]._acceptedAnswers], ["Rybelsus", "Wegovy"]);

  queue = store.applyReviewResults(queue, [{
    ...strictRecord,
    metadata: undefined,
    _acceptedAnswers: undefined,
    correct: true,
    timestamp: "2026-07-02T12:00:00.000Z"
  }]);
  assert.deepEqual({ ...queue[0].metadata.answerMatching }, {
    spellingSensitive: true,
    capitalizationSensitive: false
  });
  assert.deepEqual([...queue[0]._acceptedAnswers], ["Rybelsus", "Wegovy"]);

  const combined = store.normalizeQueue([
    queue[0],
    { ...strictRecord, _acceptedAnswers: ["Wegovy", "Rybelsus"] }
  ]);
  assert.deepEqual([...combined[0]._acceptedAnswers], ["Rybelsus", "Wegovy"]);
});

test("invalid scoring markers and unmarked accepted-answer fields are not persisted", () => {
  const store = loadStore();
  const queue = store.mergeMissedEntries([], [missedRecord({
    type: "short",
    _acceptedAnswers: ["Unmarked alternative"],
    metadata: {
      answerMatching: {
        spellingSensitive: true,
        capitalizationSensitive: true
      }
    }
  })]);

  assert.equal(Object.hasOwn(queue[0], "metadata"), false);
  assert.equal(Object.hasOwn(queue[0], "_acceptedAnswers"), false);
});

test("HTML and plain-text prompts deduplicate to the same entry", () => {
  const store = loadStore();
  const queue = store.mergeMissedEntries(
    store.mergeMissedEntries([], [missedRecord({ prompt: "<strong>Metoprolol</strong> is which class?" })]),
    [missedRecord()]
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0].missCount, 2);
  // Two genuine misses of the same wrong answer count exactly twice. The
  // intervening normalizeQueue pass inside mergeMissedEntries adds nothing.
  assert.deepEqual({ ...queue[0].wrongCounts }, { "ACE inhibitor": 2 });
});

test("array answers produce an order-independent signature", () => {
  const store = loadStore();
  const first = missedRecord({ prompt: "Brand names for lisinopril?", answer: ["Zestril", "Prinivil"] });
  const second = missedRecord({ prompt: "Brand names for lisinopril?", answer: ["Prinivil", "Zestril"] });
  const queue = store.mergeMissedEntries(store.mergeMissedEntries([], [first]), [second]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].missCount, 2);
  assert.ok(queue[0].key.endsWith("::prinivil||zestril"), queue[0].key);
});

test("three clean reviews master and archive an entry", () => {
  const store = loadStore();
  let queue = store.mergeMissedEntries([], [missedRecord()]);
  for (let i = 1; i <= 3; i += 1) {
    queue = store.applyReviewResults(queue, [
      { ...missedRecord(), correct: true, timestamp: `2026-07-0${i + 1}T12:00:00.000Z` }
    ]);
  }

  const entry = queue[0];
  assert.equal(entry.clearStreak, 3);
  assert.equal(entry.archived, true);
  assert.equal(entry.masteredAt, "2026-07-04T12:00:00.000Z");
  assert.equal(entry.reviewCorrectCount, 3);
  assert.equal(entry.reviewAttemptCount, 3);
});

test("a miss resets mastery completely", () => {
  const store = loadStore();
  let queue = store.mergeMissedEntries([], [missedRecord()]);
  for (let i = 1; i <= 3; i += 1) {
    queue = store.applyReviewResults(queue, [
      { ...missedRecord(), correct: true, timestamp: `2026-07-0${i + 1}T12:00:00.000Z` }
    ]);
  }
  queue = store.applyReviewResults(queue, [
    { ...missedRecord(), correct: false, userAnswer: "Calcium channel blocker", timestamp: "2026-07-05T12:00:00.000Z" }
  ]);

  const entry = queue[0];
  assert.equal(entry.clearStreak, 0);
  assert.equal(entry.archived, false);
  assert.equal(entry.masteredAt, null);
  assert.equal(entry.reviewMissCount, 1);
  assert.equal(entry.lastMissedAt, "2026-07-05T12:00:00.000Z");
  assert.equal(entry.wrongCounts["Calcium channel blocker"], 1);
});

test("mastered entries resurface after the 21-day refresh window", () => {
  const store = loadStore();
  const now = Date.now();
  const masteredEntry = (ageDays) => ({
    ...missedRecord(),
    clearStreak: 3,
    archived: true,
    masteredAt: new Date(now - ageDays * DAY_MS).toISOString(),
    lastReviewedAt: new Date(now - ageDays * DAY_MS).toISOString(),
    lastMissedAt: new Date(now - (ageDays + 5) * DAY_MS).toISOString(),
    createdAt: new Date(now - (ageDays + 10) * DAY_MS).toISOString()
  });

  assert.equal(store.isMasteryRefreshDue(masteredEntry(22), now), true);
  assert.equal(store.isMasteryRefreshDue(masteredEntry(20), now), false);

  assert.equal(store.getActiveEntries([masteredEntry(20)]).length, 0, "freshly mastered entries stay archived");
  assert.equal(store.getActiveEntries([masteredEntry(22)]).length, 1, "refresh-due entries resurface");
});

test("the queue is pruned to MAX_QUEUE_ITEMS entries", () => {
  const store = loadStore();
  const records = Array.from({ length: 505 }, (_, i) =>
    missedRecord({ prompt: `Unique question number ${i}?`, answer: `Answer ${i}` })
  );
  const queue = store.mergeMissedEntries([], records);
  assert.equal(queue.length, 500);
});

test("normalizeQueue drops invalid entries and combines duplicate keys", () => {
  const store = loadStore();
  const queue = store.normalizeQueue([
    { prompt: "", answer: "orphan answer" },
    { prompt: "No answer?", answer: "" },
    { ...missedRecord(), missCount: 2 },
    { ...missedRecord(), missCount: 3 }
  ]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].missCount, 5);
});

test("mastery summaries label each lifecycle stage", () => {
  const store = loadStore();
  const base = { ...missedRecord(), createdAt: "2026-07-01T12:00:00.000Z" };

  assert.equal(store.getMasterySummary({ ...base, clearStreak: 0 }).label, "Fresh miss");
  assert.equal(store.getMasterySummary({ ...base, clearStreak: 1 }).label, "1/3 clean reviews");
  assert.match(store.getMasterySummary({ ...base, clearStreak: 3, archived: true, masteredAt: new Date().toISOString() }).label, /^Mastered/);
  assert.match(
    store.getMasterySummary({
      ...base,
      clearStreak: 3,
      archived: true,
      masteredAt: new Date(Date.now() - 25 * DAY_MS).toISOString(),
      lastReviewedAt: new Date(Date.now() - 25 * DAY_MS).toISOString(),
      lastMissedAt: new Date(Date.now() - 30 * DAY_MS).toISOString(),
      createdAt: new Date(Date.now() - 40 * DAY_MS).toISOString()
    }).label,
    /^Refresh due/
  );
});

test("miss counts combine base and review misses", () => {
  const store = loadStore();
  assert.equal(store.getEntryMissCount({ missCount: 2, reviewMissCount: 3 }), 5);
});

test("most-missed aggregation groups identical questions across quizzes", () => {
  const store = loadStore();
  const queue = store.normalizeQueue([
    { ...missedRecord(), quizId: "chapter1-review", missCount: 2, wrongCounts: { "ACE inhibitor": 2 } },
    { ...missedRecord(), quizId: "lab-quiz1-antihypertensives", missCount: 1, wrongCounts: { "Diuretic": 1 } }
  ]);
  const [top] = store.getMostMissedQuestions(queue);

  assert.equal(top.misses, 3);
  assert.equal(top.quizCount, 2);
  assert.equal(top.commonWrong, "ACE inhibitor");
  // Exactly the stored historical value: both records carry wrongCounts, so
  // their lastUserAnswer aliases are never folded in on top of it.
  assert.equal(top.commonWrongCount, 2);
});

// --- P2F-09 weakness-integrity gates -----------------------------------------
// wrongCounts is authoritative whenever it exists; the legacy answer alias is a
// one-time conversion for records that predate aggregate counting.

function plainCounts(entry) {
  return { ...(entry?.wrongCounts || {}) };
}

// G1 Idempotence.
test("G1 normalizeQueue is idempotent across every fixture shape", () => {
  const store = loadStore();
  const fixtures = {
    v2: [{
      ...missedRecord(), version: 2, key: "k", missCount: 3, reviewMissCount: 1, reviewCorrectCount: 2,
      reviewAttemptCount: 3, clearStreak: 1, wrongCounts: { "ACE inhibitor": 3 }, lastUserAnswer: "ACE inhibitor"
    }],
    legacy: [{
      quizId: "chapter1-review", prompt: "Metoprolol is which class?", answer: "Beta blocker",
      userAnswer: "ACE inhibitor", timestamp: "2026-07-01T12:00:00.000Z"
    }],
    hybrid: [{ ...missedRecord(), missCount: 2, lastUserAnswer: "Diuretic" }],
    malformed: [
      null, 42, "nope", [], {},
      { prompt: "", answer: "" },
      { ...missedRecord(), wrongCounts: ["bogus"] },
      { ...missedRecord(), wrongCounts: { "ACE inhibitor": "many", Diuretic: -4, Statin: null } }
    ],
    duplicate: [missedRecord(), missedRecord(), { ...missedRecord(), prompt: "<b>Metoprolol</b> is which class?" }],
    strictFitb: [{
      ...missedRecord(), type: "fitb", answer: "Metoprolol",
      metadata: { answerMatching: { spellingSensitive: true, capitalizationSensitive: false } },
      _acceptedAnswers: ["Metoprolol", "metoprolol tartrate"]
    }],
    mastered: [{ ...missedRecord(), clearStreak: 3, archived: true, masteredAt: "2026-07-02T12:00:00.000Z" }],
    refreshDue: [{
      ...missedRecord(), clearStreak: 3, archived: true,
      masteredAt: new Date(Date.now() - (30 * DAY_MS)).toISOString(),
      lastReviewedAt: new Date(Date.now() - (30 * DAY_MS)).toISOString(),
      lastMissedAt: new Date(Date.now() - (40 * DAY_MS)).toISOString(),
      createdAt: new Date(Date.now() - (60 * DAY_MS)).toISOString()
    }]
  };

  for (const [name, fixture] of Object.entries(fixtures)) {
    const once = store.normalizeQueue(fixture);
    let current = once;
    for (let pass = 0; pass < 12; pass += 1) {
      current = store.normalizeQueue(JSON.parse(JSON.stringify(current)));
      assert.deepEqual(
        JSON.parse(JSON.stringify(current)),
        JSON.parse(JSON.stringify(once)),
        `${name}: normalize pass ${pass + 2} must be semantically identical to pass 1`
      );
    }
  }
});

// G2 Authoritative map.
test("G2 an existing wrongCounts map is never re-folded into", () => {
  const store = loadStore();
  for (const alias of ["lastUserAnswer", "userAnswer", "user", "selected"]) {
    const [entry] = store.normalizeQueue([{
      ...missedRecord(), userAnswer: undefined, [alias]: "ACE inhibitor",
      missCount: 4, wrongCounts: { "ACE inhibitor": 4 }
    }]);
    assert.deepEqual(plainCounts(entry), { "ACE inhibitor": 4 }, `${alias} must not fold into an existing map`);
  }

  // Even with legacy fields and counters coexisting alongside the map.
  const [mixed] = store.normalizeQueue([{
    ...missedRecord(), user: "Diuretic", selected: "Statin",
    missCount: 0, reviewMissCount: 0, wrongCounts: { "ACE inhibitor": 7 }
  }]);
  assert.deepEqual(plainCounts(mixed), { "ACE inhibitor": 7 });
});

// G3 Legacy single-miss.
test("G3 a true legacy record folds its answer alias exactly once", () => {
  const store = loadStore();
  for (const alias of ["lastUserAnswer", "userAnswer", "user", "selected"]) {
    const legacy = {
      quizId: "chapter1-review", prompt: "Metoprolol is which class?",
      answer: "Beta blocker", [alias]: "ACE inhibitor", timestamp: "2026-07-01T12:00:00.000Z"
    };
    const [entry] = store.normalizeQueue([legacy]);
    assert.deepEqual(plainCounts(entry), { "ACE inhibitor": 1 }, `${alias} folds once`);
    assert.equal(entry.missCount, 1, "a bare legacy record is treated as a single miss");

    // The converted result is structurally aggregate, so it cannot fold again.
    const [again] = store.normalizeQueue([JSON.parse(JSON.stringify(entry))]);
    assert.deepEqual(plainCounts(again), { "ACE inhibitor": 1 }, `${alias} does not fold a second time`);
  }
});

// G4 Ambiguous aggregate.
test("G4 aggregate counters without wrongCounts normalize to an empty map", () => {
  const store = loadStore();
  for (const counter of ["missCount", "reviewMissCount", "reviewCorrectCount", "reviewAttemptCount"]) {
    for (const value of [0, 5]) {
      const [entry] = store.normalizeQueue([{
        quizId: "chapter1-review", prompt: "Metoprolol is which class?", answer: "Beta blocker",
        lastUserAnswer: "ACE inhibitor", [counter]: value, timestamp: "2026-07-01T12:00:00.000Z"
      }]);
      assert.deepEqual(plainCounts(entry), {},
        `${counter}=${value} proves aggregate shape, so no count may be manufactured`);
      assert.equal(entry.lastUserAnswer, "ACE inhibitor", "the display value is still preserved");
    }
  }
});

// G5 Historical honesty.
test("G5 existing positive wrongCounts values are preserved exactly", () => {
  const store = loadStore();
  const stored = { "ACE inhibitor": 9, Diuretic: 3, Statin: 1 };
  const [entry] = store.normalizeQueue([{ ...missedRecord(), missCount: 13, wrongCounts: { ...stored } }]);
  assert.deepEqual(plainCounts(entry), stored, "no migration, decrement, or redistribution");

  // Inflated legacy data is left exactly as stored - it is never "repaired".
  const [inflated] = store.normalizeQueue([{ ...missedRecord(), missCount: 1, wrongCounts: { "ACE inhibitor": 47 } }]);
  assert.deepEqual(plainCounts(inflated), { "ACE inhibitor": 47 });
});

// G6 Normal miss.
test("G6 each genuine miss increments exactly one answer exactly once", () => {
  const store = loadStore();
  const first = store.mergeMissedEntries([], [missedRecord()]);
  assert.equal(first[0].missCount, 1);
  assert.deepEqual(plainCounts(first[0]), { "ACE inhibitor": 1 });

  const second = store.mergeMissedEntries(first, [missedRecord()]);
  assert.equal(second[0].missCount, 2);
  assert.deepEqual(plainCounts(second[0]), { "ACE inhibitor": 2 });

  const third = store.mergeMissedEntries(second, [missedRecord({ userAnswer: "Diuretic" })]);
  assert.equal(third[0].missCount, 3);
  assert.deepEqual(plainCounts(third[0]), { "ACE inhibitor": 2, Diuretic: 1 },
    "a different wrong answer increments only itself");
  assert.equal(third[0].lastUserAnswer, "Diuretic");
});

// G7 Incorrect review.
test("G7 one incorrect review increments review counters and one answer key", () => {
  const store = loadStore();
  const base = store.mergeMissedEntries([], [missedRecord()]);
  const after = store.applyReviewResults(base, [{
    ...missedRecord(), userAnswer: "Diuretic", correct: false, timestamp: "2026-07-05T12:00:00.000Z"
  }]);

  assert.equal(after[0].reviewAttemptCount, 1);
  assert.equal(after[0].reviewMissCount, 1);
  assert.equal(after[0].reviewCorrectCount, 0);
  assert.deepEqual(plainCounts(after[0]), { "ACE inhibitor": 1, Diuretic: 1 });
  assert.equal(after[0].lastUserAnswer, "Diuretic");
  assert.equal(after[0].clearStreak, 0, "mastery resets");
  assert.equal(after[0].archived, false);
});

// G8 Correct review.
test("G8 a correct review never touches wrongCounts or lastUserAnswer", () => {
  const store = loadStore();
  const base = store.mergeMissedEntries([], [missedRecord()]);
  const after = store.applyReviewResults(base, [{
    ...missedRecord(), userAnswer: "Beta blocker", correct: true, timestamp: "2026-07-05T12:00:00.000Z"
  }]);

  assert.equal(after[0].reviewAttemptCount, 1);
  assert.equal(after[0].reviewCorrectCount, 1);
  assert.equal(after[0].reviewMissCount, 0);
  assert.equal(after[0].clearStreak, 1, "mastery advances");
  assert.deepEqual(plainCounts(after[0]), { "ACE inhibitor": 1 }, "wrongCounts untouched");
  assert.equal(after[0].lastUserAnswer, "ACE inhibitor", "a correct answer is not a wrong answer");
});

// G9 Mastery regression.
test("G9 three clean reviews master, and a later genuine miss resets", () => {
  const store = loadStore();
  // Mastery age is measured against the wall clock, so a freshly mastered
  // entry needs recent timestamps or it is legitimately refresh-due.
  const recent = (daysAgo) => new Date(Date.now() - (daysAgo * DAY_MS)).toISOString();
  let queue = store.mergeMissedEntries([], [missedRecord({ timestamp: recent(10) })]);
  for (let i = 3; i >= 1; i -= 1) {
    queue = store.applyReviewResults(queue, [{
      ...missedRecord(), correct: true, timestamp: recent(i)
    }]);
  }
  assert.equal(queue[0].clearStreak, 3);
  assert.equal(queue[0].archived, true, "mastered entries archive");
  assert.equal(store.getMasterySummary(queue[0]).mastered, true);
  assert.equal(store.getActiveEntries(queue).length, 0, "mastered entries leave the active view");

  queue = store.mergeMissedEntries(queue, [missedRecord({ timestamp: new Date().toISOString() })]);
  assert.equal(queue[0].clearStreak, 0, "a genuine miss resets mastery");
  assert.equal(queue[0].archived, false);
  assert.equal(queue[0].masteredAt, null);

  // Refresh-due behavior is unchanged.
  const stale = store.normalizeQueue([{
    ...missedRecord(), clearStreak: 3, archived: true,
    masteredAt: new Date(Date.now() - (30 * DAY_MS)).toISOString(),
    lastReviewedAt: new Date(Date.now() - (30 * DAY_MS)).toISOString(),
    lastMissedAt: new Date(Date.now() - (40 * DAY_MS)).toISOString(),
    createdAt: new Date(Date.now() - (60 * DAY_MS)).toISOString()
  }]);
  assert.equal(store.isMasteryRefreshDue(stale[0]), true);
  assert.equal(store.getActiveEntries(stale).length, 1, "refresh-due entries come back into view");
});

// G14 Storage contract.
test("G14 storage stays at version 2 with no proactive migration or write-back", () => {
  const store = loadStore();
  assert.equal(store.STORAGE_VERSION, 2);
  assert.match(storeSource, /const STORAGE_VERSION = 2;/);

  // The store is a pure transform: it never reaches storage or the network on
  // its own, so nothing can be written back or fetched at load time.
  for (const forbidden of [
    /localStorage/, /sessionStorage/, /\bfetch\s*\(/, /XMLHttpRequest/,
    /navigator\.sendBeacon/, /new WebSocket/, /EventSource/
  ]) {
    assert.doesNotMatch(storeSource, forbidden, `store must not reference ${forbidden}`);
  }

  assert.equal(store.normalizeQueue([]).length, 0, "an empty queue stays empty");
  assert.equal(store.normalizeQueue(null).length, 0);

  // Normalizing does not mutate the caller's stored value.
  const raw = [{ ...missedRecord(), missCount: 2, wrongCounts: { "ACE inhibitor": 2 } }];
  const rawString = JSON.stringify(raw);
  store.normalizeQueue(raw);
  assert.equal(JSON.stringify(raw), rawString, "input records are not mutated in place");
});
