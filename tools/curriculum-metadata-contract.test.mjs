import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildFall2026Lab3Payload } from "../assets/js/fall-2026-lab3-launcher.js";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const METADATA_TOKEN = "20260831b";
const PROTECTED_BASELINES = Object.freeze({
  fallSource: "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01",
  fallPolicy: "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171",
  masterPool: "1fb50e96e60252a9839406d53bc929e9569d76c0ddc2522aff43adf9bdf2a87c",
  fallGenerator: "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a",
  fallLauncher: "255ef32be7b47e3f12f3b02da5db5a91e9040a5ee9fe406f68029e783a98157c",
  quizEngine: "eb56ec1f85a7cbef5dabaea065cc41dd28587979e0d4f6416c7c30f3fd396537",
  stats: "707fbf045dd1249989e3edb9c2c13666e9f2369dc75f2d2f52750b9f4688c034",
  reviewQueueStore: "67e0418362fba9da5abe5e079b2dad5437c543a636b48943e2f8a50e57b47a62",
  favorites: "b6fbd5bbca17ea150e34e9b29c9e6391b5ae7359d7b6afb18fe6c7e7caed781d"
});

const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(readFileSync(path.join(repoRoot, relativePath))).digest("hex");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    raw(key) { return values.get(key); }
  };
}

function createDocument() {
  return {
    documentElement: { classList: { contains() { return false; }, toggle() {} } },
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return {
        innerHTML: "",
        get textContent() { return String(this.innerHTML).replace(/<[^>]*>/g, ""); },
        get innerText() { return this.textContent; }
      };
    }
  };
}

function loadCatalog() {
  return loadBrowserGlobal("assets/js/quiz-catalog.js").PharmletQuizCatalog;
}

function loadMetadata(catalog = loadCatalog()) {
  return loadBrowserGlobal("assets/js/curriculum-metadata.js", {
    PharmletQuizCatalog: catalog
  }).PharmletCurriculumMetadata;
}

function loadReports(storage = createStorage()) {
  const catalog = loadCatalog();
  const metadata = loadMetadata(catalog);
  return loadBrowserGlobal("assets/js/question-reports.js", {
    localStorage: storage,
    navigator: {},
    PharmletQuizCatalog: catalog,
    PharmletCurriculumMetadata: metadata
  }).PharmletQuestionReports;
}

function buildFallPayload(quizWeek, seed) {
  return buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed });
}

function fallReportInput(payload, question) {
  return {
    quizId: payload.id,
    title: payload.title,
    questionId: question.id,
    prompt: question.prompt,
    correctAnswer: question.answer,
    userAnswer: "Student answer",
    questionType: question.type,
    sourceQuizId: question.sourceQuizId,
    questionMetadata: question.metadata,
    quizMetadata: payload.metadata
  };
}

test("known P1 catalog context normalizes without guessing unknown static metadata", () => {
  const catalog = loadCatalog();
  const metadata = loadMetadata(catalog);
  const p1 = plain(metadata.normalizeCurriculumMetadata({ quizId: "ceutics-practice-1" }));

  assert.equal(p1.schemaVersion, 1);
  assert.deepEqual(p1.quiz, {
    professionalYear: "P1",
    academicYear: "2025-26",
    semester: "Fall 2025",
    course: "Pharmaceutics I",
    quizId: "ceutics-practice-1",
    curriculumId: "p1-fall-2025",
    curriculumSource: "quizzes/ceutics-practice-1.json",
    origin: "static"
  });
  assert.deepEqual(p1.question, {});

  const technicalFixture = plain(metadata.normalizeCurriculumMetadata({ quizId: "test-sample-3" }));
  assert.deepEqual(technicalFixture.quiz, {
    quizId: "test-sample-3",
    curriculumSource: "quizzes/test-sample-3.json",
    origin: "static"
  });
  for (const field of ["professionalYear", "academicYear", "semester", "course", "lab", "curriculumId"]) {
    assert.equal(Object.hasOwn(technicalFixture.quiz, field), false, `${field} must remain unknown`);
  }

  const unknown = plain(metadata.normalizeCurriculumMetadata({
    quizId: "unknown-quiz",
    quizMetadata: { professionalYear: 2, semester: "Fall", quizWeek: true },
    questionMetadata: { sourceMaterial: "cumulative", sourceDrugQuizWeek: [7] }
  }));
  assert.deepEqual(unknown, { schemaVersion: 1, quiz: { quizId: "unknown-quiz" }, question: {} });
});

