import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  Fall2026GeneratorError,
  buildQuestionCandidates,
  createSeededRng,
  generateFall2026Quiz,
  getAccumulatedReviewDrugCohort,
  getCurrentWeekDrugCohort,
  materializeQuestionCandidate,
  selectQuestionCandidates,
  validateGeneratorInputs
} from "../assets/js/fall-2026-quiz-generator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drugData = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-p2-top-drugs.json"), "utf8")
);
const policy = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-lab3-quiz-policy.json"), "utf8")
);

const MCQ_DOMAIN_FIELDS = Object.freeze({
  drugClass: "drugClass",
  fdaIndication: "fdaIndications",
  mechanismOfAction: "mechanismOfAction",
  topAdverseReactions: "adverseReactions",
  boxWarning: "boxWarning"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeChoice(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;]+$/g, "")
    .toLocaleLowerCase("en-US");
}

function sourceValue(drug, domainId) {
  const value = drug[MCQ_DOMAIN_FIELDS[domainId]];
  return Array.isArray(value) ? value.join("; ") : value;
}

function generate(quizWeek, seed = `test-week-${quizWeek}`) {
  return generateFall2026Quiz({ drugData, policy, quizWeek, seed });
}

function assertGeneratedComposition(result, quizWeek) {
  assert.equal(result.status, "generated");
  assert.equal(result.quizWeek, quizWeek);
  assert.equal(result.questions.length, 10);
  assert.equal(result.questions.filter((question) => question.metadata.sourceMaterial === "new").length, 6);
  assert.equal(result.questions.filter((question) => question.metadata.sourceMaterial === "review").length, 4);
}

function findFilesRecursively(directory, predicate, skippedNames = new Set()) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || skippedNames.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFilesRecursively(fullPath, predicate, skippedNames));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function materialize(candidate, seed = candidate.id) {
  return materializeQuestionCandidate({
    candidate,
    drugData,
    policy,
    rng: createSeededRng(seed)
  });
}

test("foundation inputs validate and expose the official weekly cohorts", () => {
  assert.deepEqual(validateGeneratorInputs({ drugData, policy }), {
    semester: "P2 Fall",
    drugCount: 100,
    supportedQuizWeekRange: [1, 10],
    knowledgeDomainIds: [
      "brandGeneric",
      "drugClass",
      "fdaIndication",
      "mechanismOfAction",
      "topAdverseReactions",
      "boxWarning"
    ]
  });
  assert.equal(getCurrentWeekDrugCohort({ drugData, policy, quizWeek: 2 }).length, 10);
  assert.equal(getAccumulatedReviewDrugCohort({ drugData, policy, quizWeek: 1 }).length, 0);
  assert.equal(getAccumulatedReviewDrugCohort({ drugData, policy, quizWeek: 10 }).length, 90);
});

test("the same seed produces byte- and deep-identical output", () => {
  const first = generate(7, "section-a");
  const second = generate(7, "section-a");
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("different seeds can produce different valid quizzes", () => {
  const first = generate(10, "section-a");
  const second = generate(10, "section-b");
  assert.notDeepEqual(first.questions, second.questions);
  assertGeneratedComposition(first, 10);
  assertGeneratedComposition(second, 10);
});

test("Week 2 produces exactly six new and four accumulated-review questions", () => {
  assertGeneratedComposition(generate(2), 2);
});

test("Week 10 produces exactly six new and four accumulated-review questions", () => {
  assertGeneratedComposition(generate(10), 10);
});

test("new questions use only drugs assigned to the requested week", () => {
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    for (const question of generate(quizWeek).questions.filter((item) => item.metadata.sourceMaterial === "new")) {
      assert.equal(question.metadata.sourceDrugQuizWeek, quizWeek);
    }
  }
});

test("review questions use only same-semester drugs from earlier weeks", () => {
  const drugsById = new Map(drugData.drugs.map((drug) => [drug.id, drug]));
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    for (const question of generate(quizWeek).questions.filter((item) => item.metadata.sourceMaterial === "review")) {
      const sourceDrug = drugsById.get(question.metadata.sourceDrugId);
      assert.equal(sourceDrug.semester, "P2 Fall");
      assert.ok(sourceDrug.quizWeek < quizWeek);
    }
  }
});

