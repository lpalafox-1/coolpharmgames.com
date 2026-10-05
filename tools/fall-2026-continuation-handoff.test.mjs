// F26-22 — Lab III continuation handoff repair.
//
// F26-20 turned a bare `lab3-fall-2026.html?week=N` from an auto-launch into a
// preselection, which is right for bookmarks and the homepage quick links but
// silently stranded two completion-screen continuations that still route
// through that URL: "Boss Remix +1" and "New Week N Practice Set". These tests
// pin the repaired handoff end to end, across the engine (which writes the
// requests) and the launcher (which honors them), and the guarantee that a
// bare or shared URL still never generates a round.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import {
  buildFall2026Lab3Payload,
  buildFall2026WeekFocusPayload,
  consumeWeeklyLaunchRequest,
  initializePage,
  launchFall2026Lab3WeekFocus,
  peekBossRemixLaunchWeek
} from "../assets/js/fall-2026-lab3-launcher.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");

const LAUNCHER_TOKEN = "20261005a";
const ENGINE_TOKEN = "20260926e";
const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const REMIX_REQUEST_KEY = "pharmlet.fall-2026-lab3.boss-remix-request";
const ADAPTIVE_REQUEST_KEY = "pharmlet.fall-2026-lab3.adaptive-request";
const WEEKLY_REQUEST_KEY = "pharmlet.fall-2026-lab3.weekly-request";
const ADAPTIVE_MEMORY_KEY = "pharmlet.fall-2026-lab3.adaptive-memory";
const TEN_MINUTES = 10 * 60 * 1000;

const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));

// --- shared stubs ---------------------------------------------------------------

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  const writes = [];
  const removals = [];
  return {
    values,
    writes,
    removals,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem(key) { removals.push(key); values.delete(key); }
  };
}

// The engine, loaded exactly as shipped, with only the browser surface the
// completion actions touch.
function createEngineDom() {
  const make = () => {
    const node = {
      children: [], style: {}, dataset: {}, attributes: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      innerHTML: "", textContent: "", disabled: false, hidden: false, title: "", onclick: null,
      appendChild(child) { node.children.push(child); return child; },
      addEventListener() {}, removeEventListener() {},
      setAttribute(name, value) { node.attributes[name] = String(value); },
      getAttribute(name) { return name in node.attributes ? node.attributes[name] : null; },
      removeAttribute(name) { delete node.attributes[name]; },
      querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
      focus() {}, blur() {}, remove() {}, insertAdjacentHTML() {}, scrollIntoView() {}
    };
    return node;
  };
  const nodes = new Map();
  return {
    documentElement: make(), body: make(), head: make(),
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, make()); return nodes.get(id); },
    createElement() { return make(); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}
  };
}

function loadEngine({ storage = createStorage() } = {}) {
  const location = { search: "?id=custom-quiz", href: "", reloads: 0, reload() { location.reloads += 1; } };
  const sandbox = loadBrowserGlobal("assets/js/quizEngine.js", {
    location,
    document: createEngineDom(),
    localStorage: storage,
    sessionStorage: createStorage(),
    alert() {}, confirm() { return false; },
    setTimeout, clearTimeout, setInterval, clearInterval,
    PharmletQuizCatalog: null
  });
  return { sandbox, location, storage };
}

const run = (sandbox, code) => vm.runInContext(code, sandbox);

// A finished Standard attempt: every question answered, `missedIndexes` wrong.
function seedFinishedStandardAttempt(engine, quizWeek, seed, missedIndexes = []) {
  const payload = buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed });
  const questions = payload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: !missedIndexes.includes(index),
    _user: missedIndexes.includes(index) ? "wrong answer" : question.answer
  }));
  run(engine.sandbox, `
    state.questions = ${JSON.stringify(questions)};
    state.attemptMetadata = ${JSON.stringify(payload.metadata)};
    state.title = ${JSON.stringify(payload.title)};
    state.index = 0;
    state.score = ${questions.filter((question) => question._correct).length};
    state.pointScore = state.score;
    state.totalPoints = ${questions.length};
    state.bossMode = false;
    state.reviewMode = false;
    state.progressKey = "pharmlet.quiz-progress.f26-22";
    state.timerSeconds = 240;
    state.timerPaused = false;
    state.resultsRecorded = false;
    state.signalsRecorded = false;
    state.finalBreakdown = null;
    state.attemptCompleted = false;
  `);
  return payload;
}