test("merging ignores invalid later values instead of erasing trusted context", () => {
  const metadata = loadMetadata();
  const merged = plain(metadata.mergeCurriculumMetadata(
    {
      quiz: { professionalYear: "P1", origin: "static", course: "Pharmaceutics I", seed: "seed-a" },
      question: { sourceMaterial: "review", sourceDrugId: "source-a" }
    },
    {
      quiz: { professionalYear: "bad", origin: "bad", course: {}, seed: ["bad"], quizWeek: true },
      question: { sourceMaterial: "cumulative", sourceDrugId: {}, sourceDrugQuizWeek: [7] }
    }
  ));
  assert.deepEqual(merged, {
    schemaVersion: 1,
    quiz: {
      professionalYear: "P1",
      course: "Pharmaceutics I",
      origin: "static",
      seed: "seed-a"
    },
    question: { sourceMaterial: "review", sourceDrugId: "source-a" }
  });
});

test("catalog curriculum objects are cloned and dynamic P1 routes retain reliable context", () => {
  const catalog = loadCatalog();
  const first = catalog.getEntry("ceutics-practice-1");
  first.curriculum.semester = "Mutated";
  assert.equal(catalog.getEntry("ceutics-practice-1").curriculum.semester, "Fall 2025");

  assert.deepEqual(plain(catalog.getCurriculumContext("lab-1-week-3")), {
    professionalYear: "P1",
    academicYear: "2025-26",
    semester: "Fall 2025",
    curriculumId: "p1-fall-2025",
    lab: "Lab I",
    quizId: "lab-1-week-3",
    quizWeek: 3,
    origin: "generated",
    curriculumSource: "assets/data/master_pool.json"
  });
  assert.equal(catalog.getCurriculumContext("custom-quiz"), null, "mixed custom containers stay unclassified");
});

test("custom and review containers inherit only their question source curriculum", () => {
  const metadata = loadMetadata();
  for (const quizId of ["custom-quiz", "review-quiz"]) {
    const normalized = plain(metadata.normalizeCurriculumMetadata({
      quizId,
      sourceQuizId: "ceutics-practice-1"
    }));
    assert.equal(normalized.quiz.quizId, quizId);
    assert.equal(normalized.quiz.sourceQuizId, "ceutics-practice-1");
    assert.equal(normalized.quiz.professionalYear, "P1");
    assert.equal(normalized.quiz.semester, "Fall 2025");
    assert.equal(normalized.quiz.origin, "generated");
  }

  assert.deepEqual(
    plain(metadata.normalizeCurriculumMetadata({ quizId: "custom-quiz" })),
    { schemaVersion: 1, quiz: { quizId: "custom-quiz", origin: "generated" }, question: {} },
    "a mixed container without a reliable per-question source stays unclassified"
  );

  const generatedFromOnly = plain(metadata.normalizeCurriculumMetadata({
    quizId: "custom-quiz",
    quizMetadata: { kind: "boss-round", generatedFrom: "ceutics-practice-1" }
  }));
  assert.equal(generatedFromOnly.quiz.quizId, "custom-quiz");
  assert.equal(generatedFromOnly.quiz.sourceQuizId, "ceutics-practice-1");
  assert.equal(generatedFromOnly.quiz.professionalYear, "P1");
  assert.equal(generatedFromOnly.quiz.semester, "Fall 2025");
  assert.equal(generatedFromOnly.quiz.origin, "generated");

  const perQuestionSourceWins = plain(metadata.normalizeCurriculumMetadata({
    quizId: "custom-quiz",
    sourceQuizId: "fall-2026-lab3-week-7-practice",
    quizMetadata: {
      kind: metadata.FALL_PRACTICE_KIND,
      generator: metadata.FALL_GENERATOR_ID,
      generatedFrom: "custom-quiz",
      quizWeek: 7
    }
  }));
  assert.equal(perQuestionSourceWins.quiz.sourceQuizId, "fall-2026-lab3-week-7-practice");
});

