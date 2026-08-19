import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import { buildFall2026Lab3Payload } from "../assets/js/fall-2026-lab3-launcher.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drugData = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-p2-top-drugs.json"), "utf8")
);
const policy = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-lab3-quiz-policy.json"), "utf8")
);

const WEEK_1_NOTE = "Practice configuration: Week 1 has no prior review material. This 10-question study set uses Week 1 content only and is not intended to claim the exact official Week 1 quiz composition.";

const LEGACY_HOME_HREFS = [
  "stats.html",
  "stats.html#morning-warmup-section",
  "stats.html#weak-area-playlists-section",
  "favorites.html",
  "review-queue.html",
  "study-timer.html",
  "custom-quiz.html",
  "top-drugs-trends.html",
  "top-drugs-quicksheet.html",
  "top-drugs-integrity.html",
  "quiz.html?id=ceutics2-final",
  "quiz.html?id=ceutics2-final&mode=quickHard",
  "quiz.html?id=ceutics2-final&mode=pkMath",
  "quiz.html?id=ceutics2-final&mode=adaptive",
  "quiz.html?id=bdt-unit10-quiz8",
  "quiz.html?id=basis2-quiz9",
  "quiz.html?id=bdt-unit10-exam4",
  "quiz.html?id=log-lab-final-2",
  "quiz.html?id=log-lab-final-2&exam=1",
  "quiz.html?week=1",
  "quiz.html?week=2",
  "quiz.html?week=3",
  "quiz.html?week=4",
  "quiz.html?week=5",
  "quiz.html?week=6",
  "quiz.html?week=7",
  "quiz.html?week=8",
  "quiz.html?week=9",
  "quiz.html?week=10",
  "quiz.html?week=11",
  "quiz.html?id=ceutics-practice-1",
  "quiz.html?id=ceutics-practice-2",
  "quiz.html?id=practice-e1-exam1-prep-ch1-4",
  "quiz.html?id=practice-e2a-exam2-prep-ch1-5",
  "quiz.html?id=supplemental-exam1-2024",
  "quiz.html?id=latin-fun",
  "quiz.html?id=sig-wildcards",
  "quiz.html?week=1&lab=1",
  "quiz.html?week=2&lab=1",
  "quiz.html?week=3&lab=1",
  "quiz.html?week=4&lab=1",
  "quiz.html?week=5&lab=1",
  "quiz.html?weeks=1-2&lab=1",
  "quiz.html?weeks=1-3&lab=1",
  "quiz.html?weeks=1-4&lab=1",
  "quiz.html?weeks=1-5&lab=1",
  "quiz.html?id=top-drugs-final-mockA",
  "quiz.html?id=top-drugs-final-mockB",
  "quiz.html?id=top-drugs-final-mockC",
  "quiz.html?id=top-drugs-final-mockD",
  "quiz.html?id=top-drugs-final-mockE"
];

function build(quizWeek, seed = `student-launch-week-${quizWeek}`) {
  return buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed });
}

