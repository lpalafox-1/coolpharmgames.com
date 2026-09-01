// F26-09 — Fall 2026 Lab III completion & continuation experience, plus the
// performance-guided Boss Remix addendum.
//
// Two halves are covered here:
//   A. Completion is a save boundary. Finishing a run must persist history and
//      retire the live answering surface (nav map, footer actions, mastery
//      controls, timer, shortcuts) instead of leaving a half-live quiz behind,
//      and the restart warning must stop claiming saved progress will be lost.
//   B. Boss Remix is attempt-local. Guidance comes only from the attempt that
//      just finished — never from lifetime weakness counters — and the one
//      fresh item is borrowed from a normal Week X practice set built by the
//      existing Fall launcher, so the engine never selects Fall source data or
//      the Fall generator itself.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import { buildFall2026Lab3Payload } from "../assets/js/fall-2026-lab3-launcher.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_TOKEN = "20260901a";
const REMIX_REQUEST_KEY = "pharmlet.fall-2026-lab3.boss-remix-request";
const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const HISTORY_KEY = "pharmlet.history";
const REVIEW_KEY = "pharmlet.review-queue";
const LIFETIME_MEMORY_KEYS = [
  "pharmlet.topDrugs.signals",
  "pharmlet.finalLab2.recentRuns",
  HISTORY_KEY
];
const PROTECTED_FALL_BASELINES = Object.freeze({
  drugData: "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01",
  policy: "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171",
  generator: "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a",
  launcher: "255ef32be7b47e3f12f3b02da5db5a91e9040a5ee9fe406f68029e783a98157c"
});

const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));
const engineSource = read("assets/js/quizEngine.js");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(readFileSync(path.join(repoRoot, relativePath))).digest("hex");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildPracticePayload(quizWeek, seed) {
  return buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed });
}

function buildPracticeAttemptShell(quizWeek, seed) {
  return { payload: buildPracticePayload(quizWeek, seed) };
}

// A finished attempt: every question answered, `missedIndexes` marked wrong.
function buildFinishedAttempt(quizWeek, seed, missedIndexes = [], extras = {}) {
  const payload = buildPracticePayload(quizWeek, seed);
  const questions = payload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: !missedIndexes.includes(index),
    _user: missedIndexes.includes(index) ? "wrong answer" : question.answer,
    ...(extras[index] || {})
  }));
  return { payload, questions };
}

function createStorage(initial = {}, log = null) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    values,
    getItem(key) {
      if (log) log.reads.push(key);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (log) log.writes.push(key);
      values.set(key, String(value));
    },
    removeItem(key) {
      if (log) log.removals.push(key);
      values.delete(key);
    }
  };
}

function createDomStub() {
  const elements = new Map();

  function createElement(tagName = "div", id = "") {
    const classes = new Set();
    const attributes = {};
    const listeners = new Map();
    const element = {
      id,
      tagName: String(tagName).toUpperCase(),
      innerHTML: "",
      textContent: "",
      value: "",
      title: "",
      disabled: false,
      checked: false,
      dataset: {},
      style: {},
      children: [],
      parentElement: null,
      onclick: null,
      oninput: null,
      listeners,
      attributes,
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle: (name, force) => {
          const next = force === undefined ? !classes.has(name) : !!force;
          if (next) classes.add(name);
          else classes.delete(name);
          return next;
        }
      },
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return name in attributes ? attributes[name] : null; },
      removeAttribute(name) { delete attributes[name]; },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      appendChild(child) {
        child.parentElement = element;
        element.children.push(child);
        return child;
      },
      click() {
        (listeners.get("click") || []).forEach((handler) => handler({ preventDefault() {} }));
        if (typeof element.onclick === "function") element.onclick({ preventDefault() {} });
      },
      closest(selector) {
        let node = element;
        while (node) {
          if (selector === node.tagName.toLowerCase()) return node;
          node = node.parentElement;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector !== "[data-completion-action]") return [];
        return [...String(element.innerHTML).matchAll(/data-completion-action="([^"]+)"/g)].map((match) => {
          const button = createElement("button");
          button.dataset.completionAction = match[1];
          button.textContent = match[1];
          return button;
        });
      },
      querySelector() { return null; },
      isCompletionHidden() { return element.style.display === "none"; },
      hasClass(name) { return classes.has(name); }
    };
    return element;
  }

  const aside = createElement("aside");
  const mobileRow = createElement("div");

  function getElementById(id) {
    if (!elements.has(id)) {
      const element = createElement(id === "short-input" ? "input" : "div", id);
      if (id === "mark") element.parentElement = aside;
      if (id === "mark-mobile") element.parentElement = mobileRow;
      elements.set(id, element);
    }
    return elements.get(id);
  }

  return {
    elements,
    aside,
    mobileRow,
    document: {
      addEventListener() {},
      createElement: (tagName) => createElement(tagName),
      getElementById,
      querySelector() { return null; },
      querySelectorAll() { return []; },
      documentElement: { style: { setProperty() {} }, classList: { toggle() {}, contains: () => false } },
      body: { style: {} }
    },
    get(id) { return getElementById(id); }
  };
}

function loadEngine({ search = "?id=custom-quiz", storage = createStorage(), dom = null } = {}) {
  const location = { search, href: "", reloads: 0, reload() { location.reloads += 1; } };
  const confirmLog = [];
  const alerts = [];
  const domStub = dom || createDomStub();
  const sandbox = loadBrowserGlobal("assets/js/quizEngine.js", {
    location,
    document: domStub.document,
    localStorage: storage,
    sessionStorage: createStorage(),
    alert(message) { alerts.push(String(message)); },
    confirm(message) { confirmLog.push(String(message)); return false; },
    setTimeout, clearTimeout, setInterval, clearInterval,
    PharmletQuizCatalog: null
  });
  return { sandbox, location, storage, dom: domStub, confirmLog, alerts };
}

function run(sandbox, code) {
  return vm.runInContext(code, sandbox);
}

function seedCompletedAttempt(engine, questions, overrides = {}) {
  run(engine.sandbox, `
    state.questions = ${JSON.stringify(questions)};
    state.attemptMetadata = ${JSON.stringify(overrides.attemptMetadata || null)};
    state.title = ${JSON.stringify(overrides.title || "Lab III Fall 2026 - Week 3 Practice")};
    state.index = 0;
    state.score = ${questions.filter((question) => question._correct).length};
    state.pointScore = ${questions.filter((question) => question._correct).length};
    state.totalPoints = ${questions.length};
    state.bossMode = ${!!overrides.bossMode};
    state.reviewMode = ${!!overrides.reviewMode};
    state.progressKey = "pharmlet.quiz-progress.test-route";
    state.timerSeconds = ${Number(overrides.timerSeconds ?? 240)};
    state.timerPaused = false;
    state.generatedAttemptIdentity = ${JSON.stringify(overrides.generatedAttemptIdentity || null)};
    state.resultsRecorded = false;
    state.signalsRecorded = false;
    state.finalBreakdown = null;
    state.attemptCompleted = false;
  `);
}