test("Fall Lab III normalization separates quiz-level and question-level metadata", () => {
  const metadata = loadMetadata();
  const payload = buildFallPayload(7, "p2f07-week-7");
  const question = payload.questions.find((candidate) => candidate.metadata?.questionVariant);
  assert.ok(question);
  const originalPayload = structuredClone(payload);
  const normalized = plain(metadata.normalizeCurriculumMetadata({
    quizId: payload.id,
    sourceQuizId: question.sourceQuizId,
    questionId: question.id,
    quizMetadata: payload.metadata,
    questionMetadata: question.metadata
  }));

  assert.deepEqual(normalized.quiz, {
    professionalYear: "P2",
    academicYear: "2026-27",
    semester: "Fall 2026",
    lab: "Lab III",
    quizId: "custom-quiz",
    sourceQuizId: "fall-2026-lab3-week-7-practice",
    quizWeek: 7,
    curriculumId: "p2-fall-2026-lab3",
    curriculumSource: "fall-2026-p2-top-drugs",
    origin: "generated",
    generatorId: payload.metadata.generator,
    seed: "p2f07-week-7"
  });
  assert.deepEqual(normalized.question, {
    questionId: question.id,
    knowledgeDomain: question.metadata.knowledgeDomain,
    sourceMaterial: question.metadata.sourceMaterial,
    sourceDrugId: question.metadata.sourceDrugId,
    sourceDrugIds: question.metadata.sourceDrugIds,
    sourceDrugQuizWeek: question.metadata.sourceDrugQuizWeek,
    questionVariant: question.metadata.questionVariant,
    ...(question.metadata.brandGenericDirection
      ? { brandGenericDirection: question.metadata.brandGenericDirection }
      : {})
  });

  for (const field of metadata.QUESTION_FIELDS) {
    assert.equal(Object.hasOwn(normalized.quiz, field), false, `${field} must not leak into quiz scope`);
  }
  for (const field of metadata.QUIZ_FIELDS) {
    assert.equal(Object.hasOwn(normalized.question, field), false, `${field} must not leak into question scope`);
  }
  assert.deepEqual(payload, originalPayload, "normalization must not mutate generated payloads");
});

test("verified Fall generator identity cannot be contradicted by malformed runtime curriculum fields", () => {
  const metadata = loadMetadata();
  const normalized = plain(metadata.normalizeCurriculumMetadata({
    quizId: "custom-quiz",
    quizMetadata: {
      kind: metadata.FALL_PRACTICE_KIND,
      generator: metadata.FALL_GENERATOR_ID,
      generatedFrom: "fall-2026-lab3-week-7-practice",
      quizWeek: 7,
      seed: "conflict",
      professionalYear: "P1",
      academicYear: "2025-26",
      semester: "Spring 2026",
      lab: "Lab I",
      curriculumId: "p1-spring-2026",
      curriculumSource: "wrong-source",
      origin: "static"
    }
  }));
  assert.equal(normalized.quiz.professionalYear, "P2");
  assert.equal(normalized.quiz.academicYear, "2026-27");
  assert.equal(normalized.quiz.semester, "Fall 2026");
  assert.equal(normalized.quiz.lab, "Lab III");
  assert.equal(normalized.quiz.curriculumId, "p2-fall-2026-lab3");
  assert.equal(normalized.quiz.curriculumSource, "fall-2026-p2-top-drugs");
  assert.equal(normalized.quiz.origin, "generated");
});

test("missing question variants stay absent while strict FITB direction remains source metadata", () => {
  const metadata = loadMetadata();
  const payload = buildFallPayload(1, "accepted-1-3");
  const question = payload.questions.find((candidate) => candidate.metadata?.brandGenericDirection);
  assert.ok(question);
  assert.equal(Object.hasOwn(question.metadata, "questionVariant"), false);

  const normalized = plain(metadata.normalizeCurriculumMetadata({
    quizId: payload.id,
    questionId: question.id,
    quizMetadata: payload.metadata,
    questionMetadata: question.metadata
  }));
  assert.equal(normalized.question.brandGenericDirection, question.metadata.brandGenericDirection);
  assert.equal(Object.hasOwn(normalized.question, "questionVariant"), false);
});

