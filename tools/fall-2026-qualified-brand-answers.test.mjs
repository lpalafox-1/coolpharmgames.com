// F26-26 — a source parenthetical on a brand is not required for a correct brand answer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateFall2026Quiz } from "../assets/js/fall-2026-quiz-generator.js";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));
const METOPROLOL_ID = "p2-fall-quiz-03-drug-03";
const PRE_FIX = Object.freeze({
  id: "fall-2026-p2-lab3-deterministic-generator-week-03-new-p2-fall-quiz-03-drug-03-brandGeneric-generic-to-brand",
  prompt: "What is the brand name for <b>Metoprolol</b>?",
  answer: "Lopressor (tartrate)"
});

function metoprololBrandQuestion(seed) {
  const quiz = generateFall2026Quiz({ drugData, policy, quizWeek: 3, seed });
  return quiz.questions.find((question) => (
    question.metadata?.sourceDrugId === METOPROLOL_ID
    && question.metadata.knowledgeDomain === "brandGeneric"
    && question.metadata.brandGenericDirection === "genericToBrand"
  ));
}

function scoreQuestion(question, value) {
  const engine = loadBrowserGlobal("assets/js/quizEngine.js", {
    document: { addEventListener() {}, createElement() { return { innerHTML: "" }; } },
    location: { search: "?id=custom-quiz", href: "" },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }
  });
  return engine.evaluateAnswerForQuestion(question, value);
}

test("Metoprolol generic-to-brand accepts the source brand with or without its qualifier", () => {
  const question = metoprololBrandQuestion("premise-42");
  assert.ok(question, "Week 3 seed premise-42 still selects the Metoprolol brand question");
  assert.equal(question.id, PRE_FIX.id);
  assert.equal(question.prompt, PRE_FIX.prompt);
  assert.equal(question.answer, PRE_FIX.answer);
  assert.deepEqual(question._acceptedAnswers, [
    "Toprol XL (succinate)",
    "Lopressor",
    "Toprol XL"
  ]);

  for (const value of ["Lopressor (tartrate)", "Toprol XL (succinate)", "Lopressor", "Toprol XL", "lopressor", "toprol xl"]) {
    assert.equal(scoreQuestion(question, value), true, value);
  }
  for (const value of ["Lopresor", "Toprol", "Metoprolol", ""]) {
    assert.equal(scoreQuestion(question, value), false, JSON.stringify(value));
  }
});

test("drugs without a trailing source qualifier do not gain accepted answers", () => {
  let checked = 0;
  for (let week = 1; week <= 10; week += 1) {
    for (let seed = 1; seed <= 20; seed += 1) {
      const options = { drugData, policy, quizWeek: week, seed: `f26-26-plain-${week}-${seed}` };
      if (week === 1) Object.assign(options, { mode: "practice", questionCount: 10 });
      const quiz = generateFall2026Quiz(options);
      for (const question of quiz.questions) {
        if (question.metadata?.knowledgeDomain !== "brandGeneric") continue;
        if (question.metadata.brandGenericDirection !== "genericToBrand") continue;
        // F26-25 group-scoped items (e.g. "Glargine") accept only their own
        // group's brands; tools/fall-2026-insulin-brand-groups.test.mjs covers them.
        if (question.metadata.brandGroupLabel) continue;
        const sourceDrugs = (question.metadata.sourceDrugIds || [question.metadata.sourceDrugId])
          .map((id) => drugData.drugs.find((entry) => entry.id === id));
        const brands = [];
        const seen = new Set();
        for (const sourceDrug of sourceDrugs) {
          for (const brand of sourceDrug?.brandNames || []) {
            const key = brand.toLocaleLowerCase("en-US");
            if (seen.has(key)) continue;
            seen.add(key);
            brands.push(brand);
          }
        }
        if (brands.some((brand) => /\([^()]*\)\s*$/.test(brand))) continue;
        const expected = brands.filter((brand) => brand.toLocaleLowerCase("en-US") !== String(question.answer).toLocaleLowerCase("en-US"));
        assert.deepEqual(question._acceptedAnswers || [], expected, sourceDrugs[0]?.genericName);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 20);
});

test("launcher and adaptive import the same post-F26-25 generator token (bumped again for the pairwise shared-ADR form)", () => {
  const launcher = read("assets/js/fall-2026-lab3-launcher.js");
  const adaptive = read("assets/js/fall-2026-adaptive-practice.js");
  const page = read("lab3-fall-2026.html");
  const generatorToken = /fall-2026-quiz-generator\.js\?v=([0-9a-z]+)/;
  assert.equal(generatorToken.exec(launcher)?.[1], "20261006b");
  assert.equal(generatorToken.exec(adaptive)?.[1], "20261006b");
  assert.equal(launcher.includes("fall-2026-quiz-generator.js?v=20260913a"), false);
  assert.equal(adaptive.includes("fall-2026-quiz-generator.js?v=20260913a"), false);
  assert.match(launcher, /fall-2026-adaptive-practice\.js\?v=20261006b/);
  assert.match(page, /fall-2026-lab3-launcher\.js\?v=20261006b/);
});