// ---------------------------------------------------------------------------
// A. Completion lifecycle
// ---------------------------------------------------------------------------

test("finishing an attempt saves history at the completion boundary without an unload ritual", () => {
  const { questions } = buildFinishedAttempt(3, "f26-09-completion-save", [1, 4]);
  const storage = createStorage({ "pharmlet.quiz-progress.test-route": JSON.stringify({ index: 2 }) });
  const engine = loadEngine({ storage });
  engine.sandbox.PharmletReviewQueueStore = loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;

  seedCompletedAttempt(engine, questions);
  engine.sandbox.showResults();

  const history = JSON.parse(storage.values.get(HISTORY_KEY));
  assert.equal(history.length, 1, "the finished attempt must be written to history immediately");
  assert.equal(history[0].score, 8);
  assert.equal(history[0].total, 10);
  assert.equal(storage.values.has("pharmlet.quiz-progress.test-route"), false, "the resumable snapshot is cleared");
  assert.ok(storage.values.has(REVIEW_KEY), "missed items reach the review queue at completion");
  assert.equal(run(engine.sandbox, "state.attemptCompleted"), true);
  assert.equal(run(engine.sandbox, "state.timerHandle"), null, "the countdown interval is stopped");
});

test("a completed attempt retires the live answering surface", () => {
  const { questions } = buildFinishedAttempt(3, "f26-09-retire-surface", [0]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions);
  engine.sandbox.showResults();

  for (const id of ["nav-map", "prev", "check", "check-all", "next"]) {
    assert.equal(engine.dom.get(id).style.display, "none", `${id} must be hidden after completion`);
    assert.equal(engine.dom.get(id).dataset.completionHidden, "true");
  }
  assert.equal(engine.dom.get("nav-map").innerHTML, "", "stale question jump buttons are removed");
  assert.equal(engine.dom.aside.style.display, "none", "mastery controls are hidden");
  assert.equal(engine.dom.mobileRow.style.display, "none", "mobile controls are hidden");

  const readout = engine.dom.get("timer-readout");
  assert.equal(readout.onclick, null, "the timer readout is no longer clickable");
  assert.equal(readout.dataset.completed, "true");
  assert.ok(readout.hasClass("cursor-default"));
  assert.match(engine.dom.get("quiz-status").textContent, /Completed 10\/10 • 9 correct/);
  assert.match(engine.dom.get("quiz-status").textContent, /Attempt saved to history/);
});

test("completed attempts ignore timer, navigation, and answering shortcuts", () => {
  const { questions } = buildFinishedAttempt(2, "f26-09-inert-controls", [3]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions);
  engine.sandbox.showResults();

  const resultsMarkup = engine.dom.get("question-card").innerHTML;
  engine.sandbox.toggleTimer();
  assert.equal(run(engine.sandbox, "state.timerHandle"), null, "the timer cannot be restarted after completion");

  engine.sandbox.jumpToQuestion(0);
  assert.equal(engine.dom.get("question-card").innerHTML, resultsMarkup, "results must survive stale navigation");
  assert.equal(run(engine.sandbox, "state.index"), 0);

  run(engine.sandbox, "wireEvents();");
  window_onkeydown(engine, "arrowright");
  window_onkeydown(engine, "t");
  window_onkeydown(engine, "r");
  assert.equal(engine.dom.get("question-card").innerHTML, resultsMarkup);
  assert.equal(run(engine.sandbox, "state.timerHandle"), null);
  assert.equal(engine.location.reloads, 0, "the restart shortcut is inert on a completed attempt");
});

function window_onkeydown(engine, key) {
  run(engine.sandbox, `window.onkeydown({ key: ${JSON.stringify(key)}, preventDefault() {} })`);
}

test("the false progress-loss warning is gone once an attempt is complete", () => {
  const { questions } = buildFinishedAttempt(3, "f26-09-restart-warning", [2]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions);
  engine.sandbox.showResults();

  engine.sandbox.restartQuiz();
  assert.deepEqual(engine.confirmLog, [], "a saved attempt must not warn about losing progress");
  assert.equal(engine.location.reloads, 1, "retrying a completed set reloads the stored attempt");
});

test("an unfinished attempt keeps the accurate restart warning", () => {
  const { questions } = buildFinishedAttempt(3, "f26-09-unfinished-warning", []);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions);
  run(engine.sandbox, "state.attemptCompleted = false;");

  engine.sandbox.restartQuiz();
  assert.equal(engine.confirmLog.length, 1);
  assert.match(engine.confirmLog[0], /Your progress will be lost/);
  assert.equal(engine.location.reloads, 0, "declining the warning keeps the run alive");
});

test("starting a review round re-opens the live answering surface", () => {
  const { questions } = buildFinishedAttempt(3, "f26-09-review-restores", [1, 5]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions);
  engine.sandbox.showResults();
  engine.sandbox.reviewMissed();

  assert.equal(run(engine.sandbox, "state.attemptCompleted"), false);
  assert.equal(run(engine.sandbox, "state.reviewMode"), true);
  for (const id of ["nav-map", "prev", "check", "check-all", "next"]) {
    assert.equal(engine.dom.get(id).style.display, "", `${id} must be interactive again in a review round`);
    assert.equal(engine.dom.get(id).dataset.completionHidden, undefined);
  }
  assert.equal(engine.dom.aside.style.display, "");
  assert.equal(engine.dom.get("timer-readout").dataset.completed, undefined);
});

