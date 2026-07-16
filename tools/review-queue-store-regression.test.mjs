import assert from "node:assert/strict";
import test from "node:test";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  // Characterizes current behavior: normalizeEntry folds userAnswer into
  // wrongCounts once (legacy-record support), then the miss itself adds one
  // more — a first miss therefore records 2, and every later normalize pass
  // re-adds the lastUserAnswer fold. Flagged as a latent display-count quirk.
  // (Spread copies the vm-realm object so deep-equal compares same-realm prototypes.)
  assert.deepEqual({ ...entry.wrongCounts }, { "ACE inhibitor": 2 });
  assert.equal(entry.lastMissedAt, "2026-07-01T12:00:00.000Z");
});

test("HTML and plain-text prompts deduplicate to the same entry", () => {
  const store = loadStore();
  const queue = store.mergeMissedEntries(
    store.mergeMissedEntries([], [missedRecord({ prompt: "<strong>Metoprolol</strong> is which class?" })]),
    [missedRecord()]
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0].missCount, 2);
  // 4 = first miss (2, see key-grammar test) + normalize re-fold (1) + second miss (1).
  assert.deepEqual({ ...queue[0].wrongCounts }, { "ACE inhibitor": 4 });
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
  // 6 = entry one's stored 2 + two normalize re-folds, plus entry two's
  // userAnswer folded twice (see the legacy-fold note in the key-grammar test).
  assert.equal(top.commonWrongCount, 6);
});