function createStorageStub(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadEngine(extraGlobals = {}) {
  const storage = extraGlobals.localStorage || createStorageStub();
  return loadBrowserGlobal("assets/js/quizEngine.js", {
    location: { search: "?id=custom-quiz", href: "" },
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

test("Weeks 1-3 launch payloads use the existing generated-quiz runtime contract", () => {
  for (const quizWeek of [1, 2, 3]) {
    const payload = build(quizWeek);
    assert.equal(payload.id, "custom-quiz");
    assert.equal(payload.title, `Lab III Fall 2026 - Week ${quizWeek} Practice`);
    assert.equal(payload.metadata.kind, "fall-2026-lab3-practice");
    assert.equal(payload.metadata.generator, "fall-2026-p2-lab3-deterministic-generator");
    assert.equal(payload.metadata.quizWeek, quizWeek);
    assert.equal(payload.metadata.timerSeconds, 600);
    assert.equal(payload.metadata.seed, `student-launch-week-${quizWeek}`);
    assert.equal(payload.questions.length, 10);
    assert.ok(payload.questions.every((question) => question.sourceQuizId === `fall-2026-lab3-week-${quizWeek}-practice`));
    assert.ok(payload.questions.every((question) => question.sourceTitle === payload.title));
  }
});

test("Week 1 launch is practice-only, contains no review, and carries the exact disclaimer", () => {
  const payload = build(1);
  assert.equal(payload.metadata.practiceNote, WEEK_1_NOTE);
  assert.deepEqual(payload.metadata.composition, {
    newMaterialItemTarget: 10,
    reviewMaterialItemTarget: 0,
    totalItemTarget: 10
  });
  assert.ok(payload.questions.every((question) => question.metadata.sourceMaterial === "new"));
  assert.ok(payload.questions.every((question) => question.metadata.sourceDrugQuizWeek === 1));
  assert.ok(!JSON.stringify(payload).includes("accessPharmacySortingCategory"));
});

test("Week 2 and Week 3 launch composition excludes future material", () => {
  for (const quizWeek of [2, 3]) {
    const payload = build(quizWeek);
    const newQuestions = payload.questions.filter((question) => question.metadata.sourceMaterial === "new");
    const reviewQuestions = payload.questions.filter((question) => question.metadata.sourceMaterial === "review");
    assert.equal(newQuestions.length, 6);
    assert.equal(reviewQuestions.length, 4);
    assert.ok(newQuestions.every((question) => question.metadata.sourceDrugQuizWeek === quizWeek));
    assert.ok(reviewQuestions.every((question) => question.metadata.sourceDrugQuizWeek < quizWeek));
    assert.ok(payload.questions.every((question) => question.metadata.sourceDrugQuizWeek <= quizWeek));
  }

  const week2 = build(2);
  assert.ok(week2.questions
    .filter((question) => question.metadata.sourceMaterial === "review")
    .every((question) => question.metadata.sourceDrugQuizWeek === 1));
});

test("the launcher preserves deterministic generator output for a supplied seed", () => {
  assert.deepEqual(build(3, "reproducible-launch"), build(3, "reproducible-launch"));
  assert.notDeepEqual(
    build(3, "reproducible-launch").questions,
    build(3, "another-launch").questions
  );
});

test("a launched multiple-brand FITB keeps strict scoring and accepted answers through the runtime and review queue", () => {
  const payload = build(1, "dilt-diverse-3");
  const launchedQuestion = payload.questions.find((question) => (
    question.metadata?.knowledgeDomain === "brandGeneric"
    && [question.answer, ...(question._acceptedAnswers || [])].includes("Dilt-XR")
  ));
  assert.ok(launchedQuestion, "controlled launch must contain the multiple-brand Diltiazem FITB");
  assert.ok(launchedQuestion._acceptedAnswers.includes("Dilt-XR"));
  assert.deepEqual(launchedQuestion.metadata.answerMatching, {
    spellingSensitive: true,
    capitalizationSensitive: false
  });

  let reviewProjection;
  const storage = createStorageStub({ "pharmlet.review-queue": "[]" });
  const engine = loadEngine({
    localStorage: storage,
    PharmletReviewQueueStore: {
      mergeMissedEntries(_existing, entries) {
        reviewProjection = JSON.parse(JSON.stringify(entries));
        return entries;
      }
    }
  });
  const normalized = engine.normalizeLoadedQuizQuestion(launchedQuestion);
  assert.equal(engine.evaluateAnswerForQuestion(normalized, "dilt-xr"), true);
  assert.equal(engine.evaluateAnswerForQuestion(normalized, "DiltXR"), false);

  engine.saveMissedQuestionsToReviewQueue([{
    ...normalized,
    _answered: true,
    _correct: false,
    _user: "DiltXR"
  }]);
  assert.deepEqual(reviewProjection[0].metadata.answerMatching, launchedQuestion.metadata.answerMatching);
  assert.deepEqual(reviewProjection[0]._acceptedAnswers, launchedQuestion._acceptedAnswers);
});

test("homepage exposes direct Fall launches while preserving every legacy study href", () => {
  const homepage = readFileSync(path.join(repoRoot, "index.html"), "utf8");
  for (const href of LEGACY_HOME_HREFS) {
    assert.ok(homepage.includes(`href="${href}"`), `homepage lost legacy link ${href}`);
  }
  for (const quizWeek of [1, 2, 3]) {
    assert.ok(homepage.includes(`href="lab3-fall-2026.html?week=${quizWeek}"`));
  }
  assert.ok(homepage.includes('href="lab3-fall-2026.html"'));
  assert.ok(homepage.includes("P1 &amp; Spring 2026 Study Library"));
});

test("Fall UI contains no copied drug facts and does not route through the legacy master pool", () => {
  const page = readFileSync(path.join(repoRoot, "lab3-fall-2026.html"), "utf8");
  const launcher = readFileSync(path.join(repoRoot, "assets", "js", "fall-2026-lab3-launcher.js"), "utf8");
  const uiSource = `${page}\n${launcher}`;

  assert.ok(!launcher.includes("master_pool.json"));
  assert.ok(page.includes(WEEK_1_NOTE));
  for (const drug of drugData.drugs) {
    assert.ok(!uiSource.includes(drug.genericName), `UI hardcodes generic ${drug.genericName}`);
    for (const brandName of drug.brandNames) {
      assert.ok(!uiSource.includes(brandName), `UI hardcodes brand ${brandName}`);
    }
  }
});

test("legacy Lab II routes and runtime selectors remain byte-present", () => {
  const homepage = readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const engine = readFileSync(path.join(repoRoot, "assets", "js", "quizEngine.js"), "utf8");
  assert.ok(homepage.includes('href="quiz.html?week=1"'));
  assert.ok(homepage.includes('href="quiz.html?week=1&lab=1"'));
  assert.ok(engine.includes('const weekParam = parseInt(params.get("week")'));
  assert.ok(engine.includes('fullPool = await smartFetch("master_pool.json")'));
});