test("continuation actions stay distinct instead of collapsing into one reset", () => {
  const engine = loadEngine();
  const fall = { active: true, quizWeek: 4 };

  const practice = plain(engine.sandbox.getCompletionContinuationActions({
    missedCount: 3,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall
  }));
  assert.deepEqual(practice.map((action) => action.id), [
    "review-missed",
    "boss-round",
    "boss-remix",
    "retry-attempt",
    "new-week-practice",
    "lab3-hub"
  ]);
  assert.equal(practice.find((action) => action.id === "retry-attempt").label, "🔁 Retry This Set");
  assert.equal(practice.find((action) => action.id === "boss-remix").label, "⚡ Boss Remix +1 (6)");
  assert.equal(practice.find((action) => action.id === "new-week-practice").label, "🆕 New Week 4 Practice Set");
  assert.equal(practice.find((action) => action.id === "lab3-hub").label, "← Return to Lab III Hub");

  const boss = plain(engine.sandbox.getCompletionContinuationActions({
    bossMode: true,
    missedCount: 2,
    remixSize: 6,
    generatedPayload: true,
    fall
  }));
  assert.deepEqual(boss.map((action) => action.id), [
    "review-missed",
    "boss-remix",
    "retry-attempt",
    "new-week-practice",
    "lab3-hub"
  ]);
  assert.equal(boss.find((action) => action.id === "retry-attempt").label, "⚡ Retry Same Boss");

  const review = plain(engine.sandbox.getCompletionContinuationActions({
    reviewMode: true,
    missedCount: 1,
    remixSize: 0,
    generatedPayload: true,
    fall
  }));
  assert.deepEqual(review.map((action) => action.id), [
    "review-missed",
    "retry-attempt",
    "new-week-practice",
    "lab3-hub"
  ]);
  assert.equal(review.find((action) => action.id === "retry-attempt").label, "🔁 Restart Full Set");

  const legacy = plain(engine.sandbox.getCompletionContinuationActions({
    missedCount: 0,
    bossQuestionCount: 5,
    fall: { active: false, quizWeek: 0 }
  }));
  assert.deepEqual(legacy.map((action) => action.id), ["boss-round", "retry-attempt"]);
  assert.equal(legacy.find((action) => action.id === "retry-attempt").label, "🔁 Restart Quiz");
});

test("a finished Fall attempt renders wired continuation controls, including the hub exit", () => {
  const { questions } = buildFinishedAttempt(5, "f26-09-wired-actions", [0, 7]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions);
  engine.sandbox.showResults();

  const card = engine.dom.get("question-card");
  const actionIds = [...String(card.innerHTML).matchAll(/data-completion-action="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actionIds, [
    "review-missed",
    "boss-round",
    "boss-remix",
    "retry-attempt",
    "new-week-practice",
    "lab3-hub"
  ]);
  assert.match(card.innerHTML, /Saved to this browser/);
  assert.match(card.innerHTML, /New Week 5 Practice Set generates a full 10-question practice set/);

  assert.equal(engine.sandbox.openFallLab3Hub(5), true);
  assert.equal(engine.location.href, "lab3-fall-2026.html#week-5");
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// B. Performance-guided Boss Remix
// ---------------------------------------------------------------------------

function identityOf(question) {
  return `id:${question.id}`;
}

function relevanceHit(question, request) {
  const domains = new Set(request.focusDomains);
  const drugIds = new Set(request.focusDrugIds);
  const sourceDrugIds = [
    ...(question.metadata.sourceDrugIds || []),
    ...(question.metadata.sourceDrugId ? [question.metadata.sourceDrugId] : [])
  ];
  const choiceDrugIds = (question.metadata.choiceSources || []).map((choice) => choice.sourceDrugId);
  return sourceDrugIds.some((id) => drugIds.has(id))
    || domains.has(String(question.metadata.knowledgeDomain || "").toLowerCase())
    || choiceDrugIds.some((id) => drugIds.has(id));
}

function requestFor(engine, questions, overrides = {}) {
  return plain(engine.sandbox.buildFallLab3BossRemixRequest({
    attemptQuestions: questions,
    attemptContext: overrides.attemptContext,
    createdAt: overrides.createdAt ?? 1_000
  }));
}

test("the remix request inherits the parent attempt's scope, lineage, and chain history", () => {
  const missed = [2, 6, 9];
  const { questions, payload } = buildFinishedAttempt(6, "f26-09-remix-request", missed);
  const engine = loadEngine();

  const parentMetadata = payload.metadata;
  const context = plain(engine.sandbox.getFallLab3AttemptContext(questions, parentMetadata));
  const request = plain(engine.sandbox.buildFallLab3BossRemixRequest({
    attemptQuestions: questions,
    attemptContext: engine.sandbox.getFallLab3AttemptContext(questions, parentMetadata),
    createdAt: 1_000
  }));

  assert.equal(request.version, 2);
  assert.equal(request.quizWeek, 6, "scope is inherited from the parent attempt, never recomputed");
  assert.equal(request.remixGeneration, 1);
  assert.equal(request.targetSize, 6, "a 5-question Boss becomes a 6-question Remix");
  assert.equal(request.parentAttemptId, context.attemptId);
  assert.equal(request.rootAttemptId, context.attemptId, "a practice parent is the chain root");
  assert.equal(request.parentKind, "fall-2026-lab3-practice");
  assert.equal(request.sourceQuizId, "fall-2026-lab3-week-6-practice");
  assert.equal(request.missedCount, missed.length);

  const chain = new Set(request.chainQuestionIds);
  for (const question of questions) {
    assert.ok(chain.has(identityOf(question)), "every parent question is remembered as used");
  }

  const missedDomains = new Set(missed.map((index) => questions[index].metadata.knowledgeDomain.toLowerCase()));
  assert.deepEqual([...request.focusDomains].sort(), [...missedDomains].sort());
  const missedDrugIds = new Set(missed.flatMap((index) => questions[index].metadata.sourceDrugIds || []));
  assert.deepEqual([...request.focusDrugIds].sort(), [...missedDrugIds].sort());

  assert.equal(request.fallbackQuestions.length, request.targetSize, "the fallback pool stays bounded");
  const fallbackIds = request.fallbackQuestions.map((question) => question.id);
  assert.deepEqual(
    fallbackIds.slice(0, missed.length).sort(),
    missed.map((index) => questions[index].id).sort(),
    "explicit misses rank first in the fallback pool"
  );
  for (const question of request.fallbackQuestions) {
    for (const key of ["_answered", "_correct", "_user", "_id", "_hintUsed"]) {
      assert.equal(key in question, false, `${key} must not leak into a remix payload`);
    }
  }
});

test("attempt-local guidance counts explicit answers only", () => {
  const { payload } = buildPracticeAttemptShell(5, "f26-09-explicit-evidence");
  const engine = loadEngine();

  // Two explicit misses, one explicit correct, one blank item closed out by the
  // timer, one blank item closed out by "check all", and five never-seen items.
  const questions = payload.questions.map((question, index) => {
    if (index === 0 || index === 1) {
      return { ...question, _id: index, _answered: true, _correct: false, _user: "wrong answer" };
    }
    if (index === 2) {
      return { ...question, _id: index, _answered: true, _correct: true, _user: question.answer };
    }
    if (index === 3) return { ...question, _id: index, _answered: true, _correct: false, _user: null };
    if (index === 4) return { ...question, _id: index, _answered: true, _correct: false, _user: "" };
    return { ...question, _id: index, _answered: false, _correct: false, _user: null };
  });

  const rawFocus = engine.sandbox.buildFallLab3AttemptFocus(questions);
  const focus = {
    answeredCount: rawFocus.answeredCount,
    missedCount: rawFocus.missedCount,
    drugIds: Array.from(rawFocus.drugIds),
    domains: Array.from(rawFocus.domains)
  };
  assert.equal(focus.answeredCount, 3, "blank and unseen items are neutral, not answers");
  assert.equal(focus.missedCount, 2, "only explicitly answered-incorrectly items are weakness signals");

  const neutralDrugIds = [3, 4, 5].flatMap((index) => questions[index].metadata.sourceDrugIds || []);
  const explicitDrugIds = new Set([0, 1].flatMap((index) => questions[index].metadata.sourceDrugIds || []));
  for (const drugId of neutralDrugIds) {
    if (explicitDrugIds.has(drugId)) continue;
    assert.equal(focus.drugIds.includes(drugId), false, "a timed-out or unseen item never becomes a miss");
  }

  const request = requestFor(engine, questions);
  assert.ok(request, "three explicit answers are enough evidence");

  const timedOutOnly = payload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: false,
    _user: null
  }));
  assert.equal(requestFor(engine, timedOutOnly), null, "an expired timer alone is not remix evidence");
  assert.equal(engine.sandbox.getFallLab3RemixPreviewSize(timedOutOnly), 0);
});

