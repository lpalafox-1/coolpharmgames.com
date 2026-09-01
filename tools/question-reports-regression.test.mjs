import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildFall2026Lab3Payload } from "../assets/js/fall-2026-lab3-launcher.js";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_KEY = "pharmlet.question-reports";
const REPORTS_TOKEN = "20260831b";
const ENGINE_TOKEN = "20260901a";
const STATS_TOKEN = "20260831a";
const PROTECTED_BASELINES = Object.freeze({
  fallSource: "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01",
  fallPolicy: "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171",
  fallGenerator: "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a",
  fallLauncher: "255ef32be7b47e3f12f3b02da5db5a91e9040a5ee9fe406f68029e783a98157c",
  masterPool: "1fb50e96e60252a9839406d53bc929e9569d76c0ddc2522aff43adf9bdf2a87c"
});

const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(readFileSync(path.join(repoRoot, relativePath))).digest("hex");
}

function createStorage(initialRaw = null) {
  const values = new Map();
  if (initialRaw !== null) values.set(REPORTS_KEY, initialRaw);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    raw(key = REPORTS_KEY) { return values.get(key); }
  };
}

function loadReportsApi(storage = createStorage(), extras = {}) {
  const catalog = loadBrowserGlobal("assets/js/quiz-catalog.js").PharmletQuizCatalog;
  const curriculumMetadata = loadBrowserGlobal("assets/js/curriculum-metadata.js", {
    PharmletQuizCatalog: catalog
  }).PharmletCurriculumMetadata;
  return loadBrowserGlobal("assets/js/question-reports.js", {
    localStorage: storage,
    navigator: {},
    PharmletQuizCatalog: catalog,
    PharmletCurriculumMetadata: curriculumMetadata,
    ...extras
  }).PharmletQuestionReports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildFallPayload(quizWeek, seed) {
  return buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed });
}

function reportInputFromGenerated(payload, question, overrides = {}) {
  return {
    quizId: payload.id,
    title: payload.title,
    mode: "Practice",
    questionNumber: payload.questions.indexOf(question) + 1,
    totalQuestions: payload.questions.length,
    prompt: question.prompt,
    promptText: question.prompt,
    correctAnswer: question.answer,
    userAnswer: overrides.userAnswer || question.choices?.[0] || "Student response",
    questionType: question.type,
    questionFamily: question.metadata?.knowledgeDomain,
    drugGeneric: "",
    timestamp: overrides.timestamp || "2026-08-31T12:00:00.000Z",
    questionId: question.id,
    choices: question.choices,
    acceptedAnswers: question._acceptedAnswers,
    sourceQuizId: question.sourceQuizId,
    questionMetadata: question.metadata,
    quizMetadata: payload.metadata
  };
}

test("legacy reports load without migration or destructive rewriting", () => {
  const legacy = [{
    quizId: "chapter1-review",
    title: "Chapter 1 Review",
    mode: "Easy",
    questionNumber: 2,
    totalQuestions: 10,
    prompt: "Legacy prompt",
    promptText: "Legacy prompt",
    correctAnswer: "A",
    userAnswer: "B",
    questionType: "mcq",
    questionFamily: "Foundations",
    drugGeneric: "",
    note: "Old note",
    timestamp: "2026-08-01T10:00:00.000Z"
  }];
  const raw = JSON.stringify(legacy);
  const storage = createStorage(raw);
  const api = loadReportsApi(storage);

  assert.deepEqual(plain(api.loadReports()), legacy);
  assert.equal(storage.raw(), raw, "reading an old report must not rewrite localStorage");
  assert.match(api.formatReport(legacy[0]), /Quiz: Chapter 1 Review/);
  assert.doesNotMatch(api.formatReport(legacy[0]), /Seed:|Week:|Source drug:|Variant:/);
});

test("partial and corrupt-but-parseable report arrays fail gracefully", () => {
  const partialRaw = JSON.stringify([null, "bad", 17, { promptText: "Partial report" }, ["nested"]]);
  const partialStorage = createStorage(partialRaw);
  const api = loadReportsApi(partialStorage);
  assert.deepEqual(plain(api.loadReports()), [{ promptText: "Partial report" }]);
  assert.match(api.formatReport(api.loadReports()[0]), /Prompt:\nPartial report/);
  assert.equal(partialStorage.raw(), partialRaw);

  for (const raw of ["{bad json", "null", "{}", '"not an array"']) {
    const storage = createStorage(raw);
    assert.deepEqual(plain(loadReportsApi(storage).loadReports()), []);
    assert.equal(storage.raw(), raw);
  }
});

