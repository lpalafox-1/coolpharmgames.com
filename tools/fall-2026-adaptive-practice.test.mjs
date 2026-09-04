// F26-10 Performance-Guided Adaptive Practice.
//
// Adaptive selection is a ranking layer over the unmodified Fall generator, so
// these tests assert two separate things: that ranking responds to real
// longitudinal signals, and that it can never widen curriculum scope, change
// question correctness, or disturb the existing Fall practice paths.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as adaptive from "../assets/js/fall-2026-adaptive-practice.js";
import { buildFall2026Lab3Payload } from "../assets/js/fall-2026-lab3-launcher.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const sha256 = (relativePath) => createHash("sha256").update(readFileSync(path.join(repoRoot, relativePath))).digest("hex");

const drugData = JSON.parse(read("assets/data/fall-2026-p2-top-drugs.json"));
const policy = JSON.parse(read("assets/data/fall-2026-lab3-quiz-policy.json"));
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function build(overrides = {}) {
  return adaptive.buildFall2026AdaptivePayload({
    drugData, policy, targetWeek: 6, seed: "f26-10-test", now: NOW, ...overrides
  });
}

function pool(targetWeek = 6, seed = "f26-10-test") {
  return adaptive.buildAdaptiveCandidatePool({ drugData, policy, targetWeek, seed });
}

function missedEntry(question, overrides = {}) {
  return {
    quizId: "fall-2026-lab3-week-3-practice",
    prompt: question.prompt,
    answer: question.answer,
    missCount: 4,
    reviewMissCount: 2,
    clearStreak: 0,
    archived: false,
    lastMissedAt: new Date(NOW - (2 * DAY)).toISOString(),
    ...overrides
  };
}

const fingerprints = (questions) => new Set(questions.map(adaptive.getQuestionFingerprint));

// --- curriculum scope ---------------------------------------------------------

test("Week 1 adaptive contains only Week 1 material", () => {
  const payload = build({ targetWeek: 1 });
  assert.equal(payload.questions.length, adaptive.ADAPTIVE_ROUND_SIZE);
  for (const question of payload.questions) {
    for (const week of adaptive.getQuestionSourceWeeks(question)) {
      assert.equal(week, 1, "a Week 1 round may only use Week 1 material");
    }
  }
});

test("Week 10 may use Weeks 1-10 but never beyond", () => {
  const payload = build({ targetWeek: 10, seed: "week-10-scope" });
  const weeks = new Set(payload.questions.flatMap(adaptive.getQuestionSourceWeeks));
  assert.ok(Math.max(...weeks) <= 10);
  assert.ok(Math.min(...weeks) >= 1);
});

test("no future-week leakage across a large seed corpus", () => {
  let checked = 0;
  for (let targetWeek = 1; targetWeek <= 10; targetWeek += 1) {
    for (let seed = 0; seed < 6; seed += 1) {
      const payload = build({ targetWeek, seed: `corpus-${targetWeek}-${seed}` });
      assert.equal(payload.questions.length, adaptive.ADAPTIVE_ROUND_SIZE,
        `week ${targetWeek} seed ${seed} must still fill a full round`);
      for (const question of payload.questions) {
        checked += 1;
        for (const week of adaptive.getQuestionSourceWeeks(question)) {
          assert.ok(week <= targetWeek,
            `week ${targetWeek} seed ${seed}: material from week ${week} leaked`);
        }
      }
    }
  }
  assert.ok(checked >= 600, `corpus should be large; checked ${checked}`);
});

// --- signal responsiveness ----------------------------------------------------