test("Boss Remix guidance never reads lifetime weakness memory", () => {
  const { questions } = buildFinishedAttempt(4, "f26-09-remix-attempt-local", [1, 3]);
  const log = { reads: [], writes: [], removals: [] };
  const storage = createStorage({
    "pharmlet.topDrugs.signals": JSON.stringify({ missedDrugs: { lisinopril: 99 } }),
    [HISTORY_KEY]: JSON.stringify([{ quizId: "anything", score: 1, total: 10 }]),
    [REVIEW_KEY]: JSON.stringify([{ quizId: "anything", prompt: "x" }])
  }, log);
  const engine = loadEngine({ storage });

  const request = requestFor(engine, questions, { createdAt: 2_000 });
  const remix = plain(engine.sandbox.buildFallLab3BossRemixPayload({
    request,
    practicePayload: buildPracticePayload(4, "f26-09-remix-attempt-local-fresh"),
    createdAt: 2_500
  }));

  assert.ok(remix);
  for (const key of [...LIFETIME_MEMORY_KEYS, REVIEW_KEY]) {
    assert.equal(log.reads.includes(key), false, `${key} must not steer an attempt-local remix`);
  }
});

test("the remix is assembled from fresh identities aimed at the missed drugs and domains", () => {
  const missed = [0, 5, 8];
  const { questions } = buildFinishedAttempt(7, "f26-09-remix-fresh", missed);
  const engine = loadEngine();
  const request = requestFor(engine, questions, { createdAt: 3_000 });
  const practicePayload = buildPracticePayload(7, "f26-09-remix-fresh-round-2");

  const payload = plain(engine.sandbox.buildFallLab3BossRemixPayload({
    request,
    practicePayload,
    createdAt: 3_500
  }));

  assert.equal(payload.id, "custom-quiz");
  assert.equal(payload.metadata.kind, "fall-2026-lab3-boss-remix");
  assert.equal(payload.metadata.bossRound, true, "a remix runs as a Boss challenge");
  assert.equal(payload.metadata.performanceGuidance, "attempt-local");
  assert.equal(payload.metadata.quizWeek, 7);
  assert.equal(payload.metadata.remixGeneration, 1);
  assert.equal(payload.metadata.bossRoundSize, 6);
  assert.equal(payload.metadata.timerSeconds, 300);
  assert.equal(payload.questions.length, 6);
  assert.match(payload.title, /Boss Remix \+1$/);

  const chain = new Set(request.chainQuestionIds);
  assert.equal(payload.metadata.freshQuestionCount, 6, "the whole remix is newly assembled material");
  assert.equal(payload.metadata.carriedQuestionCount, 0, "exact repetition belongs to Retry Same Boss");

  const parentIds = new Set(questions.map(identityOf));
  for (const question of payload.questions) {
    assert.equal(chain.has(identityOf(question)), false, "a remix item is a question identity the chain has not used");
    assert.equal(parentIds.has(identityOf(question)), false);
    assert.equal(question.metadata.generatorId, "fall-2026-p2-lab3-deterministic-generator", "remix items stay source-backed");
    assert.equal(question.metadata.requestedQuizWeek, 7, "the inherited week ceiling is never widened");
    assert.notEqual(question.type, "mcq-multiple", "Boss Remix never emits MTC");
    for (const choice of question.metadata.choiceSources || []) {
      assert.ok(choice.sourceDrugQuizWeek <= 7, "no future-week material leaks in");
    }
  }

  const eligible = practicePayload.questions.filter((question) => !chain.has(identityOf(question)));
  const relevant = eligible.filter((question) => relevanceHit(question, request));
  const pickedIds = new Set(payload.questions.map((question) => question.id));
  if (relevant.length <= 6) {
    for (const question of relevant) {
      assert.ok(pickedIds.has(question.id), "every candidate touching a missed drug or domain is used first");
    }
  } else {
    assert.equal(payload.questions.every((question) => relevanceHit(question, request)), true);
  }

  const identities = payload.questions.map((question) => question.id);
  assert.equal(new Set(identities).size, identities.length, "a remix never duplicates a question");
});

test("a weak drug can return through a different safe question identity", () => {
  const { questions } = buildFinishedAttempt(9, "f26-09-remix-same-drug-new-form", [1, 2]);
  const engine = loadEngine();
  const request = requestFor(engine, questions, { createdAt: 4_000 });
  const payload = plain(engine.sandbox.buildFallLab3BossRemixPayload({
    request,
    practicePayload: buildPracticePayload(9, "f26-09-remix-same-drug-new-form-fresh"),
    createdAt: 4_100
  }));

  const focusDrugIds = new Set(request.focusDrugIds);
  const repeatedDrugs = payload.questions.filter((question) => (
    (question.metadata.sourceDrugIds || []).some((drugId) => focusDrugIds.has(drugId))
  ));
  const parentIds = new Set(questions.map(identityOf));

  assert.ok(repeatedDrugs.length > 0, "weak drugs are retested");
  for (const question of repeatedDrugs) {
    assert.equal(parentIds.has(identityOf(question)), false, "but through a question identity the chain has not used");
  }
});

