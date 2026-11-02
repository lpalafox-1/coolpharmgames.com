import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { generateFall2026Quiz, buildQuestionCandidates, materializeQuestionCandidate, createSeededRng } from "../assets/js/fall-2026-quiz-generator.js";
import { buildFall2026Lab3Payload, buildFall2026WeekFocusPayload } from "../assets/js/fall-2026-lab3-launcher.js";
import { buildFall2026AdaptivePayload, getQuestionFingerprint, getPerformanceKey, buildAdaptiveSignals } from "../assets/js/fall-2026-adaptive-practice.js";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const engine = loadBrowserGlobal("assets/js/quizEngine.js", {
  document: { addEventListener() {}, createElement() { return {
    innerHTML: "", get textContent() { return this.innerHTML.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '\"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"); }
  }; } },
  location: { search: "?id=custom-quiz", href: "" },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  fetch: async () => ({ ok: true, json: async () => drugData })
});

function checkDisplay(question, counts) {
  const before = JSON.stringify(question);
  const prompt = engine.getFallLab3StudentFacingPromptHtml(question);
  const canonical = question;
  assert.equal(JSON.stringify(question), before, "rendering must not mutate any question field");
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

// Actual pre-PR main surfaces, captured before the renderer rework. Keeping
// these literal prompts makes returning-data coverage independent of display.
const legacySurfaces = [
  ["Brand → Generic FITB", "What is the generic for <b>Vasotec</b>?", "Enalapril"],
  ["Brand → Generic recognition", "What is the generic for <b>Altace</b>?", "Ramipril"],
  ["Drug → Class", "What class does the Fall source list for <b>Diltiazem</b>?", "Non-Dihydropyridine Calcium Channel Blocker"],
  ["Drug → MOA", "What is the MOA of <b>Bisoprolol</b>?", "Selectively blocks beta1-adrenergic receptors in the heart, decreasing heart rate and contractility."],
  ["Drug → Boxed Warning", "Which boxed warning is listed for <b>Chlorthalidone</b>?", "none"],
  ["Drug → full FDA indication list", "Which complete FDA indication list is recorded for <b>Irbesartan</b>?", "Hypertension; Diabetic nephropathy"],
  ["Brand → one FDA indication", "Which of the following is an FDA indication for <b>Lotensin</b>?", "Hypertension"],
  ["Drug → full top ADR list", "Which full top ADR list is recorded for <b>Chlorthalidone</b>?", "Dizziness; Hypotension; Hyperuricemia"],
  ["structured inverse class", "Which drug is paired with this pharmacologic class in the Fall source?<br><b>β-Adrenergic Blocker, Cardioselective</b>", "Atenolol"]
];

function currentSurfaceQuestions() {
  // Historical literal fixtures stay reviewable even when new generation no
  // longer permits their forms. Do not require the current generator to emit them.
  return legacySurfaces.map(([surface, prompt, answer]) => {
    const drug = drugData.drugs.find(d => prompt.includes(`<b>${d.genericName}</b>`)
      || d.brandNames.some(brand => prompt.includes(`<b>${brand}</b>`)))
      || drugData.drugs.find(d => d.genericName === answer);
    assert.ok(drug, surface);
    const brand = drug.brandNames.find(brand => prompt.includes(`<b>${brand}</b>`));
    const domain = surface.includes('Generic') ? 'brandGeneric' : surface.includes('Class') || surface.includes('class') ? 'drugClass' : surface.includes('MOA') ? 'mechanismOfAction' : surface.includes('FDA') ? 'fdaIndication' : surface.includes('ADR') ? 'topAdverseReactions' : 'boxWarning';
    const question = { id: 'historical-'+surface, prompt, answer,
      type: surface === 'Brand → Generic FITB' ? 'short' : 'mcq',
      metadata: { generatorId: 'fall-2026-p2-lab3-deterministic-generator', knowledgeDomain: domain,
        requestedQuizWeek: drug.quizWeek, sourceDrugId: drug.id, sourceDrugQuizWeek: drug.quizWeek,
        ...(brand ? { sourceBrandName: brand, brandGenericDirection: domain === 'brandGeneric' ? 'brandToGeneric' : undefined,
          stemReference: { type: 'brand', brandName: brand } } : { stemReference: { type: 'generic' } })
      }
    };
    return {surface, legacy: {prompt,answer}, question};
  });
}

test("all nine returning Adaptive and Review Queue surfaces preserve main identity and merge evidence", () => {
  const store = loadBrowserGlobal("assets/js/review-queue-store.js").PharmletReviewQueueStore;
  const now = Date.parse("2026-10-06T23:30:00Z");
  for (const { surface, legacy, question } of currentSurfaceQuestions()) {
    const before = JSON.stringify(question);
    const record = (value) => ({ ...value, quizId: `fall-2026-lab3-week-${question.metadata.requestedQuizWeek}-practice`, type: question.type,
      userAnswer: "diagnostic wrong", timestamp: new Date(now).toISOString() });
    const saved = store.mergeMissedEntries([], [record(legacy)]);
    const savedBytes = JSON.stringify(saved);
    const memory = { version: 1, rounds: [{ at: now, targetWeek: question.metadata.requestedQuizWeek,
      fingerprints: [getQuestionFingerprint(legacy)], conceptKeys: [] }], updatedAt: now };
    const memoryBytes = JSON.stringify(memory);
    const signals = buildAdaptiveSignals({ reviewEntries: saved, memory, now });
    assert.equal(getQuestionFingerprint(question), getQuestionFingerprint(legacy), surface);
    assert.ok(signals.byPerformanceKey.has(getPerformanceKey(question)), surface);
    assert.ok(signals.exposure.fingerprints.has(getQuestionFingerprint(question)), surface);
    const display = engine.getFallLab3StudentFacingPromptHtml(question);
    assert.notEqual(display, legacy.prompt, `${surface}: only visible HTML changes`);
    assert.equal(getQuestionFingerprint(question), getQuestionFingerprint(legacy), `${surface}: rendering leaves identity intact`);
    const next = store.mergeMissedEntries(saved, [record(question)]);
    assert.equal(next.length, 1, surface);
    assert.equal(next[0].key, saved[0].key, surface);
    assert.equal(next[0].missCount, 2, surface);
    const reviewed = store.applyReviewResults(saved, [{ ...record(question), correct: true }]);
    assert.equal(reviewed.length, 1, surface);
    assert.equal(reviewed[0].reviewCorrectCount, 1, surface);
    assert.equal(JSON.stringify(saved), savedBytes, "reads/rendering never mutate saved Queue input");
    assert.equal(JSON.stringify(memory), memoryBytes, "reads/rendering never mutate saved Adaptive memory");
    assert.equal(JSON.stringify(question), before, "display and evidence merging never mutate the original question");
  }
});

test("display-only ® cannot affect identity and duplicate-content protections still distinguish different facts", () => {
  const { question } = currentSurfaceQuestions()[0];
  const identity = getQuestionFingerprint(question);
  assert.match(engine.getFallLab3StudentFacingPromptHtml(question), /®/);
  assert.doesNotMatch(question.prompt, /®/);
  assert.equal(getQuestionFingerprint(question), identity);
  assert.equal(getQuestionFingerprint({ ...question, id: "a different positional id" }), identity);
  assert.notEqual(getQuestionFingerprint({ ...question, answer: "Ramipril" }), identity);
  assert.notEqual(getQuestionFingerprint({ ...question, prompt: "What is the generic for <b>Altace</b>?" }), identity);
});

test("metadata-free saved Review Queue playlists render using source identity without rewriting stored fields", async () => {
  await engine.loadFallLab3DisplayBrands();
  for (const { question } of currentSurfaceQuestions()) {
    const playlistQuestion = { type: question.type, prompt: question.prompt, answer: question.answer, choices: question.choices,
      sourceQuizId: `fall-2026-lab3-week-${question.metadata.requestedQuizWeek}-practice` };
    const before = JSON.stringify(playlistQuestion);
    assert.equal(engine.getFallLab3StudentFacingPromptHtml(playlistQuestion), engine.getFallLab3StudentFacingPromptHtml(question));
    assert.equal(JSON.stringify(playlistQuestion), before);
  }
  const brandForward = generated.flatMap((quiz) => quiz.questions).find((question) => question.metadata.stemReference?.type === "brand"
    && question.metadata.questionVariant !== "brandToFdaIndicationRecognition");
  assert.ok(brandForward);
  const stripped = { ...brandForward, metadata: undefined, sourceQuizId: "fall-2026-lab3-week-8-adaptive" };
  assert.match(engine.getFallLab3StudentFacingPromptHtml(stripped), /®/);
  for (const question of generated.flatMap((quiz) => quiz.questions).filter((entry) => entry.metadata.stemReference?.type === "generic")) {
    assert.doesNotMatch(engine.getFallLab3StudentFacingPromptHtml({ ...question, metadata: undefined, sourceQuizId: "fall-2026-lab3-week-8-adaptive" }), /®/);
  }
});

test("saved attempt, retry, and missed-review rendering uses the display helper while autosaves retain main prompts", () => {
  const { question } = currentSurfaceQuestions()[0];
  const saved = JSON.parse(JSON.stringify(question));
  const promptNode = { innerHTML: "" };
  const writes = [];
  engine.document.getElementById = (id) => id === "prompt" ? promptNode : null;
  engine.document.querySelector = () => null;
  engine.document.querySelectorAll = () => [];
  engine.localStorage.setItem = (key, value) => writes.push([key, value]);
  engine.setTimeout = () => 1;
  engine.clearTimeout = () => {};
  engine.__saved = saved;
  vm.runInContext('state.questions = [__saved]; state.index = 0; state.progressKey = "saved-attempt-test"; render(); persistQuizProgress(true);', engine);
  assert.equal(promptNode.innerHTML, engine.getFallLab3StudentFacingPromptHtml(question));
  assert.equal(saved.prompt, question.prompt);
  assert.ok(writes.length > 0);
  assert.equal(JSON.parse(writes.at(-1)[1]).questions[0].prompt, question.prompt);
  const fresh = engine.buildFreshReviewRoundQuestions([{ ...saved, _answered: true, _correct: false }]);
  assert.equal(fresh[0].prompt, question.prompt);
  assert.equal(engine.getFallLab3StudentFacingPromptHtml(fresh[0]), promptNode.innerHTML);
});

test("non-Fall and unapproved atomic, pairwise, NOT/EXCEPT forms remain byte-identical on screen", () => {
  const metadata = { generatorId: "fall-2026-p2-lab3-deterministic-generator" };
  for (const prompt of [
    "Which adverse reaction is associated with <b>Atenolol</b>?",
    "Which adverse reaction is shared by <b>Atenolol</b> and <b>Bisoprolol</b>?",
    "Which adverse reaction is NOT associated with <b>Atenolol</b>?",
    "All are associated with <b>Atenolol</b> EXCEPT:",
    "What is the brand name for <b>Enalapril</b>?"
  ]) assert.equal(engine.getFallLab3StudentFacingPromptHtml({ prompt, metadata }), prompt);
  for (const { question } of currentSurfaceQuestions()) {
    assert.equal(engine.getFallLab3StudentFacingPromptHtml({ ...question, metadata: undefined, sourceQuizId: "lab-quiz1-antihypertensives" }), question.prompt);
  }
});

test("engine displays brand stems and both brand-to-generic forms with ® while canonical prompts and grading stay plain", () => {
  const counts = { brand: 0, generic: 0, fitb: 0, recognition: 0, genericToBrand: 0 };
  for (const quiz of generated) for (const question of quiz.questions) checkDisplay(question, counts);
  for (const [kind, count] of Object.entries(counts)) {
    if (kind === "recognition") assert.equal(count, 0, "new Brand/Generic is always FITB");
    else assert.ok(count > 0, `corpus must exercise ${kind}`);
  }
});

test("brand rendering escapes HTML without mutating the canonical source reference", () => {
  const fixture = structuredClone(drugData);
  const drug = fixture.drugs.find((entry) => entry.quizWeek === 8);
  drug.brandNames = ['A&B <Brand> "Name"'];
  const candidate = buildQuestionCandidates({ drugData: fixture, policy, quizWeek: 8, materialType: "new" })
    .find((entry) => entry.sourceDrugId === drug.id && entry.domainId === "brandGeneric");
  const result = materializeQuestionCandidate({ candidate, drugData: fixture, policy, rng: () => 0 });
  assert.equal(result.status, "materialized");
  assert.equal(result.question.prompt, 'Generic name for <b>A&B <Brand> "Name"</b>?');
  assert.equal(engine.getFallLab3StudentFacingPromptHtml(result.question), 'What is the generic name of <b>A&amp;B &lt;Brand&gt; &quot;Name&quot;®</b>?');
  assert.equal(result.question.metadata.sourceBrandName, drug.brandNames[0]);
  assert.equal(result.question.answer, drug.genericName);
});

test("allowed raw structured inverse class and full FDA templates render naturally without decorating facts", () => {
  for (const [domain, wording] of [
    ["drugClass", "Which drug has this pharmacologic class?"]
  ]) {
    let inverse;
    for (let week = 1; week <= 10 && !inverse; week += 1) {
      for (const candidate of buildQuestionCandidates({ drugData, policy, quizWeek: week, materialType: "new" }).filter((entry) => entry.domainId === domain)) {
        for (let seed = 0; seed < 10 && !inverse; seed += 1) {
          const result = materializeQuestionCandidate({ candidate, drugData, policy, rng: createSeededRng(`inverse-display-${seed}`) });
          if (result.question?.metadata.questionVariant === "identifyDrugByStructuredValue") inverse = result.question;
        }
        if (inverse) break;
      }
    }
    assert.ok(inverse, `exercise raw ${domain} inverse`);
    const before = JSON.stringify(inverse);
    assert.equal(engine.getFallLab3StudentFacingPromptHtml(inverse), `${wording}<br><b>${escapeHtml(inverse.metadata.displayedStructuredValue.value)}</b>`);
    assert.doesNotMatch(engine.getFallLab3StudentFacingPromptHtml(inverse), /®|Fall source|recorded/);
    assert.equal(JSON.stringify(inverse), before);
  }
});

test("400 seeded payloads reproduce the faculty-form policy revision deterministically", () => {
  // Repinned for the faculty-verbal form suppression; renderer remains presentation-only.
  assert.equal(createHash("sha256").update(JSON.stringify(generated)).digest("hex"), "8159f02566a09a03456c7af8cab04d720ad6636c196fdb3be5a97ef555507473");
});

test("Adaptive Week 8, Standard Weekly, and Week Focus render the display convention from canonical payloads", () => {
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


test("Boss Remix preserves canonical prompts and renders its brand references only in the engine", () => {
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

test("policy revision refreshes generator parents and engine cache together", () => {
  for (const [file, mainHash] of [
    ["fall-2026-quiz-generator.js", "6a2c7abfb3beb1c0dd30cb00598b361120eb8764f9f406ed27afdcf52150781f"],
    ["fall-2026-adaptive-practice.js", "324a38b578a297ddca574116bbd62b75c6d0f3d5c6aeb4ffdebe4f21c2bd71f3"],
    ["fall-2026-lab3-launcher.js", "e1042684cf79079f653958532156641a1715bf255271d66fae573618fe2fd5aa"]
  ]) assert.equal(createHash("sha256").update(read(`assets/js/${file}`)).digest("hex"), mainHash, `${file}: approved policy baseline`);
  const launcher = read("assets/js/fall-2026-lab3-launcher.js");
  const adaptive = read("assets/js/fall-2026-adaptive-practice.js");
  for (const parent of [launcher, adaptive]) assert.match(parent, /fall-2026-quiz-generator\.js\?v=20261101a/);
  assert.match(launcher, /fall-2026-adaptive-practice\.js\?v=20261101a/);
  assert.match(read("lab3-fall-2026.html"), /fall-2026-lab3-launcher\.js\?v=20261101a/);
  assert.match(read("assets/js/quizEngine.js"), /new URL\("assets\/js\/fall-2026-lab3-launcher\.js\?v=20261101a"/);
  assert.match(read("quiz.html"), /quizEngine\.js\?v=20261101a/);
});

test("student stems use natural wording without visible source-audit language", () => {
  const forwardPrefixes = {
    drugClass: "What is the drug class of ",
    fdaIndication: "Which FDA indication is recorded in the Fall source for ",
    mechanismOfAction: "What is the mechanism of action of ",
    topAdverseReactions: "Which Top ADR is recorded in the Fall source for ",
    boxWarning: "What boxed warning is associated with "
  };
  const seenDomains = new Set();
  let singleIndicationCount = 0;
  for (const quiz of generated) for (const question of quiz.questions) {
    const prompt = engine.getFallLab3StudentFacingPromptHtml(question);
    if (!["singleFdaIndicationRecognition", "singleAdverseReactionRecognition", "atomicFdaIndicationRecognition", "atomicAdverseReactionRecognition"].includes(question.metadata.questionVariant)) {
      assert.doesNotMatch(prompt, /Fall source|recorded (?:in|for)|boxed-warning value/i, question.id);
    }
    if (question.metadata.brandGenericDirection === "brandToGeneric") {
      assert.equal(prompt, `What is the generic name of <b>${escapeHtml(question.metadata.sourceBrandName)}®</b>?`);
    }
    if (question.metadata.questionVariant === "brandToFdaIndicationRecognition") {
      assert.ok(prompt.startsWith("Which is an FDA-approved indication for "));
      singleIndicationCount += 1;
      seenDomains.add("fdaIndication");
    } else if (question.metadata.stemReference) {
      const domain = question.metadata.knowledgeDomain;
      assert.ok(prompt.startsWith(forwardPrefixes[domain]), question.id);
      seenDomains.add(domain);
    }
    if (question.metadata.questionVariant === "identifyDrugByStructuredValue") {
      assert.ok(prompt.startsWith("Which drug has this "), question.id);
    }
  }
  assert.deepEqual(seenDomains, new Set(["drugClass", "mechanismOfAction", "fdaIndication", "topAdverseReactions"]), "exercise viable positive forward domains; BBW remains positive inverse when forward capacity is insufficient");
  // The calibrated corpus prefers atomic inverse forms; exercise the raw
  // structured inverse fallback explicitly as well.
  const atenolol = drugData.drugs.find((drug) => drug.genericName === "Atenolol");
  const candidate = buildQuestionCandidates({ drugData, policy, quizWeek: 3, materialType: "new" })
    .find((entry) => entry.sourceDrugId === atenolol.id && entry.domainId === "drugClass");
  const inverse = materializeQuestionCandidate({ candidate, drugData, policy, rng: createSeededRng("amb-20") });
  assert.equal(inverse.question.metadata.questionVariant, "identifyDrugByStructuredValue");
  assert.ok(engine.getFallLab3StudentFacingPromptHtml(inverse.question).startsWith("Which drug has this pharmacologic class?"));
  assert.doesNotMatch(engine.getFallLab3StudentFacingPromptHtml(inverse.question), /Fall source|recorded/i);
  const rawAdrCandidate = buildQuestionCandidates({ drugData, policy, quizWeek: 3, materialType: "new" })
    .find((entry) => entry.sourceDrugId === "p2-fall-quiz-03-drug-02" && entry.domainId === "topAdverseReactions");
  const rawAdr = materializeQuestionCandidate({ candidate: rawAdrCandidate, drugData, policy, rng: createSeededRng("adr-top-boundary") });
  assert.equal(rawAdr.status, "materialized");
  assert.doesNotMatch(engine.getFallLab3StudentFacingPromptHtml(rawAdr.question), /full|complete|entire/i);
  assert.notEqual(rawAdr.question.metadata.questionVariant, "structuredValueChoices");
  assert.equal(rawAdr.question.metadata.knowledgeDomain, "topAdverseReactions");
  assert.ok(singleIndicationCount > 0);
});