test("no future-week drug can appear as a question source", () => {
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    for (const question of generate(quizWeek).questions) {
      assert.ok(question.metadata.sourceDrugQuizWeek <= quizWeek);
    }
  }
});

test("the public materializer rejects a caller-supplied future-week candidate", () => {
  const futureDrug = drugData.drugs.find((drug) => drug.quizWeek === 3);
  assert.throws(
    () => materializeQuestionCandidate({
      candidate: {
        id: "forged-future-candidate",
        sourceDrugId: futureDrug.id,
        sourceDrugQuizWeek: futureDrug.quizWeek,
        requestedQuizWeek: 2,
        materialType: "review",
        domainId: "brandGeneric",
        questionType: "short"
      },
      drugData,
      policy,
      rng: createSeededRng("future")
    }),
    (error) => error instanceof Fall2026GeneratorError && error.code === "INELIGIBLE_CANDIDATE_SOURCE"
  );
});

test("no future-week source can supply an MCQ distractor", () => {
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    for (const question of generate(quizWeek).questions.filter((item) => item.type === "mcq")) {
      for (const source of question.metadata.choiceSources) {
        assert.ok(source.sourceDrugQuizWeek <= quizWeek);
      }
    }
  }
});

test("Brand / Generic candidates produce FITB and every remaining domain produces MCQ", () => {
  const candidates = [
    ...buildQuestionCandidates({ drugData, policy, quizWeek: 10, materialType: "new" }),
    ...buildQuestionCandidates({ drugData, policy, quizWeek: 10, materialType: "review" })
  ];
  const domainsSeen = new Set();
  for (const domainId of ["brandGeneric", ...Object.keys(MCQ_DOMAIN_FIELDS)]) {
    const candidate = candidates.find((item) => item.domainId === domainId);
    assert.ok(candidate, `expected a candidate for ${domainId}`);
    const result = materialize(candidate);
    assert.equal(result.status, "materialized");
    assert.equal(result.question.type, domainId === "brandGeneric" ? "short" : "mcq");
    domainsSeen.add(result.question.metadata.knowledgeDomain);
  }
  assert.deepEqual(domainsSeen, new Set(["brandGeneric", ...Object.keys(MCQ_DOMAIN_FIELDS)]));
});

test("multiple-brand generic-to-brand FITB preserves every official listed brand", () => {
  const semaglutide = drugData.drugs.find((drug) => drug.genericName === "Semaglutide");
  const candidate = buildQuestionCandidates({
    drugData,
    policy,
    quizWeek: semaglutide.quizWeek,
    materialType: "new"
  }).find((item) => item.sourceDrugId === semaglutide.id && item.domainId === "brandGeneric");
  const result = materializeQuestionCandidate({
    candidate,
    drugData,
    policy,
    rng: () => 0.75
  });

  assert.equal(result.status, "materialized");
  assert.equal(result.question.type, "short");
  assert.equal(result.question.metadata.brandGenericDirection, "genericToBrand");
  assert.equal(result.question.answer, "Ozempic");
  assert.deepEqual(result.question._acceptedAnswers, ["Rybelsus", "Wegovy"]);
  assert.deepEqual(result.question.metadata.answerMatching, {
    spellingSensitive: true,
    capitalizationSensitive: false
  });
});

