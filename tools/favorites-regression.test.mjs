import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAVORITES_KEY = "pharmlet.favorites";
const FEATURE_TOKEN = "20260821a";

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createStorage(initialRaw = "[]") {
  const values = new Map([[FAVORITES_KEY, initialRaw]]);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    raw(key = FAVORITES_KEY) { return values.get(key); }
  };
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.title = "";
    this.type = "";
    this.hidden = false;
    this.value = "";
    this.href = "";
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach((name) => this.classList.values.add(name)),
      contains: (name) => this.classList.values.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      }
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  click() {
    const event = { preventDefault() {}, stopPropagation() {} };
    for (const listener of this.listeners.get("click") || []) listener(event);
  }
}

function createDocument(controls = []) {
  const byId = new Map();
  const listeners = new Map();
  return {
    documentElement: new FakeElement("html"),
    createElement(tagName) { return new FakeElement(tagName); },
    querySelectorAll(selector) { return selector === "[data-favorite-id]" ? controls : []; },
    getElementById(id) { return byId.get(id) || null; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    setElement(id, element) { byId.set(id, element); },
    listeners
  };
}

function loadCatalog() {
  return loadBrowserGlobal("assets/js/quiz-catalog.js").PharmletQuizCatalog;
}

function loadFavorites({ storage = createStorage(), controls = [], locationSearch = "" } = {}) {
  const document = createDocument(controls);
  const sandbox = loadBrowserGlobal("assets/js/favorites.js", {
    document,
    localStorage: storage,
    location: { search: locationSearch },
    PharmletQuizCatalog: loadCatalog(),
    addEventListener() {},
    matchMedia() { return { matches: false }; },
    confirm() { return false; }
  });
  return { api: sandbox.PharmletFavorites, document, storage };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("Favorites keeps the existing string-array schema across add, reload, dedupe, and remove", () => {
  const initial = JSON.stringify(["ceutics-practice-1", "ceutics-practice-1", "", 42, "retired-quiz"]);
  const storage = createStorage(initial);
  const first = loadFavorites({ storage }).api;

  assert.equal(first.STORAGE_KEY, FAVORITES_KEY);
  assert.deepEqual(Array.from(first.getAll()), ["ceutics-practice-1", "retired-quiz"]);
  assert.equal(storage.raw(), initial, "reading must not rewrite existing or stale stored data");

  assert.equal(first.add("latin-fun"), true);
  assert.equal(first.add("latin-fun"), true);
  assert.deepEqual(JSON.parse(storage.raw()), ["ceutics-practice-1", "retired-quiz", "latin-fun"]);

  const reloaded = loadFavorites({ storage }).api;
  assert.equal(reloaded.has("latin-fun"), true);
  assert.equal(reloaded.remove("ceutics-practice-1"), true);
  assert.deepEqual(JSON.parse(storage.raw()), ["retired-quiz", "latin-fun"]);
});

test("Favorites fails safely for malformed and non-array storage without rewriting it", () => {
  for (const raw of ["{bad json", "null", "{}", '"chapter1-review"']) {
    const storage = createStorage(raw);
    const { api } = loadFavorites({ storage });
    assert.deepEqual(Array.from(api.getAll()), []);
    assert.equal(storage.raw(), raw);
  }
});

test("Favorite buttons provide immediate accessible state and synchronize duplicate controls", () => {
  const storage = createStorage();
  const controls = [];
  const { api, document } = loadFavorites({ storage, controls });
  const first = new FakeElement("button");
  const second = new FakeElement("button");
  controls.push(first, second);
  api.bindToggleButton(first, { id: "chapter1-review", title: "Chapter 1 Review" });
  api.bindToggleButton(second, { id: "chapter1-review", title: "Chapter 1 Review" });

  assert.equal(first.type, "button");
  assert.equal(first.textContent, "☆");
  assert.equal(first.getAttribute("aria-pressed"), "false");
  assert.equal(first.getAttribute("aria-label"), "Add Chapter 1 Review to favorites");

  first.click();
  assert.deepEqual(JSON.parse(storage.raw()), ["chapter1-review"]);
  for (const control of controls) {
    assert.equal(control.textContent, "★");
    assert.equal(control.getAttribute("aria-pressed"), "true");
    assert.equal(control.getAttribute("aria-label"), "Remove Chapter 1 Review from favorites");
  }

  second.click();
  assert.deepEqual(JSON.parse(storage.raw()), []);
  assert.equal(first.textContent, "☆");
  assert.ok(document.listeners.has("DOMContentLoaded"));
});

test("Favorites resolves cataloged P1 and legacy dynamic routes while rejecting generated or stale IDs", () => {
  const { api } = loadFavorites();
  for (const entry of loadCatalog().entries) {
    const descriptor = api.resolveFavoriteDescriptor(entry.id);
    assert.ok(descriptor, `${entry.id} must resolve through the Favorites catalog contract`);
    const actions = api.getLaunchActions(descriptor);
    assert.ok(actions.length > 0, `${entry.id} must retain at least one valid launch action`);
    assert.ok(actions.every((action) => action.href.startsWith("quiz.html?")), `${entry.id} must launch through quiz.html`);
  }

  const staticP1 = api.resolveFavoriteDescriptor("ceutics-practice-1");
  assert.equal(staticP1.title, "PSCI 71303 Pharmaceutics");
  assert.equal(staticP1.category, "practice");
  assert.equal(api.getLaunchActions(staticP1)[0].href, "quiz.html?id=ceutics-practice-1&mode=easy");

  const labTwo = api.resolveLocationFavorite({ search: "?week=3" });
  assert.equal(labTwo.id, "lab-2-week-3");
  assert.equal(labTwo.category, "lab");
  assert.deepEqual(plain(api.getLaunchActions(labTwo)), [{ label: "Open Quiz", href: "quiz.html?lab=2&week=3" }]);

  const labOneCumulative = api.resolveLocationFavorite({ search: "?weeks=1-5&lab=1" });
  assert.equal(labOneCumulative.id, "lab-1-weeks-1-5");
  assert.equal(labOneCumulative.category, "cumulative");
  assert.equal(api.resolveLocationFavorite({ search: "?weeks=2-11&lab=2" }).id, "lab-2-weeks-2-11");
  assert.equal(api.resolveLocationFavorite({ search: "?id=custom-quiz" }), null);
  assert.equal(api.resolveFavoriteDescriptor("retired-or-unknown"), null);
  for (const invalidId of [
    "lab-999-week-999",
    "lab-1-week-6",
    "lab-2-week-12",
    "lab-1-weeks-0-5",
    "lab-2-weeks-8-3",
    "lab-2-tag-antihypertensive",
    "tag-antihypertensive"
  ]) {
    assert.equal(api.resolveFavoriteDescriptor(invalidId), null, `${invalidId} must fail as unavailable`);
  }
  assert.equal(api.resolveLocationFavorite({ search: "?week=1&lab=3" }), null);
  assert.equal(api.resolveLocationFavorite({ search: "?tag=antihypertensive&lab=2" }), null);
});

test("Favorites projection skips stale IDs non-destructively and sorting/filtering remain correct", () => {
  const raw = JSON.stringify(["chapter1-review", "retired-or-unknown", "latin-fun"]);
  const storage = createStorage(raw);
  const { api } = loadFavorites({ storage });
  const projection = api.projectFavorites();

  assert.deepEqual(Array.from(projection.items, (item) => item.id), ["chapter1-review", "latin-fun"]);
  assert.deepEqual(Array.from(projection.unavailableIds), ["retired-or-unknown"]);
  assert.equal(storage.raw(), raw, "projection must not delete unavailable stored IDs");
  assert.deepEqual(Array.from(api.sortFavorites(projection.items, "recent"), (item) => item.id), ["latin-fun", "chapter1-review"]);
  assert.deepEqual(Array.from(api.sortFavorites(projection.items, "name"), (item) => item.id), ["chapter1-review", "latin-fun"]);
  assert.deepEqual(Array.from(api.filterFavorites(projection.items, "fun"), (item) => item.id), ["latin-fun"]);
});

test("Favorites page rendering removes resolved cards and restores the accurate empty state", () => {
  const storage = createStorage(JSON.stringify(["ceutics-practice-1"]));
  const { api, document } = loadFavorites({ storage });
  const list = new FakeElement("div");
  const sort = new FakeElement("select");
  sort.value = "recent";
  const filter = new FakeElement("select");
  filter.value = "";
  document.setElement("favorites-list", list);
  document.setElement("sort-by", sort);
  document.setElement("filter-category", filter);

  api.loadFavoritesPage();
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].tagName, "ARTICLE");

  api.remove("ceutics-practice-1");
  api.loadFavoritesPage();
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[0].textContent, "No favorites yet!");
  assert.equal(list.children[0].children[1].textContent, "Use the ☆ button beside a quiz in Quiz Library, or in a quiz header, to save it here.");
});

