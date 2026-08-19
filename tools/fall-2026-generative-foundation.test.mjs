import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drugDataPath = path.join(repoRoot, "assets", "data", "fall-2026-p2-top-drugs.json");
const policyPath = path.join(repoRoot, "assets", "data", "fall-2026-lab3-quiz-policy.json");
const drugData = JSON.parse(readFileSync(drugDataPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

const LEGACY_BASELINE = Object.freeze({
  commit: "d55a57b638b9424299ab2fabb842a73e8792edab",
  quizFileCount: 35,
  quizCorpusSha256: "10e5336b75c55f15ad249ce8350edf66737a560423b50e6eedc38c68e27cf2fb",
  masterPoolSha256: "1fb50e96e60252a9839406d53bc929e9569d76c0ddc2522aff43adf9bdf2a87c",
  quizEngineSha256: "b9862408f282f5e57f2ff6f7813b027ef94117f683e2c73a166bae1792dbe3be"
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashQuizCorpus() {
  const quizzesDir = path.join(repoRoot, "quizzes");
  const files = readdirSync(quizzesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const hash = createHash("sha256");

  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(path.join(quizzesDir, file)));
    hash.update("\0");
  }

  return { count: files.length, digest: hash.digest("hex") };
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

function assertNoForbiddenQuestionBankKeys(value, location = "policy") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenQuestionBankKeys(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    assert.ok(!["questions", "prompt", "choices"].includes(key), `${location}.${key} must not encode a fixed question bank`);
    assertNoForbiddenQuestionBankKeys(child, `${location}.${key}`);
  }
}

test(`legacy quiz inputs and engine source remain byte-identical to ${LEGACY_BASELINE.commit}`, () => {
  const quizCorpus = hashQuizCorpus();
  assert.equal(quizCorpus.count, LEGACY_BASELINE.quizFileCount, "legacy static quiz file count changed");
  assert.equal(quizCorpus.digest, LEGACY_BASELINE.quizCorpusSha256, "legacy static quiz JSON changed");

  const masterPool = readFileSync(path.join(repoRoot, "assets", "data", "master_pool.json"));
  assert.equal(sha256(masterPool), LEGACY_BASELINE.masterPoolSha256, "legacy Top Drugs master pool changed");

  const quizEngine = readFileSync(path.join(repoRoot, "assets", "js", "quizEngine.js"));
  assert.equal(sha256(quizEngine), LEGACY_BASELINE.quizEngineSha256, "legacy engine/scoring source changed");
});

test("Fall 2026 drug data contains ten complete weekly cohorts without a testable sorting category", () => {
  assert.equal(drugData.schemaVersion, 1);
  assert.equal(drugData.academicYear, "2026-27");
  assert.equal(drugData.semester, "P2 Fall");
  assert.equal(drugData.drugs.length, 100);
  assert.equal(drugData.source.sha256, "917420820f18d3adf77cad796b72ce4c0777bb97b3578668597707e75d94b3c1");

  const ids = new Set();
  const countsByWeek = new Map();
  for (const drug of drugData.drugs) {
    assert.ok(!ids.has(drug.id), `duplicate drug row id: ${drug.id}`);
    ids.add(drug.id);
    countsByWeek.set(drug.quizWeek, (countsByWeek.get(drug.quizWeek) || 0) + 1);

    assert.equal(drug.semester, "P2 Fall", `${drug.id} has the wrong semester`);
    assert.match(drug.genericName, /\S/, `${drug.id} needs a generic name`);
    assert.match(drug.brandListing, /\S/, `${drug.id} needs the source brand listing`);
    assert.ok(Array.isArray(drug.brandNames) && drug.brandNames.length > 0, `${drug.id} needs all listed brands`);
    assert.ok(Array.isArray(drug.fdaIndications) && drug.fdaIndications.length > 0, `${drug.id} needs an FDA indication`);
    assert.match(drug.drugClass, /\S/, `${drug.id} needs a drug class`);
    assert.match(drug.mechanismOfAction, /\S/, `${drug.id} needs an MOA`);
    assert.match(drug.boxWarning, /\S/, `${drug.id} needs a BBW value, including source 'none' values`);
    assert.ok(Array.isArray(drug.adverseReactions) && drug.adverseReactions.length > 0, `${drug.id} needs at least one ADR`);
    assert.ok(Number.isInteger(drug.sourcePage) && drug.sourcePage >= 1 && drug.sourcePage <= 3, `${drug.id} needs a valid source page`);
    assert.ok(!Object.hasOwn(drug, "category"), `${drug.id} must not encode the non-memorized sorting category`);
    assert.ok(!Object.hasOwn(drug, "accessPharmacySortingCategory"), `${drug.id} must not encode the non-memorized sorting category`);
  }

  assert.deepEqual(
    [...countsByWeek.entries()].sort(([a], [b]) => a - b),
    Array.from({ length: 10 }, (_, index) => [index + 1, 10])
  );
});

test("Quiz 1 matches the authoritative ten-drug source slice", () => {
  const quiz1 = drugData.drugs.filter((drug) => drug.quizWeek === 1);
  const projection = quiz1.map((drug) => ({
    genericName: drug.genericName,
    brandNames: drug.brandNames,
    fdaIndications: drug.fdaIndications,
    drugClass: drug.drugClass,
    mechanismOfAction: drug.mechanismOfAction,
    boxWarning: drug.boxWarning,
    adverseReactions: drug.adverseReactions
  }));

  const aceMoa = "Inhibits the conversion of angiotensin I to angiotensin II, causing vasodilation and reduction in the release of aldosterone.";
  const nonDhpMoa = "Inhibits the influx of calcium ions into vascular smooth muscle, leading to vasodilation and reduced heart rate.";
  assert.deepEqual(projection, [
    { genericName: "Enalapril", brandNames: ["Vasotec"], fdaIndications: ["Hypertension", "Heart failure"], drugClass: "ACEI, Antihypertensive", mechanismOfAction: aceMoa, boxWarning: "Pregnancy", adverseReactions: ["Increased SCr"] },
    { genericName: "Lisinopril", brandNames: ["Prinivil", "Zestril"], fdaIndications: ["Hypertension", "Heart failure"], drugClass: "ACEI, Antihypertensive", mechanismOfAction: aceMoa, boxWarning: "Pregnancy", adverseReactions: ["Dizziness", "Hypotension", "Angioedema"] },
    { genericName: "Ramipril", brandNames: ["Altace"], fdaIndications: ["Hypertension", "Heart failure"], drugClass: "ACEI, Antihypertensive", mechanismOfAction: aceMoa, boxWarning: "Pregnancy", adverseReactions: ["Dizziness", "Hypotension", "Angioedema"] },
    { genericName: "Fosinopril", brandNames: ["Monopril"], fdaIndications: ["Hypertension", "Heart failure"], drugClass: "ACEI, Antihypertensive", mechanismOfAction: aceMoa, boxWarning: "Pregnancy", adverseReactions: ["Dizziness", "Hypotension", "Angioedema"] },
    { genericName: "Quinapril", brandNames: ["Accupril"], fdaIndications: ["Hypertension", "Heart failure"], drugClass: "ACEI, Antihypertensive", mechanismOfAction: aceMoa, boxWarning: "Pregnancy", adverseReactions: ["Dizziness", "Hypotension", "Angioedema"] },
    { genericName: "Benazepril", brandNames: ["Lotensin"], fdaIndications: ["Hypertension"], drugClass: "ACEI, Antihypertensive", mechanismOfAction: aceMoa, boxWarning: "Pregnancy", adverseReactions: ["Dizziness", "Hypotension", "Angioedema"] },
    { genericName: "Amlodipine", brandNames: ["Norvasc"], fdaIndications: ["Hypertension", "Chronic stable angina"], drugClass: "Calcium Channel Blocker", mechanismOfAction: "Inhibits the influx of calcium ions into vascular smooth muscle and cardiac muscle, resulting in decreased peripheral vascular resistance and reduced blood pressure.", boxWarning: "none", adverseReactions: ["Peripheral edema"] },
    { genericName: "Verapamil", brandNames: ["Calan", "Verelan"], fdaIndications: ["Hypertension", "Angina"], drugClass: "Non-Dihydropyridine Calcium Channel Blocker", mechanismOfAction: nonDhpMoa, boxWarning: "none", adverseReactions: ["Gingival hyperplasia"] },
    { genericName: "Bisoprolol", brandNames: ["Cardicor", "Zebeta"], fdaIndications: ["Hypertension"], drugClass: "Cardioselective β-Adrenergic Blocker", mechanismOfAction: "Selectively blocks beta1-adrenergic receptors in the heart, decreasing heart rate and contractility.", boxWarning: "none", adverseReactions: ["Dizziness", "Hypotension", "Depression"] },
    { genericName: "Diltiazem", brandNames: ["Cardizem", "Cartia XT", "Dilacor XR", "Dilt-XR", "Taztia XT", "Tiazac"], fdaIndications: ["Hypertension", "Angina"], drugClass: "Non-Dihydropyridine Calcium Channel Blocker", mechanismOfAction: nonDhpMoa, boxWarning: "none", adverseReactions: ["Edema"] }
  ]);
});

test("Fall 2026 policy separates eligibility, question types, and Week 1 uncertainty", () => {
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.semester, "P2 Fall");
  assert.equal(policy.drugDataPath, "assets/data/fall-2026-p2-top-drugs.json");
  assert.equal(policy.source.sha256, "d327ce9dccdc49e897b109b81b1dc78b38e6c81f05ca20cedca216d0194fe3b1");

  const domains = new Map(policy.knowledgeDomains.map((domain) => [domain.id, domain]));
  assert.deepEqual([...domains.keys()], [
    "brandGeneric",
    "drugClass",
    "fdaIndication",
    "mechanismOfAction",
    "topAdverseReactions",
    "boxWarning"
  ]);
  assert.equal(domains.get("brandGeneric").questionType, "fitb");
  assert.deepEqual(domains.get("brandGeneric").answerMatching, {
    spellingSensitive: true,
    capitalizationSensitive: false
  });
  for (const domainId of ["drugClass", "fdaIndication", "mechanismOfAction", "topAdverseReactions", "boxWarning"]) {
    assert.equal(domains.get(domainId).questionType, "mcq", `${domainId} must use MCQ`);
  }

  assert.equal(policy.eligibility.newMaterial.drugRule, "sameSemesterAndAssignedWeekEqualsQuizWeek");
  assert.equal(policy.eligibility.accumulatedReview.startsAtQuizWeek, 2);
  assert.equal(policy.eligibility.accumulatedReview.drugRule, "sameSemesterAndAssignedWeekLessThanQuizWeek");

  assert.deepEqual(policy.composition.week2AndLater.quizWeekRange, [2, 10]);
  assert.equal(policy.composition.week2AndLater.newMaterialItemTarget, 6);
  assert.equal(policy.composition.week2AndLater.reviewMaterialItemTarget, 4);
  assert.equal(policy.composition.week2AndLater.totalItemTarget, 10);

  assert.equal(policy.composition.week1.newMaterialItemTarget, 6);
  assert.equal(policy.composition.week1.reviewMaterialEligible, false);
  assert.equal(policy.composition.week1.reviewMaterialItemTarget, 0);
  assert.equal(policy.composition.week1.totalItemTarget, null);
  assert.equal(policy.composition.week1.policyStatus, "owner-decision-required");
  assert.match(policy.composition.week1.unresolvedDecision, /does not specify/i);
  assert.equal(policy.runtimeIntegration.selectedByDefault, false);
  assert.equal(policy.runtimeIntegration.legacyRoutesChanged, false);
  assertNoForbiddenQuestionBankKeys(policy);
});

test("Fall 2026 foundation is not referenced by an application page or runtime script", () => {
  const htmlFiles = listFilesRecursively(
    repoRoot,
    (file) => file.endsWith(".html"),
    new Set([".git", "node_modules", "tmp"])
  );
  const runtimeFiles = [
    ...htmlFiles,
    ...listFilesRecursively(path.join(repoRoot, "assets", "js"), (file) => file.endsWith(".js"))
  ];
  const forbiddenReferences = [
    "fall-2026-p2-top-drugs.json",
    "fall-2026-lab3-quiz-policy.json"
  ];

  for (const file of runtimeFiles) {
    const source = readFileSync(file, "utf8");
    for (const reference of forbiddenReferences) {
      assert.ok(!source.includes(reference), `${path.relative(repoRoot, file)} unexpectedly selects ${reference}`);
    }
  }
});
