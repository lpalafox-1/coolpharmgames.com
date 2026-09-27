// F26-25 — Week 6 insulin subtype Brand/Generic stays inside the Fall source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildQuestionCandidates,
  generateFall2026Quiz
} from "../assets/js/fall-2026-quiz-generator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drugData = JSON.parse(readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-p2-top-drugs.json"), "utf8"));
const policy = JSON.parse(readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-lab3-quiz-policy.json"), "utf8"));
const masterPool = JSON.parse(readFileSync(path.join(repoRoot, "assets", "data", "master_pool.json"), "utf8"));
const INSULIN_ID = "p2-fall-quiz-06-drug-08";
const insulin = drugData.drugs.find((drug) => drug.id === INSULIN_ID);
const SOURCE_GROUPS = Object.freeze({
  Aspart: ["Novolog", "Fiasp", "Merilog"],
  Glargine: ["Lantus", "Basaglar", "Toujeo", "Semglee", "Rezvoglar"],
  Lispro: ["Humalog", "Admelog", "Lyumjev"],
  NPH: ["Humulin N", "Novolin N"],
  Regular: ["Humulin R", "Novolin R"]
});

function acceptedAnswers(question) {
  return [question.answer, ...(question._acceptedAnswers || [])];
}

function sameBrandSet(actual, expected) {
  return actual.map((value) => value.toLocaleLowerCase("en-US")).sort().join("|")
    === expected.map((value) => value.toLocaleLowerCase("en-US")).sort().join("|");
}

function collect(mode) {
  const found = [];
  for (let seed = 1; seed <= 250; seed += 1) {
    const quiz = generateFall2026Quiz({
      drugData,
      policy,
      quizWeek: 6,
      seed: `f26-25-${mode}-${seed}`,
      ...(mode === "week-focus" ? { mode: "week-focus", questionCount: 10 } : {})
    });
    assert.equal(quiz.status, "generated");
    assert.equal(quiz.questions.length, 10);
    if (mode === "week-focus") {
      assert.equal(quiz.composition.newMaterialItemTarget, 10);
      assert.equal(quiz.composition.reviewMaterialItemTarget, 0);
    } else {
      assert.equal(quiz.composition.newMaterialItemTarget, 6);
      assert.equal(quiz.composition.reviewMaterialItemTarget, 4);
    }
    for (const question of quiz.questions) {
      assert.ok(question.metadata.sourceDrugQuizWeek <= 6, question.id);
      assert.ok(String(question.metadata.sourceDrugId).startsWith("p2-fall-"), question.id);
    }
    found.push(...quiz.questions.filter((question) => (
      question.metadata?.sourceDrugId === INSULIN_ID
      && question.metadata.knowledgeDomain === "brandGeneric"
    )).map((question) => ({ question, quiz })));
  }
  return found;
}

test("Week 6 insulin Brand/Generic uses the Fall subtype listing, not P1 records", () => {
  const candidates = buildQuestionCandidates({
    drugData,
    policy,
    quizWeek: 6,
    materialType: "new"
  });
  assert.equal(
    candidates.filter((candidate) => candidate.sourceDrugId === INSULIN_ID && candidate.domainId === "brandGeneric").length,
    1,
    "subtype questions stay one Brand/Generic candidate on the parent record"
  );

  const generatorSource = readFileSync(path.join(repoRoot, "assets", "js", "fall-2026-quiz-generator.js"), "utf8");
  assert.equal(generatorSource.includes("master_pool.json"), false);

  const p1InsulinNames = new Set(
    masterPool
      .filter((drug) => /insulin/i.test(drug.generic || ""))
      .map((drug) => drug.generic)
  );
  assert.ok(p1InsulinNames.has("Insulin Lispro"));
  assert.equal(drugData.drugs.filter((drug) => drug.genericName === "Insulin").length, 1);

  const seen = collect("standard");
  assert.ok(seen.length >= 5, "Week 6 practice produces insulin Brand/Generic questions");
  const counts = Object.fromEntries(Object.keys(SOURCE_GROUPS).map((label) => [label, 0]));

  for (const { question } of seen) {
    const label = question.metadata.brandGroupLabel;
    assert.ok(SOURCE_GROUPS[label], `unexpected insulin group ${label}`);
    counts[label] += 1;
    assert.equal(question.metadata.sourceDrugId, INSULIN_ID);
    const brands = SOURCE_GROUPS[label];
    if (question.type === "short" && question.metadata.brandGenericDirection === "genericToBrand") {
      assert.equal(sameBrandSet(acceptedAnswers(question), brands), true, question.prompt);
      assert.match(question.prompt, new RegExp(`<b>${label}</b>`));
      assert.equal(acceptedAnswers(question).includes("Insulin"), false);
    } else if (question.type === "short") {
      assert.equal(question.answer, label);
      assert.ok(brands.includes(question.metadata.sourceBrandName), question.prompt);
      assert.match(question.prompt, /generic/i);
    } else {
      assert.equal(question.type, "mcq");
      assert.equal(question.answer, label);
      assert.ok(question.choices.includes(label));
      assert.ok(brands.includes(question.metadata.sourceBrandName));
      assert.equal(question.choices.includes("Insulin"), false);
    }
    assert.equal(/Insulin (?:Lispro|Glargine|aspart)/i.test(`${question.prompt} ${question.answer}`), false);
  }

  for (const label of Object.keys(SOURCE_GROUPS)) {
    assert.ok(counts[label] > 0, `${label} is questionable in Week 6 practice`);
  }

  const focus = collect("week-focus");
  assert.ok(focus.some((entry) => entry.question.metadata.brandGroupLabel === "Lispro"));
  assert.ok(focus.length > 0);
});

test("insulin subtype questions do not invent subtype pharmacology", () => {
  const subtypeLabels = new Set(Object.keys(SOURCE_GROUPS));
  const sharedValues = new Set([
    insulin.mechanismOfAction,
    insulin.drugClass,
    insulin.boxWarning,
    insulin.fdaIndications.join("; "),
    insulin.adverseReactions.join("; "),
    ...insulin.fdaIndications,
    ...insulin.adverseReactions,
    "Insulin"
  ]);
  let pharmacologyQuestions = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const quiz = generateFall2026Quiz({ drugData, policy, quizWeek: 6, seed: `f26-25-pharm-${seed}` });
    for (const question of quiz.questions) {
      if (question.metadata?.sourceDrugId !== INSULIN_ID) continue;
      if (question.metadata.knowledgeDomain === "brandGeneric") continue;
      pharmacologyQuestions += 1;
      assert.equal(subtypeLabels.has(question.answer), false, question.prompt);
      assert.equal(/<b>(?:Lispro|Aspart|Glargine|NPH|Regular)<\/b>/.test(question.prompt), false, question.prompt);
      const visible = [question.prompt, question.answer, ...(question.choices || [])].join(" ");
      if (question.metadata.knowledgeDomain === "mechanismOfAction") {
        assert.equal(visible.includes(insulin.mechanismOfAction), true, question.prompt);
      }
      if (question.metadata.knowledgeDomain === "drugClass") {
        assert.equal(visible.includes(insulin.drugClass), true, question.prompt);
      }
      if (question.metadata.knowledgeDomain === "fdaIndication") {
        assert.equal(insulin.fdaIndications.every((indication) => visible.includes(indication)), true, question.prompt);
      }
      if (question.metadata.knowledgeDomain === "topAdverseReactions") {
        assert.equal(insulin.adverseReactions.some((reaction) => visible.includes(reaction)), true, question.prompt);
      }
      if (question.metadata.knowledgeDomain === "boxWarning") {
        assert.equal(visible.includes(insulin.boxWarning), true, question.prompt);
      }
      if (![...sharedValues].some((value) => visible.includes(value))) {
        assert.fail(`insulin pharmacology question is not the shared record: ${question.prompt}`);
      }
    }
  }
  assert.ok(pharmacologyQuestions > 0);
});

test("flat Brand/Generic drugs still accept every listed brand", () => {
  let checked = 0;
  for (let seed = 1; seed <= 40 && checked < 3; seed += 1) {
    const quiz = generateFall2026Quiz({ drugData, policy, quizWeek: 6, seed: `f26-25-flat-${seed}` });
    for (const question of quiz.questions) {
      if (question.metadata?.knowledgeDomain !== "brandGeneric") continue;
      if (question.metadata.brandGenericDirection !== "genericToBrand") continue;
      if (question.metadata.brandGroupLabel) continue;
      const drug = drugData.drugs.find((entry) => entry.id === question.metadata.sourceDrugId);
      if (!drug || drug.brandNames.length < 2) continue;
      assert.equal(sameBrandSet(acceptedAnswers(question), drug.brandNames), true, drug.genericName);
      checked += 1;
    }
  }
  assert.ok(checked >= 1, "a multi-brand non-insulin drug was generated");
});
