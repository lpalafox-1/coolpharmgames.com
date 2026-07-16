import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const quizzesDir = path.join(repoRoot, "quizzes");

test("canonical validator accepts every tracked static quiz", () => {
  const result = spawnSync(process.execPath, ["tools/validate-quizzes.mjs"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const quizCount = readdirSync(quizzesDir).filter((file) => file.endsWith(".json")).length;

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal((result.stdout.match(/✅/g) || []).length, quizCount);
});

test("the E2B placeholder remains schema-valid while its question count is zero", () => {
  const quiz = JSON.parse(readFileSync(path.join(quizzesDir, "practice-e2b-exam2-prep-expanded.json"), "utf8"));
  const questionCount = Object.values(quiz.pools || {})
    .reduce((total, pool) => total + (Array.isArray(pool) ? pool.length : 0), 0);

  assert.equal(questionCount, 0);
  assert.equal(quiz.id, "practice-e2b-exam2-prep-expanded");
});
