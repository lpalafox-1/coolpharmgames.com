import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import {
  ADAPTIVE_MEMORY_KEY,
  getQuestionSourceWeeks
} from "../assets/js/fall-2026-adaptive-practice.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(repoRoot, file), "utf8");
const CUSTOM_KEY = "pharmlet.custom-quiz";
const HISTORY_KEY = "pharmlet.history";
const REVIEW_KEY = "pharmlet.review-queue";
const allWeeks = Array.from({ length: 10 }, (_, index) => index + 1);
let importCount = 0;

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes.push(key); values.set(key, String(value)); },
    removeItem(key) { writes.push(key); values.delete(key); },
    snapshot() { return JSON.stringify([...values.entries()].sort()); }
  };
}

// Only the page's real IDs, defaults, and data-launch-week buttons are mounted.
// The shipped launcher registers and handles events; no launch logic is copied.
function pageDocument(html) {
  const listeners = new Map();
  const elements = new Map();
  const weekly = [];

  function element(tag = "div", attributes = "", content = "") {
    const classes = new Set();
    const handlers = new Map();
    const attrs = new Map([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    const node = {
      tagName: tag.toUpperCase(),
      id: attrs.get("id") || "",
      dataset: Object.fromEntries([...attrs].filter(([key]) => key.startsWith("data-")).map(([key, value]) => [
        key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value
      ])),
      value: attrs.get("value") || "",
      disabled: /(?:^|\s)disabled(?:\s|=|$)/.test(attributes),
      style: {},
      innerHTML: content,
      textContent: content.replace(/<[^>]+>/g, ""),
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; }
      },
      setAttribute(name, value) { attrs.set(name, String(value)); },
      getAttribute(name) { return attrs.get(name) ?? null; },
      removeAttribute(name) { attrs.delete(name); },
      addEventListener(type, handler) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(handler);
      },
      async dispatch(type) {
        await Promise.all((handlers.get(type) || []).map((handler) => handler({ target: node, preventDefault() {} })));
      },
      focus() { node.focused = true; }
    };
    if (tag === "select") {
      const options = [...content.matchAll(/<option\b([^>]*)>/g)];
      const selected = options.find((option) => /(?:^|\s)selected(?:\s|=|$)/.test(option[1])) || options[0];
      node.value = /value="([^"]*)"/.exec(selected?.[1] || "")?.[1] ?? "";
    }
    return node;
  }

  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="[^"]+"[^>]*)>/g)) {
    const contentEnd = html.indexOf(`</${match[1]}>`, match.index + match[0].length);
    const content = contentEnd < 0 ? "" : html.slice(match.index + match[0].length, contentEnd);
    const node = element(match[1], match[2], content);
    elements.set(node.id, node);
  }
  for (const match of html.matchAll(/<button\b([^>]*\bdata-launch-week="\d+"[^>]*)>([\s\S]*?)<\/button>/g)) {
    weekly.push(element("button", match[1], match[2]));
  }
  return {
    elements, weekly,
    documentElement: element("html"),
    createElement: element,
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) { return selector === "[data-launch-week]" ? weekly : []; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    async initialize() {
      await listeners.get("DOMContentLoaded")?.();
      await new Promise(setImmediate);
    }
  };
}