test("generated questions use the smallest existing-engine-compatible shapes", () => {
  const corpus = Array.from({ length: 9 }, (_, index) => generate(index + 2, `shape-${index}`))
    .flatMap((result) => result.questions);
  assert.ok(corpus.some((question) => question.type === "short"));
  assert.ok(corpus.some((question) => question.type === "mcq"));

  for (const question of corpus) {
    assert.match(question.id, /\S/);
    assert.match(question.prompt, /\S/);
    assert.match(question.answer, /\S/);
    assert.ok(question.metadata && typeof question.metadata === "object");
    if (question.type === "short") {
      assert.equal(question.choices, undefined);
    } else {
      assert.equal(question.type, "mcq");
      assert.equal(question.choices.length, 4);
    }
  }
});

test("MCQ options are unique after normalization", () => {
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    for (const question of generate(quizWeek, `unique-${quizWeek}`).questions.filter((item) => item.type === "mcq")) {
      const normalized = question.choices.map(normalizeChoice);
      assert.equal(new Set(normalized).size, normalized.length, question.id);
    }
  }
});

test("every MCQ contains its correct answer exactly once", () => {
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    for (const question of generate(quizWeek, `answer-${quizWeek}`).questions.filter((item) => item.type === "mcq")) {
      const answerKey = normalizeChoice(question.answer);
      assert.equal(question.choices.filter((choice) => normalizeChoice(choice) === answerKey).length, 1, question.id);
    }
  }
});

test("every MCQ distractor traces to the matching official source field through that week", () => {
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    const eligibleDrugs = drugData.drugs.filter((drug) => drug.quizWeek <= quizWeek && drug.semester === "P2 Fall");
    for (const question of generate(quizWeek, `trace-${quizWeek}`).questions.filter((item) => item.type === "mcq")) {
      const officialValues = new Set(
        eligibleDrugs.map((drug) => normalizeChoice(sourceValue(drug, question.metadata.knowledgeDomain)))
      );
      for (const choice of question.choices) {
        assert.ok(officialValues.has(normalizeChoice(choice)), `${question.id} has an untraceable choice`);
      }
      for (const source of question.metadata.choiceSources.filter((entry) => entry.role === "distractor")) {
        const sourceDrug = eligibleDrugs.find((drug) => drug.id === source.sourceDrugId);
        assert.ok(sourceDrug, `${question.id} has an ineligible distractor source`);
        assert.equal(normalizeChoice(source.value), normalizeChoice(sourceValue(sourceDrug, question.metadata.knowledgeDomain)));
      }
    }
  }
});

test("Access Pharmacy sorting-category fields are rejected and never generated", () => {
  const withForbiddenCategory = clone(drugData);
  withForbiddenCategory.drugs[0].category = "Cardiovascular Agent";
  assert.throws(
    () => validateGeneratorInputs({ drugData: withForbiddenCategory, policy }),
    (error) => error instanceof Fall2026GeneratorError && error.code === "FORBIDDEN_SOURCE_FIELD"
  );

  const serialized = JSON.stringify(generate(6, "no-category"));
  assert.ok(!serialized.includes("accessPharmacySortingCategory"));
  assert.ok(!serialized.includes("Cardiovascular Agent"));
});

test("complete Week 1 generation returns the explicit unresolved-policy result", () => {
  const result = generate(1, "ignored-week-one-seed");
  assert.deepEqual(result, {
    status: "unresolved-policy",
    code: "WEEK_1_COMPOSITION_UNRESOLVED",
    quizWeek: 1,
    canGenerateCompleteQuiz: false,
    composition: {
      newMaterialItemTarget: 6,
      reviewMaterialEligible: false,
      reviewMaterialItemTarget: 0,
      totalItemTarget: null
    },
    message: policy.composition.week1.unresolvedDecision
  });
  assert.ok(!Object.hasOwn(result, "questions"));
});

test("invalid quiz weeks fail cleanly", () => {
  for (const quizWeek of [0, 11, 2.5, "2", null]) {
    assert.throws(
      () => generateFall2026Quiz({ drugData, policy, quizWeek, seed: "invalid" }),
      (error) => error instanceof Fall2026GeneratorError && error.code === "INVALID_QUIZ_WEEK"
    );
  }
});