test("new static reports use the additive schema without inventing Fall metadata", () => {
  const storage = createStorage();
  const api = loadReportsApi(storage);
  const built = api.buildReport({
    quizId: "ceutics-practice-1",
    title: "PSCI 71303 Pharmaceutics",
    mode: "Easy",
    questionNumber: 1,
    totalQuestions: 20,
    prompt: "<b>Which answer is correct?</b>",
    correctAnswer: "Answer A",
    userAnswer: "Answer B",
    questionType: "mcq",
    questionFamily: "Pharmaceutics",
    choices: ["Answer A", "Answer B", "Answer C", "Answer D"],
    timestamp: "2026-08-31T12:00:00.000Z"
  });
  const saved = api.addReport({ ...built, reportReason: "incorrectAnswer", note: "Static note" }, storage);
  const reloaded = plain(api.loadReports(storage)[0]);

  assert.equal(saved.schemaVersion, 2);
  assert.equal(reloaded.reportReason, "incorrectAnswer");
  assert.equal(reloaded.note, "Static note");
  assert.deepEqual(reloaded.choices, ["Answer A", "Answer B", "Answer C", "Answer D"]);
  assert.equal(reloaded.professionalYear, "P1");
  assert.equal(reloaded.semester, "Fall 2025");
  assert.equal(reloaded.curriculumId, "p1-fall-2025");
  assert.equal(reloaded.origin, "static");
  for (const key of [
    "generatorId", "seed", "requestedQuizWeek", "sourceMaterial", "knowledgeDomain",
    "sourceDrugId", "sourceDrugIds", "sourceDrugQuizWeek", "questionVariant",
    "brandGenericDirection", "answerMatching"
  ]) {
    assert.equal(Object.hasOwn(reloaded, key), false, `static report must omit ${key}`);
  }
});

test("Week 3 and Week 7 reports preserve existing deterministic reproduction metadata", () => {
  for (const quizWeek of [3, 7]) {
    const seed = `report-v2-week-${quizWeek}`;
    const payload = buildFallPayload(quizWeek, seed);
    const question = payload.questions.find((candidate) => candidate.metadata?.questionVariant);
    assert.ok(question, `Week ${quizWeek} fixture must contain a variant-bearing question`);
    const originalQuestion = structuredClone(question);
    const originalPayloadMetadata = structuredClone(payload.metadata);

    const storage = createStorage();
    const api = loadReportsApi(storage);
    const built = api.buildReport(reportInputFromGenerated(payload, question));
    api.addReport({ ...built, reportReason: "distractorQuality", note: "Reproduction note" }, storage);
    const reloaded = plain(api.loadReports(storage)[0]);

    assert.equal(reloaded.seed, seed);
    assert.equal(reloaded.requestedQuizWeek, quizWeek);
    assert.equal(reloaded.generatorId, question.metadata.generatorId);
    assert.equal(reloaded.knowledgeDomain, question.metadata.knowledgeDomain);
    assert.equal(reloaded.sourceMaterial, question.metadata.sourceMaterial);
    assert.equal(reloaded.sourceDrugId, question.metadata.sourceDrugId);
    assert.deepEqual(reloaded.sourceDrugIds, question.metadata.sourceDrugIds);
    assert.equal(reloaded.sourceDrugQuizWeek, question.metadata.sourceDrugQuizWeek);
    assert.equal(reloaded.questionVariant, question.metadata.questionVariant);
    assert.equal(reloaded.questionId, question.id);
    assert.equal(reloaded.sourceQuizId, question.sourceQuizId);
    assert.deepEqual(question, originalQuestion, "report construction must not mutate a generated question");
    assert.deepEqual(payload.metadata, originalPayloadMetadata, "report construction must not mutate quiz metadata");
  }
});

test("strict Brand/Generic report metadata and multiple accepted brands survive save/reload", () => {
  const payload = buildFallPayload(1, "accepted-1-3");
  const question = payload.questions.find((candidate) => Array.isArray(candidate._acceptedAnswers));
  assert.ok(question, "fixture must contain a multi-brand strict short-answer question");
  const storage = createStorage();
  const api = loadReportsApi(storage);
  const built = api.buildReport(reportInputFromGenerated(payload, question));
  api.addReport({ ...built, reportReason: "sourceMismatch" }, storage);
  const report = plain(api.loadReports(storage)[0]);

  assert.equal(report.brandGenericDirection, "genericToBrand");
  assert.deepEqual(report.answerMatching, {
    spellingSensitive: true,
    capitalizationSensitive: false
  });
  assert.deepEqual(report.acceptedAnswers, question._acceptedAnswers);
  assert.equal(Object.hasOwn(report, "questionVariant"), false, "missing source variants must remain omitted");
});