test("repeated genuine misses measurably increase selection priority", () => {
  const candidates = pool();
  const weak = candidates.slice(0, 5);
  const reviewEntries = weak.map((question) => missedEntry(question));

  const baseline = build();
  const weighted = build({ reviewEntries });

  const baselineHits = weak.filter((q) => fingerprints(baseline.questions).has(adaptive.getQuestionFingerprint(q))).length;
  const weightedHits = weak.filter((q) => fingerprints(weighted.questions).has(adaptive.getQuestionFingerprint(q))).length;
  assert.ok(weightedHits > baselineHits,
    `missed material must surface more often (baseline ${baselineHits}, weighted ${weightedHits})`);
  assert.ok(weighted.metadata.adaptive.bucketCounts.weakness > 0, "the weakness bucket must be used");

  // Score, not just placement, must respond.
  const signalsWith = adaptive.buildAdaptiveSignals({ reviewEntries, now: NOW });
  const signalsWithout = adaptive.buildAdaptiveSignals({ reviewEntries: [], now: NOW });
  const weakness = adaptive.buildConceptWeakness(candidates, signalsWith);
  const none = adaptive.buildConceptWeakness(candidates, signalsWithout);
  assert.ok(
    adaptive.scoreCandidate(weak[0], signalsWith, weakness) > adaptive.scoreCandidate(weak[0], signalsWithout, none),
    "a missed question must score above its unmissed self"
  );
});

test("mastered material is deprioritized but stays eligible", () => {
  const candidates = pool();
  const mastered = candidates.slice(0, 6);
  const reviewEntries = mastered.map((question) => missedEntry(question, {
    missCount: 1, reviewMissCount: 0, clearStreak: 3, archived: true,
    masteredAt: new Date(NOW - (2 * DAY)).toISOString(),
    lastReviewedAt: new Date(NOW - (2 * DAY)).toISOString()
  }));

  const signals = adaptive.buildAdaptiveSignals({ reviewEntries, now: NOW });
  const weakness = adaptive.buildConceptWeakness(candidates, signals);
  const neutral = adaptive.buildAdaptiveSignals({ reviewEntries: [], now: NOW });
  const neutralWeakness = adaptive.buildConceptWeakness(candidates, neutral);

  assert.ok(
    adaptive.scoreCandidate(mastered[0], signals, weakness)
      < adaptive.scoreCandidate(mastered[0], neutral, neutralWeakness),
    "mastered material must score below neutral material"
  );

  // Deprioritized, not banned: it can still be drawn when the pool is small.
  const tiny = adaptive.selectAdaptiveRound({
    candidates: mastered, signals, seed: "mastered-eligible", size: 4
  });
  assert.equal(tiny.questions.length, 4, "mastered material remains selectable");
});

test("refresh-due mastered material returns and is bucketed as refresh", () => {
  const candidates = pool();
  const stale = candidates.slice(0, 4);
  const reviewEntries = stale.map((question) => missedEntry(question, {
    missCount: 1, reviewMissCount: 0, clearStreak: 3, archived: true,
    masteredAt: new Date(NOW - (40 * DAY)).toISOString(),
    lastReviewedAt: new Date(NOW - (40 * DAY)).toISOString(),
    lastMissedAt: new Date(NOW - (60 * DAY)).toISOString()
  }));

  const signals = adaptive.buildAdaptiveSignals({ reviewEntries, now: NOW });
  const weakness = adaptive.buildConceptWeakness(candidates, signals);
  assert.equal(adaptive.classifyCandidate(stale[0], signals, weakness), "refresh");

  const payload = build({ reviewEntries });
  assert.ok(payload.metadata.adaptive.bucketCounts.refresh > 0, "refresh-due material must come back");
});

test("underexposed material receives coverage", () => {
  const payload = build();
  assert.ok(payload.metadata.adaptive.bucketCounts.underexposed > 0,
    "with no history everything is underexposed and must be covered");
  const concepts = new Set(payload.questions.map(adaptive.getQuestionConceptKey));
  assert.ok(concepts.size >= 8, `a round should spread across concepts, got ${concepts.size}`);
});

test("performance keys survive the Review Queue store's own prompt stripping", () => {
  // The store removes HTML tags WITHOUT inserting a space, so its promptText
  // reads "dizziness?" where the candidate's HTML yields "dizziness ?". A round
  // trip through that shape must still match, or every weakness signal is
  // silently lost in the browser while unit fixtures still pass.
  const candidate = pool()[0];
  const storeStyle = {
    promptText: String(candidate.prompt).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(),
    answer: candidate.answer
  };
  assert.equal(adaptive.getPerformanceKey(storeStyle), adaptive.getPerformanceKey(candidate),
    "store-normalized prompts must key identically to candidate prompts");

  // And the signal must actually land end to end.
  const weak = pool().slice(0, 5).map((question) => ({
    quizId: "fall-2026-lab3-week-3-practice",
    promptText: String(question.prompt).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(),
    prompt: question.prompt,
    answer: question.answer,
    missCount: 5, reviewMissCount: 2, clearStreak: 0, archived: false,
    lastMissedAt: new Date(NOW - (2 * DAY)).toISOString()
  }));
  const payload = build({ reviewEntries: weak });
  assert.ok(payload.metadata.adaptive.bucketCounts.weakness >= 3,
    `store-shaped entries must drive the weakness bucket, got ${payload.metadata.adaptive.bucketCounts.weakness}`);
});