test("the remix falls back to bounded carried items only when fresh material runs out", () => {
  const { questions } = buildFinishedAttempt(6, "f26-09-remix-fallback", [0, 1, 2]);
  const engine = loadEngine();
  const request = requestFor(engine, questions, { createdAt: 5_000 });
  const practicePayload = buildPracticePayload(6, "f26-09-remix-fallback-fresh");

  // Only two fresh identities are left anywhere in the chain.
  const survivors = practicePayload.questions.slice(0, 2).map(identityOf);
  request.chainQuestionIds = [
    ...request.chainQuestionIds,
    ...practicePayload.questions.slice(2).map(identityOf)
  ];

  const payload = plain(engine.sandbox.buildFallLab3BossRemixPayload({
    request,
    practicePayload,
    createdAt: 5_100
  }));

  assert.equal(payload.questions.length, 6, "the promised size still holds");
  assert.equal(payload.metadata.freshQuestionCount, 2);
  assert.equal(payload.metadata.carriedQuestionCount, 4);
  assert.deepEqual(payload.questions.slice(0, 2).map(identityOf).sort(), [...survivors].sort());

  const carried = payload.questions.slice(2);
  const missedIds = new Set([0, 1, 2].map((index) => questions[index].id));
  assert.ok(carried.slice(0, 3).every((question) => missedIds.has(question.id)), "carried items are this attempt's misses");
  for (const question of carried) {
    assert.ok(question.metadata.requestedQuizWeek <= 6);
  }
});

function exhaustedRemixFixture(engine, quizWeek = 1) {
  const { questions } = buildFinishedAttempt(quizWeek, `f26-09-remix-exhausted-${quizWeek}`, [0, 1]);
  const request = requestFor(engine, questions, { createdAt: 6_000 });
  const practicePayload = buildPracticePayload(quizWeek, `f26-09-remix-exhausted-${quizWeek}-fresh`);
  request.chainQuestionIds = [
    ...request.chainQuestionIds,
    ...practicePayload.questions.map(identityOf)
  ];
  return { questions, request, practicePayload };
}

test("a remix fails closed when the chain has used every safe fresh candidate", () => {
  const engine = loadEngine({ storage: createStorage() });
  const { request, practicePayload } = exhaustedRemixFixture(engine);

  assert.equal(
    engine.sandbox.buildFallLab3BossRemixPayload({ request, practicePayload, createdAt: 6_100 }),
    null,
    "no unsafe duplicate and no future-week leak is manufactured"
  );

  engine.storage.setItem(REMIX_REQUEST_KEY, JSON.stringify(request));
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(practicePayload, 6_200), null);
  assert.equal(engine.storage.getItem(REMIX_REQUEST_KEY), null, "the exhausted request is cleared");
  assert.match(
    engine.sandbox.takeFallLab3RemixNotice(),
    /every eligible Week 1 question has already been used/,
    "the student is told why no Boss Remix could be built"
  );
});

test("an exhausted Boss Remix stops at a decision point instead of starting a different quiz", () => {
  const engine = loadEngine({ storage: createStorage() });
  const { request, practicePayload } = exhaustedRemixFixture(engine);

  engine.storage.setItem(REMIX_REQUEST_KEY, JSON.stringify(request));
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(practicePayload, 6_200), null);
  assert.ok(engine.sandbox.peekFallLab3RemixNotice(), "the loader can tell the remix was exhausted");

  assert.equal(engine.sandbox.renderFallLab3RemixExhaustedDecision(practicePayload), true);

  const card = engine.dom.get("question-card");
  assert.match(card.innerHTML, /No Fresh Boss Remix Available/, "the student gets an explanation, not a quiz");
  assert.match(card.innerHTML, /every eligible Week 1 question has already been used/);
  assert.match(card.innerHTML, /only starts if you choose it here/);

  const actionIds = [...String(card.innerHTML).matchAll(/data-completion-action="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actionIds, ["start-week-practice", "lab3-hub"], "the decision point offers explicit choices only");

  // Nothing about a Week X practice attempt may have started on its own.
  assert.equal(run(engine.sandbox, "state.questions.length"), 0, "no questions were loaded");
  assert.equal(run(engine.sandbox, "state.timerHandle"), null, "no timer was started");
  assert.equal(engine.location.reloads, 0, "no alternate quiz began as a consequence of Boss Remix");
  assert.equal(engine.location.href, "", "and nothing navigated away on its own");
  assert.equal(engine.dom.get("nav-map").style.display, "none", "the live answering surface stays retired");
  assert.equal(engine.dom.get("check").style.display, "none");
  assert.match(engine.dom.get("quiz-status").textContent, /nothing has started yet/);
  assert.deepEqual(
    JSON.parse(engine.storage.getItem(CUSTOM_QUIZ_KEY) || "null"),
    null,
    "the exhausted remix wrote no attempt of its own"
  );
  assert.equal(engine.sandbox.peekFallLab3RemixNotice(), "", "the explanation is shown once, not replayed later");

  // The parked Week X practice set starts only from an affirmative choice.
  const startButton = card.querySelectorAll("[data-completion-action]")[0];
  assert.equal(startButton.dataset.completionAction, "start-week-practice");
  assert.equal(engine.sandbox.startFallLab3PreparedWeekPractice(), true);
  assert.equal(engine.location.reloads, 1, "the standard practice set begins only after the student asks for it");
});

test("the loader never substitutes a normal practice set for an exhausted remix", () => {
  assert.equal(
    engineSource.includes("consumeFallLab3BossRemixRequest(data) || data"),
    false,
    "an exhausted remix must not fall through to the launcher-built practice payload"
  );
  assert.match(
    engineSource,
    /renderFallLab3RemixExhaustedDecision\(data\);\s*\n\s*return;/,
    "the loader stops at the decision point instead of continuing setup"
  );
});

test("the size progression is deterministic and capped at seven questions", () => {
  const { questions } = buildFinishedAttempt(8, "f26-09-remix-progression", [2, 4]);
  const engine = loadEngine();

  assert.equal(engine.sandbox.getFallLab3RemixTargetSize(1), 6);
  assert.equal(engine.sandbox.getFallLab3RemixTargetSize(2), 7);
  assert.equal(engine.sandbox.getFallLab3RemixTargetSize(3), 0, "the chain never grows to eight");

  const firstRequest = requestFor(engine, questions, { createdAt: 10 });
  const firstPayload = plain(engine.sandbox.buildFallLab3BossRemixPayload({
    request: firstRequest,
    practicePayload: buildPracticePayload(8, "f26-09-remix-progression-fresh-1"),
    createdAt: 20
  }));
  assert.equal(firstPayload.questions.length, 6);

  const secondAttempt = firstPayload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: index !== 0,
    _user: index === 0 ? "wrong answer" : question.answer
  }));
  const secondContext = engine.sandbox.getFallLab3AttemptContext(secondAttempt, firstPayload.metadata);
  const secondRequest = plain(engine.sandbox.buildFallLab3BossRemixRequest({
    attemptQuestions: secondAttempt,
    attemptContext: secondContext,
    createdAt: 30
  }));
  assert.equal(secondRequest.remixGeneration, 2);
  assert.equal(secondRequest.targetSize, 7);
  assert.equal(secondRequest.rootAttemptId, firstRequest.rootAttemptId, "the chain root survives every generation");
  assert.ok(
    questions.every((question) => secondRequest.chainQuestionIds.includes(identityOf(question))),
    "the grandparent attempt's questions stay marked as used"
  );

  const secondPayload = plain(engine.sandbox.buildFallLab3BossRemixPayload({
    request: secondRequest,
    practicePayload: buildPracticePayload(8, "f26-09-remix-progression-fresh-2"),
    createdAt: 40
  }));
  assert.equal(secondPayload.questions.length, 7);
  assert.equal(secondPayload.metadata.remixGeneration, 2);
  assert.match(secondPayload.title, /Boss Remix \+1 \(Round 2\)/);

  const thirdAttempt = secondPayload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: index !== 1,
    _user: index === 1 ? "wrong answer" : question.answer
  }));
  const thirdContext = plain(engine.sandbox.getFallLab3AttemptContext(thirdAttempt, secondPayload.metadata));
  assert.equal(thirdContext.remixGeneration, 2);
  assert.equal(engine.sandbox.buildFallLab3BossRemixRequest({
    attemptQuestions: thirdAttempt,
    attemptContext: engine.sandbox.getFallLab3AttemptContext(thirdAttempt, secondPayload.metadata),
    createdAt: 50
  }), null, "no further remix is built at the cap");
  assert.equal(
    engine.sandbox.getFallLab3RemixPreviewSize(thirdAttempt, engine.sandbox.getFallLab3AttemptContext(thirdAttempt, secondPayload.metadata)),
    0,
    "and no misleading +1 action is offered"
  );
});

