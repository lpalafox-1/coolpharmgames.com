import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalogExternalQuizSources } from "./validator-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WARNING_HEADER = "Cataloged data sources outside quizzes/";

// Build a throwaway validator repo: tools/{validate-quizzes,validator-core}.mjs,
// schema.json, node_modules symlink, plus caller-supplied files. The validator
// resolves its repo root from its own location, so a copied tree is the only way
// to exercise catalog-present / catalog-absent behavior without touching tools/.
function runValidatorInFixture({ quizzes = {}, files = {} }) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "pharmlet-extwarn-"));
  mkdirSync(path.join(fixtureRoot, "tools"));
  mkdirSync(path.join(fixtureRoot, "quizzes"));
  cpSync(path.join(repoRoot, "tools/validate-quizzes.mjs"), path.join(fixtureRoot, "tools/validate-quizzes.mjs"));
  cpSync(path.join(repoRoot, "tools/validator-core.mjs"), path.join(fixtureRoot, "tools/validator-core.mjs"));
  cpSync(path.join(repoRoot, "schema.json"), path.join(fixtureRoot, "schema.json"));
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(fixtureRoot, "node_modules"), "dir");

  for (const [name, content] of Object.entries(quizzes)) {
    writeFileSync(path.join(fixtureRoot, "quizzes", name), typeof content === "string" ? content : JSON.stringify(content));
  }
  for (const [relPath, content] of Object.entries(files)) {
    const dest = path.join(fixtureRoot, relPath);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, typeof content === "string" ? content : JSON.stringify(content));
  }

  const result = spawnSync(process.execPath, [path.join(fixtureRoot, "tools/validate-quizzes.mjs")], { encoding: "utf8" });
  rmSync(fixtureRoot, { recursive: true, force: true });
  return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

const validQuiz = {
  id: "fixture-valid",
  title: "Fixture Quiz",
  pools: { easy: [{ type: "mcq", prompt: "2 + 2?", choices: ["3", "4"], answer: "4" }] }
};

// Minimal catalog IIFE exposing one external quiz-json source, mirroring the
// real assets/js/quiz-catalog.js shape the loader reads.
function catalogSource(entries) {
  return `(function (global) {
  global.PharmletQuizCatalog = { entries: ${JSON.stringify(entries)} };
})(window);\n`;
}

test("real repository: warnings section appears, identifies the external source, exit stays 0", () => {
  const result = spawnSync(process.execPath, ["tools/validate-quizzes.mjs"], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(WARNING_HEADER));
  assert.match(result.stdout, /assets\/data\/bdt2_quiz9_masterpool\.json \(id: basis2-quiz9\)/);

  // quizzes/ results are unchanged: a stable ✅ line is present, and the warnings
  // header only appears after the last quizzes/ result line.
  assert.match(result.stdout, /✅ chapter1-review\.json/);
  const lines = result.stdout.split("\n");
  const lastQuizLine = lines.map((l, i) => (/^[✅❌💥] .+\.json$/.test(l) ? i : -1)).filter((i) => i >= 0).pop();
  const headerLine = lines.findIndex((l) => l.includes(WARNING_HEADER));
  assert.ok(headerLine > lastQuizLine, "warnings section must be appended after the quizzes/ results");
});

test("core loader returns the real external source, sorted and outside quizzes/", () => {
  const sources = loadCatalogExternalQuizSources();
  assert.ok(sources.some((s) => s.id === "basis2-quiz9" && s.sourcePath === "assets/data/bdt2_quiz9_masterpool.json"));
  assert.ok(sources.every((s) => !s.sourcePath.startsWith("quizzes/")));
});

test("fixture without quiz-catalog.js: behavior unchanged, no warnings section, exit 0", () => {
  const result = runValidatorInFixture({ quizzes: { "fixture-valid.json": validQuiz } });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /✅ fixture-valid\.json/);
  assert.doesNotMatch(result.stdout, new RegExp(WARNING_HEADER));
});

test("fixture with a catalog pointing to malformed external data: warning appears, exit stays 0", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-valid.json": validQuiz },
    files: {
      "assets/js/quiz-catalog.js": catalogSource([
        { id: "broken-ext", sourceType: "quiz-json", sourcePath: "assets/data/broken.json" }
      ]),
      "assets/data/broken.json": "{ not valid json"
    }
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /✅ fixture-valid\.json/);
  assert.match(result.stdout, new RegExp(WARNING_HEADER));
  assert.match(result.stdout, /assets\/data\/broken\.json \(id: broken-ext\)/);
  assert.match(result.stdout, /invalid JSON/);
});

test("fixture catalog whose external quiz-json source is schema-invalid warns without failing", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-valid.json": validQuiz },
    files: {
      "assets/js/quiz-catalog.js": catalogSource([
        { id: "bad-shape", sourceType: "quiz-json", sourcePath: "assets/data/bad-shape.json" }
      ]),
      // schema-invalid: an mcq whose answer is not among its choices
      "assets/data/bad-shape.json": {
        id: "bad-shape",
        title: "Bad Shape",
        pools: { easy: [{ type: "mcq", prompt: "?", choices: ["A", "B"], answer: "C" }] }
      }
    }
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /assets\/data\/bad-shape\.json \(id: bad-shape\)/);
  assert.match(result.stdout, /semantic: .*mcq answer must exactly match one listed choice/);
});
