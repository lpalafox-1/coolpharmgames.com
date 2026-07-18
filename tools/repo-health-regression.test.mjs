import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runRepoHealth(...args) {
  return spawnSync(process.execPath, [path.join(repoRoot, "tools/repo-health.mjs"), ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("repo-health keeps its exit-1 baseline with the two known deferred findings", () => {
  const result = runRepoHealth();

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Errors: 2/);
  assert.match(result.stdout, /practice-e2b-exam2-prep-expanded\.json: empty quiz/);
  assert.match(result.stdout, /index\.html: footer count \d+ does not match static quiz total \d+/);
});

test("repo-health --count-only reports counts and exits 0", () => {
  const result = runRepoHealth("--count-only");

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Static quiz questions: \d+/);
  assert.match(result.stdout, /Static quiz files: \d+/);
  assert.match(result.stdout, /Top Drugs master pool entries: \d+/);
  assert.match(result.stdout, /Endocrine concept pool entries: \d+/);
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