test("a Boss Round carries Fall chain provenance into the next remix", () => {
  const { questions, payload } = buildFinishedAttempt(3, "f26-09-boss-chain", [1, 3, 5]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions, { attemptMetadata: payload.metadata });

  assert.equal(engine.sandbox.launchBossRound(), undefined);
  const bossPayload = JSON.parse(engine.storage.getItem(CUSTOM_QUIZ_KEY));
  assert.equal(bossPayload.metadata.kind, "boss-round");
  assert.equal(bossPayload.metadata.quizWeek, 3);
  assert.equal(bossPayload.metadata.fallLab3.remixGeneration, 0, "a Boss Round is not a remix generation");
  assert.ok(
    questions.every((question) => bossPayload.metadata.fallLab3.chainQuestionIds.includes(identityOf(question))),
    "the parent practice questions stay marked as used"
  );

  const bossAttempt = bossPayload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: index !== 0,
    _user: index === 0 ? "wrong answer" : question.answer
  }));
  const request = plain(engine.sandbox.buildFallLab3BossRemixRequest({
    attemptQuestions: bossAttempt,
    attemptContext: engine.sandbox.getFallLab3AttemptContext(bossAttempt, bossPayload.metadata),
    createdAt: 7_000
  }));

  assert.equal(request.quizWeek, 3);
  assert.equal(request.remixGeneration, 1);
  assert.equal(request.targetSize, 6, "five-question Boss to six-question Remix");
  assert.equal(request.parentKind, "boss-round");
  assert.equal(request.rootAttemptId, bossPayload.metadata.fallLab3.rootAttemptId);
  assert.ok(
    questions.every((question) => request.chainQuestionIds.includes(identityOf(question))),
    "freshness is judged against the whole Boss chain, not just the last attempt"
  );
});

test("a pending remix request is consumed only by its own week's practice payload", () => {
  const { questions } = buildFinishedAttempt(3, "f26-09-remix-consume", [1]);
  const engine = loadEngine();
  const request = requestFor(engine, questions, { createdAt: 1_000 });
  engine.storage.setItem(REMIX_REQUEST_KEY, JSON.stringify(request));

  const otherWeek = buildPracticePayload(4, "f26-09-remix-consume-other-week");
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(otherWeek, 1_500), null, "a different week must not be hijacked");
  assert.equal(engine.storage.getItem(REMIX_REQUEST_KEY), null, "a mismatched launch clears the stale request");

  engine.storage.setItem(REMIX_REQUEST_KEY, JSON.stringify(request));
  const matching = buildPracticePayload(3, "f26-09-remix-consume-match");
  const payload = plain(engine.sandbox.consumeFallLab3BossRemixRequest(matching, 1_600));

  assert.ok(payload, "the matching weekly practice payload becomes the remix attempt");
  assert.equal(payload.metadata.kind, "fall-2026-lab3-boss-remix");
  assert.equal(engine.storage.getItem(REMIX_REQUEST_KEY), null, "the request is single-use");
  assert.deepEqual(
    JSON.parse(engine.storage.getItem(CUSTOM_QUIZ_KEY)),
    payload,
    "Retry Same Boss replays the identical stored remix"
  );
});

test("Retry Same Boss replays resolved questions, not a seed", () => {
  const { questions } = buildFinishedAttempt(5, "f26-09-exact-retry", [2, 3]);
  const engine = loadEngine();
  const request = requestFor(engine, questions, { createdAt: 8_000 });
  engine.storage.setItem(REMIX_REQUEST_KEY, JSON.stringify(request));
  const payload = plain(engine.sandbox.consumeFallLab3BossRemixRequest(buildPracticePayload(5, "f26-09-exact-retry-fresh"), 8_100));

  const stored = JSON.parse(engine.storage.getItem(CUSTOM_QUIZ_KEY));
  assert.deepEqual(stored, payload);
  for (const question of stored.questions) {
    assert.ok(question.prompt, "the stored attempt keeps the resolved prompt");
    assert.ok(question.answer, "and the resolved answer");
    if (question.type === "mcq") assert.ok(Array.isArray(question.choices) && question.choices.length);
    assert.ok(question.metadata, "and the resolved question metadata");
  }

  // Reloading the stored attempt must not re-enter the remix builder.
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(stored, 8_200), null, "a remix payload is not a practice payload");
  assert.deepEqual(JSON.parse(engine.storage.getItem(CUSTOM_QUIZ_KEY)), stored, "an exact retry cannot be regenerated away");
});

