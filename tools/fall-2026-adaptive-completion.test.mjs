// F26-12 Adaptive Practice completion UX.
//
// Adaptive rounds previously inherited the generic Fall completion menu, which
// offers five or six continuations. These tests pin the dedicated adaptive fork
// (at most four actions), the New Adaptive Round / Retry This Set distinction,
// and the guarantee that the standard weekly path is untouched.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import { consumeAdaptiveRoundRequest } from "../assets/js/fall-2026-lab3-launcher.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(path.join(repoRoot, relativePath))).digest("hex");
const plain = (value) => JSON.parse(JSON.stringify(value));
const ADAPTIVE_REQUEST_KEY = "pharmlet.fall-2026-lab3.adaptive-request";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    writes,
    snapshot() { return JSON.stringify([...values.entries()].sort()); }
  };
}

function createDomStub() {
  const make = () => {
    const node = {
      children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      innerHTML: "", textContent: "", disabled: false, hidden: false,
      appendChild(child) { node.children.push(child); return child; },
      addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
      querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
      focus() {}, blur() {}, remove() {}, insertAdjacentHTML() {}, scrollIntoView() {}
    };
    return node;
  };
  const nodes = new Map();
  return {
    document: {
      documentElement: make(), body: make(), head: make(),
      getElementById(id) { if (!nodes.has(id)) nodes.set(id, make()); return nodes.get(id); },
      createElement() { return make(); },
      querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener() {}, removeEventListener() {}
    }
  };
}

function loadEngine({ search = "?id=custom-quiz", storage = createStorage() } = {}) {
  const location = { search, href: "", reloads: 0, reload() { location.reloads += 1; } };
  const domStub = createDomStub();
  const sandbox = loadBrowserGlobal("assets/js/quizEngine.js", {
    location,
    document: domStub.document,
    localStorage: storage,
    sessionStorage: createStorage(),
    alert() {}, confirm() { return false; },
    setTimeout, clearTimeout, setInterval, clearInterval,
    PharmletQuizCatalog: null
  });
  return { sandbox, location, storage };
}

const run = (sandbox, code) => vm.runInContext(code, sandbox);
const adaptive = (targetWeek) => ({ active: true, targetWeek });
const fall = (quizWeek) => ({ active: true, quizWeek });

// --- the adaptive fork ----------------------------------------------------------

test("an adaptive attempt with misses shows exactly four actions", () => {
  const engine = loadEngine();
  const actions = plain(engine.sandbox.getCompletionContinuationActions({
    missedCount: 3,
    // Boss and remix material is deliberately offered and must be ignored.
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: fall(7),
    adaptive: adaptive(7)
  }));

  assert.deepEqual(actions.map((action) => action.id), [
    "review-missed", "new-adaptive-round", "retry-attempt", "lab3-hub"
  ]);
  assert.equal(actions.length, 4, "adaptive completion must never offer a fifth action");
  assert.equal(actions.find((a) => a.id === "review-missed").label, "🎯 Review 3 Missed");
  assert.equal(actions.find((a) => a.id === "new-adaptive-round").label, "🧠 New Adaptive Round");
  assert.equal(actions.find((a) => a.id === "retry-attempt").label, "🔁 Retry This Set");
  assert.equal(actions.find((a) => a.id === "lab3-hub").label, "← Return to Lab III Hub");
  assert.equal(actions.find((a) => a.id === "new-adaptive-round").tone, "primary",
    "New Adaptive Round is the primary action");
});

test("a perfect adaptive attempt shows exactly three actions", () => {
  const engine = loadEngine();
  const actions = plain(engine.sandbox.getCompletionContinuationActions({
    missedCount: 0, bossQuestionCount: 5, remixSize: 6, generatedPayload: true,
    fall: fall(4), adaptive: adaptive(4)
  }));

  assert.deepEqual(actions.map((action) => action.id), [
    "new-adaptive-round", "retry-attempt", "lab3-hub"
  ]);
  assert.equal(actions.length, 3);
});

test("adaptive completion never offers Boss Round, Boss Remix, or New Week X Practice", () => {
  const engine = loadEngine();
  for (const missedCount of [0, 1, 5, 10]) {
    for (const targetWeek of [1, 4, 10]) {
      const ids = plain(engine.sandbox.getCompletionContinuationActions({
        missedCount, bossQuestionCount: 5, remixSize: 7, generatedPayload: true,
        fall: fall(targetWeek), adaptive: adaptive(targetWeek)
      })).map((action) => action.id);

      for (const forbidden of ["boss-round", "boss-remix", "new-week-practice", "start-week-practice"]) {
        assert.ok(!ids.includes(forbidden),
          `adaptive completion offered ${forbidden} (missed ${missedCount}, week ${targetWeek})`);
      }
      assert.ok(ids.length <= 4, `adaptive completion produced ${ids.length} actions`);
    }
  }
});