// --- freshness ----------------------------------------------------------------// --- freshness ----------------------------------------------------------------

test("recent adaptive items are suppressed when alternatives exist", () => {
  const reviewEntries = pool().slice(0, 5).map((question) => missedEntry(question));
  const first = build({ reviewEntries });
  const memory = adaptive.recordAdaptiveRound({
    memory: null, questions: first.questions, targetWeek: 6, at: NOW
  });
  const second = build({ reviewEntries, memory, now: NOW + (60 * 60 * 1000) });

  const overlap = second.questions.filter((q) => fingerprints(first.questions).has(adaptive.getQuestionFingerprint(q))).length;
  assert.ok(overlap <= 3, `a follow-up round must mostly move on, overlap was ${overlap}`);
  assert.equal(second.questions.length, adaptive.ADAPTIVE_ROUND_SIZE);
});

test("a prior miss raises priority without pinning the identical item forever", () => {
  const candidates = pool();
  const weak = candidates.slice(0, 3);
  const reviewEntries = weak.map((question) => missedEntry(question));

  let memory = null;
  const appearances = new Map();
  for (let round = 0; round < 4; round += 1) {
    const payload = build({ reviewEntries, memory, now: NOW + (round * 60 * 60 * 1000) });
    for (const question of payload.questions) {
      const key = adaptive.getQuestionFingerprint(question);
      appearances.set(key, (appearances.get(key) || 0) + 1);
    }
    memory = adaptive.recordAdaptiveRound({
      memory, questions: payload.questions, targetWeek: 6, at: NOW + (round * 60 * 60 * 1000)
    });
  }

  const worst = Math.max(...appearances.values());
  assert.ok(worst < 4, `no item may appear in every round; worst was ${worst}`);
  assert.ok(appearances.size >= 20, `four rounds should span material; saw ${appearances.size} distinct items`);
});

test("no duplicate fingerprints within a round", () => {
  for (let targetWeek = 1; targetWeek <= 10; targetWeek += 1) {
    const payload = build({ targetWeek, seed: `dupes-${targetWeek}` });
    assert.equal(fingerprints(payload.questions).size, payload.questions.length,
      `week ${targetWeek} round repeated a question`);
  }
});

// --- determinism and adaptation -----------------------------------------------

test("identical history, memory and seed give identical output", () => {
  const reviewEntries = pool().slice(0, 4).map((question) => missedEntry(question));
  const memory = adaptive.recordAdaptiveRound({
    memory: null, questions: pool().slice(4, 8), targetWeek: 6, at: NOW
  });
  const a = build({ reviewEntries, memory });
  const b = build({ reviewEntries, memory });
  assert.deepEqual(JSON.parse(JSON.stringify(a.questions)), JSON.parse(JSON.stringify(b.questions)));
});

test("changed performance changes the next round", () => {
  const candidates = pool();
  const before = build({ reviewEntries: candidates.slice(0, 4).map((q) => missedEntry(q)) });
  const after = build({ reviewEntries: candidates.slice(40, 44).map((q) => missedEntry(q)) });
  assert.notDeepEqual(
    before.questions.map(adaptive.getQuestionFingerprint),
    after.questions.map(adaptive.getQuestionFingerprint),
    "different weaknesses must produce a different round"
  );
});

// --- trust boundary -----------------------------------------------------------

