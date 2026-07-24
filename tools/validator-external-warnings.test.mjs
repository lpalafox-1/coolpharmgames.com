import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalogExternalQuizSources } from "./validator-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quizzesDir = path.join(repoRoot, "quizzes");

const WARNING_HEADER = "Cataloged data sources outside quizzes/";
const WARNING_SPLIT = "\n⚠️  Cataloged data sources outside quizzes/";

// Build a throwaway validator repo: tools/{validate-quizzes,validator-core}.mjs,
// schema.json, node_modules symlink, plus caller-supplied files. The validator
// resolves its repo root from its own location, so a copied tree is the only way
// to exercise catalog-present / catalog-absent and containment behavior without
// touching tools/. `prepare(fixtureRoot)` runs after files are written and before
// the validator runs, for symlinks and other filesystem setup.
function runValidatorInFixture({ quizzes = {}, files = {}, prepare } = {}) {
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
  if (prepare) prepare(fixtureRoot);

  const result = spawnSync(process.execPath, [path.join(fixtureRoot, "tools/validate-quizzes.mjs")], { encoding: "utf8" });
  rmSync(fixtureRoot, { recursive: true, force: true });
  return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

const validQuiz = {
  id: "fixture-valid",
  title: "Fixture Quiz",
  pools: { easy: [{ type: "mcq", prompt: "2 + 2?", choices: ["3", "4"], answer: "4" }] }
};

const brokenQuiz = {
  id: "fixture-broken",
  title: "Broken Quiz",
  pools: { easy: [{ type: "mcq", prompt: "?", choices: ["A", "B"], answer: "C" }] }
};

// Minimal catalog IIFE exposing the given entries, mirroring the real
// assets/js/quiz-catalog.js shape the loader reads.
function catalogSource(entries) {
  return `(function (global) {
  global.PharmletQuizCatalog = { entries: ${JSON.stringify(entries)} };
})(window);\n`;
}

// --- Real repository ---------------------------------------------------------

test("real repository: warnings section appears, identifies the external source, exit stays 0", () => {
  const result = spawnSync(process.execPath, ["tools/validate-quizzes.mjs"], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(WARNING_HEADER));
  assert.match(result.stdout, /assets\/data\/bdt2_quiz9_masterpool\.json \(id: basis2-quiz9\)/);
  assert.match(result.stdout, /✅ chapter1-review\.json/);
});

test("core loader returns the real external source, normalized and outside quizzes/", () => {
  const sources = loadCatalogExternalQuizSources();
  const target = sources.find((s) => s.id === "basis2-quiz9");
  assert.ok(target, "basis2-quiz9 must be present");
  assert.equal(target.sourcePath, "assets/data/bdt2_quiz9_masterpool.json");
  assert.ok(path.isAbsolute(target.resolvedPath));
  assert.ok(sources.every((s) => !s.sourcePath.startsWith("..") && !path.isAbsolute(s.sourcePath)));
});

// --- Durable byte-identical proof (requirement 3) ----------------------------

test("static quizzes/ output is byte-identical to catalog-inert (parent) behavior", () => {
  // Feature-on: real repo run (catalog present → warnings appended).
  const real = spawnSync(process.execPath, ["tools/validate-quizzes.mjs"], { cwd: repoRoot, encoding: "utf8" });
  // Feature-inert: same quizzes/, no quiz-catalog.js → loader returns [], so the
  // CLI executes exactly the pre-feature (parent) code path with no warnings block.
  const parent = runValidatorInFixture({
    prepare: (fixtureRoot) => cpSync(quizzesDir, path.join(fixtureRoot, "quizzes"), { recursive: true })
  });

  const staticPrefix = real.stdout.split(WARNING_SPLIT)[0];
  assert.equal(staticPrefix, parent.stdout, "quizzes/ stdout prefix must be byte-identical");
  assert.equal(real.stderr, parent.stderr, "quizzes/ stderr must be byte-identical");
  assert.equal(real.status, parent.status, "exit code must be unchanged");
});

// --- Path containment (requirement 1) ----------------------------------------

test("path traversal (../outside.json) is rejected, no external section, exit 0", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-valid.json": validQuiz },
    files: { "assets/js/quiz-catalog.js": catalogSource([{ id: "escape", sourceType: "quiz-json", sourcePath: "../outside.json" }]) }
  });

  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.stdout, new RegExp(WARNING_HEADER));
  assert.doesNotMatch(result.output, /outside\.json/);
});