// The hub page as the launcher sees it: the three selects, buttons, status
// lines, and the Standard section it scrolls to. Calls are recorded so a test
// can assert what the page did, not only what storage holds afterwards.
function createHubDom() {
  const nodes = new Map();
  const calls = { scrollIntoView: [], focus: [] };
  const make = (id) => {
    const node = {
      id, value: "", disabled: false, textContent: "", dataset: {}, attributes: {},
      classList: { toggle() {}, contains() { return false; }, add() {}, remove() {} },
      setAttribute(name, value) { node.attributes[name] = String(value); },
      addEventListener() {},
      scrollIntoView(options) { calls.scrollIntoView.push({ id, options }); },
      focus(options) { calls.focus.push({ id, options }); }
    };
    return node;
  };
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, make(id)); return nodes.get(id); },
    documentElement: { classList: { contains: () => false, toggle() {} } },
    addEventListener() {}
  };
  return { document, calls, get: (id) => document.getElementById(id) };
}

// Runs `body` with the launcher's browser globals installed: storage, the hub
// DOM, a window whose location records navigation, and a fetch that serves the
// canonical Fall source and policy the way the static site does.
async function onHub({ storage, search = "" }, body) {
  const saved = ["localStorage", "window", "document", "fetch"].map((name) => [
    name, Object.getOwnPropertyDescriptor(globalThis, name)
  ]);
  const hub = createHubDom();
  const assigned = [];
  const install = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  install("localStorage", storage);
  install("document", hub.document);
  install("window", {
    location: { search, assign(url) { assigned.push(url); } },
    matchMedia: () => ({ matches: false })
  });
  install("fetch", async (url) => ({
    ok: true,
    json: async () => (String(url).includes("fall-2026-p2-top-drugs.json") ? drugData : policy)
  }));
  try {
    return await body({ hub, assigned, storage });
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

// --- Boss Remix: completion → hub → automatic Standard launch → remix ----------

test("peekBossRemixLaunchWeek honors a live remix request and never removes it", () => {
  const now = Date.now();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    for (const quizWeek of [1, 5, 10]) {
      const storage = createStorage({ [REMIX_REQUEST_KEY]: JSON.stringify({ quizWeek, createdAt: now, targetSize: 6, remixGeneration: 1 }) });
      globalThis.localStorage = storage;
      assert.equal(peekBossRemixLaunchWeek(now), quizWeek);
      assert.equal(peekBossRemixLaunchWeek(now), quizWeek, "peeking is repeatable");
      assert.ok(storage.getItem(REMIX_REQUEST_KEY), "the engine, not the hub, consumes the remix request");
      assert.deepEqual(storage.writes, []);
      assert.deepEqual(storage.removals, []);
    }

    for (const [label, value] of [
      ["expired", JSON.stringify({ quizWeek: 7, createdAt: now - TEN_MINUTES - 1 })],
      ["future dated", JSON.stringify({ quizWeek: 7, createdAt: now + (5 * 60 * 1000) })],
      ["no timestamp", JSON.stringify({ quizWeek: 7 })],
      ["string timestamp", JSON.stringify({ quizWeek: 7, createdAt: String(now) })],
      ["week 0", JSON.stringify({ quizWeek: 0, createdAt: now })],
      ["week 11", JSON.stringify({ quizWeek: 11, createdAt: now })],
      ["week 2.5", JSON.stringify({ quizWeek: 2.5, createdAt: now })],
      ["quizWeek true", JSON.stringify({ quizWeek: true, createdAt: now })],
      ["quizWeek \"1\"", JSON.stringify({ quizWeek: "1", createdAt: now })],
      ["quizWeek [1]", JSON.stringify({ quizWeek: [1], createdAt: now })],
      ["not json", "{ broken"],
      ["an array", "[7]"]
    ]) {
      const storage = createStorage({ [REMIX_REQUEST_KEY]: value });
      globalThis.localStorage = storage;
      assert.equal(peekBossRemixLaunchWeek(now), 0, `${label} must not launch`);
      assert.deepEqual(storage.removals, [], `${label}: clearing stays the engine's job`);
    }

    globalThis.localStorage = createStorage();
    assert.equal(peekBossRemixLaunchWeek(now), 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("Boss Remix completion reaches the hub and continues without a second click", async () => {
  const storage = createStorage();
  const engine = loadEngine({ storage });
  seedFinishedStandardAttempt(engine, 9, "f26-22-remix-handoff", [2, 5]);
  engine.sandbox.showResults();

  assert.equal(engine.sandbox.launchFallLab3BossRemix(), true);
  assert.equal(engine.location.href, "lab3-fall-2026.html?week=9", "the handoff URL is unchanged");
  const request = JSON.parse(storage.getItem(REMIX_REQUEST_KEY));
  assert.equal(request.quizWeek, 9);
  assert.equal(request.targetSize, 6);

  // The hub loads with the request pending and the fallback ?week=9 URL.
  await onHub({ storage, search: "?week=9" }, async ({ hub, assigned }) => {
    await initializePage();
    assert.deepEqual(assigned, ["quiz.html?id=custom-quiz"], "the Standard set launches on its own");
    assert.equal(hub.get("weekly-week").value, "9", "the visible selection matches the launch");
    const practice = JSON.parse(storage.getItem(CUSTOM_QUIZ_KEY));
    assert.equal(practice.metadata.kind, "fall-2026-lab3-practice");
    assert.equal(practice.metadata.quizWeek, 9);
    assert.deepEqual(practice.metadata.composition, {
      newMaterialItemTarget: 6,
      reviewMaterialItemTarget: 4,
      totalItemTarget: 10
    }, "the remix source is a normal 6+4 Standard set");
    assert.ok(storage.getItem(REMIX_REQUEST_KEY), "the launcher leaves the remix request for the engine");
    assert.equal(storage.getItem(ADAPTIVE_REQUEST_KEY), null);
  });

  // quiz.html then turns that set into the remix exactly as before F26-20.
  const next = loadEngine({ storage });
  const remix = next.sandbox.consumeFallLab3BossRemixRequest(JSON.parse(storage.getItem(CUSTOM_QUIZ_KEY)));
  assert.ok(remix, "the pending remix request is consumed by its own week's practice payload");
  assert.equal(remix.metadata.kind, "fall-2026-lab3-boss-remix");
  assert.equal(remix.metadata.quizWeek, 9);
  assert.equal(remix.questions.length, 6);
  assert.equal(storage.getItem(REMIX_REQUEST_KEY), null, "the request is spent");
  assert.equal(JSON.parse(storage.getItem(CUSTOM_QUIZ_KEY)).metadata.kind, "fall-2026-lab3-boss-remix");
});

test("a remix request for another week does not hijack a bare ?week=N visit", async () => {
  const storage = createStorage({
    [REMIX_REQUEST_KEY]: JSON.stringify({ quizWeek: 4, createdAt: Date.now() - TEN_MINUTES - 1, targetSize: 6, remixGeneration: 1 })
  });
  await onHub({ storage, search: "?week=4" }, async ({ hub, assigned }) => {
    await initializePage();
    assert.deepEqual(assigned, [], "an expired request is not a launch");
    assert.equal(hub.get("weekly-week").value, "4", "the URL still preselects");
    assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), null);
  });
});

// --- bare ?week=N: preselect and reveal only -------------------------------------

test("a bare ?week=N preselects and reveals Standard Weekly Practice but never launches", async () => {
  for (const quizWeek of [1, 6, 10]) {
    const storage = createStorage();
    await onHub({ storage, search: `?week=${quizWeek}` }, async ({ hub, assigned }) => {
      await initializePage();
      assert.deepEqual(assigned, [], `?week=${quizWeek} must not navigate`);
      assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), null, `?week=${quizWeek} must not generate a round`);
      assert.deepEqual(storage.writes, [], "a bare visit writes nothing");
      assert.equal(hub.get("weekly-week").value, String(quizWeek));
      assert.equal(hub.get("weekly-launch").disabled, false, "the student can start it with one click");
      assert.equal(hub.get("adaptive-week").value, "", "Adaptive is not preselected");
      assert.equal(hub.get("week-focus-week").value, "", "Week Focus is not preselected");
      assert.deepEqual(hub.calls.scrollIntoView.map((call) => call.id), ["standard-weekly-practice"]);
      assert.deepEqual(hub.calls.focus, [{ id: "standard-weekly-practice", options: { preventScroll: true } }],
        "focus lands on the section, never on the select");
      assert.match(hub.get("weekly-selection-summary").textContent, new RegExp(`^Week ${quizWeek} selected\\.`));
    });
  }
});

test("an unsupported or missing ?week leaves the hub untouched", async () => {
  for (const search of ["", "?week=0", "?week=11", "?week=abc", "?adaptive=3"]) {
    const storage = createStorage();
    await onHub({ storage, search }, async ({ hub, assigned }) => {
      await initializePage();
      assert.deepEqual(assigned, []);
      assert.equal(hub.get("weekly-week").value, "");
      assert.deepEqual(hub.calls.scrollIntoView, [], `${search || "(none)"} must not scroll`);
      assert.deepEqual(hub.calls.focus, []);
      assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), null);
    });
  }
});