test("stale, expired, and non-Fall payloads leave the remix request alone", () => {
  const { questions } = buildFinishedAttempt(3, "f26-09-remix-expiry", [1]);
  const engine = loadEngine();
  const request = requestFor(engine, questions, { createdAt: 0 });

  engine.storage.setItem(REMIX_REQUEST_KEY, JSON.stringify(request));
  const legacyPayload = { id: "custom-quiz", title: "Legacy", questions: [{ type: "mcq", prompt: "x", answer: "y" }] };
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(legacyPayload, 1_000), null);
  assert.ok(engine.storage.getItem(REMIX_REQUEST_KEY), "a legacy quiz launch never touches a pending Fall request");

  const expired = 11 * 60 * 1000;
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(buildPracticePayload(3, "expired"), expired), null);
  assert.equal(engine.storage.getItem(REMIX_REQUEST_KEY), null, "expired requests are discarded");

  engine.storage.setItem(REMIX_REQUEST_KEY, JSON.stringify({ ...request, targetSize: 9, createdAt: 12_000 }));
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(buildPracticePayload(3, "tampered"), 12_100), null);
  assert.equal(engine.storage.getItem(REMIX_REQUEST_KEY), null, "an out-of-contract size is refused");
});

test("a completed remix records its own mode, lineage, and no longitudinal signals", () => {
  const { questions: parentQuestions, payload: practice } = buildFinishedAttempt(3, "f26-09-remix-history", [1, 2]);
  const engine = loadEngine();
  engine.sandbox.PharmletReviewQueueStore = loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;
  engine.sandbox.PharmletCurriculumMetadata = loadBrowserGlobal("assets/js/curriculum-metadata.js").PharmletCurriculumMetadata;

  // The parent practice attempt is completed first.
  seedCompletedAttempt(engine, parentQuestions, { attemptMetadata: practice.metadata });
  engine.sandbox.showResults();
  const parentHistory = JSON.parse(engine.storage.getItem(HISTORY_KEY));
  const reviewQueueAfterParent = JSON.parse(engine.storage.getItem(REVIEW_KEY) || "[]");
  assert.equal(parentHistory.length, 1);
  assert.ok(reviewQueueAfterParent.length > 0, "a normal attempt still feeds the review queue");

  const request = requestFor(engine, parentQuestions, {
    attemptContext: engine.sandbox.getFallLab3AttemptContext(parentQuestions, practice.metadata),
    createdAt: 500
  });
  const remix = plain(engine.sandbox.buildFallLab3BossRemixPayload({
    request,
    practicePayload: buildPracticePayload(3, "f26-09-remix-history-fresh"),
    createdAt: 600
  }));

  const remixAttempt = remix.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: index !== 0,
    _user: index === 0 ? "wrong answer" : question.answer
  }));
  seedCompletedAttempt(engine, remixAttempt, {
    attemptMetadata: remix.metadata,
    bossMode: true,
    title: remix.title
  });
  run(engine.sandbox, `state.generatedAttemptIdentity = buildGeneratedAttemptIdentity(${JSON.stringify(remix)});`);
  engine.sandbox.showResults();

  const history = JSON.parse(engine.storage.getItem(HISTORY_KEY));
  assert.equal(history.length, 2, "the remix is its own completed attempt");
  assert.deepEqual(history[0], parentHistory[0], "the parent attempt entry is untouched");

  const entry = history[1];
  assert.equal(entry.mode, "bossRemix", "a remix is a distinct practice mode");
  assert.match(entry.quizId, /fall-2026-lab3-boss-remix/);
  assert.notEqual(entry.quizId, parentHistory[0].quizId);
  assert.equal(entry.total, remix.questions.length);
  assert.equal(entry.attemptLineage.attemptKind, "fall-2026-lab3-boss-remix");
  assert.equal(entry.attemptLineage.remixGeneration, 1);
  assert.equal(entry.attemptLineage.quizWeek, 3);
  assert.equal(entry.attemptLineage.questionCount, remix.questions.length);
  assert.equal(entry.attemptLineage.attemptId, remix.metadata.fallLab3.attemptId);
  assert.equal(entry.attemptLineage.parentAttemptId, request.parentAttemptId);
  assert.equal(entry.attemptLineage.rootAttemptId, request.rootAttemptId);
  assert.equal(entry.attemptLineage.curriculumId, "p2-fall-2026-lab3");
  assert.equal(entry.attemptLineage.professionalYear, "P2");
  assert.equal(entry.attemptLineage.lab, "Lab III");
  assert.equal(parentHistory[0].attemptLineage.attemptKind, "fall-2026-lab3-practice");
  assert.equal(parentHistory[0].attemptLineage.remixGeneration, 0);

  assert.deepEqual(
    JSON.parse(engine.storage.getItem(REVIEW_KEY)),
    reviewQueueAfterParent,
    "a remix never amplifies review-queue weakness"
  );
  assert.equal(engine.storage.getItem("pharmlet.topDrugs.signals"), null, "and never writes lifetime signals");
  assert.match(engine.dom.get("question-card").innerHTML, /does not feed lifetime weakness/);
});