test("student-facing Favorites entry points are catalog-backed, discoverable, and exclude Fall generated runs", () => {
  const index = read("index.html");
  const custom = read("custom-quiz.html");
  const customJs = read("assets/js/custom-quiz.js");
  const quiz = read("quiz.html");
  const favorites = read("favorites.html");

  assert.match(index, /href="custom-quiz\.html"[^>]*>[\s\S]*?Quiz Library[\s\S]*?Custom Quiz/);
  assert.match(custom, /Quiz Library &amp; Custom Builder/);
  assert.match(custom, /use ☆ to save an individual quiz to Favorites/);
  assert.match(custom, /href="favorites\.html"[^>]*>View Favorites/);
  assert.match(customJs, /PharmletFavorites\?\.createToggleButton/);
  assert.match(customJs, /favoriteCategory: entry\.favoriteCategory/);
  assert.match(quiz, /id="favorite-quiz-control" hidden/);
  assert.match(favorites, /Use the ☆ button beside a quiz in Quiz Library, or in a quiz header/);
  assert.match(favorites, /href="custom-quiz\.html"[^>]*>Browse Quiz Library/);

  const currentSection = index.slice(index.indexOf('id="current-semester"'), index.indexOf('id="study-tools"'));
  assert.doesNotMatch(currentSection, /data-favorite-id|favorite-toggle/);
  assert.doesNotMatch(quiz, /data-favorite-id="custom-quiz"/);
});

test("Favorites controls share a versioned cache contract and a 44px keyboard-focus treatment", () => {
  const consumers = ["favorites.html", "custom-quiz.html", "quiz.html"];
  for (const file of consumers) {
    const html = read(file);
    assert.ok(html.includes(`assets/js/favorites.js?v=${FEATURE_TOKEN}`), `${file} must load the current Favorites controller`);
    assert.ok(html.includes(`assets/css/favorites.css?v=${FEATURE_TOKEN}`), `${file} must load the current Favorites styles`);
  }
  assert.ok(read("custom-quiz.html").includes(`assets/js/custom-quiz.js?v=${FEATURE_TOKEN}`));

  const css = read("assets/css/favorites.css");
  assert.match(css, /\.favorite-toggle\s*\{[\s\S]*?min-width:\s*44px/);
  assert.match(css, /\.favorite-toggle\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.favorite-toggle:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(css, /\.dark \.favorite-toggle\s*\{[\s\S]*?color:/);
  assert.match(read("assets/js/favorites.js"), /button\.type = "button"/);
  assert.match(read("assets/js/favorites.js"), /aria-pressed/);
});
