import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateFall2026Quiz, buildQuestionCandidates, materializeQuestionCandidate, createSeededRng } from "../assets/js/fall-2026-quiz-generator.js";
import { buildFall2026Lab3Payload, buildFall2026WeekFocusPayload } from "../assets/js/fall-2026-lab3-launcher.js";
import { buildFall2026AdaptivePayload } from "../assets/js/fall-2026-adaptive-practice.js";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const engine = loadBrowserGlobal("assets/js/quizEngine.js", {
  document: { addEventListener() {}, createElement() { return { innerHTML: "" }; } },
  location: { search: "?id=custom-quiz", href: "" },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }
});

function checkDisplay(question, counts) {
  const { prompt, ...canonical } = question;
  assert.equal(JSON.stringify(canonical).includes("®"), false, `${question.id}: answers, choices, metadata stay plain`);
  const brand = question.metadata.sourceBrandName || (question.metadata.stemReference?.type === "brand" && question.metadata.stemReference.brandName);
  if (brand) {
    assert.ok(prompt.includes(`<b>${escapeHtml(brand)}®</b>`), question.id);
    assert.equal((prompt.match(/®/g) || []).length, 1, question.id);
    counts.brand += 1;
  } else {
    assert.equal(prompt.includes("®"), false, `${question.id}: generic/fact prompts stay unchanged`);
    counts.generic += 1;
  }
  if (question.metadata.knowledgeDomain !== "brandGeneric") return;
  const kind = question.metadata.brandGenericDirection === "genericToBrand" ? "genericToBrand" : question.type === "short" ? "fitb" : "recognition";
  counts[kind] += 1;
  assert.equal(engine.evaluateAnswerForQuestion(question, question.answer), true, question.id);
  for (const accepted of question._acceptedAnswers || []) {
    assert.equal(engine.evaluateAnswerForQuestion(question, accepted), true, `${question.id}: ${accepted}`);
  }
  assert.equal(engine.evaluateAnswerForQuestion(question, "definitely wrong"), false, question.id);
  if (kind === "genericToBrand") {
    // The visual cue is never required (or added as an accepted answer).
    assert.equal(engine.evaluateAnswerForQuestion(question, `${question.answer}®`), false, question.id);
    assert.equal(engine.evaluateAnswerForQuestion(question, question.answer.toLowerCase()), true, question.id);
  }
}

function corpus(generate = generateFall2026Quiz) {
  const outputs = [];
  for (const mode of ["standard", "week-focus"]) {
    for (let quizWeek = 1; quizWeek <= 10; quizWeek += 1) {
      for (let index = 0; index < 20; index += 1) {
        outputs.push(generate({ drugData, policy, quizWeek, seed: `brand-display-${mode}-${quizWeek}-${index}`,
          ...(mode === "week-focus" ? { mode, questionCount: 10 } : quizWeek === 1 ? { mode: "practice", questionCount: 10 } : {}) }));
      }
    }
  }
  return outputs;
}

const generated = corpus();

test("shared generator displays brand stems and both brand-to-generic forms with ® while grading stays plain", () => {
  const counts = { brand: 0, generic: 0, fitb: 0, recognition: 0, genericToBrand: 0 };
  for (const quiz of generated) for (const question of quiz.questions) checkDisplay(question, counts);
  for (const [kind, count] of Object.entries(counts)) assert.ok(count > 0, `corpus must exercise ${kind}`);
});

test("brand rendering escapes HTML without mutating the canonical source reference", () => {
  const fixture = structuredClone(drugData);
  const drug = fixture.drugs.find((entry) => entry.quizWeek === 8);
  drug.brandNames = ['A&B <Brand> "Name"'];
  const candidate = buildQuestionCandidates({ drugData: fixture, policy, quizWeek: 8, materialType: "new" })
    .find((entry) => entry.sourceDrugId === drug.id && entry.domainId === "brandGeneric");
  const result = materializeQuestionCandidate({ candidate, drugData: fixture, policy, rng: () => 0 });
  assert.equal(result.status, "materialized");
  assert.equal(result.question.prompt, 'What is the generic name of <b>A&amp;B &lt;Brand&gt; &quot;Name&quot;®</b>?');
  assert.equal(result.question.metadata.sourceBrandName, drug.brandNames[0]);
  assert.equal(result.question.answer, drug.genericName);
});

test("400 seeded sets preserve every non-presentation field from pre-change main", () => {
  const normalized = generated.map((quiz) => ({ ...quiz, questions: quiz.questions.map((question) => (({ prompt, ...canonical }) => canonical)(question)) }));
  // Captured from main 3c047c83 before this change, with the same corpus.
  assert.equal(createHash("sha256").update(JSON.stringify(normalized)).digest("hex"), "c181ea82c6ed3b662f3ee7369268892bd8acc867aae22f3c47bc5bf79aa88c9e");
});