test("standard weekly Fall completion keeps every existing action", () => {
  const engine = loadEngine();
  const practice = plain(engine.sandbox.getCompletionContinuationActions({
    missedCount: 3, bossQuestionCount: 5, remixSize: 6, generatedPayload: true, fall: fall(4)
  }));
  assert.deepEqual(practice.map((action) => action.id), [
    "review-missed", "boss-round", "boss-remix", "retry-attempt", "new-week-practice", "lab3-hub"
  ]);
  assert.equal(practice.find((a) => a.id === "review-missed").label, "🔄 Review 3 Missed",
    "the standard path keeps its own Review label");

  // Boss and review sub-modes are unchanged too.
  const boss = plain(engine.sandbox.getCompletionContinuationActions({
    bossMode: true, missedCount: 2, remixSize: 6, generatedPayload: true, fall: fall(4)
  }));
  assert.deepEqual(boss.map((a) => a.id), [
    "review-missed", "boss-remix", "retry-attempt", "new-week-practice", "lab3-hub"
  ]);

  const legacy = plain(engine.sandbox.getCompletionContinuationActions({
    missedCount: 0, bossQuestionCount: 5, fall: { active: false, quizWeek: 0 }
  }));
  assert.deepEqual(legacy.map((a) => a.id), ["boss-round", "retry-attempt"]);
});

test("a boss or review sub-mode never takes the adaptive fork", () => {
  const engine = loadEngine();
  for (const mode of [{ bossMode: true }, { reviewMode: true }]) {
    const ids = plain(engine.sandbox.getCompletionContinuationActions({
      ...mode, missedCount: 2, remixSize: 6, generatedPayload: true,
      fall: fall(6), adaptive: adaptive(6)
    })).map((a) => a.id);
    assert.ok(!ids.includes("new-adaptive-round"),
      `${JSON.stringify(mode)} must keep the standard continuation menu`);
  }
});

// --- provenance -----------------------------------------------------------------

test("the adaptive target week comes from attempt metadata, never inferred", () => {
  const engine = loadEngine();
  for (const targetWeek of [1, 5, 10]) {
    const context = plain(run(engine.sandbox,
      `getFallLab3AdaptiveContext({ kind: "fall-2026-lab3-adaptive", adaptiveTargetWeek: ${targetWeek} })`));
    assert.deepEqual(context, { active: true, targetWeek });
  }

  // Anything that does not prove an adaptive attempt is inactive.
  for (const metadata of [
    '{ kind: "fall-2026-lab3-practice", adaptiveTargetWeek: 4 }',
    '{ kind: "boss-round", adaptiveTargetWeek: 4 }',
    '{ kind: "fall-2026-lab3-adaptive" }',
    '{ kind: "fall-2026-lab3-adaptive", adaptiveTargetWeek: 0 }',
    '{ kind: "fall-2026-lab3-adaptive", adaptiveTargetWeek: 11 }',
    '{ kind: "fall-2026-lab3-adaptive", adaptiveTargetWeek: true }',
    '{ kind: "fall-2026-lab3-adaptive", adaptiveTargetWeek: [] }',
    '{ kind: "fall-2026-lab3-adaptive", adaptiveTargetWeek: "" }',
    "null", "undefined", "[]"
  ]) {
    const context = plain(run(engine.sandbox, `getFallLab3AdaptiveContext(${metadata})`));
    assert.equal(context.active, false, `${metadata} must not be treated as an adaptive attempt`);
    assert.equal(context.targetWeek, 0);
  }
});

// --- the handoff ----------------------------------------------------------------

test("New Adaptive Round requests a fresh round at the completed target week", () => {
  for (const targetWeek of [1, 7, 10]) {
    const engine = loadEngine();
    assert.equal(run(engine.sandbox, `startFallLab3AdaptiveRound(${targetWeek})`), true);

    const request = JSON.parse(engine.storage.getItem(ADAPTIVE_REQUEST_KEY));
    assert.equal(request.targetWeek, targetWeek, "the recorded ceiling is carried, not widened");
    assert.ok(Number.isFinite(request.createdAt));
    assert.equal(engine.location.href, "lab3-fall-2026.html",
      "the handoff must not encode a generating URL");

    // The engine hands off; it must not build or store a round itself.
    assert.equal(engine.storage.getItem("pharmlet.custom-quiz"), null,
      "the engine must not assemble the next adaptive round");
  }
});

test("an out-of-range or malformed target week is refused", () => {
  const engine = loadEngine();
  for (const bad of [0, 11, -1, 2.5, NaN, true, [], "", null, undefined]) {
    const literal = typeof bad === "string" ? `"${bad}"` : String(bad);
    assert.equal(run(engine.sandbox, `startFallLab3AdaptiveRound(${literal})`), false,
      `${literal} must be refused`);
  }
  assert.equal(engine.storage.getItem(ADAPTIVE_REQUEST_KEY), null);
});