test("generation does not mutate the official drug data", () => {
  const input = clone(drugData);
  const before = JSON.stringify(input);
  generateFall2026Quiz({ drugData: input, policy, quizWeek: 8, seed: "immutable-drugs" });
  assert.equal(JSON.stringify(input), before);
});

test("generation does not mutate the Lab III policy", () => {
  const input = clone(policy);
  const before = JSON.stringify(input);
  generateFall2026Quiz({ drugData, policy: input, quizWeek: 8, seed: "immutable-policy" });
  assert.equal(JSON.stringify(input), before);
});

test("repeated class, MOA, and BBW values cannot create duplicate-choice ambiguity", () => {
  const enalapril = drugData.drugs.find((drug) => drug.genericName === "Enalapril");
  const candidates = buildQuestionCandidates({ drugData, policy, quizWeek: 10, materialType: "review" });
  for (const domainId of ["drugClass", "mechanismOfAction", "boxWarning"]) {
    const candidate = candidates.find((item) => item.sourceDrugId === enalapril.id && item.domainId === domainId);
    assert.ok(candidate, `expected repeated-value candidate for ${domainId}`);
    const result = materialize(candidate, `repeated-${domainId}`);
    assert.equal(result.status, "materialized");
    const keys = result.question.choices.map(normalizeChoice);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(keys.filter((key) => key === normalizeChoice(result.question.answer)).length, 1);
  }
});

test("constrained source data refuses unsafe MCQs instead of fabricating distractors", () => {
  const constrainedData = {
    ...drugData,
    drugs: drugData.drugs.slice(0, 4).map((drug, index) => ({
      ...drug,
      id: `constrained-${index + 1}`,
      quizWeek: index < 2 ? 1 : 2,
      drugClass: "Shared official class"
    }))
  };
  const classCandidates = buildQuestionCandidates({
    drugData: constrainedData,
    policy,
    quizWeek: 2,
    materialType: "new"
  }).filter((candidate) => candidate.domainId === "drugClass");
  assert.deepEqual(classCandidates, []);

  const unavailable = materializeQuestionCandidate({
    candidate: {
      id: "constrained-class-candidate",
      sourceDrugId: "constrained-3",
      sourceDrugQuizWeek: 2,
      requestedQuizWeek: 2,
      materialType: "new",
      domainId: "drugClass",
      questionType: "mcq"
    },
    drugData: constrainedData,
    policy,
    rng: createSeededRng("constrained")
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.code, "INSUFFICIENT_DISTRACTORS");
  assert.equal(unavailable.availableDistractors, 0);

  assert.throws(
    () => selectQuestionCandidates({ candidates: classCandidates, count: 1, rng: createSeededRng("none") }),
    (error) => error instanceof Fall2026GeneratorError && error.code === "INSUFFICIENT_CANDIDATES"
  );
});

test("injected RNG is honored and invalid RNG output is rejected", () => {
  const candidates = buildQuestionCandidates({ drugData, policy, quizWeek: 2, materialType: "new" });
  const selected = selectQuestionCandidates({ candidates, count: 2, rng: () => 0 });
  assert.equal(selected.length, 2);
  assert.throws(
    () => selectQuestionCandidates({ candidates, count: 2, rng: () => 1 }),
    (error) => error instanceof Fall2026GeneratorError && error.code === "INVALID_RNG"
  );
});

test("no existing application page references or loads the generator module", () => {
  const htmlFiles = findFilesRecursively(
    repoRoot,
    (file) => file.endsWith(".html"),
    new Set(["node_modules", "tmp"])
  );
  for (const file of htmlFiles) {
    const source = readFileSync(file, "utf8");
    assert.ok(
      !source.includes("fall-2026-quiz-generator.js"),
      `${path.relative(repoRoot, file)} must not activate the Fall 2026 generator`
    );
  }
});
