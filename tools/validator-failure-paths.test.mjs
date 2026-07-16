import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Runs the real, unmodified validator against a throwaway fixture repo:
// tmp/{tools/validate-quizzes.mjs, schema.json, node_modules -> repo, quizzes/*}.
// The script resolves its repo root from its own location, so a copied tree
// is the only way to feed it fixtures without touching tools/ behavior.
function runValidatorAgainst(fixtureQuizzes) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "pharmlet-validator-"));
  mkdirSync(path.join(fixtureRoot, "tools"));
  mkdirSync(path.join(fixtureRoot, "quizzes"));
  cpSync(path.join(repoRoot, "tools/validate-quizzes.mjs"), path.join(fixtureRoot, "tools/validate-quizzes.mjs"));
  cpSync(path.join(repoRoot, "schema.json"), path.join(fixtureRoot, "schema.json"));
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(fixtureRoot, "node_modules"), "dir");

  for (const [fileName, content] of Object.entries(fixtureQuizzes)) {
    writeFileSync(
      path.join(fixtureRoot, "quizzes", fileName),
      typeof content === "string" ? content : JSON.stringify(content, null, 2)
    );
  }

  const result = spawnSync(process.execPath, [path.join(fixtureRoot, "tools/validate-quizzes.mjs")], { encoding: "utf8" });
  rmSync(fixtureRoot, { recursive: true, force: true });
  return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

function validQuiz(overrides = {}) {
  return {
    id: "fixture-valid",
    title: "Fixture Quiz",
    pools: {
      easy: [
        { type: "mcq", prompt: "2 + 2?", choices: ["3", "4", "5"], answer: "4" }
      ]
    },
    ...overrides
  };
}

test("fixture harness baseline: a valid quiz passes", () => {
  const result = runValidatorAgainst({ "fixture-valid.json": validQuiz() });
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /✅ fixture-valid\.json/);
});

test("mcq semantic rules reject answer mismatches and bad indexes", () => {
  const result = runValidatorAgainst({
    "bad-mcq.json": {
      id: "bad-mcq",
      title: "Bad MCQ",
      pools: {
        easy: [
          { type: "mcq", prompt: "Mismatch?", choices: ["A", "B"], answer: "C" },
          { type: "mcq", prompt: "Bad index?", choices: ["A", "B"], answer: "A", answerIndex: 5 }
        ]
      }
    }
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /mcq answer must exactly match one listed choice/);
  assert.match(result.output, /mcq answerIndex is out of bounds/);
});

test("duplicate question ids are rejected", () => {
  const result = runValidatorAgainst({
    "dup-ids.json": {
      id: "dup-ids",
      title: "Duplicate IDs",
      pools: {
        easy: [
          { id: "q1", type: "mcq", prompt: "First?", choices: ["A", "B"], answer: "A" },
          { id: "q1", type: "mcq", prompt: "Second?", choices: ["A", "B"], answer: "B" }
        ]
      }
    }
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /duplicate question id "q1"/);
});

test("malformed JSON fails loudly instead of being skipped", () => {
  const result = runValidatorAgainst({ "broken.json": "{ not json" });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /💥 broken\.json/);
});

test("ceutics2-final requires mode configs and enforces per-question rules", () => {
  const result = runValidatorAgainst({
    "ceutics-broken.json": {
      id: "ceutics2-final",
      title: "Ceutics Final (broken fixture)",
      questions: [
        { id: "c1", type: "short", questionKind: "fitb", prompt: "Missing arrays?" },
        {
          id: "c2",
          type: "short",
          questionKind: "calculation",
          sourceSection: "exam1Review",
          prompt: "Calculation missing everything?",
          answer: ["1"],
          acceptableAnswers: ["1"]
        }
      ]
    }
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /settings\.modeConfigs is required/);
  assert.match(result.output, /fitb questions must provide a non-empty answer array/);
  assert.match(result.output, /fitb questions must provide a non-empty acceptableAnswers array/);
  assert.match(result.output, /calculation questions must include units/);
  assert.match(result.output, /calculation questions must include a formula/);
  assert.match(result.output, /calculation questions must include a numeric tolerance/);
  assert.match(result.output, /non-PK calculation questions are not allowed in ceutics2-final/);
});

test("ceutics2-final blueprint totals are enforced against the real exam file", () => {
  const real = JSON.parse(readFileSync(path.join(repoRoot, "quizzes/ceutics2_final_master_pool_v2.json"), "utf8"));
  const mutated = structuredClone(real);
  const rules = mutated.settings.modeConfigs.trueExam.selection.rules;
  const choiceRule = rules.find((rule) => String(rule.questionKind).toLowerCase() === "choice");
  assert.ok(choiceRule, "expected the real trueExam config to contain a choice rule");
  choiceRule.count += 1;

  const result = runValidatorAgainst({ "ceutics-mutated.json": mutated });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /exam mode must target 39 choice questions/);
  assert.match(result.output, /exam mode weighted total must equal 150 points/);
});
