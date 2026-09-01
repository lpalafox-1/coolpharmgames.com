import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const catalogPath = path.join(repoRoot, "assets", "js", "quiz-catalog.js");
const indexPath = path.join(repoRoot, "index.html");
const quizzesDir = path.join(repoRoot, "quizzes");
const retiredE2bId = "practice-e2b-exam2-prep-expanded";
const retiredE2bPath = "quizzes/practice-e2b-exam2-prep-expanded.json";
const catalogConsumerPaths = [
  "custom-quiz.html",
  "favorites.html",
  "quiz.html",
  "review-queue.html",
  "stats.html"
];

function loadCatalogApi() {
  const sandbox = { window: {}, URLSearchParams };
  vm.runInNewContext(readFileSync(catalogPath, "utf8"), sandbox, {
    filename: catalogPath,
    timeout: 1_000
  });

  const catalog = sandbox.window.PharmletQuizCatalog;
  const entries = catalog?.entries;
  assert.ok(Array.isArray(entries), "quiz catalog must expose an entries array");
  return catalog;
}

function loadCatalog() {
  return loadCatalogApi().entries;
}

function countQuizQuestions(quiz) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
  const pools = quiz?.pools && typeof quiz.pools === "object"
    ? Object.values(quiz.pools).reduce((sum, pool) => sum + (Array.isArray(pool) ? pool.length : 0), 0)
    : 0;
  return questions + pools;
}

function extractQuizIds(html) {
  const ids = [];
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1] ?? match[2];
    const url = new URL(href, "https://pharmlet.local/");
    if (!url.pathname.endsWith("/quiz.html")) continue;

    const id = url.searchParams.get("id");
    if (id) ids.push(id);
  }

  return [...new Set(ids)];
}

test("quiz URL parsing preserves uppercase IDs and query parameters", () => {
  const ids = extractQuizIds(`
    <a href="quiz.html?id=top-drugs-final-mockA&mode=easy">Mock A</a>
    <a href="quiz.html?mode=easy&id=basis2-quiz9">Quiz 9</a>
  `);

  assert.deepEqual(ids, ["top-drugs-final-mockA", "basis2-quiz9"]);
});

test("homepage quiz links resolve through the runtime catalog", () => {
  const catalogIds = new Set(loadCatalog().map((entry) => entry.id));
  const homepageIds = extractQuizIds(readFileSync(indexPath, "utf8"));

  assert.ok(homepageIds.length > 0, "homepage should contain quiz links");
  for (const id of homepageIds) {
    assert.ok(catalogIds.has(id), `homepage quiz id ${id} must exist in the catalog`);
  }
});

test("catalog quiz-json sources exist and preserve their catalog IDs", () => {
  const entries = loadCatalog().filter((entry) => entry.sourceType === "quiz-json");

  for (const entry of entries) {
    assert.equal(typeof entry.sourcePath, "string", `${entry.id} needs a sourcePath`);
    const sourcePath = path.join(repoRoot, entry.sourcePath);
    assert.ok(existsSync(sourcePath), `${entry.id} source path must exist`);

    const source = JSON.parse(readFileSync(sourcePath, "utf8"));
    assert.equal(source.id, entry.id, `${entry.id} source id must match its catalog id`);
    if (entry.sourcePath.startsWith("quizzes/")) {
      assert.ok(countQuizQuestions(source) > 0, `${entry.id} must expose at least one static question`);
    }
  }
});

test("the retired empty E2B placeholder is absent from the catalog and Custom Quiz", () => {
  const catalog = loadCatalogApi();

  assert.equal(catalog.getEntry(retiredE2bId), null);
  assert.equal(catalog.entries.some((entry) => entry.id === retiredE2bId || entry.sourcePath === retiredE2bPath), false);
  assert.equal(catalog.listCustomBuilderEntries().some((entry) => entry.id === retiredE2bId), false);
  assert.equal(existsSync(path.join(repoRoot, retiredE2bPath)), false);
});

test("representative existing P1 quiz IDs still resolve through legacy routes", () => {
  const catalog = loadCatalogApi();
  const examples = [
    ["chapter1-review", "easy"],
    ["practice-e2a-exam2-prep-ch1-5", "hard"],
    ["top-drugs-final-mockA", "easy"]
  ];

  for (const [id, mode] of examples) {
    assert.ok(catalog.getEntry(id), `${id} must remain cataloged`);
    assert.equal(catalog.buildQuizHref(id, mode), `quiz.html?id=${id}&mode=${mode}`);
  }
});

test("every page consuming the shared quiz catalog uses one cache token", () => {
  const tokens = new Set();

  for (const relativePath of catalogConsumerPaths) {
    const html = readFileSync(path.join(repoRoot, relativePath), "utf8");
    const match = html.match(/assets\/js\/quiz-catalog\.js\?v=([^"'\s>]+)/);
    assert.ok(match, `${relativePath} must load the versioned quiz catalog`);
    tokens.add(match[1]);
  }

  assert.equal(tokens.size, 1, "quiz catalog consumers must share one cache token");
  assert.deepEqual([...tokens], ["20260831b"], "the P2F-07 curriculum catalog needs a fresh cache token");
});

test("catalog exposes cloned curriculum context only where repository evidence is reliable", () => {
  const catalog = loadCatalogApi();
  const fall = catalog.getCurriculumContext("ceutics-practice-1");
  assert.equal(fall.professionalYear, "P1");
  assert.equal(fall.semester, "Fall 2025");
  assert.equal(fall.course, "Pharmaceutics I");
  assert.equal(fall.origin, "static");

  const first = catalog.getEntry("ceutics-practice-1");
  first.curriculum.semester = "Changed outside the catalog";
  assert.equal(catalog.getEntry("ceutics-practice-1").curriculum.semester, "Fall 2025");

  const sample = catalog.getCurriculumContext("test-sample-3");
  assert.equal(sample.origin, "static");
  assert.equal(Object.hasOwn(sample, "professionalYear"), false);
  assert.equal(Object.hasOwn(sample, "semester"), false);
  assert.equal(Object.hasOwn(sample, "curriculumId"), false);
});

test("every static quiz is registered in the runtime catalog", () => {
  const catalogIds = new Set(loadCatalog().map((entry) => entry.id));
  const staticIds = readdirSync(quizzesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(path.join(quizzesDir, file), "utf8")).id);

  for (const id of staticIds) {
    assert.ok(catalogIds.has(id), `static quiz id ${id} must exist in the catalog`);
  }
});