test("in-repository symlink whose target escapes repoRoot is rejected", () => {
  const outsideDir = mkdtempSync(path.join(os.tmpdir(), "pharmlet-escape-target-"));
  const outsideTarget = path.join(outsideDir, "escape-target.json");
  writeFileSync(outsideTarget, JSON.stringify(validQuiz));
  try {
    const result = runValidatorInFixture({
      quizzes: { "fixture-valid.json": validQuiz },
      files: { "assets/js/quiz-catalog.js": catalogSource([{ id: "linked", sourceType: "quiz-json", sourcePath: "assets/data/escape.json" }]) },
      prepare: (fixtureRoot) => {
        mkdirSync(path.join(fixtureRoot, "assets/data"), { recursive: true });
        symlinkSync(outsideTarget, path.join(fixtureRoot, "assets/data/escape.json"));
      }
    });

    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.stdout, new RegExp(WARNING_HEADER));
    assert.doesNotMatch(result.output, /escape\.json/);
  } finally {
    rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("./quizzes/example.json is treated as a static quiz, not an external source", () => {
  const result = runValidatorInFixture({
    quizzes: { "example.json": { ...validQuiz, id: "example" } },
    files: { "assets/js/quiz-catalog.js": catalogSource([{ id: "example", sourceType: "quiz-json", sourcePath: "./quizzes/example.json" }]) }
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /✅ example\.json/);            // validated as a normal static quiz
  assert.doesNotMatch(result.stdout, new RegExp(WARNING_HEADER)); // no external sources remain
});

// --- Warning content, advisory & non-failing (requirement 1 & 2) -------------

test("fixture without quiz-catalog.js: behavior unchanged, no warnings section, exit 0", () => {
  const result = runValidatorInFixture({ quizzes: { "fixture-valid.json": validQuiz } });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /✅ fixture-valid\.json/);
  assert.doesNotMatch(result.stdout, new RegExp(WARNING_HEADER));
});

test("missing external file warns with exit 0", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-valid.json": validQuiz },
    files: { "assets/js/quiz-catalog.js": catalogSource([{ id: "gone", sourceType: "quiz-json", sourcePath: "assets/data/missing.json" }]) }
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /assets\/data\/missing\.json \(id: gone\)/);
  assert.match(result.stdout, /file not found/);
});

test("malformed external JSON warns with exit 0", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-valid.json": validQuiz },
    files: {
      "assets/js/quiz-catalog.js": catalogSource([{ id: "broken-ext", sourceType: "quiz-json", sourcePath: "assets/data/broken.json" }]),
      "assets/data/broken.json": "{ not valid json"
    }
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /assets\/data\/broken\.json \(id: broken-ext\)/);
  assert.match(result.stdout, /invalid JSON/);
});

test("schema-invalid external data warns with exit 0", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-valid.json": validQuiz },
    files: {
      "assets/js/quiz-catalog.js": catalogSource([{ id: "bad-schema", sourceType: "quiz-json", sourcePath: "assets/data/bad-schema.json" }]),
      // missing required `title` and unknown top-level property
      "assets/data/bad-schema.json": { id: "bad-schema", notAField: true, pools: { easy: [] } }
    }
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /assets\/data\/bad-schema\.json \(id: bad-schema\)/);
  assert.match(result.stdout, /schema:/);
});

test("semantic-invalid external data warns with exit 0", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-valid.json": validQuiz },
    files: {
      "assets/js/quiz-catalog.js": catalogSource([{ id: "bad-semantic", sourceType: "quiz-json", sourcePath: "assets/data/bad-semantic.json" }]),
      // schema-valid shape, but mcq answer is not among the choices
      "assets/data/bad-semantic.json": {
        id: "bad-semantic",
        title: "Bad Semantic",
        pools: { easy: [{ type: "mcq", prompt: "?", choices: ["A", "B"], answer: "C" }] }
      }
    }
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /assets\/data\/bad-semantic\.json \(id: bad-semantic\)/);
  assert.match(result.stdout, /semantic: .*mcq answer must exactly match one listed choice/);
});

// --- Interaction with real validation failures (requirement 2) ---------------

test("invalid quizzes/ file plus external warning still exits 1, with correct stream placement", () => {
  const result = runValidatorInFixture({
    quizzes: { "fixture-broken.json": brokenQuiz, "fixture-valid.json": validQuiz },
    files: {
      "assets/js/quiz-catalog.js": catalogSource([{ id: "gone", sourceType: "quiz-json", sourcePath: "assets/data/missing.json" }])
    }
  });

  assert.equal(result.status, 1, result.output);                         // static failure still fails the run
  assert.match(result.stderr, /❌ fixture-broken\.json/);                // failures go to stderr
  assert.match(result.stderr, /mcq answer must exactly match one listed choice/);
  assert.match(result.stdout, new RegExp(WARNING_HEADER));               // advisory warnings still print (stdout)
  assert.match(result.stdout, /assets\/data\/missing\.json \(id: gone\)/);
  assert.doesNotMatch(result.stdout, /❌/);                              // no failure text leaked onto stdout
});
