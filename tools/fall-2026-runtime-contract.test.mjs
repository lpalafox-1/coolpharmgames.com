import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import {
  buildQuestionCandidates,
  materializeQuestionCandidate
} from "../assets/js/fall-2026-quiz-generator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = path.join(repoRoot, "assets", "js", "quizEngine.js");
const engineSource = readFileSync(enginePath, "utf8");
const drugData = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-p2-top-drugs.json"), "utf8")
);
const policy = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-lab3-quiz-policy.json"), "utf8")
);
const EXPECTED_ENGINE_SHA256 = "b9862408f282f5e57f2ff6f7813b027ef94117f683e2c73a166bae1792dbe3be";

function createStorageStub() {
  return {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
}

function loadEngineWithoutBootstrap() {
  const storage = createStorageStub();
  return loadBrowserGlobal("assets/js/quizEngine.js", {
    location: { search: "", href: "" },
    document: { addEventListener() {} },
    localStorage: storage,
    sessionStorage: storage,
    alert() {},
    confirm() { return false; },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function listFilesRecursively(directory, predicate, skippedNames = new Set()) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || skippedNames.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(fullPath, predicate, skippedNames));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("the actual shipped evaluator is callable without running app bootstrap", () => {
  const engine = loadEngineWithoutBootstrap();
  assert.equal(typeof engine.evaluateAnswerForQuestion, "function");
  assert.equal(
    engine.evaluateAnswerForQuestion(
      { type: "short", prompt: "Brand for Enalapril?", answer: "Vasotec" },
      "Vasotec"
    ),
    true
  );
});

test("legacy short-answer scoring is case-insensitive and whitespace tolerant", () => {
  const evaluate = loadEngineWithoutBootstrap().evaluateAnswerForQuestion;

  const vasotec = { type: "short", prompt: "Brand for Enalapril?", answer: "Vasotec" };
  assert.equal(evaluate(vasotec, "VASOTEC"), true);
  assert.equal(evaluate(vasotec, "  vasotec  "), true);
  assert.equal(evaluate(vasotec, "Vasotecc"), false, "unlisted inserted letters are not generically fuzzy-matched");

  const cartia = { type: "short", prompt: "Brand for Diltiazem?", answer: "Cartia XT" };
  assert.equal(evaluate(cartia, "Cartia     XT"), true);
});

test("legacy scoring deletes punctuation and separators and splits comma/semicolon options", () => {
  const evaluate = loadEngineWithoutBootstrap().evaluateAnswerForQuestion;

  const dilt = { type: "short", prompt: "Brand for Diltiazem?", answer: "Dilt-XR" };
  assert.equal(evaluate(dilt, "DiltXR"), true);
  assert.equal(evaluate(dilt, "Dilt.XR"), true);

  const entrestoGeneric = {
    type: "short",
    prompt: "Generic for Entresto?",
    answer: "Sacubitril/Valsartan"
  };
  assert.equal(evaluate(entrestoGeneric, "Sacubitril Valsartan"), true);
  assert.equal(evaluate(entrestoGeneric, "Valsartan-Sacubitril"), true);

  assert.equal(evaluate(
    { type: "short", prompt: "Brand options?", answer: "Flovent, Arnuity" },
    "Arnuity"
  ), true);
  assert.equal(evaluate(
    { type: "short", prompt: "Brand options?", answer: "Flonase; Xhance" },
    "Xhance"
  ), true);
});

test("legacy aliases, _acceptedAnswers, brand extras, and qualifier removal participate", () => {
  const evaluate = loadEngineWithoutBootstrap().evaluateAnswerForQuestion;

  assert.equal(evaluate(
    { type: "short", prompt: "Class?", answer: "Hormone Replacement" },
    "Horomone Replacement"
  ), true);

  const semaglutide = {
    type: "short",
    prompt: "Brand for Semaglutide?",
    answer: "Ozempic",
    _acceptedAnswers: ["Rybelsus", "Wegovy"]
  };
  assert.equal(evaluate(semaglutide, "RYBELSUS"), true);
  assert.equal(evaluate(semaglutide, "Wegovy"), true);
  assert.equal(evaluate(semaglutide, "Wegovyy"), false);

  assert.equal(evaluate(
    { type: "short", prompt: "Brand for Metoprolol?", answer: "Lopressor (tartrate)" },
    "Lopressor"
  ), true);

  assert.equal(evaluate({
    type: "short",
    prompt: "Brand for Albuterol?",
    answer: "Ventolin",
    drugRef: { generic: "Albuterol", brand: "Ventolin" }
  }, "ProAir HFA"), true);
});

test("Fall answerMatching metadata and official alternatives survive loading and in-session clones", () => {
  const engine = loadEngineWithoutBootstrap();
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
  assert.equal(result.question.answer, "Ozempic");
  assert.deepEqual(result.question._acceptedAnswers, ["Rybelsus", "Wegovy"]);
  assert.deepEqual(result.question.metadata.answerMatching, {
    spellingSensitive: true,
    capitalizationSensitive: false
  });

  const normalized = engine.normalizeLoadedQuizQuestion(result.question);
  assert.deepEqual(plain(normalized.metadata), result.question.metadata);
  assert.deepEqual(plain(normalized._acceptedAnswers), result.question._acceptedAnswers);

  const reviewClone = engine.buildFreshReviewRoundQuestions([normalized])[0];
  assert.deepEqual(plain(reviewClone.metadata), result.question.metadata);
  assert.deepEqual(plain(reviewClone._acceptedAnswers), result.question._acceptedAnswers);

  const generatedClone = engine.cloneQuestionForGeneratedQuiz(normalized);
  assert.deepEqual(plain(generatedClone.metadata), result.question.metadata);
  assert.deepEqual(plain(generatedClone._acceptedAnswers), result.question._acceptedAnswers);
});

test("the persisted review-queue path currently drops strict metadata and accepted alternatives", () => {
  const saveProjection = sourceBetween(
    engineSource,
    "function saveMissedQuestionsToReviewQueue",
    "function saveReviewRoundResultsToReviewQueue"
  );
  assert.doesNotMatch(saveProjection, /answerMatching/);
  assert.doesNotMatch(saveProjection, /_acceptedAnswers/);

  const storeSource = readFileSync(path.join(repoRoot, "assets", "js", "review-queue-store.js"), "utf8");
  const storeProjection = sourceBetween(storeSource, "function normalizeEntry", "function combineEntries");
  assert.doesNotMatch(storeProjection, /answerMatching/);
  assert.doesNotMatch(storeProjection, /_acceptedAnswers/);

  const reviewPageSource = readFileSync(path.join(repoRoot, "assets", "js", "review-queue.js"), "utf8");
  const rebuildProjection = sourceBetween(reviewPageSource, "function startReviewQuiz", "function populateQuizFilter");
  assert.doesNotMatch(rebuildProjection, /answerMatching/);
  assert.doesNotMatch(rebuildProjection, /_acceptedAnswers/);
});

test("Fall remains inactive, legacy data has no strict marker, and quizEngine.js is byte-identical", () => {
  const digest = createHash("sha256").update(engineSource).digest("hex");
  assert.equal(digest, EXPECTED_ENGINE_SHA256);

  const htmlFiles = listFilesRecursively(
    repoRoot,
    (file) => file.endsWith(".html"),
    new Set(["node_modules", "tmp"])
  );
  for (const file of htmlFiles) {
    const source = readFileSync(file, "utf8");
    for (const forbiddenReference of [
      "fall-2026-quiz-generator.js",
      "fall-2026-p2-top-drugs.json",
      "fall-2026-lab3-quiz-policy.json"
    ]) {
      assert.ok(
        !source.includes(forbiddenReference),
        `${path.relative(repoRoot, file)} must not activate ${forbiddenReference}`
      );
    }
  }

  const legacyQuestionSources = [
    ...listFilesRecursively(path.join(repoRoot, "quizzes"), (file) => file.endsWith(".json")),
    path.join(repoRoot, "assets", "data", "master_pool.json")
  ];
  for (const file of legacyQuestionSources) {
    assert.ok(
      !readFileSync(file, "utf8").includes("answerMatching"),
      `${path.relative(repoRoot, file)} unexpectedly opts into strict Fall matching`
    );
  }
});