test("source-record identity is curriculum-scoped and duplicate Fluticasone rows stay distinct", () => {
  const metadata = loadMetadata();
  const p1LisinoprilSource = JSON.parse(read("assets/data/master_pool.json"))[82];
  const p2LisinoprilSource = drugData.drugs.find((drug) => drug.id === "p2-fall-quiz-01-drug-02");
  assert.equal(p1LisinoprilSource.generic, "Lisinopril");
  assert.equal(p2LisinoprilSource.genericName, "Lisinopril");
  const p1Lisinopril = metadata.normalizeCurriculumMetadata({
    quizId: "top-drugs-final-mockA",
    questionMetadata: { sourceDrugId: "master_pool:83", sourceDrugIds: ["master_pool:83"] }
  });
  const p2Lisinopril = metadata.normalizeCurriculumMetadata({
    quizId: "custom-quiz",
    quizMetadata: {
      kind: "fall-2026-lab3-practice",
      generator: metadata.FALL_GENERATOR_ID,
      generatedFrom: "fall-2026-lab3-week-1-practice",
      quizWeek: 1,
      seed: "identity"
    },
    questionMetadata: {
      generatorId: metadata.FALL_GENERATOR_ID,
      sourceDrugId: "p2-fall-quiz-01-drug-02",
      sourceDrugIds: ["p2-fall-quiz-01-drug-02"]
    }
  });
  assert.notDeepEqual(
    plain(metadata.getSourceRecordIdentities(p1Lisinopril)),
    plain(metadata.getSourceRecordIdentities(p2Lisinopril)),
    "the same generic in P1 and P2 must retain different curriculum/source identities"
  );

  const fluticasoneIds = drugData.drugs
    .filter((drug) => drug.genericName === "Fluticasone")
    .map((drug) => drug.id);
  assert.deepEqual(fluticasoneIds, ["p2-fall-quiz-08-drug-03", "p2-fall-quiz-08-drug-04"]);
  const fluticasoneContracts = fluticasoneIds.map((sourceDrugId) => metadata.normalizeCurriculumMetadata({
    quizMetadata: { kind: "fall-2026-lab3-practice", generator: metadata.FALL_GENERATOR_ID },
    questionMetadata: { sourceDrugId, sourceDrugIds: [sourceDrugId] }
  }));
  assert.notDeepEqual(
    plain(metadata.getSourceRecordIdentities(fluticasoneContracts[0])),
    plain(metadata.getSourceRecordIdentities(fluticasoneContracts[1])),
    "same-generic records inside one curriculum must retain distinct source IDs"
  );
  const fluticasone = metadata.normalizeCurriculumMetadata({
    quizMetadata: { kind: "fall-2026-lab3-practice", generator: metadata.FALL_GENERATOR_ID },
    questionMetadata: { sourceDrugId: fluticasoneIds[0], sourceDrugIds: fluticasoneIds }
  });
  assert.deepEqual(plain(fluticasone.question.sourceDrugIds), fluticasoneIds);
  assert.deepEqual(
    plain(metadata.getSourceRecordIdentities(fluticasone)),
    fluticasoneIds.map((sourceDrugId) => ({ curriculumId: "p2-fall-2026-lab3", sourceDrugId }))
  );
});

test("Question Reports consumes the shared contract additively without changing legacy loading", () => {
  const legacy = [{ quizId: "legacy", promptText: "Old report", timestamp: "2025-01-01T00:00:00.000Z" }];
  const storage = createStorage({ "pharmlet.question-reports": JSON.stringify(legacy) });
  const reports = loadReports(storage);
  assert.deepEqual(plain(reports.loadReports()), legacy);
  assert.equal(storage.raw("pharmlet.question-reports"), JSON.stringify(legacy));

  const staticReport = plain(reports.buildReport({
    quizId: "ceutics-practice-1",
    title: "PSCI 71303 Pharmaceutics",
    prompt: "Static prompt",
    correctAnswer: "A",
    userAnswer: "B",
    questionType: "mcq"
  }));
  assert.equal(staticReport.professionalYear, "P1");
  assert.equal(staticReport.semester, "Fall 2025");
  assert.equal(staticReport.curriculumId, "p1-fall-2025");
  assert.equal(staticReport.origin, "static");
  for (const field of ["seed", "requestedQuizWeek", "knowledgeDomain", "sourceMaterial", "sourceDrugId"]) {
    assert.equal(Object.hasOwn(staticReport, field), false, `static reports must not invent ${field}`);
  }

  const payload = buildFallPayload(3, "p2f07-report-week-3");
  const question = payload.questions.find((candidate) => candidate.metadata?.questionVariant);
  const fallReport = plain(reports.buildReport(fallReportInput(payload, question)));
  assert.equal(fallReport.professionalYear, "P2");
  assert.equal(fallReport.academicYear, "2026-27");
  assert.equal(fallReport.semester, "Fall 2026");
  assert.equal(fallReport.lab, "Lab III");
  assert.equal(fallReport.curriculumId, "p2-fall-2026-lab3");
  assert.equal(fallReport.curriculumSource, "fall-2026-p2-top-drugs");
  assert.equal(fallReport.origin, "generated");
  assert.equal(fallReport.seed, payload.metadata.seed);
  assert.equal(fallReport.requestedQuizWeek, 3);
  assert.equal(fallReport.sourceDrugId, question.metadata.sourceDrugId);
  assert.equal(fallReport.questionVariant, question.metadata.questionVariant);
});

