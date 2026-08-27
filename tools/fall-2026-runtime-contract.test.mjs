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
const APPROVED_ENGINE_BASELINE = Object.freeze({
  commit: "25c9211e96cdcc8fa431fa852deb86065148282f",
  sha256: "5852b3ce1ae6d22dba6eadb9b7dfa1461676af74913e39b639a27d07a44f34a5"
});

function createStorageStub(initialValues = {}) {
  const values = new Map(
    Object.entries(initialValues).map(([key, value]) => [key, String(value)])
  );
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadEngineWithoutBootstrap(extraGlobals = {}) {
  const storage = extraGlobals.localStorage || createStorageStub();
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
    clearInterval,
    ...extraGlobals
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

function strictMetadata() {
  return {
    answerMatching: {
      spellingSensitive: true,
      capitalizationSensitive: false
    }
  };
}

function loadReviewQueuePage(queue, reviewQueueStore) {
  const storage = createStorageStub({
    "pharmlet.review-queue": JSON.stringify(queue)
  });
  const location = { search: "", href: "" };
  const document = {
    addEventListener() {},
    getElementById(id) {
      return id === "filter-quiz" ? { value: "" } : null;
    }
  };
  const page = loadBrowserGlobal("assets/js/review-queue.js", {
    document,
    localStorage: storage,
    location,
    PharmletReviewQueueStore: reviewQueueStore,
    PharmletQuizCatalog: null,
    alert(message) { throw new Error(message); },
    confirm() { return false; }
  });
  return { page, storage, location };
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

test("marked Fall FITB scoring is spelling-sensitive and capitalization-insensitive", () => {
  const evaluate = loadEngineWithoutBootstrap().evaluateAnswerForQuestion;
  const marked = (answer, acceptedAnswers = []) => ({
    type: "short",
    prompt: "Fall Brand/Generic FITB",
    answer,
    _acceptedAnswers: acceptedAnswers,
    metadata: strictMetadata()
  });

  assert.equal(evaluate(marked("Vasotec"), "VASOTEC"), true);
  assert.equal(evaluate(marked("Vasotec"), "  vasotec  "), true);
  assert.equal(evaluate(marked("Vasotec"), "Vasotecc"), false);

  assert.equal(evaluate(marked("Dilt-XR"), "dilt-xr"), true);
  assert.equal(evaluate(marked("Dilt-XR"), "DiltXR"), false);
  assert.equal(evaluate(marked("Dilt-XR"), "Dilt.XR"), false);
  assert.equal(evaluate(marked("Cartia XT"), "Cartia     XT"), false);

  assert.equal(evaluate(marked("Sacubitril/Valsartan"), "sacubitril/valsartan"), true);
  assert.equal(evaluate(marked("Sacubitril/Valsartan"), "Sacubitril Valsartan"), false);
  assert.equal(evaluate(marked("Sacubitril/Valsartan"), "Valsartan-Sacubitril"), false);

  const semaglutide = marked("Ozempic", ["Rybelsus", "Wegovy"]);
  assert.equal(evaluate(semaglutide, "RYBELSUS"), true);
  assert.equal(evaluate(semaglutide, "wegovy"), true);
  assert.equal(evaluate(semaglutide, "Rybelsus!"), false);
});

test("malformed marked FITB questions fail closed instead of using legacy loose scoring", () => {
  const evaluate = loadEngineWithoutBootstrap().evaluateAnswerForQuestion;
  const base = {
    type: "short",
    prompt: "Brand for Diltiazem?",
    answer: "Dilt-XR"
  };

  assert.equal(evaluate({ ...base, metadata: { answerMatching: null } }, "DiltXR"), false);
  assert.equal(evaluate({
    ...base,
    metadata: { answerMatching: { spellingSensitive: true } }
  }, "DiltXR"), false);
  assert.equal(evaluate({ ...base, answer: ["Dilt-XR"], metadata: strictMetadata() }, "Dilt-XR"), false);
  assert.equal(evaluate({ ...base, answer: undefined, metadata: strictMetadata() }, "Dilt-XR"), false);
  assert.equal(evaluate({ ...base, metadata: strictMetadata() }, ["Dilt-XR"]), false);
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

test("strict metadata and official alternatives survive the full persisted review lifecycle", () => {
  let missedProjection;
  let reviewProjection;
  const storage = createStorageStub({ "pharmlet.review-queue": "[]" });
  const engine = loadEngineWithoutBootstrap({
    localStorage: storage,
    PharmletReviewQueueStore: {
      mergeMissedEntries(_existing, entries) {
        missedProjection = plain(entries);
        return entries;
      },
      applyReviewResults(_existing, entries) {
        reviewProjection = plain(entries);
        return entries;
      }
    }
  });
  const markedQuestion = {
    type: "short",
    prompt: "Brand for Semaglutide?",
    answer: "Ozempic",
    _acceptedAnswers: ["Rybelsus", "Wegovy"],
    metadata: strictMetadata(),
    sourceQuizId: "fall-2026-week-8",
    sourceTitle: "Fall 2026 Week 8",
    _answered: true,
    _correct: false,
    _user: "Rybelsus!"
  };

  engine.saveMissedQuestionsToReviewQueue([markedQuestion]);
  assert.deepEqual(missedProjection[0].metadata, strictMetadata());
  assert.deepEqual(missedProjection[0]._acceptedAnswers, ["Rybelsus", "Wegovy"]);

  const store = loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;
  const persistedQueue = plain(store.mergeMissedEntries([], missedProjection));
  assert.deepEqual(persistedQueue[0].metadata, strictMetadata());
  assert.deepEqual(persistedQueue[0]._acceptedAnswers, ["Rybelsus", "Wegovy"]);

  const reviewPage = loadReviewQueuePage(persistedQueue, store);
  reviewPage.page.startReviewQuiz(null);
  const customQuiz = JSON.parse(reviewPage.storage.getItem("pharmlet.custom-quiz"));
  const rebuiltQuestion = customQuiz.pools.easy[0];
  assert.deepEqual(rebuiltQuestion.metadata, strictMetadata());
  assert.deepEqual(rebuiltQuestion._acceptedAnswers, ["Rybelsus", "Wegovy"]);
  assert.match(reviewPage.location.href, /^quiz\.html\?id=review-quiz/);

  const normalizedReview = engine.normalizeLoadedQuizQuestion(rebuiltQuestion);
  assert.equal(engine.evaluateAnswerForQuestion(normalizedReview, "RYBELSUS"), true);
  assert.equal(engine.evaluateAnswerForQuestion(normalizedReview, "Rybelsus!"), false);

  engine.saveReviewRoundResultsToReviewQueue([{
    ...rebuiltQuestion,
    _answered: true,
    _correct: true,
    _user: "RYBELSUS"
  }]);
  assert.deepEqual(reviewProjection[0].metadata, strictMetadata());
  assert.deepEqual(reviewProjection[0]._acceptedAnswers, ["Rybelsus", "Wegovy"]);

  const updatedQueue = plain(store.applyReviewResults(persistedQueue, reviewProjection));
  assert.deepEqual(updatedQueue[0].metadata, strictMetadata());
  assert.deepEqual(updatedQueue[0]._acceptedAnswers, ["Rybelsus", "Wegovy"]);
});

test("malformed answerMatching markers remain fail closed by staying out of persisted review", () => {
  let missedMergeCalls = 0;
  let reviewResultCalls = 0;
  const storage = createStorageStub({ "pharmlet.review-queue": "[]" });
  const engine = loadEngineWithoutBootstrap({
    localStorage: storage,
    PharmletReviewQueueStore: {
      mergeMissedEntries(_existing, entries) {
        missedMergeCalls += 1;
        return entries;
      },
      applyReviewResults(_existing, entries) {
        reviewResultCalls += 1;
        return entries;
      }
    }
  });
  const malformedQuestion = {
    type: "short",
    prompt: "Brand for Diltiazem?",
    answer: "Dilt-XR",
    metadata: {
      answerMatching: {
        spellingSensitive: true
      }
    },
    sourceQuizId: "fall-2026-week-1",
    sourceTitle: "Fall 2026 Week 1",
    _answered: true,
    _correct: false,
    _user: "DiltXR"
  };

  assert.equal(engine.evaluateAnswerForQuestion(malformedQuestion, "DiltXR"), false);

  engine.saveMissedQuestionsToReviewQueue([malformedQuestion]);
  engine.saveReviewRoundResultsToReviewQueue([malformedQuestion]);
  assert.equal(missedMergeCalls, 0);
  assert.equal(reviewResultCalls, 0);

  const store = loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;
  const persistedQueue = plain(store.normalizeQueue(JSON.parse(storage.getItem("pharmlet.review-queue"))));
  assert.deepEqual(persistedQueue, []);

  const reviewPage = loadReviewQueuePage(persistedQueue, store);
  assert.throws(() => reviewPage.page.startReviewQuiz(null), /No questions available for review/);
  assert.equal(reviewPage.storage.getItem("pharmlet.custom-quiz"), null);
});

test(`Fall stays isolated to its launcher, legacy data has no strict marker, and the engine matches ${APPROVED_ENGINE_BASELINE.commit}`, () => {
  const digest = createHash("sha256").update(engineSource).digest("hex");
  assert.equal(digest, APPROVED_ENGINE_BASELINE.sha256);
  assert.ok(!engineSource.includes("stemReference"), "Fall stem provenance must not be rendered by the legacy engine");

  const htmlFiles = listFilesRecursively(
    repoRoot,
    (file) => file.endsWith(".html"),
    new Set(["node_modules", "tmp"])
  );
  for (const file of htmlFiles) {
    const source = readFileSync(file, "utf8");
    const relativePath = path.relative(repoRoot, file);
    for (const forbiddenReference of [
      "fall-2026-quiz-generator.js",
      "fall-2026-p2-top-drugs.json",
      "fall-2026-lab3-quiz-policy.json"
    ]) {
      assert.ok(
        !source.includes(forbiddenReference),
        `${relativePath} must not activate ${forbiddenReference} directly`
      );
    }
    assert.equal(
      source.includes("fall-2026-lab3-launcher.js"),
      relativePath === "lab3-fall-2026.html",
      `${relativePath} has the wrong Fall launcher activation state`
    );
  }

  const launcherSource = readFileSync(
    path.join(repoRoot, "assets", "js", "fall-2026-lab3-launcher.js"),
    "utf8"
  );
  const fallPageSource = readFileSync(
    path.join(repoRoot, "lab3-fall-2026.html"),
    "utf8"
  );
  assert.ok(fallPageSource.includes(
    'src="assets/js/fall-2026-lab3-launcher.js?v=20260826a"'
  ));
  assert.ok(launcherSource.includes('from "./fall-2026-quiz-generator.js?v=20260826a"'));
  assert.ok(launcherSource.includes("assets/data/fall-2026-p2-top-drugs.json"));
  assert.ok(launcherSource.includes("assets/data/fall-2026-lab3-quiz-policy.json"));
  assert.ok(!launcherSource.includes("master_pool.json"));

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