test("abandoning a remix leaves the completed Boss attempt durable and unduplicated", () => {
  const { questions, payload: practice } = buildFinishedAttempt(3, "f26-09-abandoned-remix", [0, 4, 6]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions, { attemptMetadata: practice.metadata });
  engine.sandbox.launchBossRound();

  const bossPayload = JSON.parse(engine.storage.getItem(CUSTOM_QUIZ_KEY));
  const bossAttempt = bossPayload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: index !== 0,
    _user: index === 0 ? "wrong answer" : question.answer
  }));
  seedCompletedAttempt(engine, bossAttempt, { attemptMetadata: bossPayload.metadata, bossMode: true });
  run(engine.sandbox, `state.generatedAttemptIdentity = buildGeneratedAttemptIdentity(${JSON.stringify(bossPayload)});`);
  engine.sandbox.showResults();

  const historyAfterBoss = JSON.parse(engine.storage.getItem(HISTORY_KEY));
  assert.equal(historyAfterBoss.length, 1);
  assert.equal(historyAfterBoss[0].mode, "boss");

  // Re-rendering the same completed results must not write a second entry.
  engine.sandbox.showResults();
  assert.deepEqual(JSON.parse(engine.storage.getItem(HISTORY_KEY)), historyAfterBoss, "completion writes history exactly once");

  // Launch the remix and walk away without finishing it.
  assert.equal(engine.sandbox.launchFallLab3BossRemix(), true);
  const remixPayload = plain(engine.sandbox.consumeFallLab3BossRemixRequest(
    buildPracticePayload(3, "f26-09-abandoned-remix-fresh"),
    9_000
  ));
  assert.ok(remixPayload, "the remix attempt was created");

  const historyAfterAbandon = JSON.parse(engine.storage.getItem(HISTORY_KEY));
  assert.deepEqual(historyAfterAbandon, historyAfterBoss, "an unfinished remix records nothing");
  assert.equal(historyAfterAbandon.filter((entry) => entry.mode === "boss").length, 1, "exactly one completed Boss attempt exists");
  assert.equal(historyAfterAbandon.some((entry) => entry.mode === "bossRemix"), false);
  assert.equal(historyAfterAbandon[0].attemptLineage.attemptKind, "boss-round");
  assert.equal(JSON.parse(engine.storage.getItem(CUSTOM_QUIZ_KEY)).metadata.kind, "fall-2026-lab3-boss-remix");
});

test("Boss Remix and New Week practice both leave through the existing Fall launcher route", () => {
  const { questions } = buildFinishedAttempt(9, "f26-09-remix-route", [3]);
  const engine = loadEngine();
  seedCompletedAttempt(engine, questions);
  engine.sandbox.showResults();

  assert.equal(engine.sandbox.launchFallLab3BossRemix(), true);
  assert.equal(engine.location.href, "lab3-fall-2026.html?week=9", "a remix is built by the existing weekly launcher");
  const pending = JSON.parse(engine.storage.getItem(REMIX_REQUEST_KEY));
  assert.equal(pending.quizWeek, 9, "the requested week is inherited from the finished attempt");
  assert.equal(pending.targetSize, 6);

  assert.equal(engine.sandbox.startFallLab3WeekPractice(9), true);
  assert.equal(engine.location.href, "lab3-fall-2026.html?week=9");
  assert.equal(engine.storage.getItem(REMIX_REQUEST_KEY), null, "a plain weekly launch clears a stale remix request");

  assert.equal(engine.sandbox.startFallLab3WeekPractice(11), false, "week ceilings still apply to the launcher route");
});

test("remix eligibility needs real attempt evidence and a Fall attempt", () => {
  const engine = loadEngine();
  const { questions } = buildFinishedAttempt(2, "f26-09-remix-eligibility", [1]);

  assert.equal(engine.sandbox.getFallLab3RemixPreviewSize(questions), 6);

  const barelyStarted = questions.map((question, index) => ({
    ...question,
    _answered: index < 2,
    _correct: false,
    _user: index < 2 ? "wrong answer" : null
  }));
  assert.equal(engine.sandbox.getFallLab3RemixPreviewSize(barelyStarted), 0, "two answers are not an attempt");

  const legacyQuestions = [
    { type: "mcq", prompt: "Legacy", answer: "A", _answered: true, _correct: false, _user: "B" },
    { type: "mcq", prompt: "Legacy 2", answer: "B", _answered: true, _correct: true, _user: "B" },
    { type: "mcq", prompt: "Legacy 3", answer: "C", _answered: true, _correct: true, _user: "C" }
  ];
  assert.equal(engine.sandbox.getFallLab3AttemptContext(legacyQuestions, null).active, false);
  assert.equal(engine.sandbox.getFallLab3RemixPreviewSize(legacyQuestions), 0, "legacy quizzes never offer Boss Remix");
});

// Protected boundaries
// ---------------------------------------------------------------------------

test("the engine still selects no Fall source data, policy, or generator module", () => {
  for (const reference of [
    "fall-2026-p2-top-drugs.json",
    "fall-2026-lab3-quiz-policy.json",
    "fall-2026-quiz-generator.js",
    "fall-2026-lab3-launcher.js"
  ]) {
    assert.equal(engineSource.includes(reference), false, `quizEngine.js must not select ${reference}`);
  }
  assert.equal(/\bimport\s*\(/.test(engineSource), false, "the engine stays a plain classic script");
  assert.ok(engineSource.includes('const FALL_LAB3_HUB_PAGE = "lab3-fall-2026.html";'), "continuation routes through the hub page");
});

test("canonical Fall data, policy, generator, and launcher stay byte-identical under F26-09", () => {
  assert.deepEqual({
    drugData: sha256("assets/data/fall-2026-p2-top-drugs.json"),
    policy: sha256("assets/data/fall-2026-lab3-quiz-policy.json"),
    generator: sha256("assets/js/fall-2026-quiz-generator.js"),
    launcher: sha256("assets/js/fall-2026-lab3-launcher.js")
  }, PROTECTED_FALL_BASELINES);
});

test("normal Fall generation semantics are untouched by the continuation work", () => {
  for (let quizWeek = 1; quizWeek <= 10; quizWeek += 1) {
    const seed = `f26-09-generation-unchanged-${quizWeek}`;
    const payload = buildPracticePayload(quizWeek, seed);
    assert.equal(payload.questions.length, 10);
    assert.equal(payload.metadata.kind, "fall-2026-lab3-practice");
    assert.equal(payload.metadata.composition.totalItemTarget, 10);
    assert.equal(payload.metadata.composition.newMaterialItemTarget, quizWeek === 1 ? 10 : 6);
    assert.equal(payload.metadata.composition.reviewMaterialItemTarget, quizWeek === 1 ? 0 : 4);
    assert.deepEqual(plain(payload), plain(buildPracticePayload(quizWeek, seed)), "generation stays deterministic");
    for (const question of payload.questions) {
      assert.notEqual(question.type, "mcq-multiple", "the generator still emits no MTC");
    }
  }
});

test("the engine cache token is refreshed for quiz.html only", () => {
  const quiz = read("quiz.html");
  assert.ok(quiz.includes(`assets/js/quizEngine.js?v=${ENGINE_TOKEN}`), "the engine change needs a fresh cache token");
  assert.ok(read("stats.html").includes("assets/js/stats.js?v=20260831a"), "unrelated bundles keep their tokens");
  assert.ok(read("lab3-fall-2026.html").includes('src="assets/js/fall-2026-lab3-launcher.js?v=20260827a"'));
});
