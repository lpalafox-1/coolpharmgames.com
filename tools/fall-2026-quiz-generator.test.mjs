import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  Fall2026GeneratorError,
  WEEK_1_PRACTICE_NOTE,
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

function normalizeGenericIdentity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function sourceValue(drug, domainId) {
  const value = drug[MCQ_DOMAIN_FIELDS[domainId]];
  return Array.isArray(value) ? value.join("; ") : value;
}

function sourceValueIdentity(drug, domainId) {
  const value = drug[MCQ_DOMAIN_FIELDS[domainId]];
  if (Array.isArray(value)) {
    return value.map(normalizeChoice).filter(Boolean).sort().join("\0");
  }
  return normalizeChoice(value);
}

function getDuplicateGenericFixture() {
  const rows = drugData.drugs.filter((drug) => drug.genericName === "Fluticasone");
  assert.equal(rows.length, 2, "official fixture must retain both Fluticasone rows");
  return {
    rows,
    genericIdentity: normalizeGenericIdentity(rows[0].genericName),
    candidates: [
      ...buildQuestionCandidates({ drugData, policy, quizWeek: 8, materialType: "new" }),
      ...buildQuestionCandidates({ drugData, policy, quizWeek: 8, materialType: "review" })
    ]
  };
}

function getDiversityConstrainedData() {
  return {
    ...drugData,
    drugs: drugData.drugs.slice(0, 4).map((drug, index) => ({
      ...drug,
      id: `diversity-constrained-${index + 1}`,
      quizWeek: 1,
      genericName: `Fixture Generic ${index + 1}`,
      brandNames: [`Fixture Brand ${index + 1}`],
      fdaIndications: [`Fixture Indication ${index + 1}`],
      drugClass: `Fixture Class ${index + 1}`,
      mechanismOfAction: `Fixture Mechanism ${index + 1}`,
      boxWarning: `Fixture Warning ${index + 1}`,
      adverseReactions: [`Fixture Reaction ${index + 1}`]
    }))
  };
}

function forgedCandidate(drug, domainId) {
  return {
    id: `forged-duplicate-generic-${drug.id}-${domainId}`,
    sourceDrugId: drug.id,
    sourceDrugQuizWeek: drug.quizWeek,
    requestedQuizWeek: 8,
    materialType: "new",
    domainId,
    questionType: domainId === "brandGeneric" ? "short" : "mcq"
  };
}

function generate(quizWeek, seed = `test-week-${quizWeek}`) {
  return generateFall2026Quiz({ drugData, policy, quizWeek, seed });
}