// --- surface contracts ------------------------------------------------------------

test("the hub ships the repaired launcher and the homepage names the quick links honestly", () => {
  const hub = read("lab3-fall-2026.html");
  assert.ok(hub.includes(`src="assets/js/fall-2026-lab3-launcher.js?v=${LAUNCHER_TOKEN}"`), "launcher cache token must move");
  assert.match(hub, /id="standard-weekly-practice"[^>]*tabindex="-1"/, "the Standard section must stay focusable");
  assert.ok(read("quiz.html").includes(`assets/js/quizEngine.js?v=${ENGINE_TOKEN}`), "engine cache token must move with the engine change");

  const homepage = read("index.html");
  assert.doesNotMatch(homepage, /Jump straight to a week/, "the old label promised a launch that no longer happens");
  assert.match(homepage, /Standard Weekly Practice · opens the Hub with your week selected/);
  for (const quizWeek of [1, 2, 3]) {
    assert.ok(homepage.includes(`href="lab3-fall-2026.html?week=${quizWeek}"`), "quick-link hrefs are unchanged");
  }

  const launcher = read("assets/js/fall-2026-lab3-launcher.js");
  const writes = [...launcher.matchAll(/localStorage\.setItem\(\s*([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(writes)].sort(), ["ADAPTIVE_MEMORY_KEY", "CUSTOM_QUIZ_KEY"],
    "the hub reads continuation requests; it never writes one");
  assert.doesNotMatch(launcher, /removeItem\(\s*BOSS_REMIX_REQUEST_KEY/, "the remix request is the engine's to clear");
});

// --- New Week N Practice Set: completion → single-use request → fresh set ----------

test("consumeWeeklyLaunchRequest is single use, expiring, and strict", () => {
  const now = Date.now();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    for (const quizWeek of [1, 7, 10]) {
      const storage = createStorage({ [WEEKLY_REQUEST_KEY]: JSON.stringify({ quizWeek, createdAt: now }) });
      globalThis.localStorage = storage;
      assert.equal(consumeWeeklyLaunchRequest(now), quizWeek);
      assert.equal(storage.getItem(WEEKLY_REQUEST_KEY), null, "the request is consumed on read");
      assert.equal(consumeWeeklyLaunchRequest(now), 0, "a spent request cannot fire twice");
    }

    for (const [label, value] of [
      ["expired", JSON.stringify({ quizWeek: 7, createdAt: now - TEN_MINUTES - 1 })],
      ["future dated", JSON.stringify({ quizWeek: 7, createdAt: now + (5 * 60 * 1000) })],
      ["no timestamp", JSON.stringify({ quizWeek: 7 })],
      ["string timestamp", JSON.stringify({ quizWeek: 7, createdAt: String(now) })],
      ["null timestamp", JSON.stringify({ quizWeek: 7, createdAt: null })],
      ["week 0", JSON.stringify({ quizWeek: 0, createdAt: now })],
      ["week 11", JSON.stringify({ quizWeek: 11, createdAt: now })],
      ["week 2.5", JSON.stringify({ quizWeek: 2.5, createdAt: now })],
      ["quizWeek true", JSON.stringify({ quizWeek: true, createdAt: now })],
      ["quizWeek false", JSON.stringify({ quizWeek: false, createdAt: now })],
      ["quizWeek \"1\"", JSON.stringify({ quizWeek: "1", createdAt: now })],
      ["quizWeek [1]", JSON.stringify({ quizWeek: [1], createdAt: now })],
      ["quizWeek null", JSON.stringify({ quizWeek: null, createdAt: now })],
      ["adaptive-shaped", JSON.stringify({ targetWeek: 7, createdAt: now })],
      ["not json", "{ broken"],
      ["not an object", '"7"'],
      ["an array", "[7]"]
    ]) {
      const storage = createStorage({ [WEEKLY_REQUEST_KEY]: value });
      globalThis.localStorage = storage;
      assert.equal(consumeWeeklyLaunchRequest(now), 0, `${label} must not launch`);
      assert.equal(storage.getItem(WEEKLY_REQUEST_KEY), null, `${label} must still be consumed`);
    }

    const empty = createStorage();
    globalThis.localStorage = empty;
    assert.equal(consumeWeeklyLaunchRequest(now), 0);
    assert.deepEqual(empty.writes, [], "reading with no request writes nothing");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("New Week N Practice Set completes as a fresh Standard set without a second click", async () => {
  const storage = createStorage({
    [REMIX_REQUEST_KEY]: JSON.stringify({ quizWeek: 9, createdAt: Date.now(), targetSize: 6, remixGeneration: 1 })
  });
  const engine = loadEngine({ storage });
  seedFinishedStandardAttempt(engine, 9, "f26-22-new-week-handoff", [1]);
  engine.sandbox.showResults();

  assert.equal(engine.sandbox.startFallLab3WeekPractice(9), true);
  assert.equal(engine.location.href, "lab3-fall-2026.html?week=9", "?week=N stays the fallback preselection URL");
  const request = JSON.parse(storage.getItem(WEEKLY_REQUEST_KEY));
  assert.equal(request.quizWeek, 9);
  assert.ok(Number.isFinite(request.createdAt));
  assert.equal(storage.getItem(REMIX_REQUEST_KEY), null, "a plain weekly launch still clears a stale remix request");
  assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), null, "the engine hands off; it never builds the set");

  await onHub({ storage, search: "?week=9" }, async ({ hub, assigned }) => {
    await initializePage();
    assert.deepEqual(assigned, ["quiz.html?id=custom-quiz"]);
    assert.equal(hub.get("weekly-week").value, "9");
    assert.equal(storage.getItem(WEEKLY_REQUEST_KEY), null, "single use");
    const practice = JSON.parse(storage.getItem(CUSTOM_QUIZ_KEY));
    assert.equal(practice.metadata.kind, "fall-2026-lab3-practice");
    assert.equal(practice.metadata.quizWeek, 9);
    assert.deepEqual(practice.metadata.composition, {
      newMaterialItemTarget: 6,
      reviewMaterialItemTarget: 4,
      totalItemTarget: 10
    }, "Standard 6+4 generation is untouched");
    assert.equal(storage.getItem(ADAPTIVE_MEMORY_KEY), null, "a Standard launch never touches adaptive memory");
  });

  // Returning to the same URL later is a bare visit again: preselect only.
  storage.removeItem(CUSTOM_QUIZ_KEY);
  await onHub({ storage, search: "?week=9" }, async ({ hub, assigned }) => {
    await initializePage();
    assert.deepEqual(assigned, [], "the spent request cannot re-fire from the URL");
    assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), null);
    assert.equal(hub.get("weekly-week").value, "9");
    assert.deepEqual(hub.calls.scrollIntoView.map((call) => call.id), ["standard-weekly-practice"]);
  });
});

test("startFallLab3WeekPractice refuses bad weeks and writes no request", () => {
  // `true` is deliberately absent: this pre-existing function coerces with
  // Number(), unlike toFallLab3WeekNumber, and F26-22 does not change that.
  const engine = loadEngine();
  for (const bad of [0, 11, -1, 2.5, NaN, [], "", null, undefined]) {
    const literal = typeof bad === "string" ? `"${bad}"` : String(bad);
    assert.equal(run(engine.sandbox, `startFallLab3WeekPractice(${literal})`), false, `${literal} must be refused`);
  }
  assert.equal(engine.storage.getItem(WEEKLY_REQUEST_KEY), null);
  assert.equal(engine.location.href, "");
});

test("the adaptive request keeps precedence and a stray weekly request is still consumed", async () => {
  const now = Date.now();
  const storage = createStorage({
    [ADAPTIVE_REQUEST_KEY]: JSON.stringify({ targetWeek: 5, createdAt: now }),
    [WEEKLY_REQUEST_KEY]: JSON.stringify({ quizWeek: 3, createdAt: now })
  });
  await onHub({ storage, search: "" }, async ({ hub, assigned }) => {
    await initializePage();
    assert.deepEqual(assigned, ["quiz.html?id=custom-quiz"]);
    const payload = JSON.parse(storage.getItem(CUSTOM_QUIZ_KEY));
    assert.equal(payload.metadata.kind, "fall-2026-lab3-adaptive", "Adaptive wins");
    assert.equal(payload.metadata.adaptiveTargetWeek, 5);
    assert.equal(hub.get("adaptive-week").value, "5");
    assert.equal(hub.get("weekly-week").value, "", "the weekly request did not touch the Standard select");
    assert.equal(storage.getItem(ADAPTIVE_REQUEST_KEY), null);
    assert.equal(storage.getItem(WEEKLY_REQUEST_KEY), null, "the losing request cannot fire on a later visit");
  });
});

// --- boundaries: who never writes or consumes the weekly request -------------------

test("Adaptive and Boss Remix continuations never write the weekly request", () => {
  const adaptiveEngine = loadEngine();
  assert.equal(run(adaptiveEngine.sandbox, "startFallLab3AdaptiveRound(7)"), true);
  assert.ok(adaptiveEngine.storage.getItem(ADAPTIVE_REQUEST_KEY));
  assert.equal(adaptiveEngine.storage.getItem(WEEKLY_REQUEST_KEY), null);
  assert.equal(adaptiveEngine.location.href, "lab3-fall-2026.html", "adaptive handoff is unchanged");

  const remixEngine = loadEngine();
  seedFinishedStandardAttempt(remixEngine, 4, "f26-22-remix-writes-no-weekly", [0, 3]);
  remixEngine.sandbox.showResults();
  assert.equal(remixEngine.sandbox.launchFallLab3BossRemix(), true);
  assert.ok(remixEngine.storage.getItem(REMIX_REQUEST_KEY));
  assert.equal(remixEngine.storage.getItem(WEEKLY_REQUEST_KEY), null);
  assert.equal(remixEngine.location.href, "lab3-fall-2026.html?week=4", "remix handoff is unchanged");

  const engine = read("assets/js/quizEngine.js");
  const writes = [...engine.matchAll(/localStorage\.setItem\(\s*FALL_LAB3_WEEKLY_REQUEST_KEY/g)];
  assert.equal(writes.length, 1, "exactly one engine site writes the weekly request");
  const site = engine.slice(engine.indexOf("function startFallLab3WeekPractice("), engine.indexOf("function openFallLab3Hub("));
  assert.match(site, /FALL_LAB3_WEEKLY_REQUEST_KEY/, "and it is New Week N Practice Set");
  assert.doesNotMatch(engine, /getItem\(\s*FALL_LAB3_WEEKLY_REQUEST_KEY/, "the engine never consumes it");
});

test("Week Focus neither writes nor consumes the weekly continuation", async () => {
  const now = Date.now();
  const pending = JSON.stringify({ quizWeek: 6, createdAt: now });
  const storage = createStorage({ [WEEKLY_REQUEST_KEY]: pending });
  const previous = ["localStorage", "window"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  let assigned = "";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { assign(url) { assigned = url; } } } });
  try {
    const payload = await launchFall2026Lab3WeekFocus(6, { drugData, policy, seed: "f26-22-week-focus-isolation" });
    assert.equal(payload.metadata.kind, "fall-2026-lab3-week-focus");
    assert.equal(assigned, "quiz.html?id=custom-quiz");
    assert.equal(storage.getItem(WEEKLY_REQUEST_KEY), pending, "a Week Focus launch leaves the request alone");
    assert.deepEqual(storage.removals, []);
    assert.deepEqual([...new Set(storage.writes)], [CUSTOM_QUIZ_KEY]);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }

  // And a Week Focus payload arriving in quiz.html is not a Standard practice
  // payload, so it can never stand in for the remix's fresh source either.
  const engine = loadEngine({ storage: createStorage({
    [REMIX_REQUEST_KEY]: JSON.stringify({ quizWeek: 6, createdAt: now, targetSize: 6, remixGeneration: 1 })
  }) });
  const focusPayload = buildFall2026WeekFocusPayload({ drugData, policy, quizWeek: 6, seed: "f26-22-week-focus-not-remix-source" });
  assert.equal(focusPayload.metadata.kind, "fall-2026-lab3-week-focus");
  assert.equal(engine.sandbox.consumeFallLab3BossRemixRequest(focusPayload), null);
  assert.ok(engine.storage.getItem(REMIX_REQUEST_KEY), "the remix request waits for a Standard set");
  assert.equal(engine.storage.getItem(CUSTOM_QUIZ_KEY), null, "nothing was substituted");

  const launcher = read("assets/js/fall-2026-lab3-launcher.js");
  const weekFocus = launcher.slice(launcher.indexOf("export function createFall2026WeekFocusSeed("), launcher.indexOf("function readJson("));
  assert.doesNotMatch(weekFocus, /WEEKLY_REQUEST_KEY|BOSS_REMIX_REQUEST_KEY|ADAPTIVE_REQUEST_KEY/,
    "the Week Focus path knows nothing about continuation requests");
});