test("Copy Report is concise, human-readable, and omits unavailable or internal fields", async () => {
  const payload = buildFallPayload(3, "report-v2-week-3");
  const question = payload.questions.find((candidate) => candidate.metadata?.questionVariant);
  const api = loadReportsApi();
  const report = {
    ...plain(api.buildReport(reportInputFromGenerated(payload, question, { userAnswer: "Wrong choice" }))),
    reportReason: "distractorQuality",
    note: "Another displayed option may share this fact."
  };
  const writes = [];
  const copied = await api.copyReport(report, { writeText(text) { writes.push(text); } });

  assert.equal(writes.length, 1, "clipboard write must require one explicit copy action");
  assert.equal(writes[0], copied);
  for (const expected of [
    "Pharm-let Question Report", "Reason: Distractor quality", payload.title,
    `Seed: ${payload.metadata.seed}`, `Question ID: ${question.id}`,
    `Week: ${payload.metadata.quizWeek}`, `Domain: ${question.metadata.knowledgeDomain}`,
    `Material: ${question.metadata.sourceMaterial === "new" ? "New" : "Review"}`,
    `Source drug: ${question.metadata.sourceDrugId}`, `Variant: ${question.metadata.questionVariant}`,
    "Prompt:", "Choices:", "Expected answer:", "Submitted answer:", "Student note:"
  ]) {
    assert.match(copied, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(copied, /choiceSources|testedFact|choicePredicate|sourceDomainValue|\{\s*"/);

  const legacyCopy = api.formatReport({ title: "Legacy Quiz", promptText: "Old prompt" });
  assert.doesNotMatch(legacyCopy, /Seed:|Week:|Domain:|Material:|Source drug:|Variant:/);
});

test("individual deletion supports v2 IDs and legacy report signatures", () => {
  const legacy = { quizId: "legacy", promptText: "Old", timestamp: "2025-01-01T00:00:00.000Z" };
  const storage = createStorage(JSON.stringify([legacy]));
  const api = loadReportsApi(storage);
  const fresh = api.addReport({
    ...api.buildReport({ quizId: "new", promptText: "New", timestamp: "2026-08-31T12:00:00.000Z" }),
    reportReason: "other"
  }, storage);

  api.deleteReport(fresh, storage);
  assert.deepEqual(plain(api.loadReports(storage)), [legacy]);
  api.deleteReport(legacy, storage);
  assert.deepEqual(plain(api.loadReports(storage)), []);
});

test("reporting assets expose the reason workflow without any network submission path", () => {
  const moduleSource = read("assets/js/question-reports.js");
  const quiz = read("quiz.html");
  const stats = read("stats.html");
  const statsScript = read("assets/js/stats.js");
  const engine = read("assets/js/quizEngine.js");

  for (const value of [
    "incorrectAnswer", "sourceMismatch", "ambiguousAnswers", "distractorQuality",
    "wordingClarity", "typoFormatting", "professorStyleMismatch", "other"
  ]) {
    assert.match(moduleSource, new RegExp(`value: "${value}"`));
    assert.match(quiz, new RegExp(`value="${value}"`));
  }
  assert.match(quiz, /id="question-report-dialog"/);
  assert.match(quiz, /id="question-report-note"[^>]*maxlength="500"/);
  assert.ok(
    quiz.indexOf(`assets/js/curriculum-metadata.js?v=${REPORTS_TOKEN}`)
      < quiz.indexOf(`assets/js/question-reports.js?v=${REPORTS_TOKEN}`),
    "the curriculum adapter must load before the report store"
  );
  assert.ok(
    quiz.indexOf(`assets/js/question-reports.js?v=${REPORTS_TOKEN}`)
      < quiz.indexOf(`assets/js/quizEngine.js?v=${ENGINE_TOKEN}`),
    "the shared report store must load before the engine"
  );
  assert.ok(
    stats.indexOf(`assets/js/question-reports.js?v=${REPORTS_TOKEN}`)
      < stats.indexOf(`assets/js/stats.js?v=${STATS_TOKEN}`),
    "the shared report store must load before Stats"
  );
  assert.match(statsScript, /Copy Report/);
  assert.match(statsScript, /deleteReport\(report\)/);
  assert.match(engine, /state\.questionReportContext = data\?\.metadata/);

  const engineReportSection = engine.slice(
    engine.indexOf("function loadQuestionReports"),
    engine.indexOf("function createEmptyTopDrugsSignals")
  );
  assert.doesNotMatch(engineReportSection, /\balert\s*\(/, "saving a report must return to studying without a blocking alert");
  for (const source of [moduleSource, engineReportSection, statsScript]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  }
});

test("Fall generation remains deterministic and protected source/generator files remain byte-identical", () => {
  for (const quizWeek of [1, 3, 7, 10]) {
    const seed = `reporting-no-generator-change-${quizWeek}`;
    assert.deepEqual(buildFallPayload(quizWeek, seed), buildFallPayload(quizWeek, seed));
  }

  assert.equal(sha256("assets/data/fall-2026-p2-top-drugs.json"), PROTECTED_BASELINES.fallSource);
  assert.equal(sha256("assets/data/fall-2026-lab3-quiz-policy.json"), PROTECTED_BASELINES.fallPolicy);
  assert.equal(sha256("assets/js/fall-2026-quiz-generator.js"), PROTECTED_BASELINES.fallGenerator);
  assert.equal(sha256("assets/js/fall-2026-lab3-launcher.js"), PROTECTED_BASELINES.fallLauncher);
  assert.equal(sha256("assets/data/master_pool.json"), PROTECTED_BASELINES.masterPool);
});
