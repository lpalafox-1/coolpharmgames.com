import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";
import {
  buildFall2026Lab3Payload,
  launchFall2026Lab3Practice
} from "../assets/js/fall-2026-lab3-launcher.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drugData = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-p2-top-drugs.json"), "utf8")
);
const policy = JSON.parse(
  readFileSync(path.join(repoRoot, "assets", "data", "fall-2026-lab3-quiz-policy.json"), "utf8")
);

const WEEK_1_NOTE = "Practice configuration: Week 1 has no prior review material. This 10-question study set uses Week 1 content only and is not intended to claim the exact official Week 1 quiz composition.";
const FALL_LAB3_WEEKS = Array.from({ length: 10 }, (_, index) => index + 1);
const FALL_UI_BASELINES = Object.freeze({
  drugData: "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01",
  policy: "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171",
  generator: "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a",
  launcher: "e62430108dde5a88ce67a9f9be815ae93c48a93b1b4c61290968fd36bdb8d360"
});

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
  "#lab2-series",
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

function sectionBetween(homepage, startId, endId) {
  const startMarker = `id="${startId}"`;
  const start = homepage.indexOf(startMarker);
  assert.notEqual(start, -1, `homepage is missing #${startId}`);
  if (!endId) return homepage.slice(start);

  const end = homepage.indexOf(`id="${endId}"`, start + startMarker.length);
  assert.notEqual(end, -1, `homepage is missing #${endId}`);
  return homepage.slice(start, end);
}