function generatePractice(quizWeek, seed = `practice-week-${quizWeek}`) {
  return generateFall2026Quiz({
    drugData,
    policy,
    quizWeek,
    seed,
    ...(quizWeek === 1 ? { mode: "practice", questionCount: 10 } : {})
  });
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function assertBalancedEligibleDomains(questions, eligibleDomainIds, label) {
  const domainCounts = countBy(questions, (question) => question.metadata.knowledgeDomain);
  const counts = eligibleDomainIds.map((domainId) => domainCounts.get(domainId) || 0);
  assert.equal(
    domainCounts.size,
    Math.min(questions.length, eligibleDomainIds.length),
    `${label} should use as many eligible domains as its size permits`
  );
  assert.ok(
    Math.max(...counts) - Math.min(...counts) <= 1,
    `${label} domain counts should differ by at most one: ${JSON.stringify(Object.fromEntries(domainCounts))}`
  );
}

function assertSourceBackedStemReference(question) {
  if (question.type !== "mcq") return;
  const reference = question.metadata.stemReference;
  const sourceDrug = drugData.drugs.find((drug) => drug.id === question.metadata.sourceDrugId);
  assert.ok(reference, `${question.id} needs stem-reference provenance`);
  assert.equal(reference.genericName, sourceDrug.genericName);

  if (reference.type === "generic") {
    assert.equal(reference.brandName, undefined);
    assert.ok(question.prompt.includes(`<b>${sourceDrug.genericName}</b>`));
    return;
  }

  assert.equal(reference.type, "brand");
  assert.ok(sourceDrug.brandNames.includes(reference.brandName));
  const matchingGenericIdentities = new Set(
    drugData.drugs
      .filter((drug) => drug.quizWeek <= question.metadata.requestedQuizWeek)
      .filter((drug) => drug.brandNames.some((brand) => normalizeChoice(brand) === normalizeChoice(reference.brandName)))
      .map((drug) => normalizeGenericIdentity(drug.genericName))
  );
  assert.equal(matchingGenericIdentities.size, 1, `${reference.brandName} is not safe as a brand-only reference`);
  assert.ok(question.prompt.includes(`<b>${reference.brandName}</b>`));
}

function normalizePreAnswerText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function visibleTextContainsAnswer(visibleText, answer) {
  const normalizedAnswer = normalizePreAnswerText(answer);
  return normalizedAnswer
    ? ` ${visibleText} `.includes(` ${normalizedAnswer} `)
    : false;
}

function assertMcqStemDoesNotPairGenericAndBrand(question, sourceData = drugData) {
  if (question.type !== "mcq") return;
  const sourceDrug = sourceData.drugs.find((drug) => drug.id === question.metadata.sourceDrugId);
  const promptText = normalizePreAnswerText(question.prompt);
  const showsGeneric = visibleTextContainsAnswer(promptText, sourceDrug.genericName);
  const shownBrand = sourceDrug.brandNames.find((brandName) => (
    visibleTextContainsAnswer(promptText, brandName)
  ));

  assert.ok(
    ["generic", "brand"].includes(question.metadata.stemReference.type),
    `${question.id} uses unsupported ${question.metadata.stemReference.type} stem-reference metadata`
  );
  assert.equal(
    showsGeneric && Boolean(shownBrand),
    false,
    `${question.id} exposes both ${sourceDrug.genericName} and ${shownBrand}`
  );
}

function assertNoBrandGenericLeakage(result, sourceData = drugData) {
  const drugsById = new Map(sourceData.drugs.map((drug) => [drug.id, drug]));
  const brandGenericQuestions = result.questions.filter(
    (question) => question.metadata.knowledgeDomain === "brandGeneric"
  );

  for (const protectedQuestion of brandGenericQuestions) {
    const protectedAnswers = [
      protectedQuestion.answer,
      ...(protectedQuestion._acceptedAnswers || [])
    ];
    for (const question of result.questions) {
      if (question.id === protectedQuestion.id) continue;
      const visibleText = normalizePreAnswerText([
        question.prompt,
        ...(Array.isArray(question.choices) ? question.choices : [])
      ].join(" "));
      for (const answer of protectedAnswers) {
        assert.equal(
          visibleTextContainsAnswer(visibleText, answer),
          false,
          `${question.id} reveals ${answer} from ${protectedQuestion.id}`
        );
      }
    }
  }

  result.questions.forEach((question) => assertMcqStemDoesNotPairGenericAndBrand(question, sourceData));
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

test("Weeks 1-3 practice selection prefers distinct drugs within each material bucket", () => {
  for (let quizWeek = 1; quizWeek <= 3; quizWeek += 1) {
    for (let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
      const result = generatePractice(quizWeek, `distinct-${quizWeek}-${seedIndex}`);
      const newQuestions = result.questions.filter(
        (question) => question.metadata.sourceMaterial === "new"
      );
      const reviewQuestions = result.questions.filter(
        (question) => question.metadata.sourceMaterial === "review"
      );

      assert.equal(
        new Set(newQuestions.map((question) => question.metadata.sourceDrugId)).size,
        newQuestions.length,
        `Week ${quizWeek} new material repeated a drug for seed ${seedIndex}`
      );
      assert.equal(
        new Set(reviewQuestions.map((question) => question.metadata.sourceDrugId)).size,
        reviewQuestions.length,
        `Week ${quizWeek} review material repeated a drug for seed ${seedIndex}`
      );
      if (quizWeek === 1) {
        assert.equal(newQuestions.length, 10);
        assert.equal(reviewQuestions.length, 0);
      } else {
        assert.equal(newQuestions.length, 6);
        assert.equal(reviewQuestions.length, 4);
      }
    }
  }
});

test("Weeks 1-3 practice selection balances all safely eligible domains", () => {
  for (let quizWeek = 1; quizWeek <= 3; quizWeek += 1) {
    const materialTypes = quizWeek === 1 ? ["new"] : ["new", "review"];
    for (let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
      const result = generatePractice(quizWeek, `domains-${quizWeek}-${seedIndex}`);
      for (const materialType of materialTypes) {
        const eligibleDomainIds = [...new Set(
          buildQuestionCandidates({ drugData, policy, quizWeek, materialType })
            .map((candidate) => candidate.domainId)
        )];
        const questions = result.questions.filter(
          (question) => question.metadata.sourceMaterial === materialType
        );
        assertBalancedEligibleDomains(
          questions,
          eligibleDomainIds,
          `Week ${quizWeek} ${materialType} seed ${seedIndex}`
        );
      }
    }
  }
});

test("Weeks 1-3 practice generation remains deterministic with diversity enabled", () => {
  for (let quizWeek = 1; quizWeek <= 3; quizWeek += 1) {
    const first = generatePractice(quizWeek, `diversity-deterministic-${quizWeek}`);
    const second = generatePractice(quizWeek, `diversity-deterministic-${quizWeek}`);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  }
});

test("Weeks 1-3 practice sets never expose another Brand / Generic FITB answer", () => {
  const sourceBefore = JSON.stringify(drugData);
  const policyBefore = JSON.stringify(policy);
  const directions = new Set();
  const referenceTypeCounts = new Map();

  for (let quizWeek = 1; quizWeek <= 3; quizWeek += 1) {
    for (let seedIndex = 0; seedIndex < 100; seedIndex += 1) {
      const result = generatePractice(quizWeek, `leakage-audit-${quizWeek}-${seedIndex}`);
      assertNoBrandGenericLeakage(result);
      for (const question of result.questions) {
        if (question.metadata.knowledgeDomain === "brandGeneric") {
          directions.add(question.metadata.brandGenericDirection);
        }
        if (question.type === "mcq") {
          const referenceType = question.metadata.stemReference.type;
          referenceTypeCounts.set(referenceType, (referenceTypeCounts.get(referenceType) || 0) + 1);
        }
      }
    }
  }

  assert.deepEqual(directions, new Set(["genericToBrand", "brandToGeneric"]));
  assert.ok((referenceTypeCounts.get("generic") || 0) > 0, "many-seed audit must exercise generic-only MCQ stems");
  assert.ok((referenceTypeCounts.get("brand") || 0) > 0, "many-seed audit must exercise safe brand-only MCQ stems");
  assert.deepEqual([...referenceTypeCounts.keys()].sort(), ["brand", "generic"]);
  assert.equal(JSON.stringify(drugData), sourceBefore);
  assert.equal(JSON.stringify(policy), policyBefore);
});

test("quiz-level leakage protection handles repeated identities in constrained pools", () => {
  const constrainedData = getDiversityConstrainedData();
  const drugsById = new Map(constrainedData.drugs.map((drug) => [drug.id, drug]));
  const protectedDirections = new Set();
  let repeatedProtectedIdentityCount = 0;

  for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
    const result = generateFall2026Quiz({
      drugData: constrainedData,
      policy,
      quizWeek: 1,
      mode: "practice",
      questionCount: 10,
      seed: `constrained-leakage-${seedIndex}`
    });
    assertNoBrandGenericLeakage(result, constrainedData);

    for (const protectedQuestion of result.questions.filter(
      (question) => question.metadata.knowledgeDomain === "brandGeneric"
    )) {
      const protectedDrug = drugsById.get(protectedQuestion.metadata.sourceDrugId);
      const genericIdentity = normalizeGenericIdentity(protectedDrug.genericName);
      const sameIdentityMcqs = result.questions.filter((question) => {
        if (question.type !== "mcq") return false;
        const sourceDrug = drugsById.get(question.metadata.sourceDrugId);
        return normalizeGenericIdentity(sourceDrug.genericName) === genericIdentity;
      });
      if (!sameIdentityMcqs.length) continue;
      repeatedProtectedIdentityCount += 1;
      protectedDirections.add(protectedQuestion.metadata.brandGenericDirection);
      const expectedReferenceType = protectedQuestion.metadata.brandGenericDirection === "genericToBrand"
        ? "generic"
        : "brand";
      assert.ok(sameIdentityMcqs.every(
        (question) => question.metadata.stemReference.type === expectedReferenceType
      ));
    }
  }

  assert.ok(repeatedProtectedIdentityCount > 0);
  assert.deepEqual(protectedDirections, new Set(["genericToBrand", "brandToGeneric"]));
});

test("practice diversity degrades gracefully when ten distinct drugs are unavailable", () => {
  const constrainedData = getDiversityConstrainedData();
  const result = generateFall2026Quiz({
    drugData: constrainedData,
    policy,
    quizWeek: 1,
    mode: "practice",
    questionCount: 10,
    seed: "constrained-diversity"
  });
  const drugCounts = [...countBy(
    result.questions,
    (question) => question.metadata.sourceDrugId
  ).values()];

  assert.equal(result.questions.length, 10);
  assert.equal(drugCounts.length, 4);
  assert.ok(Math.max(...drugCounts) - Math.min(...drugCounts) <= 1);
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

test("Week 1-3 class MCQs present complete source listings without hardcodes or canonical edits", () => {
  const canonicalDataBefore = JSON.stringify(drugData);
  const productionSource = readFileSync(
    path.join(repoRoot, "assets", "js", "fall-2026-quiz-generator.js"),
    "utf8"
  );
  const legacyEngineSource = readFileSync(
    path.join(repoRoot, "assets", "js", "quizEngine.js"),
    "utf8"
  );
  const promptPrefix = "Which complete drug-class listing is recorded for";

  assert.ok(!productionSource.includes("Benazepril"));
  assert.ok(!legacyEngineSource.includes(promptPrefix));

  const benazepril = drugData.drugs.find((drug) => drug.genericName === "Benazepril");
  assert.ok(benazepril, "official source must retain Benazepril");
  assert.equal(benazepril.drugClass, "ACEI, Antihypertensive");

  let auditedClassQuestionCount = 0;
  for (let quizWeek = 1; quizWeek <= 3; quizWeek += 1) {
    const materialTypes = quizWeek === 1 ? ["new"] : ["new", "review"];
    const eligibleDrugs = drugData.drugs.filter(
      (drug) => drug.semester === policy.semester && drug.quizWeek <= quizWeek
    );
    const eligibleClassValues = new Set(
      eligibleDrugs.map((drug) => normalizeChoice(drug.drugClass))
    );
    const classCandidates = materialTypes.flatMap((materialType) => (
      buildQuestionCandidates({ drugData, policy, quizWeek, materialType })
        .filter((candidate) => candidate.domainId === "drugClass")
    ));

    for (const candidate of classCandidates) {
      const sourceDrug = drugData.drugs.find((drug) => drug.id === candidate.sourceDrugId);
      const result = materialize(candidate, `class-presentation-${candidate.id}`);

      assert.equal(result.status, "materialized");
      assert.ok(result.question.prompt.startsWith(`${promptPrefix} `));
      assertSourceBackedStemReference(result.question);
      assert.equal(result.question.answer, sourceDrug.drugClass);
      assert.equal(
        result.question.metadata.choiceSources.find((entry) => entry.role === "correct")?.value,
        sourceDrug.drugClass
      );
      for (const choice of result.question.choices) {
        assert.ok(
          eligibleClassValues.has(normalizeChoice(choice)),
          `${candidate.id} has a class option that is not source-backed through Week ${quizWeek}`
        );
      }
      auditedClassQuestionCount += 1;
    }
  }

  assert.ok(auditedClassQuestionCount > 0);
  assert.equal(JSON.stringify(drugData), canonicalDataBefore);
});

test("Week 1-3 MCQ stems vary across generic-only and official brand-only references", () => {
  const referenceTypeCounts = new Map();
  let strictFitbCount = 0;

  for (let quizWeek = 1; quizWeek <= 3; quizWeek += 1) {
    for (let seedIndex = 0; seedIndex < 16; seedIndex += 1) {
      const result = generatePractice(quizWeek, `stem-variety-${quizWeek}-${seedIndex}`);
      for (const question of result.questions) {
        if (question.type === "mcq") {
          assertSourceBackedStemReference(question);
          const referenceType = question.metadata.stemReference.type;
          referenceTypeCounts.set(referenceType, (referenceTypeCounts.get(referenceType) || 0) + 1);
        } else {
          assert.equal(question.metadata.knowledgeDomain, "brandGeneric");
          assert.deepEqual(question.metadata.answerMatching, {
            spellingSensitive: true,
            capitalizationSensitive: false
          });
          assert.equal(question.metadata.stemReference, undefined);
          strictFitbCount += 1;
        }
      }
    }
  }

  assert.ok((referenceTypeCounts.get("generic") || 0) > 0);
  assert.ok((referenceTypeCounts.get("brand") || 0) > 0);
  assert.deepEqual([...referenceTypeCounts.keys()].sort(), ["brand", "generic"]);
  assert.ok(strictFitbCount > 0);
});

test("multiple-brand drugs use only their official brands in seeded MCQ references", () => {
  const semaglutide = drugData.drugs.find((drug) => drug.genericName === "Semaglutide");
  assert.ok(semaglutide.brandNames.length > 1);
  const candidate = buildQuestionCandidates({
    drugData,
    policy,
    quizWeek: semaglutide.quizWeek,
    materialType: "new"
  }).find((item) => item.sourceDrugId === semaglutide.id && item.domainId === "drugClass");
  const observedBrands = new Set();

  for (let seedIndex = 0; seedIndex < 48; seedIndex += 1) {
    const result = materialize(candidate, `multiple-brand-stem-${seedIndex}`);
    assert.equal(result.status, "materialized");
    assertSourceBackedStemReference(result.question);
    const brandName = result.question.metadata.stemReference.brandName;
    if (brandName) observedBrands.add(brandName);
  }

  assert.ok(observedBrands.size > 1, "seeded MCQ references should exercise multiple official brands");
  for (const brandName of observedBrands) {
    assert.ok(semaglutide.brandNames.includes(brandName));
  }
});

test("an ambiguous official brand is never used as a brand-only MCQ reference", () => {
  const ambiguousBrandData = clone(drugData);
  const sourceDrug = ambiguousBrandData.drugs.find((drug) => drug.genericName === "Benazepril");
  const otherDrug = ambiguousBrandData.drugs.find((drug) => drug.genericName === "Amlodipine");
  otherDrug.brandNames = [...otherDrug.brandNames, sourceDrug.brandNames[0]];
  const candidate = buildQuestionCandidates({
    drugData: ambiguousBrandData,
    policy,
    quizWeek: 1,
    materialType: "new"
  }).find((item) => item.sourceDrugId === sourceDrug.id && item.domainId === "drugClass");
  const result = materializeQuestionCandidate({
    candidate,
    drugData: ambiguousBrandData,
    policy,
    rng: () => 0.5
  });

  assert.equal(result.status, "materialized");
  assert.deepEqual(result.question.metadata.stemReference, {
    type: "generic",
    genericName: sourceDrug.genericName
  });
  assert.ok(result.question.prompt.includes(`<b>${sourceDrug.genericName}</b>`));
  assert.ok(!result.question.prompt.includes(sourceDrug.brandNames[0]));
});

test("production MCQ stem references have no combined Generic (Brand) form", () => {
  const productionSource = readFileSync(
    path.join(repoRoot, "assets", "js", "fall-2026-quiz-generator.js"),
    "utf8"
  );
  assert.ok(!productionSource.includes("genericBrand"));
  for (const exampleSpecificValue of ["Amlodipine", "Lisinopril", "Norvasc", "Zestril"]) {
    assert.ok(!productionSource.includes(exampleSpecificValue));
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

test("explicit Week 1 practice mode generates ten Week 1-only questions without changing policy", () => {
  const policyBefore = JSON.stringify(policy);
  const result = generateFall2026Quiz({
    drugData,
    policy,
    quizWeek: 1,
    mode: "practice",
    questionCount: 10,
    seed: "week-one-student-practice"
  });

  assert.equal(result.status, "generated");
  assert.equal(result.id, "fall-2026-p2-lab3-week-01-practice");
  assert.equal(result.title, "Lab III Fall 2026 - Week 1 Practice");
  assert.equal(result.mode, "practice");
  assert.equal(result.practiceConfiguration, true);
  assert.equal(result.practiceNote, WEEK_1_PRACTICE_NOTE);
  assert.deepEqual(result.composition, {
    newMaterialItemTarget: 10,
    reviewMaterialItemTarget: 0,
    totalItemTarget: 10
  });
  assert.equal(result.questions.length, 10);
  assert.equal(JSON.stringify(policy), policyBefore);

  for (const question of result.questions) {
    assert.equal(question.metadata.sourceMaterial, "new");
    assert.equal(question.metadata.sourceDrugQuizWeek, 1);
    assert.equal(question.metadata.requestedQuizWeek, 1);
    assert.ok(question.metadata.knowledgeDomain in {
      brandGeneric: true,
      drugClass: true,
      fdaIndication: true,
      mechanismOfAction: true,
      topAdverseReactions: true,
      boxWarning: true
    });
    if (question.metadata.knowledgeDomain === "brandGeneric") {
      assert.deepEqual(question.metadata.answerMatching, {
        spellingSensitive: true,
        capitalizationSensitive: false
      });
    }
  }

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("accessPharmacySortingCategory"));
  assert.ok(!serialized.includes('"sourceMaterial":"review"'));
});

test("Week 1 practice override must be explicit and exactly match the authorized configuration", () => {
  for (const options of [
    { quizWeek: 1, mode: "practice" },
    { quizWeek: 1, mode: "practice", questionCount: 6 },
    { quizWeek: 1, questionCount: 10 },
    { quizWeek: 2, mode: "practice", questionCount: 10 }
  ]) {
    assert.throws(
      () => generateFall2026Quiz({ drugData, policy, seed: "invalid-practice", ...options }),
      (error) => error instanceof Fall2026GeneratorError
        && ["INVALID_WEEK_1_PRACTICE_CONFIGURATION", "INVALID_PRACTICE_OVERRIDE"].includes(error.code)
    );
  }
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

test("the two official Fluticasone rows cannot produce an ambiguous indication MCQ", () => {
  const fixture = getDuplicateGenericFixture();
  assert.equal(
    fixture.candidates.filter(
      (candidate) => candidate.sourceGenericIdentity === fixture.genericIdentity
        && candidate.domainId === "fdaIndication"
    ).length,
    0
  );
});

test("the two official Fluticasone rows cannot produce an ambiguous MOA MCQ", () => {
  const fixture = getDuplicateGenericFixture();
  assert.equal(
    fixture.candidates.filter(
      (candidate) => candidate.sourceGenericIdentity === fixture.genericIdentity
        && candidate.domainId === "mechanismOfAction"
    ).length,
    0
  );
});

test("the two official Fluticasone rows cannot produce an ambiguous ADR MCQ", () => {
  const fixture = getDuplicateGenericFixture();
  assert.equal(
    fixture.candidates.filter(
      (candidate) => candidate.sourceGenericIdentity === fixture.genericIdentity
        && candidate.domainId === "topAdverseReactions"
    ).length,
    0
  );
});

test("the public materializer refuses every ambiguous duplicate-generic value before choices exist", () => {
  const { rows } = getDuplicateGenericFixture();
  for (const domainId of ["fdaIndication", "mechanismOfAction", "topAdverseReactions"]) {
    for (const row of rows) {
      const otherRow = rows.find((candidate) => candidate.id !== row.id);
      const otherOfficialValue = sourceValue(otherRow, domainId);
      assert.notEqual(sourceValueIdentity(row, domainId), sourceValueIdentity(otherRow, domainId));
      const result = materializeQuestionCandidate({
        candidate: forgedCandidate(row, domainId),
        drugData,
        policy,
        rng: createSeededRng(`forged-${domainId}-${row.id}`)
      });
      assert.equal(result.status, "unavailable");
      assert.equal(result.code, "AMBIGUOUS_DUPLICATE_GENERIC");
      assert.ok(!Object.hasOwn(result, "question"));
      assert.ok(!Object.hasOwn(result, "choices"));
      assert.match(otherOfficialValue, /\S/, "the other official value must exist for this regression");
    }
  }
});

test("duplicate-generic Brand / Generic FITB aggregates all four official Fluticasone brands", () => {
  const fixture = getDuplicateGenericFixture();
  const brandCandidates = fixture.candidates.filter(
    (candidate) => candidate.sourceGenericIdentity === fixture.genericIdentity
      && candidate.domainId === "brandGeneric"
  );
  assert.equal(brandCandidates.length, 1);

  const result = materializeQuestionCandidate({
    candidate: brandCandidates[0],
    drugData,
    policy,
    rng: () => 0.75
  });
  assert.equal(result.status, "materialized");
  assert.equal(result.question.metadata.brandGenericDirection, "genericToBrand");
  assert.deepEqual(
    new Set([result.question.answer, ...(result.question._acceptedAnswers || [])]),
    new Set(["Flovent", "Arnuity", "Flonase", "Xhance"])
  );
  assert.deepEqual(result.question.metadata.sourceDrugIds, fixture.rows.map((row) => row.id));
});

test("duplicate-generic MCQ stem references remain source-backed and unambiguous", () => {
  const fixture = getDuplicateGenericFixture();
  const mcqCandidates = fixture.candidates.filter(
    (candidate) => candidate.sourceGenericIdentity === fixture.genericIdentity
      && candidate.domainId !== "brandGeneric"
  );
  const officialBrands = new Set(fixture.rows.flatMap((row) => row.brandNames));
  assert.ok(mcqCandidates.length > 0);

  for (const candidate of mcqCandidates) {
    for (let seedIndex = 0; seedIndex < 12; seedIndex += 1) {
      const result = materializeQuestionCandidate({
        candidate,
        drugData,
        policy,
        rng: createSeededRng(`duplicate-stem-${candidate.id}-${seedIndex}`)
      });
      assert.equal(result.status, "materialized");
      assertSourceBackedStemReference(result.question);
      const reference = result.question.metadata.stemReference;
      assert.equal(reference.genericName, "Fluticasone");
      if (reference.brandName) assert.ok(officialBrands.has(reference.brandName));
    }
  }
});

test("duplicate generic identities cannot emit duplicate rendered prompt/answer questions", () => {
  const fixture = getDuplicateGenericFixture();
  const renderedKeys = new Set();
  for (const candidate of fixture.candidates) {
    const result = materializeQuestionCandidate({
      candidate,
      drugData,
      policy,
      rng: candidate.domainId === "brandGeneric" ? () => 0.75 : createSeededRng(candidate.id)
    });
    assert.equal(result.status, "materialized", candidate.id);
    const renderedKey = `${normalizeChoice(result.question.prompt)}\0${normalizeChoice(result.question.answer)}`;
    assert.ok(!renderedKeys.has(renderedKey), `duplicate rendered question: ${result.question.prompt}`);
    renderedKeys.add(renderedKey);
  }
});

test("duplicate-generic protection is generic production logic, not a Fluticasone special case", () => {
  const productionSource = readFileSync(
    path.join(repoRoot, "assets", "js", "fall-2026-quiz-generator.js"),
    "utf8"
  );
  assert.ok(!productionSource.includes("Fluticasone"));

  const renamedData = clone(drugData);
  for (const row of renamedData.drugs.filter((drug) => drug.genericName === "Fluticasone")) {
    row.genericName = "Synthetic Duplicate Generic";
  }
  const identity = normalizeGenericIdentity("Synthetic Duplicate Generic");
  const candidates = buildQuestionCandidates({
    drugData: renamedData,
    policy,
    quizWeek: 8,
    materialType: "new"
  }).filter((candidate) => candidate.sourceGenericIdentity === identity);

  assert.equal(candidates.filter((candidate) => candidate.domainId === "brandGeneric").length, 1);
  for (const domainId of ["fdaIndication", "mechanismOfAction", "topAdverseReactions"]) {
    assert.equal(candidates.filter((candidate) => candidate.domainId === domainId).length, 0);
  }
});

test("dataset-wide duplicate generic identities obey aggregation, ambiguity, and deduplication invariants", () => {
  let duplicateGroupCount = 0;
  for (let quizWeek = 2; quizWeek <= 10; quizWeek += 1) {
    const eligibleDrugs = drugData.drugs.filter(
      (drug) => drug.semester === policy.semester && drug.quizWeek <= quizWeek
    );
    const groups = new Map();
    for (const drug of eligibleDrugs) {
      const identity = normalizeGenericIdentity(drug.genericName);
      if (!groups.has(identity)) groups.set(identity, []);
      groups.get(identity).push(drug);
    }
    const candidates = [
      ...buildQuestionCandidates({ drugData, policy, quizWeek, materialType: "new" }),
      ...buildQuestionCandidates({ drugData, policy, quizWeek, materialType: "review" })
    ];

    for (const [identity, rows] of groups) {
      if (rows.length < 2) continue;
      duplicateGroupCount += 1;
      const identityCandidates = candidates.filter(
        (candidate) => candidate.sourceGenericIdentity === identity
      );
      const canonicalRow = rows.reduce((canonical, row) => (
        row.quizWeek > canonical.quizWeek ? row : canonical
      ));
      const brandCandidates = identityCandidates.filter(
        (candidate) => candidate.domainId === "brandGeneric"
      );
      assert.equal(brandCandidates.length, 1, `${identity} needs one aggregated Brand/Generic candidate`);
      assert.equal(brandCandidates[0].sourceDrugId, canonicalRow.id);
      assert.deepEqual(brandCandidates[0].sourceDrugIds, rows.map((row) => row.id));

      const brandResult = materializeQuestionCandidate({
        candidate: brandCandidates[0],
        drugData,
        policy,
        rng: () => 0.75
      });
      const expectedBrands = new Set(rows.flatMap((row) => row.brandNames).map(normalizeChoice));
      const acceptedBrands = new Set(
        [brandResult.question.answer, ...(brandResult.question._acceptedAnswers || [])].map(normalizeChoice)
      );
      assert.deepEqual(acceptedBrands, expectedBrands);

      for (const domainId of Object.keys(MCQ_DOMAIN_FIELDS)) {
        const valueIdentities = new Set(rows.map((row) => sourceValueIdentity(row, domainId)));
        const domainCandidates = identityCandidates.filter(
          (candidate) => candidate.domainId === domainId
        );
        if (valueIdentities.size > 1) {
          assert.equal(domainCandidates.length, 0, `${identity}/${domainId} must be suppressed as ambiguous`);
        } else {
          assert.ok(domainCandidates.length <= 1, `${identity}/${domainId} must not be duplicated`);
          if (domainCandidates.length === 1) {
            assert.equal(domainCandidates[0].sourceDrugId, canonicalRow.id);
          }
        }
      }
    }
  }
  assert.ok(duplicateGroupCount > 0, "the official dataset must exercise duplicate-generic invariants");
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

test("the Fall generator stack is activated only through the intended Fall Lab III page", () => {
  const htmlFiles = findFilesRecursively(
    repoRoot,
    (file) => file.endsWith(".html"),
    new Set(["node_modules", "tmp"])
  );
  for (const file of htmlFiles) {
    const source = readFileSync(file, "utf8");
    const relativePath = path.relative(repoRoot, file);
    if (relativePath === "lab3-fall-2026.html") {
      assert.ok(source.includes("assets/js/fall-2026-lab3-launcher.js"));
    } else {
      assert.ok(
        !source.includes("fall-2026-lab3-launcher.js"),
        `${relativePath} must not activate the Fall 2026 launcher`
      );
    }
    assert.ok(!source.includes("fall-2026-quiz-generator.js"));
    assert.ok(!source.includes("fall-2026-p2-top-drugs.json"));
    assert.ok(!source.includes("fall-2026-lab3-quiz-policy.json"));
  }
});