async function withHub({ search = "", initial = {}, fetchHook } = {}, run) {
  const document = pageDocument(read("lab3-fall-2026.html"));
  const localStorage = storage(initial);
  const navigations = [];
  const fetches = [];
  const errors = [];
  const globals = {
    document,
    localStorage,
    window: { location: { search, assign(url) { navigations.push(url); } } },
    console: { ...console, error(...args) { errors.push(args); } },
    async fetch(url) {
      fetches.push(url);
      if (fetchHook) await fetchHook(url);
      assert.ok(["assets/data/fall-2026-p2-top-drugs.json", "assets/data/fall-2026-lab3-quiz-policy.json"].includes(url));
      return { ok: true, json: async () => JSON.parse(read(url)) };
    }
  };
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    const url = pathToFileURL(path.join(repoRoot, "assets/js/fall-2026-lab3-launcher.js"));
    url.searchParams.set("primary-path-test", String(++importCount));
    await import(url.href);
    await document.initialize();
    await run({ document, localStorage, navigations, fetches, errors });
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function assertHistoryIdentity(payload, expectedKind, expectedType) {
  const quietDocument = { addEventListener() {} };
  const engine = loadBrowserGlobal("assets/js/quizEngine.js", {
    document: quietDocument,
    location: { search: "?id=custom-quiz", href: "" },
    localStorage: storage(), sessionStorage: storage()
  });
  vm.runInContext(`state.questions = ${JSON.stringify(payload.questions)}; state.attemptMetadata = ${JSON.stringify(payload.metadata)};`, engine);
  const lineage = JSON.parse(JSON.stringify(engine.buildFallLab3HistoryLineage()));
  assert.equal(lineage.attemptKind, expectedKind);
  assert.ok(lineage.attemptId.includes(`:${expectedKind}:`));
  assert.equal(lineage.questionCount, 10);
  const stats = loadBrowserGlobal("assets/js/stats.js", { document: quietDocument });
  const [record] = stats.normalizeHistoryRecords([{
    quizId: "generated-custom-quiz", title: payload.title, mode: "easy",
    score: 7, total: 10, timestamp: Date.now(), attemptLineage: lineage
  }]);
  assert.equal(record.attemptKind, expectedKind);
  assert.equal(record.attemptTypeId, expectedType);
  assert.equal(record.attemptTypeSource, "lineage");
}

test("homepage and hub initialization leave existing quiz, adaptive memory, history, and review storage byte-identical", async () => {
  const initial = {
    [CUSTOM_KEY]: '{ "title": "an unfinished round" }',
    [ADAPTIVE_MEMORY_KEY]: '{ "version": 1, "rounds": [] }',
    [HISTORY_KEY]: "[ ]",
    [REVIEW_KEY]: "[ ]"
  };
  const document = pageDocument(read("index.html"));
  const localStorage = storage(initial);
  const before = localStorage.snapshot();
  loadBrowserGlobal("assets/js/home.js", { document, localStorage });
  await document.initialize();
  assert.equal(localStorage.snapshot(), before);
  assert.deepEqual(localStorage.writes, []);

  for (const search of ["", "?week=0", "?week=11", "?week=2.5", "?week=garbage", "?adaptive=1"]) {
    await withHub({ initial, search }, ({ localStorage: hubStorage, fetches, navigations }) => {
      assert.equal(hubStorage.snapshot(), before, `loading ${search || "the hub"} must not persist a round`);
      assert.deepEqual(hubStorage.writes, []);
      assert.deepEqual(fetches, [], "setup must not even fetch the question corpus before a deliberate launch");
      assert.deepEqual(navigations, []);
    });
  }
});

test("adaptive setup starts empty and refuses unsupported values even when its click handler is dispatched", async () => {
  await withHub({}, async ({ document, localStorage, fetches, navigations }) => {
    const select = document.getElementById("adaptive-week");
    const button = document.getElementById("adaptive-launch");
    assert.equal(select.value, "", "a new student must choose a target rather than inherit an arbitrary week");
    assert.equal(button.disabled, true);
    for (const value of ["", "0", "11", "2.5", "invalid"]) {
      select.value = value;
      await select.dispatch("change");
      assert.equal(button.disabled, true, `${value || "empty"} is not a valid target`);
      await button.dispatch("click");
      assert.match(document.getElementById("adaptive-status").textContent, /choose a week/i);
    }
    assert.deepEqual(localStorage.writes, []);
    assert.deepEqual(fetches, []);
    assert.deepEqual(navigations, []);
    select.value = "4";
    await select.dispatch("change");
    assert.equal(button.disabled, false);
    assert.deepEqual(localStorage.writes, [], "changing the target is still setup, not a round launch");
  });
});

test("every adaptive target launches through real selection, retains its lineage, and writes only launch-time anti-repetition memory", async () => {
  for (const targetWeek of allWeeks) {
    await withHub({ initial: { [HISTORY_KEY]: "[ ]", [REVIEW_KEY]: "[ ]" } }, async ({ document, localStorage, navigations }) => {
      const select = document.getElementById("adaptive-week");
      select.value = String(targetWeek);
      await select.dispatch("change");
      await document.getElementById("adaptive-launch").dispatch("click");
      const payload = JSON.parse(localStorage.getItem(CUSTOM_KEY));
      assert.equal(payload.metadata.kind, "fall-2026-lab3-adaptive");
      assert.equal(payload.metadata.adaptiveTargetWeek, targetWeek);
      assert.equal(payload.questions.length, 10);
      assert.ok(payload.questions.every((question) => getQuestionSourceWeeks(question).every((week) => week >= 1 && week <= targetWeek)), `Week ${targetWeek} leaked future material`);
      assert.equal(payload.selection, undefined, "selection diagnostics are not a competing persisted payload");
      assert.deepEqual(localStorage.writes, [CUSTOM_KEY, ADAPTIVE_MEMORY_KEY]);
      assert.equal(JSON.parse(localStorage.getItem(ADAPTIVE_MEMORY_KEY)).rounds.length, 1);
      assert.equal(localStorage.getItem(HISTORY_KEY), "[ ]", "launching is not completing an attempt");
      assert.equal(localStorage.getItem(REVIEW_KEY), "[ ]");
      assert.deepEqual(navigations, ["quiz.html?id=custom-quiz"]);
      assertHistoryIdentity(payload, "fall-2026-lab3-adaptive", "fall-lab3-adaptive");
    });
  }
});

test("all standard buttons and bookmarked week links keep weekly composition and standard history identity", async () => {
  for (const quizWeek of allWeeks) {
    for (const route of ["button", "bookmark"]) {
      const remembered = '{ "version": 1, "rounds": [] }';
      await withHub({ search: route === "bookmark" ? `?week=${quizWeek}` : "", initial: { [ADAPTIVE_MEMORY_KEY]: remembered } }, async ({ document, localStorage, navigations }) => {
        if (route === "button") await document.weekly.find((button) => Number(button.dataset.launchWeek) === quizWeek).dispatch("click");
        const payload = JSON.parse(localStorage.getItem(CUSTOM_KEY));
        assert.equal(payload.metadata.kind, "fall-2026-lab3-practice");
        assert.equal(payload.metadata.quizWeek, quizWeek);
        assert.equal(payload.metadata.adaptiveTargetWeek, undefined);
        assert.equal(payload.questions.length, 10);
        assert.deepEqual(payload.metadata.composition, {
          newMaterialItemTarget: quizWeek === 1 ? 10 : 6,
          reviewMaterialItemTarget: quizWeek === 1 ? 0 : 4,
          totalItemTarget: 10
        });
        assert.equal(payload.questions.filter((question) => question.metadata.sourceMaterial === "new").length, quizWeek === 1 ? 10 : 6);
        assert.ok(payload.questions.every((question) => getQuestionSourceWeeks(question).every((week) => week <= quizWeek)));
        assert.deepEqual(localStorage.writes, [CUSTOM_KEY]);
        assert.equal(localStorage.getItem(ADAPTIVE_MEMORY_KEY), remembered);
        assert.deepEqual(navigations, ["quiz.html?id=custom-quiz"]);
        assertHistoryIdentity(payload, "fall-2026-lab3-practice", "fall-lab3-practice");
      });
    }
  }
});

test("an in-flight adaptive launch blocks competing mode clicks and keeps the selected target stable", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await withHub({ fetchHook: () => pending }, async ({ document, localStorage, navigations }) => {
    const select = document.getElementById("adaptive-week");
    const adaptiveButton = document.getElementById("adaptive-launch");
    select.value = "4";
    await select.dispatch("change");
    const launch = adaptiveButton.dispatch("click");
    try {
      assert.equal(select.disabled, true);
      assert.equal(adaptiveButton.disabled, true);
      assert.ok(document.weekly.every((button) => button.disabled));
      await document.weekly[9].dispatch("click");
      await adaptiveButton.dispatch("click");
      assert.deepEqual(localStorage.writes, []);
    } finally {
      release();
      await launch;
    }
    assert.deepEqual(localStorage.writes, [CUSTOM_KEY, ADAPTIVE_MEMORY_KEY]);
    assert.equal(JSON.parse(localStorage.getItem(CUSTOM_KEY)).metadata.adaptiveTargetWeek, 4);
    assert.deepEqual(navigations, ["quiz.html?id=custom-quiz"]);
  });
});

test("a failed source load restores both practice controls and a deliberate retry can launch", async () => {
  let fail = true;
  await withHub({ fetchHook() { if (fail) throw new Error("Source temporarily unavailable"); } }, async ({ document, localStorage, navigations, errors }) => {
    const select = document.getElementById("adaptive-week");
    const button = document.getElementById("adaptive-launch");
    select.value = "3";
    await select.dispatch("change");
    await button.dispatch("click");
    assert.equal(errors.length, 1);
    assert.match(document.getElementById("adaptive-status").textContent, /Source temporarily unavailable/);
    assert.equal(select.disabled, false);
    assert.equal(button.disabled, false);
    assert.ok(document.weekly.every((weeklyButton) => !weeklyButton.disabled));
    assert.deepEqual(localStorage.writes, []);
    assert.deepEqual(navigations, []);
    fail = false;
    await button.dispatch("click");
    assert.deepEqual(localStorage.writes, [CUSTOM_KEY, ADAPTIVE_MEMORY_KEY]);
    assert.deepEqual(navigations, ["quiz.html?id=custom-quiz"]);
  });
});
