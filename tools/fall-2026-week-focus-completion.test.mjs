// F26-24 — Week Focus completion keeps Week Focus identity.
//
// A finished Week Focus round used to fall through to the Standard Fall menu,
// so "New Week N Practice Set" continued into Standard Weekly Practice and
// Boss Round / Boss Remix were offered on a selected-week-only attempt.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import { buildFall2026WeekFocusPayload } from "../assets/js/fall-2026-lab3-launcher.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));

const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const REMIX_REQUEST_KEY = "pharmlet.fall-2026-lab3.boss-remix-request";
const ADAPTIVE_REQUEST_KEY = "pharmlet.fall-2026-lab3.adaptive-request";
const WEEKLY_REQUEST_KEY = "pharmlet.fall-2026-lab3.weekly-request";
const QUIZ_HREF = pathToFileURL(path.join(repoRoot, "quiz.html")).href;

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function createDocument() {
  const nodes = new Map();
  const make = () => {
    const node = {
      children: [], style: {}, dataset: {}, attributes: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      innerHTML: "", textContent: "", value: "", disabled: false, hidden: false, title: "",
      className: "", type: "", name: "", checked: false,
      appendChild(child) { node.children.push(child); return child; },
      addEventListener() {}, removeEventListener() {},
      setAttribute(name, value) { node.attributes[name] = String(value); },
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(node.attributes, name) ? node.attributes[name] : null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      focus() {}, blur() {}, remove() {}, insertAdjacentHTML() {}, scrollIntoView() {}
    };
    return node;
  };
  return {
    documentElement: make(),
    body: make(),
    head: make(),
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, make());
      return nodes.get(id);
    },
    createElement() { return make(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
}

function loadMenuEngine() {
  const storage = createStorage();
  const sandbox = loadBrowserGlobal("assets/js/quizEngine.js", {
    location: { search: "?id=custom-quiz", href: QUIZ_HREF, reload() {}, assign() {} },
    document: createDocument(),
    localStorage: storage,
    sessionStorage: createStorage(),
    alert() {},
    confirm() { return false; },
    setTimeout, clearTimeout, setInterval, clearInterval
  });
  return sandbox;
}

function loadActionEngine(storage = createStorage()) {
  const alerts = [];
  const location = {
    search: "?id=custom-quiz",
    href: QUIZ_HREF,
    assigned: [],
    reloads: 0,
    assign(url) { location.assigned.push(url); },
    reload() { location.reloads += 1; }
  };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    location,
    document: createDocument(),
    localStorage: storage,
    sessionStorage: createStorage(),
    alert(message) { alerts.push(String(message)); },
    confirm() { return false; },
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const script = new vm.Script(read("assets/js/quizEngine.js"), {
    filename: path.join(repoRoot, "assets/js/quizEngine.js"),
    importModuleDynamically: (specifier) => import(specifier)
  });
  script.runInContext(sandbox);
  return { sandbox, alerts, location, storage };
}

function installLauncherGlobals(storage, windowValue) {
  const names = ["localStorage", "window", "document", "fetch"];
  const previous = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const define = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  define("localStorage", storage);
  define("window", windowValue);
  define("document", windowValue.document);
  define("fetch", async (url) => {
    const relative = String(url).includes("fall-2026-lab3-quiz-policy.json")
      ? "assets/data/fall-2026-lab3-quiz-policy.json"
      : "assets/data/fall-2026-p2-top-drugs.json";
    return { ok: true, json: async () => JSON.parse(read(relative)) };
  });
  return () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

function focusPayload(quizWeek, seed) {
  return buildFall2026WeekFocusPayload({ drugData, policy, quizWeek, seed });
}

function answered(payload, missedIndexes = []) {
  return payload.questions.map((question, index) => ({
    ...question,
    _id: index,
    _answered: true,
    _correct: !missedIndexes.includes(index),
    _user: missedIndexes.includes(index) ? "wrong answer" : question.answer
  }));
}

function run(sandbox, code) {
  return vm.runInContext(code, sandbox);
}

function actionIds(actions) {
  return Array.from(actions, (action) => action.id);
}

function forbiddenStandardIds(actions) {
  for (const id of ["boss-round", "boss-remix", "new-week-practice", "start-week-practice"]) {
    assert.equal(actionIds(actions).includes(id), false, `Week Focus offered ${id}`);
  }
}

const standardFall = (quizWeek) => ({ active: true, quizWeek });
const weekFocus = (quizWeek) => ({ active: true, quizWeek });
const adaptive = (targetWeek) => ({ active: true, targetWeek });

test("a perfect Week Focus completion offers Focus, retry, and the hub", () => {
  const engine = loadMenuEngine();
  const actions = engine.getCompletionContinuationActions({
    missedCount: 0,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(6),
    weekFocus: weekFocus(6)
  });

  assert.deepEqual(actionIds(actions), ["new-week-focus", "retry-attempt", "lab3-hub"]);
  assert.equal(actions[0].label, "🆕 New Week 6 Focus");
  assert.equal(actions[1].label, "🔁 Retry This Set");
  assert.equal(actions[2].label, "← Return to Lab III Hub");
  forbiddenStandardIds(actions);
});

test("a Week Focus completion with misses keeps Review N Missed and stays on Focus", () => {
  const engine = loadMenuEngine();
  const actions = engine.getCompletionContinuationActions({
    missedCount: 3,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(4),
    weekFocus: weekFocus(4)
  });

  assert.deepEqual(actionIds(actions), ["review-missed", "new-week-focus", "retry-attempt", "lab3-hub"]);
  assert.equal(actions[0].label, "🔄 Review 3 Missed");
  assert.equal(actions[1].label, "🆕 New Week 4 Focus");
  assert.equal(actions[2].label, "🔁 Retry This Set");
  forbiddenStandardIds(actions);
});

test("Week Focus Review Missed completion keeps review-again, Restart Full Set, and New Week N Focus", () => {
  const engine = loadMenuEngine();
  const withMisses = engine.getCompletionContinuationActions({
    reviewMode: true,
    missedCount: 2,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(8),
    weekFocus: weekFocus(8)
  });
  assert.deepEqual(actionIds(withMisses), ["review-missed", "new-week-focus", "retry-attempt", "lab3-hub"]);
  assert.equal(withMisses[0].label, "🔄 Review 2 Missed");
  assert.equal(withMisses[1].label, "🆕 New Week 8 Focus");
  assert.equal(withMisses[2].label, "🔁 Restart Full Set");
  forbiddenStandardIds(withMisses);

  const cleared = engine.getCompletionContinuationActions({
    reviewMode: true,
    missedCount: 0,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(8),
    weekFocus: weekFocus(8)
  });
  assert.deepEqual(actionIds(cleared), ["new-week-focus", "retry-attempt", "lab3-hub"]);
  assert.equal(cleared.find((action) => action.id === "retry-attempt").label, "🔁 Restart Full Set");
  forbiddenStandardIds(cleared);
});

test("rendered Week Focus results use Focus copy and the Review Missed screen stays there", () => {
  const payload = focusPayload(6, "f26-24-render-week-6");
  const storage = createStorage({ [CUSTOM_QUIZ_KEY]: JSON.stringify(payload) });
  const engine = loadActionEngine(storage);
  run(engine.sandbox, `
    state.questions = ${JSON.stringify(answered(payload, [1, 4, 7]))};
    state.attemptMetadata = ${JSON.stringify(payload.metadata)};
    state.title = ${JSON.stringify(payload.title)};
    state.score = 7;
  `);

  engine.sandbox.showResults();
  const first = engine.sandbox.document.getElementById("question-card").innerHTML;
  assert.match(first, /New Week 6 Focus builds a fresh 10-question set from Week 6 only, with no prior-week review/);
  assert.match(first, /Retry This Set repeats these exact questions/);
  assert.match(first, /🔄 Review 3 Missed/);
  assert.match(first, /🆕 New Week 6 Focus/);
  assert.match(first, /🔁 Retry This Set/);
  assert.doesNotMatch(first, /Boss Remix|Boss Round|Practice Set/);

  engine.sandbox.reviewMissed();
  assert.equal(run(engine.sandbox, "state.reviewMode"), true);
  assert.equal(run(engine.sandbox, "state.questions.length"), 3);
  run(engine.sandbox, `
    state.questions.forEach((question) => {
      question._answered = true;
      question._correct = false;
      question._user = "still wrong";
    });
  `);
  engine.sandbox.showResults();
  const review = engine.sandbox.document.getElementById("question-card").innerHTML;
  assert.match(review, /🔄 Review 3 Missed/);
  assert.match(review, /🆕 New Week 6 Focus/);
  assert.match(review, /🔁 Restart Full Set/);
  assert.match(review, /Restart Full Set reloads this exact Week 6 Focus set/);
  assert.match(review, /no prior-week review/);
  assert.doesNotMatch(review, /Boss Remix|Boss Round|Practice Set/);
  assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), JSON.stringify(payload), "Review Missed leaves the stored Focus set in place");
});

