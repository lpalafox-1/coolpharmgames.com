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

function loadCatalog() {
  const sandbox = { window: {}, URLSearchParams };
  vm.runInNewContext(readFileSync(catalogPath, "utf8"), sandbox, {
    filename: catalogPath,
    timeout: 1_000
  });

  const entries = sandbox.window.PharmletQuizCatalog?.entries;
  assert.ok(Array.isArray(entries), "quiz catalog must expose an entries array");
  return entries;
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
  }
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