function hrefsIn(source) {
  return [...source.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

function htmlText(source) {
  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cardForWeek(page, quizWeek) {
  const openingTagPattern = new RegExp(
    `<article\\b(?=[^>]*\\bid="week-${quizWeek}")(?=[^>]*\\bdata-week-card="${quizWeek}")[^>]*>`,
    "i"
  );
  const openingTag = openingTagPattern.exec(page);
  assert.ok(openingTag, `hub is missing the unified Week ${quizWeek} card`);
  const end = page.indexOf("</article>", openingTag.index + openingTag[0].length);
  assert.notEqual(end, -1, `Week ${quizWeek} card is not closed`);
  return page.slice(openingTag.index, end + "</article>".length);
}

function sha256File(relativePath) {
  return createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
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

test("Weeks 1-10 launch payloads use the existing generated-quiz runtime contract", () => {
  for (const quizWeek of FALL_LAB3_WEEKS) {
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
    assert.ok(payload.questions.every((question) => question.answer !== undefined && question.answer !== ""));
  }
});

test("the student launcher persists and routes every intended Week 1-10 payload", async () => {
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = createStorageStub();
  let assignedUrl = "";

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { assign(url) { assignedUrl = url; } } }
  });

  try {
    for (const quizWeek of FALL_LAB3_WEEKS) {
      assignedUrl = "";
      const payload = await launchFall2026Lab3Practice(quizWeek, {
        drugData,
        policy,
        seed: `persisted-launch-week-${quizWeek}`
      });
      const persisted = JSON.parse(storage.getItem("pharmlet.custom-quiz"));

      assert.deepEqual(persisted, payload);
      assert.equal(persisted.metadata.quizWeek, quizWeek);
      assert.equal(persisted.questions.length, 10);
      assert.equal(assignedUrl, "quiz.html?id=custom-quiz");
    }
  } finally {
    if (previousLocalStorage) Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
    else delete globalThis.localStorage;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
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

test("Weeks 2-10 launch composition is 6-new/4-review and excludes later material", () => {
  for (const quizWeek of FALL_LAB3_WEEKS.slice(1)) {
    const payload = build(quizWeek);
    const newQuestions = payload.questions.filter((question) => question.metadata.sourceMaterial === "new");
    const reviewQuestions = payload.questions.filter((question) => question.metadata.sourceMaterial === "review");
    assert.deepEqual(payload.metadata.composition, {
      newMaterialItemTarget: 6,
      reviewMaterialItemTarget: 4,
      totalItemTarget: 10
    });
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
  for (const quizWeek of FALL_LAB3_WEEKS) {
    assert.deepEqual(
      build(quizWeek, `reproducible-launch-${quizWeek}`),
      build(quizWeek, `reproducible-launch-${quizWeek}`)
    );
  }
});

test("Weeks 1-10 preserve strict Brand/Generic FITB metadata through activation", () => {
  for (const quizWeek of FALL_LAB3_WEEKS) {
    let launchedQuestion;
    for (let attempt = 0; attempt < 40 && !launchedQuestion; attempt += 1) {
      launchedQuestion = build(quizWeek, `activation-fitb-${quizWeek}-${attempt}`).questions.find((question) => (
        question.metadata?.knowledgeDomain === "brandGeneric"
        && question.type === "short"
      ));
    }

    assert.ok(launchedQuestion, `Week ${quizWeek} activation samples must include a strict Brand/Generic FITB`);
    assert.deepEqual(launchedQuestion.metadata.answerMatching, {
      spellingSensitive: true,
      capitalizationSensitive: false
    });
    assert.match(launchedQuestion.answer, /\S/);
    if (launchedQuestion._acceptedAnswers !== undefined) {
      assert.ok(Array.isArray(launchedQuestion._acceptedAnswers));
      assert.ok(launchedQuestion._acceptedAnswers.length >= 1);
      assert.ok(launchedQuestion._acceptedAnswers.every((answer) => typeof answer === "string" && answer.length > 0));
    }
  }
});

test("a launched multiple-brand FITB keeps strict scoring and accepted answers through the runtime and review queue", () => {
  const payload = build(1, "dilt-fitb-8");
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
  assert.ok(homepage.includes("P1 Spring 2026"));
  assert.ok(homepage.includes("P1 Fall 2025"));
});

test("Fall Lab III hub exposes ten unified visible week cards with ten native launch buttons", () => {
  const page = readFileSync(path.join(repoRoot, "lab3-fall-2026.html"), "utf8");
  const cardTags = [...page.matchAll(/<article\b[^>]*\bdata-week-card="(\d+)"[^>]*>/g)];
  const launchButtons = [...page.matchAll(/<button\b[^>]*\bdata-launch-week="(\d+)"[^>]*>/g)];
  const cardWeeks = cardTags.map((match) => Number(match[1]));
  const launchWeeks = launchButtons
    .map((match) => Number(match[1]));

  assert.deepEqual(cardWeeks, FALL_LAB3_WEEKS);
  assert.deepEqual(launchWeeks, FALL_LAB3_WEEKS);
  for (const quizWeek of FALL_LAB3_WEEKS) {
    const card = cardForWeek(page, quizWeek);
    const openingTag = card.slice(0, card.indexOf(">") + 1);
    const matchingButtons = [...card.matchAll(new RegExp(
      `<button\\b[^>]*\\bdata-launch-week="${quizWeek}"[^>]*>`,
      "g"
    ))];

    assert.equal(matchingButtons.length, 1, `Week ${quizWeek} needs one native launch button`);
    assert.match(htmlText(card), new RegExp(`\\bWeek ${quizWeek}\\b`));
    assert.match(htmlText(card), new RegExp(`Start Week ${quizWeek}`));
    assert.doesNotMatch(openingTag, /\bhidden\b|aria-hidden="true"/i);
    assert.doesNotMatch(matchingButtons[0][0], /\sdisabled(?:\s|=|>)/i);
    assert.doesNotMatch(matchingButtons[0][0], /aria-disabled="true"/i);
  }
});

test("the unified cards communicate Week 1 and Weeks 2-10 practice structure without second-class future-week noise", () => {
  const page = readFileSync(path.join(repoRoot, "lab3-fall-2026.html"), "utf8");
  const week1 = htmlText(cardForWeek(page, 1));

  assert.match(week1, /10 Questions/);
  assert.match(week1, /Week 1 Content/);
  assert.match(week1, /Practice (?:Configuration|setup)/i);
  assert.match(week1, /no prior(?:-| )week review/i);
  assert.match(week1, /not[^.]{0,100}official[^.]{0,100}composition/i);
  assert.doesNotMatch(week1, /6 New|4 Review/);
  assert.ok(!page.includes(WEEK_1_NOTE), "hub should use concise Week 1 wording instead of the full payload note");

  for (const quizWeek of FALL_LAB3_WEEKS.slice(1)) {
    const card = cardForWeek(page, quizWeek);
    const text = htmlText(card);
    assert.match(text, /10 Questions/, `Week ${quizWeek} must show its question count`);
    assert.match(text, /6 New • 4 Review/, `Week ${quizWeek} must show the shared composition`);
  }

  for (const quizWeek of FALL_LAB3_WEEKS.slice(3)) {
    const card = cardForWeek(page, quizWeek);
    assert.doesNotMatch(
      htmlText(card),
      /study[- ]ahead|future quiz|coming soon|not available|unavailable/i,
      `Week ${quizWeek} must not carry repetitive future-week labeling`
    );
  }
  assert.doesNotMatch(page, /study-ahead-launch|id="study-ahead-heading"|id="study-ahead-note"/i);
});

test("the hub uses one concise future-practice note and keeps Top Drugs Reference secondary but reachable", () => {
  const page = readFileSync(path.join(repoRoot, "lab3-fall-2026.html"), "utf8");
  const noteMatches = [...page.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="semester-practice-note"[^>]*>([\s\S]*?)<\/\1>/gi)];

  assert.equal(noteMatches.length, 1, "hub needs one shared semester practice note");
  const note = htmlText(noteMatches[0][2]);
  assert.match(note, /All Fall weeks are available for Pharm-let practice/i);
  assert.match(
    note,
    /Future-week sets (?:use|follow) the official course (?:drug list|source) and current practice rules/i
  );
  assert.match(
    note,
    /(?:not intended to reproduce|not predictions? of) exact (?:future )?professor wording/i
  );
  assert.ok(note.length <= 300, "future-practice guidance should stay concise");
  assert.ok(page.includes('href="top-drugs-quicksheet.html"'));
  assert.match(page, /Top Drugs Reference/);
  assert.doesNotMatch(
    page,
    /(?:will|does|is intended to)\s+(?:match|reproduce)\s+exact future professor|guarantees?\s+exact future professor/i
  );
});

test("the F26-08 presentation-only change preserves launch wiring, cache tokens, generator, and canonical sources", () => {
  const page = readFileSync(path.join(repoRoot, "lab3-fall-2026.html"), "utf8");
  const launcher = readFileSync(
    path.join(repoRoot, "assets", "js", "fall-2026-lab3-launcher.js"),
    "utf8"
  );

  assert.ok(page.includes('src="assets/js/fall-2026-lab3-launcher.js?v=20260904a"'));
  assert.ok(launcher.includes('from "./fall-2026-quiz-generator.js?v=20260827a"'));
  assert.ok(launcher.includes('window.location.assign("quiz.html?id=custom-quiz")'));
  assert.ok(launcher.includes('document.querySelectorAll("[data-launch-week]")'));
  assert.deepEqual({
    drugData: sha256File("assets/data/fall-2026-p2-top-drugs.json"),
    policy: sha256File("assets/data/fall-2026-lab3-quiz-policy.json"),
    generator: sha256File("assets/js/fall-2026-quiz-generator.js"),
    launcher: sha256File("assets/js/fall-2026-lab3-launcher.js")
  }, FALL_UI_BASELINES);
});

test("homepage prioritizes current P2 Lab III and labels Weeks 4-10 as study-ahead practice", () => {
  const homepage = readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const current = sectionBetween(homepage, "current-semester", "study-tools");
  const fallWeeks = [...homepage.matchAll(/href="lab3-fall-2026\.html\?week=(\d+)"/g)]
    .map((match) => Number(match[1]));

  assert.match(current, /P2 Fall 2026/);
  assert.match(current, /Lab III/);
  assert.match(current, /Top Drugs Reference/);
  assert.ok(current.includes('href="lab3-fall-2026.html"'));
  assert.ok(current.includes('href="top-drugs-quicksheet.html"'));
  assert.deepEqual([...new Set(fallWeeks)].sort((a, b) => a - b), [1, 2, 3]);
  assert.doesNotMatch(current, /lab3-fall-2026\.html\?week=(?:4|5|6|7|8|9|10)/);
  assert.match(current, /Weeks 1–10/);
  assert.match(current, /Week 1 is a practice configuration/);
  assert.match(current, /not a claim about official quiz composition/);
  assert.match(current, /Weeks 2–10 use 6 new \+ 4 cumulative review/);
  assert.match(current, /Weeks 4–10.*study[- ]ahead/i);
});

test("homepage separates primary study tools, quiet utilities, and chronological P1 coursework", () => {
  const homepage = readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const current = sectionBetween(homepage, "current-semester", "study-tools");
  const primaryTools = sectionBetween(homepage, "study-tools", "utilities");
  const utilities = sectionBetween(homepage, "utilities", "previous-coursework");
  const previous = sectionBetween(homepage, "previous-coursework", "upcoming-planned");
  const spring = sectionBetween(previous, "p1-spring-2026", "p1-fall-2025");
  const fall = sectionBetween(previous, "p1-fall-2025");

  for (const href of ["review-queue.html", "stats.html", "favorites.html", "study-timer.html", "custom-quiz.html"]) {
    assert.ok(hrefsIn(primaryTools).includes(href), `primary tools are missing ${href}`);
  }
  assert.ok(!current.includes("top-drugs-integrity.html"));
  assert.ok(!primaryTools.includes("top-drugs-integrity.html"));
  assert.ok(utilities.includes('href="top-drugs-integrity.html"'));
  assert.ok(utilities.includes('data-tool-tier="diagnostic"'));
  assert.ok(homepage.indexOf('id="p1-spring-2026"') < homepage.indexOf('id="p1-fall-2025"'));
  assert.ok(spring.includes('href="quiz.html?id=ceutics2-final"'));
  assert.ok(spring.includes('href="quiz.html?week=11"'));
  assert.ok(spring.includes('id="lab2-series"'));
  assert.ok(fall.includes('href="quiz.html?id=ceutics-practice-1"'));
  assert.ok(fall.includes('href="quiz.html?id=top-drugs-final-mockE"'));
});

test("homepage keeps compact navigation, planned-content, count, touch-target, and dark-mode contracts", () => {
  const homepage = readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const planned = sectionBetween(homepage, "upcoming-planned");
  const menuStart = homepage.indexOf('id="menu"');

  for (const href of ["#current-semester", "#study-tools", "#previous-coursework"]) {
    assert.ok(homepage.includes(`href="${href}"`), `section navigation is missing ${href}`);
    assert.ok(
      homepage.indexOf(`href="${href}"`) > menuStart,
      `${href} navigation must follow the welcome gate's #menu visibility contract`
    );
  }
  assert.equal(hrefsIn(planned).length, 0, "planned content must not expose launch links");
  assert.match(planned, /No launches yet/);
  assert.match(homepage, /1,723 practice questions/);
  assert.match(homepage, /static quiz library/);
  assert.match(homepage, /\.home-nav-link\{[^}]*min-height:44px/);
  assert.match(homepage, /\.home-link\{[^}]*min-height:44px/);
  assert.match(homepage, /tailwind\.config = \{ darkMode: "class" \}/);
  assert.ok(homepage.includes('id="theme-toggle"'));
  assert.ok(homepage.includes('id="theme-label"'));
  assert.ok(homepage.includes("dark:text-rose-200"));
  assert.ok(homepage.includes('src="assets/js/home.js?v=20260429a"'));
});

test("Fall UI contains no copied drug facts and does not route through the legacy master pool", () => {
  const page = readFileSync(path.join(repoRoot, "lab3-fall-2026.html"), "utf8");
  const launcher = readFileSync(path.join(repoRoot, "assets", "js", "fall-2026-lab3-launcher.js"), "utf8");
  const uiSource = `${page}\n${launcher}`;

  assert.ok(!launcher.includes("master_pool.json"));
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