test("the adaptive request is single use, expiring, and not replayable from a URL", () => {
  const now = Date.now();
  const store = (value) => {
    globalThis.localStorage = createStorage(value === null ? {} : { [ADAPTIVE_REQUEST_KEY]: value });
    return globalThis.localStorage;
  };

  // Every genuinely numeric supported week is honored exactly once.
  for (const targetWeek of [1, 7, 10]) {
    const valid = store(JSON.stringify({ targetWeek, createdAt: now }));
    assert.equal(consumeAdaptiveRoundRequest(now), targetWeek);
    assert.equal(valid.getItem(ADAPTIVE_REQUEST_KEY), null, "the request is consumed on read");
    assert.equal(consumeAdaptiveRoundRequest(now), 0, "a spent request cannot fire twice");
  }

  // Expired, malformed, coercible, and out-of-range requests are refused and
  // cleared. Number() would map true, "1" and [1] onto Week 1, so the consumer
  // must reject by type rather than coerce.
  for (const [label, value] of [
    ["expired", JSON.stringify({ targetWeek: 7, createdAt: now - (11 * 60 * 1000) })],
    ["future dated", JSON.stringify({ targetWeek: 7, createdAt: now + (5 * 60 * 1000) })],
    ["no timestamp", JSON.stringify({ targetWeek: 7 })],
    ["string timestamp", JSON.stringify({ targetWeek: 7, createdAt: String(now) })],
    ["null timestamp", JSON.stringify({ targetWeek: 7, createdAt: null })],
    ["week 0", JSON.stringify({ targetWeek: 0, createdAt: now })],
    ["week 11", JSON.stringify({ targetWeek: 11, createdAt: now })],
    ["week 2.5", JSON.stringify({ targetWeek: 2.5, createdAt: now })],
    ["targetWeek true", JSON.stringify({ targetWeek: true, createdAt: now })],
    ["targetWeek false", JSON.stringify({ targetWeek: false, createdAt: now })],
    ["targetWeek \"1\"", JSON.stringify({ targetWeek: "1", createdAt: now })],
    ["targetWeek [1]", JSON.stringify({ targetWeek: [1], createdAt: now })],
    ["targetWeek []", JSON.stringify({ targetWeek: [], createdAt: now })],
    ["targetWeek null", JSON.stringify({ targetWeek: null, createdAt: now })],
    ["targetWeek object", JSON.stringify({ targetWeek: { valueOf: 1 }, createdAt: now })],
    ["not json", "{ broken"],
    ["not an object", '"7"'],
    ["an array", "[7]"]
  ]) {
    const storage = store(value);
    assert.equal(consumeAdaptiveRoundRequest(now), 0, `${label} must not launch`);
    assert.equal(storage.getItem(ADAPTIVE_REQUEST_KEY), null, `${label} must still be cleared`);
  }

  const empty = store(null);
  assert.equal(consumeAdaptiveRoundRequest(now), 0);
  assert.deepEqual(empty.writes, [], "reading with no request writes nothing");
  delete globalThis.localStorage;
});

// --- boundaries -----------------------------------------------------------------

test("rendering adaptive completion actions writes nothing", () => {
  const engine = loadEngine();
  const before = engine.storage.snapshot();
  for (const missedCount of [0, 3]) {
    engine.sandbox.getCompletionContinuationActions({
      missedCount, bossQuestionCount: 5, remixSize: 6, generatedPayload: true,
      fall: fall(7), adaptive: adaptive(7)
    });
  }
  assert.equal(engine.storage.snapshot(), before, "building the menu must not touch storage");
  assert.deepEqual(engine.storage.writes, [], "no history or review-queue write may occur");
});

test("the engine hands adaptive selection to the launcher instead of duplicating it", () => {
  const engineSource = read("assets/js/quizEngine.js");
  const adaptiveSection = engineSource.slice(
    engineSource.indexOf("function getFallLab3AdaptiveContext"),
    engineSource.indexOf("function startFallLab3WeekPractice")
  );
  assert.ok(adaptiveSection.length > 0);

  // The engine must not grow its own adaptive selection.
  for (const forbidden of [
    "buildAdaptiveCandidatePool", "selectAdaptiveRound", "buildFall2026AdaptivePayload",
    "buildAdaptiveSignals", "scoreCandidate", "generateFall2026Quiz"
  ]) {
    assert.ok(!engineSource.includes(forbidden),
      `the engine must not call ${forbidden}; adaptive selection stays in its own module`);
  }

  // Canonical Fall data stays out of the engine.
  assert.ok(!engineSource.includes("fall-2026-p2-top-drugs.json"));
  assert.ok(!engineSource.includes("fall-2026-lab3-quiz-policy.json"));
});

test("F26-12 leaves the generator, canonical data, policy, and adaptive ranking untouched", () => {
  assert.equal(sha256("assets/js/fall-2026-quiz-generator.js"),
    "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a");
  assert.equal(sha256("assets/data/fall-2026-p2-top-drugs.json"),
    "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01");
  assert.equal(sha256("assets/data/fall-2026-lab3-quiz-policy.json"),
    "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171");
  assert.equal(sha256("assets/js/fall-2026-adaptive-practice.js"),
    "223f4888904f90f7c0b89affdded992203955a33428b037537bec5891820209c");
});