test("Retry and Restart Full Set reload the exact stored Week Focus set", () => {
  const payload = focusPayload(3, "f26-24-retry-week-3");
  const stored = JSON.stringify(payload);
  const { sandbox, location, storage } = loadActionEngine(createStorage({ [CUSTOM_QUIZ_KEY]: stored }));
  run(sandbox, `
    state.attemptCompleted = true;
    state.attemptMetadata = ${JSON.stringify(payload.metadata)};
    state.questions = ${JSON.stringify(answered(payload, [0]))};
  `);

  sandbox.restartQuiz();
  assert.equal(location.reloads, 1);
  assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), stored);

  run(sandbox, "state.reviewMode = true;");
  sandbox.restartQuiz();
  assert.equal(location.reloads, 2);
  assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), stored);
  assert.equal(JSON.parse(storage.getItem(CUSTOM_QUIZ_KEY)).metadata.kind, "fall-2026-lab3-week-focus");
});

test("New Week N Focus launches another 10-question same-week Focus round and clears a stale Boss Remix request", async () => {
  // The engine action uses dynamic import(). Node's vm only honors that callback
  // with --experimental-vm-modules, which the shared test script does not set.
  if (!process.execArgv.includes("--experimental-vm-modules")) {
    const result = spawnSync(process.execPath, [
      "--experimental-vm-modules",
      "--test",
      "--test-name-pattern",
      "New Week N Focus launches another 10-question same-week Focus round",
      fileURLToPath(import.meta.url)
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return;
  }

  const storage = createStorage({
    [REMIX_REQUEST_KEY]: JSON.stringify({
      quizWeek: 9, createdAt: Date.now(), targetSize: 6, remixGeneration: 1
    }),
    [WEEKLY_REQUEST_KEY]: JSON.stringify({ quizWeek: 2, createdAt: Date.now() }),
    [ADAPTIVE_REQUEST_KEY]: JSON.stringify({ targetWeek: 2, createdAt: Date.now() })
  });
  const engine = loadActionEngine(storage);
  const restore = installLauncherGlobals(storage, engine.sandbox);
  try {
    const weeklyBefore = storage.getItem(WEEKLY_REQUEST_KEY);
    const adaptiveBefore = storage.getItem(ADAPTIVE_REQUEST_KEY);
    run(engine.sandbox, `state.attemptMetadata = { kind: "fall-2026-lab3-week-focus", quizWeek: 6 };`);
    assert.equal(engine.sandbox.runCompletionAction("new-week-focus"), true);
    assert.equal(storage.getItem(REMIX_REQUEST_KEY), null, "the stale remix request is cleared before the new round starts");
    assert.equal(engine.sandbox.runCompletionAction("new-week-focus"), false, "a second click does not start another launch");

    await new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (engine.location.assigned.length || engine.alerts.length) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 8000) {
          clearInterval(timer);
          reject(new Error("New Week N Focus did not finish"));
        }
      }, 20);
    });

    assert.deepEqual(engine.alerts, []);
    assert.deepEqual(engine.location.assigned, ["quiz.html?id=custom-quiz"]);
    const round = JSON.parse(storage.getItem(CUSTOM_QUIZ_KEY));
    assert.equal(round.metadata.kind, "fall-2026-lab3-week-focus");
    assert.equal(round.metadata.quizWeek, 6);
    assert.equal(round.questions.length, 10);
    assert.deepEqual(round.metadata.composition, {
      newMaterialItemTarget: 10,
      reviewMaterialItemTarget: 0,
      totalItemTarget: 10
    });
    assert.ok(round.questions.every((question) => question.metadata.sourceDrugQuizWeek === 6));
    assert.ok(round.questions.every((question) => question.metadata.sourceMaterial === "new"));
    assert.equal(round.questions.filter((question) => question.metadata.sourceMaterial === "review").length, 0);
    assert.equal(storage.getItem(WEEKLY_REQUEST_KEY), weeklyBefore, "Focus launch does not consume the weekly request");
    assert.equal(storage.getItem(ADAPTIVE_REQUEST_KEY), adaptiveBefore, "Focus launch does not consume the adaptive request");
    assert.equal(storage.getItem(REMIX_REQUEST_KEY), null);
  } finally {
    restore();
  }
});