test("legacy Stats, Review Queue, and Favorites storage contracts remain readable", () => {
  const history = [{
    quizId: "chapter1-review",
    mode: "easy",
    title: "Chapter 1 Review",
    score: 8,
    total: 10,
    timestamp: "2026-01-01T00:00:00.000Z"
  }];
  const historyRaw = JSON.stringify(history);
  const historyStorage = createStorage({ "pharmlet.history": historyRaw });
  const statsSandbox = loadBrowserGlobal("assets/js/stats.js", {
    document: createDocument(),
    localStorage: historyStorage,
    sessionStorage: createStorage(),
    matchMedia() { return { matches: false }; }
  });
  assert.deepEqual(plain(statsSandbox.getHistory()), history);
  assert.equal(historyStorage.raw("pharmlet.history"), historyRaw, "Stats reads must not migrate old history");

  const reviewStore = loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;
  const legacyQueue = [{
    quizId: "chapter1-review",
    title: "Chapter 1 Review",
    type: "mcq",
    prompt: "Legacy queue prompt",
    answer: "A",
    userAnswer: "B",
    timestamp: "2026-01-01T00:00:00.000Z"
  }];
  const normalizedQueue = reviewStore.normalizeQueue(legacyQueue);
  assert.equal(normalizedQueue.length, 1);
  assert.equal(normalizedQueue[0].quizId, "chapter1-review");
  assert.equal(normalizedQueue[0].key, "chapter1-review::legacy queue prompt::a");

  const favoritesRaw = JSON.stringify(["ceutics-practice-1", "latin-fun"]);
  const favoritesStorage = createStorage({ "pharmlet.favorites": favoritesRaw });
  const favorites = loadBrowserGlobal("assets/js/favorites.js", {
    document: createDocument(),
    localStorage: favoritesStorage,
    location: { search: "" },
    PharmletQuizCatalog: loadCatalog(),
    addEventListener() {},
    matchMedia() { return { matches: false }; }
  }).PharmletFavorites;
  assert.deepEqual(Array.from(favorites.getAll()), ["ceutics-practice-1", "latin-fun"]);
  assert.equal(favoritesStorage.raw("pharmlet.favorites"), favoritesRaw);
  assert.equal(
    favorites.getLaunchActions(favorites.resolveFavoriteDescriptor("ceutics-practice-1"))[0].href,
    "quiz.html?id=ceutics-practice-1&mode=easy"
  );
});

test("metadata scripts use synchronized cache tokens and load before report capture", () => {
  const quiz = read("quiz.html");
  assert.ok(
    quiz.indexOf(`assets/js/curriculum-metadata.js?v=${METADATA_TOKEN}`)
      < quiz.indexOf(`assets/js/question-reports.js?v=${METADATA_TOKEN}`),
    "the metadata adapter must load before Question Reports"
  );
  assert.ok(quiz.includes(`assets/js/quiz-catalog.js?v=${METADATA_TOKEN}`));
  assert.ok(quiz.includes(`assets/js/question-reports.js?v=${METADATA_TOKEN}`));

  for (const page of ["custom-quiz.html", "favorites.html", "quiz.html", "review-queue.html", "stats.html"]) {
    assert.ok(read(page).includes(`assets/js/quiz-catalog.js?v=${METADATA_TOKEN}`), `${page} needs the current catalog`);
  }
  assert.ok(read("stats.html").includes(`assets/js/question-reports.js?v=${METADATA_TOKEN}`));
});

test("canonical data, generator, launcher, scoring, and existing storage modules stay byte-identical", () => {
  for (const [key, relativePath] of Object.entries({
    fallSource: "assets/data/fall-2026-p2-top-drugs.json",
    fallPolicy: "assets/data/fall-2026-lab3-quiz-policy.json",
    masterPool: "assets/data/master_pool.json",
    fallGenerator: "assets/js/fall-2026-quiz-generator.js",
    fallLauncher: "assets/js/fall-2026-lab3-launcher.js",
    quizEngine: "assets/js/quizEngine.js",
    stats: "assets/js/stats.js",
    reviewQueueStore: "assets/js/review-queue-store.js",
    favorites: "assets/js/favorites.js"
  })) {
    assert.equal(sha256(relativePath), PROTECTED_BASELINES[key], `${relativePath} must remain unchanged`);
  }

  for (const week of [1, 3, 7, 10]) {
    const seed = `p2f07-no-generator-change-${week}`;
    assert.deepEqual(buildFallPayload(week, seed), buildFallPayload(week, seed));
  }
});