test("Adaptive Week 8, Standard Weekly, and Week Focus inherit the shared display convention", () => {
  for (const [mode, build] of [
    ["adaptive", (seed) => buildFall2026AdaptivePayload({ drugData, policy, targetWeek: 8, seed, now: 0 })],
    ["standard", (seed) => buildFall2026Lab3Payload({ drugData, policy, quizWeek: 8, seed })],
    ["week-focus", (seed) => buildFall2026WeekFocusPayload({ drugData, policy, quizWeek: 8, seed })]
  ]) {
    const counts = { brand: 0, generic: 0, fitb: 0, recognition: 0, genericToBrand: 0 };
    for (let index = 0; index < 6; index += 1) {
      const payload = build(`brand-display-${mode}-8-${index}`);
      assert.equal(payload.questions.length, 10);
      if (mode === "adaptive") {
        assert.equal(payload.metadata.adaptive.composition.currentItemCount, 6);
        assert.equal(payload.metadata.adaptive.composition.reviewItemCount, 4);
        assert.equal(payload.metadata.adaptive.composition.fallback, false);
      } else {
        assert.equal(payload.metadata.composition.newMaterialItemTarget, mode === "week-focus" ? 10 : 6);
        assert.equal(payload.metadata.composition.reviewMaterialItemTarget, mode === "week-focus" ? 0 : 4);
      }
      for (const question of payload.questions) checkDisplay(question, counts);
    }
    assert.ok(counts.brand > 0, `${mode} Week 8 must surface ®`);
  }
});


test("Boss Remix preserves decorated prompts from its fresh shared-generator practice material", () => {
  const counts = { brand: 0, generic: 0, fitb: 0, recognition: 0, genericToBrand: 0 };
  for (let index = 0; index < 10; index += 1) {
    const practicePayload = buildFall2026Lab3Payload({ drugData, policy, quizWeek: 8, seed: `brand-display-remix-${index}` });
    const payload = engine.buildFallLab3BossRemixPayload({
      request: { quizWeek: 8, remixGeneration: 1, targetSize: 6, focusDomains: ["brandGeneric"], chainQuestionIds: [], fallbackQuestions: [] },
      practicePayload,
      createdAt: 0
    });
    assert.ok(payload);
    assert.equal(payload.metadata.kind, "fall-2026-lab3-boss-remix");
    for (const question of payload.questions) {
      const source = practicePayload.questions.find((entry) => entry.id === question.id);
      assert.ok(source, "remix uses fresh generated questions");
      assert.equal(question.prompt, source.prompt);
      checkDisplay(question, counts);
    }
  }
  assert.ok(counts.brand > 0, "remix must exercise a brand prompt");
});

test("all generator entry points and the Week Focus continuation use the refreshed cache chain", () => {
  const launcher = read("assets/js/fall-2026-lab3-launcher.js");
  const adaptive = read("assets/js/fall-2026-adaptive-practice.js");
  for (const parent of [launcher, adaptive]) assert.match(parent, /fall-2026-quiz-generator\.js\?v=20261006b/);
  assert.match(launcher, /fall-2026-adaptive-practice\.js\?v=20261006b/);
  assert.match(read("lab3-fall-2026.html"), /fall-2026-lab3-launcher\.js\?v=20261006b/);
  assert.match(read("assets/js/quizEngine.js"), /new URL\("assets\/js\/fall-2026-lab3-launcher\.js\?v=20261006b"/);
  assert.match(read("quiz.html"), /quizEngine\.js\?v=20261006b/);
});

test("student stems use natural wording without visible source-audit language", () => {
  const forwardPrefixes = {
    drugClass: "What is the drug class of ",
    fdaIndication: "Which full list of FDA-approved indications is associated with ",
    mechanismOfAction: "What is the mechanism of action of ",
    topAdverseReactions: "Which full list of adverse reactions is associated with ",
    boxWarning: "What boxed warning is associated with "
  };
  const seenDomains = new Set();
  let singleIndicationCount = 0;
  for (const quiz of generated) for (const question of quiz.questions) {
    assert.doesNotMatch(question.prompt, /Fall source|recorded (?:in|for)|boxed-warning value/i, question.id);
    if (question.metadata.brandGenericDirection === "brandToGeneric") {
      assert.equal(question.prompt, `What is the generic name of <b>${escapeHtml(question.metadata.sourceBrandName)}®</b>?`);
    }
    if (question.metadata.questionVariant === "brandToFdaIndicationRecognition") {
      assert.ok(question.prompt.startsWith("Which is an FDA-approved indication for "));
      singleIndicationCount += 1;
    } else if (question.metadata.stemReference) {
      const domain = question.metadata.knowledgeDomain;
      assert.ok(question.prompt.startsWith(forwardPrefixes[domain]), question.id);
      seenDomains.add(domain);
    }
    if (question.metadata.questionVariant === "identifyDrugByStructuredValue") {
      assert.ok(question.prompt.startsWith("Which drug has this "), question.id);
    }
  }
  assert.equal(seenDomains.size, 5, "exercise all forward domains, including full-list fallbacks");
  // The calibrated corpus prefers atomic inverse forms; exercise the raw
  // structured inverse fallback explicitly as well.
  const atenolol = drugData.drugs.find((drug) => drug.genericName === "Atenolol");
  const candidate = buildQuestionCandidates({ drugData, policy, quizWeek: 3, materialType: "new" })
    .find((entry) => entry.sourceDrugId === atenolol.id && entry.domainId === "drugClass");
  const inverse = materializeQuestionCandidate({ candidate, drugData, policy, rng: createSeededRng("amb-20") });
  assert.equal(inverse.question.metadata.questionVariant, "identifyDrugByStructuredValue");
  assert.ok(inverse.question.prompt.startsWith("Which drug has this pharmacologic class?"));
  assert.doesNotMatch(inverse.question.prompt, /Fall source|recorded/i);
  assert.ok(singleIndicationCount > 0);
});