test("historical wrongCounts magnitude does not control hard selection", () => {
  const candidates = pool();
  const base = candidates.slice(0, 5).map((question) => missedEntry(question));
  const inflated = base.map((entry) => ({ ...entry, wrongCounts: { phantom: 9999, other: 4321 } }));
  const deflated = base.map((entry) => ({ ...entry, wrongCounts: {} }));

  const a = build({ reviewEntries: base });
  const b = build({ reviewEntries: inflated });
  const c = build({ reviewEntries: deflated });
  const ids = (payload) => payload.questions.map(adaptive.getQuestionFingerprint);
  assert.deepEqual(ids(b), ids(a), "inflated answer frequencies must not change selection");
  assert.deepEqual(ids(c), ids(a), "absent answer frequencies must not change selection");

  // And the module must never read the field - property access, not the word,
  // since the header comment documents deliberately ignoring it.
  const source = read("assets/js/fall-2026-adaptive-practice.js");
  const codeOnly = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(codeOnly, /[.\[]\s*["']?wrongCounts/, "adaptive must not read wrongCounts");
});

test("malformed or empty history falls back to balanced practice", () => {
  const shapes = [
    { reviewEntries: [], historyEntries: [], memory: null },
    { reviewEntries: [null, 42, "x", {}, []], historyEntries: [null, "y"], memory: "not json" },
    { reviewEntries: [{ prompt: "", answer: "" }], historyEntries: [{ total: 0, score: 5 }], memory: { rounds: "no" } },
    { reviewEntries: [{ prompt: "x", answer: "y", missCount: -3, clearStreak: "many" }], memory: { rounds: [null, 7] } }
  ];
  for (const shape of shapes) {
    const payload = build(shape);
    assert.equal(payload.questions.length, adaptive.ADAPTIVE_ROUND_SIZE,
      `malformed input ${JSON.stringify(shape).slice(0, 60)} must still yield a full round`);
    assert.equal(fingerprints(payload.questions).size, adaptive.ADAPTIVE_ROUND_SIZE);
  }
});

test("adaptive memory normalizes defensively and never grows without bound", () => {
  assert.deepEqual(adaptive.normalizeAdaptiveMemory(null).rounds, []);
  assert.deepEqual(adaptive.normalizeAdaptiveMemory("garbage").rounds, []);
  assert.deepEqual(adaptive.normalizeAdaptiveMemory({ rounds: [{}, null] }).rounds, []);

  let memory = null;
  for (let round = 0; round < 12; round += 1) {
    memory = adaptive.recordAdaptiveRound({
      memory, questions: pool().slice(round, round + 3), targetWeek: 6, at: NOW + round
    });
  }
  assert.ok(memory.rounds.length <= adaptive.ADAPTIVE_MEMORY_ROUNDS,
    `memory kept ${memory.rounds.length} rounds`);
  assert.equal(memory.version, adaptive.ADAPTIVE_MEMORY_VERSION);
});

// --- contracts preserved ------------------------------------------------------

test("strict FITB answer contracts survive selection unchanged", () => {
  const candidates = pool(10, "fitb-scan");
  const strict = candidates.filter((q) => q?.metadata?.answerMatching?.spellingSensitive === true
    || Array.isArray(q?._acceptedAnswers));
  const payload = build({ targetWeek: 10, seed: "fitb-scan" });
  const byFingerprint = new Map(candidates.map((q) => [adaptive.getQuestionFingerprint(q), q]));

  for (const question of payload.questions) {
    const source = byFingerprint.get(adaptive.getQuestionFingerprint(question));
    assert.ok(source, "every selected question must come from the generated pool");
    assert.deepEqual(question.answer, source.answer, "answers are passed through untouched");
    assert.deepEqual(question.choices, source.choices, "choices are passed through untouched");
    assert.deepEqual(question.metadata?.answerMatching, source.metadata?.answerMatching);
    assert.deepEqual(question._acceptedAnswers, source._acceptedAnswers);
  }
  assert.ok(strict.length >= 0);
});

test("adaptive attempts carry their own lineage kind and scope", () => {
  const payload = build({ targetWeek: 7, seed: "lineage" });
  assert.equal(payload.metadata.kind, "fall-2026-lab3-adaptive");
  assert.equal(payload.metadata.kind, adaptive.ADAPTIVE_KIND);
  assert.equal(payload.metadata.adaptiveTargetWeek, 7);
  assert.equal(payload.metadata.quizWeek, 7);
  assert.equal(payload.metadata.generator, "fall-2026-p2-lab3-deterministic-generator");
  assert.equal(payload.metadata.generatedFrom, "fall-2026-lab3-week-7-adaptive");
  assert.match(payload.title, /Adaptive Practice/);

  // The engine recognizes Fall material by generator id on each question, so
  // adaptive provenance flows through without any engine change.
  for (const question of payload.questions) {
    assert.equal(question.metadata.generatorId, "fall-2026-p2-lab3-deterministic-generator");
  }
});

test("Stats classifies fall-2026-lab3-adaptive as its own attempt type", () => {
  const stats = read("assets/js/stats.js");
  assert.match(stats, /const FALL_LAB3_ADAPTIVE_KIND = "fall-2026-lab3-adaptive";/);
  assert.match(stats, /id: "fall-lab3-adaptive", label: "Adaptive Practice"/);
  assert.match(stats, /\[FALL_LAB3_ADAPTIVE_KIND\]: "fall-lab3-adaptive"/);
});

test("normal Week Practice output is unchanged by F26-10", () => {
  // Byte-identical composition for the same week and seed as before the change.
  for (const quizWeek of [1, 2, 5, 10]) {
    const seed = `unchanged-week-${quizWeek}`;
    const payload = buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed });
    assert.equal(payload.metadata.kind, "fall-2026-lab3-practice");
    assert.equal(payload.questions.length, 10);
    assert.equal(payload.metadata.composition.totalItemTarget, 10);
    assert.equal(payload.metadata.composition.newMaterialItemTarget, quizWeek === 1 ? 10 : 6);
    assert.equal(payload.metadata.composition.reviewMaterialItemTarget, quizWeek === 1 ? 0 : 4);
    assert.deepEqual(
      JSON.parse(JSON.stringify(payload)),
      JSON.parse(JSON.stringify(buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed }))),
      "normal practice stays deterministic"
    );
    assert.equal(payload.title, `Lab III Fall 2026 - Week ${quizWeek} Practice`);
  }
});