test("importing the launcher registers Hub startup and does not run it", async () => {
  const now = Date.now();
  const pending = {
    [ADAPTIVE_REQUEST_KEY]: JSON.stringify({ targetWeek: 4, createdAt: now }),
    [WEEKLY_REQUEST_KEY]: JSON.stringify({ quizWeek: 4, createdAt: now }),
    [REMIX_REQUEST_KEY]: JSON.stringify({ quizWeek: 4, createdAt: now, targetSize: 6, remixGeneration: 1 })
  };
  const storage = createStorage(pending);
  const listeners = [];
  const document = { addEventListener(type, callback) { listeners.push({ type, callback }); } };
  const previous = ["document", "localStorage", "window"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const define = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try {
    define("document", document);
    define("localStorage", storage);
    define("window", { location: { search: "?week=4", href: QUIZ_HREF, assign() { throw new Error("import navigated"); } } });
    const url = pathToFileURL(path.join(repoRoot, "assets/js/fall-2026-lab3-launcher.js"));
    url.searchParams.set("f26-24-import-side-effect", "1");
    await import(url.href);
    assert.deepEqual(listeners.map((listener) => listener.type), ["DOMContentLoaded"]);
    assert.equal(listeners[0].callback.name, "initializePage");
    assert.equal(storage.getItem(ADAPTIVE_REQUEST_KEY), pending[ADAPTIVE_REQUEST_KEY]);
    assert.equal(storage.getItem(WEEKLY_REQUEST_KEY), pending[WEEKLY_REQUEST_KEY]);
    assert.equal(storage.getItem(REMIX_REQUEST_KEY), pending[REMIX_REQUEST_KEY]);
    assert.equal(storage.getItem(CUSTOM_QUIZ_KEY), null);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test("Week 1 Focus stays distinct from Standard Week 1", () => {
  const engine = loadMenuEngine();
  const focus = engine.getCompletionContinuationActions({
    missedCount: 2,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(1),
    weekFocus: weekFocus(1)
  });
  assert.equal(focus.find((action) => action.id === "new-week-focus").label, "🆕 New Week 1 Focus");
  forbiddenStandardIds(focus);

  const standard = engine.getCompletionContinuationActions({
    missedCount: 2,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(1)
  });
  assert.deepEqual(actionIds(standard), [
    "review-missed", "boss-round", "boss-remix", "retry-attempt", "new-week-practice", "lab3-hub"
  ]);
  assert.equal(standard.find((action) => action.id === "new-week-practice").label, "🆕 New Week 1 Practice Set");
});

test("the Standard completion menu remains unchanged", () => {
  const engine = loadMenuEngine();
  const practice = engine.getCompletionContinuationActions({
    missedCount: 3,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(4)
  });
  assert.deepEqual(actionIds(practice), [
    "review-missed", "boss-round", "boss-remix", "retry-attempt", "new-week-practice", "lab3-hub"
  ]);
  assert.equal(practice.find((action) => action.id === "review-missed").label, "🔄 Review 3 Missed");
  assert.equal(practice.find((action) => action.id === "new-week-practice").label, "🆕 New Week 4 Practice Set");

  const boss = engine.getCompletionContinuationActions({
    bossMode: true,
    missedCount: 2,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(4)
  });
  assert.deepEqual(actionIds(boss), [
    "review-missed", "boss-remix", "retry-attempt", "new-week-practice", "lab3-hub"
  ]);
});

test("the Adaptive completion menu remains unchanged", () => {
  const engine = loadMenuEngine();
  const withMisses = engine.getCompletionContinuationActions({
    missedCount: 3,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(7),
    adaptive: adaptive(7)
  });
  assert.deepEqual(actionIds(withMisses), ["review-missed", "new-adaptive-round", "retry-attempt", "lab3-hub"]);
  assert.equal(withMisses.find((action) => action.id === "review-missed").label, "🎯 Review 3 Missed");
  assert.equal(withMisses.find((action) => action.id === "new-adaptive-round").label, "🧠 New Adaptive Round");

  const perfect = engine.getCompletionContinuationActions({
    missedCount: 0,
    bossQuestionCount: 5,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(4),
    adaptive: adaptive(4)
  });
  assert.deepEqual(actionIds(perfect), ["new-adaptive-round", "retry-attempt", "lab3-hub"]);

  const review = engine.getCompletionContinuationActions({
    reviewMode: true,
    missedCount: 2,
    remixSize: 6,
    generatedPayload: true,
    fall: standardFall(6),
    adaptive: adaptive(6)
  });
  assert.equal(actionIds(review).includes("new-adaptive-round"), false);
  assert.equal(actionIds(review).includes("new-week-practice"), true);
});
