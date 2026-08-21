import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quizzesDir = path.join(repoRoot, "quizzes");

function countQuizQuestions(quiz) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
  const pools = quiz?.pools && typeof quiz.pools === "object"
    ? Object.values(quiz.pools).reduce((sum, pool) => sum + (Array.isArray(pool) ? pool.length : 0), 0)
    : 0;
  return questions + pools;
}

function runRepoHealth(...args) {
  return spawnSync(process.execPath, [path.join(repoRoot, "tools/repo-health.mjs"), ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("repo-health exits successfully with no repository-health errors", () => {
  const result = runRepoHealth();

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Errors: 0/);
  assert.match(result.stdout, /Footer count matches static quiz total \(1723\)/);
  assert.doesNotMatch(result.stdout, /empty quiz/);
  assert.doesNotMatch(result.stdout, /footer count \d+ does not match static quiz total \d+/);
});

test("repo-health --count-only reports counts and exits 0", () => {
  const result = runRepoHealth("--count-only");

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Static quiz questions: 1723/);
  assert.match(result.stdout, /Static quiz files: 34/);
  assert.match(result.stdout, /Top Drugs master pool entries: \d+/);
  assert.match(result.stdout, /Endocrine concept pool entries: \d+/);
});

test("the homepage static question count matches the actual quiz corpus", () => {
  const staticTotal = readdirSync(quizzesDir)
    .filter((file) => file.endsWith(".json"))
    .reduce((sum, file) => {
      const quiz = JSON.parse(readFileSync(path.join(quizzesDir, file), "utf8"));
      return sum + countQuizQuestions(quiz);
    }, 0);
  const homepage = readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const match = homepage.match(/([\d,]+)\s+practice questions/i);

  assert.ok(match, "homepage must state its static practice-question count");
  assert.equal(Number.parseInt(match[1].replace(/,/g, ""), 10), staticTotal);
});

test("both validator CLIs consume the shared validator core", () => {
  const validatorSource = readFileSync(path.join(repoRoot, "tools/validate-quizzes.mjs"), "utf8");
  const repoHealthSource = readFileSync(path.join(repoRoot, "tools/repo-health.mjs"), "utf8");
  const coreSource = readFileSync(path.join(repoRoot, "tools/validator-core.mjs"), "utf8");

  assert.match(validatorSource, /from "\.\/validator-core\.mjs"/, "validate-quizzes must import the shared core");
  assert.match(repoHealthSource, /from "\.\/validator-core\.mjs"/, "repo-health must import the shared core");
  assert.doesNotMatch(validatorSource, /from "ajv"/, "validate-quizzes must not compile its own schema");
  assert.doesNotMatch(repoHealthSource, /from "ajv"/, "repo-health must not compile its own schema");
  assert.match(coreSource, /ajv\.compile\(/, "the core owns the single ajv compile");
});