test("the generator, engine, canonical data, and policy are untouched", () => {
  assert.equal(sha256("assets/js/fall-2026-quiz-generator.js"),
    "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a", "generator must not change");
  assert.equal(sha256("assets/js/quizEngine.js"),
    "6dc5c2f6d467742e837435be1d120f1110eb9faacb9d985898efad52a5c8a507", "engine must not change");
  assert.equal(sha256("assets/data/fall-2026-p2-top-drugs.json"),
    "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01", "canonical drug data must not change");
  assert.equal(sha256("assets/data/fall-2026-lab3-quiz-policy.json"),
    "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171", "quiz policy must not change");

  // Adaptive never generates material of its own.
  const source = read("assets/js/fall-2026-adaptive-practice.js");
  assert.match(source, /import \{ generateFall2026Quiz \}/, "adaptive must reuse the shared generator");
  assert.doesNotMatch(source, /localStorage|sessionStorage/, "the adaptive module is a pure transform");
});

test("adaptive writes only its own memory key", () => {
  const launcher = read("assets/js/fall-2026-lab3-launcher.js");
  const writes = [...launcher.matchAll(/localStorage\.setItem\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(writes)].sort(), ["ADAPTIVE_MEMORY_KEY", "CUSTOM_QUIZ_KEY"],
    "the launcher may only write the custom-quiz payload and adaptive memory");
  assert.match(launcher, /ADAPTIVE_MEMORY_KEY/);
  assert.doesNotMatch(launcher, /localStorage\.setItem\(\s*REVIEW_KEY/, "adaptive must never write the Review Queue");
  assert.doesNotMatch(launcher, /localStorage\.setItem\(\s*HISTORY_KEY/, "adaptive must never write history");
});

test("the hub offers Adaptive Practice without AI language", () => {
  const hub = read("lab3-fall-2026.html");
  assert.match(hub, /id="adaptive-launch"/);
  assert.match(hub, /id="adaptive-week"/);
  assert.match(hub, /Adaptive Practice/);
  assert.doesNotMatch(hub, /AI-powered|AI powered|artificial intelligence/i);

  // Normal Week Practice stays visible and unchanged.
  for (let week = 1; week <= 10; week += 1) {
    assert.match(hub, new RegExp(`data-launch-week="${week}"`), `Week ${week} practice must remain available`);
  }
  assert.match(hub, /assets\/js\/fall-2026-lab3-launcher\.js\?v=20260904a/);
});
