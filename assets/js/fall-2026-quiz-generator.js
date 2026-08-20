/**
 * Pure Fall 2026 selector/generator. The choices below are implementation
 * behavior, not additional Lab III policy: one candidate per eligible
 * normalized generic identity/domain; duplicate identities aggregate official
 * brands, suppress generic-only MCQs whose official values disagree, and use
 * the latest eligible week then source order as the canonical tie-breaker;
 * four choices per MCQ; a source-string-only pharmacologic-class projection
 * for Drug Class practice while canonical class wording remains untouched;
 * complete source arrays displayed with semicolon separators; source-
 * structure-matched distractors for class, indication, and adverse-reaction
 * lists with exact-record inverse identification only when a normal structured
 * pool is unavailable; seeded practice-only candidate selection that prefers
 * least-used drug identities and eligible domains, then degrades when pools
 * are constrained; seeded option shuffles; a seeded Brand/Generic direction
 * (and brand variant); a quiz-level guard against pre-answer Brand/Generic
 * leakage through other prompts or choices; and a final seeded shuffle of the
 * ten selected questions.
 */
const GENERATOR_ID = "fall-2026-p2-lab3-deterministic-generator";
const MCQ_CHOICE_COUNT = 4;
const WEEK_1_PRACTICE_QUESTION_COUNT = 10;

// This reviewed projection uses only exact wording already present in the
// canonical drugClass field. Only listed, clearly appended therapeutic-category
// suffixes are removed. Known ambiguous/no-pharmacologic-class values map to an
// empty concept and are excluded from Drug Class questions. Every other value,
// including future duration, schedule, route, formulation, subclass, or leading-
// category wording, falls back to the complete canonical string unchanged.
const DRUG_CLASS_QUIZ_CONCEPT_OVERRIDES = Object.freeze({
  "ACEI, Antihypertensive": "ACEI",
  "Thiazide Diuretic, Antihypertensive": "Thiazide Diuretic",
  "Long-Acting Nitrate, Antianginal": "Long-Acting Nitrate",
  "Nitrate, Antianginal": "Nitrate",
  "Biguanide, Hypoglycemic": "Biguanide",
  "Dipeptidyl Peptidase IV Inhibitor, Antidiabetic": "Dipeptidyl Peptidase IV Inhibitor",
  "Second-Generation Sulfonylurea, Antidiabetic": "Second-Generation Sulfonylurea",
  "Erectile Dysfunction Agent, Pulmonary HTN Agent": "",
  "Erectile Dysfunction Agent; Pulmonary HTN Agent": "",
  "Dibenzazepine Carboxamide, Anticonvulsant": "Dibenzazepine Carboxamide",
  "Xanthine Oxidase Inhibitor; Antigout": "Xanthine Oxidase Inhibitor",
  "Gamma Aminobutyric Acid Analog, Anticonvulsant": "Gamma Aminobutyric Acid Analog",
  "Benzodiazepine, Short or Intermediate Acting": "",
  "Benzodiazepine, Short or Intermediate Acting. C- IV": "",
  "Benzodiazepine. C-IV": ""
});

export function deriveDrugClassQuizConcept(sourceDrugClass) {
  const canonicalValue = String(sourceDrugClass ?? "").trim();
  if (!canonicalValue) return "";
  if (Object.hasOwn(DRUG_CLASS_QUIZ_CONCEPT_OVERRIDES, canonicalValue)) {
    return DRUG_CLASS_QUIZ_CONCEPT_OVERRIDES[canonicalValue];
  }
  return canonicalValue;
}

export const WEEK_1_PRACTICE_NOTE = "Practice configuration: Week 1 has no prior review material. This 10-question study set uses Week 1 content only and is not intended to claim the exact official Week 1 quiz composition.";

const DOMAIN_SPECS = Object.freeze({
  drugClass: Object.freeze({
    field: "drugClass",
    prompt: (reference) => `Which pharmacologic class is recorded in the Fall source for ${reference}?`,
    inversePrompt: (value) => `Which drug is paired with this pharmacologic class in the Fall source?<br><b>${value}</b>`
  }),
  fdaIndication: Object.freeze({
    field: "fdaIndications",
    prompt: (reference) => `Which complete FDA indication list is recorded for ${reference}?`,
    inversePrompt: (value) => `Which drug is recorded in the Fall source with this complete FDA indication list?<br><b>${value}</b>`
  }),
  mechanismOfAction: Object.freeze({
    field: "mechanismOfAction",
    prompt: (reference) => `Which mechanism of action belongs to ${reference}?`
  }),
  topAdverseReactions: Object.freeze({
    field: "adverseReactions",
    prompt: (reference) => `Which complete top adverse-reaction list is recorded for ${reference}?`,
    inversePrompt: (value) => `Which drug is recorded in the Fall source with this complete top adverse-reaction list?<br><b>${value}</b>`
  }),
  boxWarning: Object.freeze({
    field: "boxWarning",
    prompt: (reference) => `Which boxed-warning value belongs to ${reference}?`
  })
});

const FORBIDDEN_DRUG_FIELDS = Object.freeze([
  "category",
  "accessPharmacySortingCategory"
]);

export class Fall2026GeneratorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "Fall2026GeneratorError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new Fall2026GeneratorError(code, message, details);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_INPUT", `${label} must be an object.`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_INPUT", `${label} must be a non-empty string.`);
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail("INVALID_INPUT", `${label} must be a non-empty array.`);
  }
  value.forEach((entry, index) => requireNonEmptyString(entry, `${label}[${index}]`));
}

function normalizeChoiceKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;]+$/g, "")
    .toLocaleLowerCase("en-US");
}

function normalizeGenericIdentity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function getDomainSourceValue(drug, domainId) {
  const spec = DOMAIN_SPECS[domainId];
  if (!spec) fail("UNSUPPORTED_DOMAIN", `Unsupported MCQ domain: ${domainId}.`);

  const rawValue = drug[spec.field];
  if (Array.isArray(rawValue)) {
    return rawValue.map((value) => String(value).trim()).filter(Boolean).join("; ");
  }
  return String(rawValue ?? "").trim();
}

function getDomainQuizValue(drug, domainId) {
  const sourceValue = getDomainSourceValue(drug, domainId);
  return domainId === "drugClass"
    ? deriveDrugClassQuizConcept(sourceValue)
    : sourceValue;
}

function getDomainSourceValueKey(drug, domainId) {
  const spec = DOMAIN_SPECS[domainId];
  if (!spec) fail("UNSUPPORTED_DOMAIN", `Unsupported MCQ domain: ${domainId}.`);
  const rawValue = drug[spec.field];
  if (Array.isArray(rawValue)) {
    return rawValue.map(normalizeChoiceKey).filter(Boolean).sort().join("\0");
  }
  return normalizeChoiceKey(rawValue);
}

function getDomainValueKey(drug, domainId) {
  return domainId === "drugClass"
    ? normalizeChoiceKey(getDomainQuizValue(drug, domainId))
    : getDomainSourceValueKey(drug, domainId);
}

function getDomainStructuralCardinality(drug, domainId) {
  if (domainId === "drugClass") {
    return getDomainQuizValue(drug, domainId)
      .split(/[;,]/)
      .map((component) => component.trim())
      .filter(Boolean)
      .length;
  }
  if (domainId === "fdaIndication") return drug.fdaIndications.length;
  if (domainId === "topAdverseReactions") return drug.adverseReactions.length;
  return null;
}

function createContext(drugData, policy) {
  requireObject(drugData, "drugData");
  requireObject(policy, "policy");
  requireNonEmptyString(drugData.semester, "drugData.semester");
  requireNonEmptyString(policy.semester, "policy.semester");

  if (drugData.semester !== policy.semester) {
    fail("SEMESTER_MISMATCH", "Drug data and policy must describe the same semester.", {
      drugSemester: drugData.semester,
      policySemester: policy.semester
    });
  }
  if (!Array.isArray(drugData.drugs) || drugData.drugs.length === 0) {
    fail("INVALID_INPUT", "drugData.drugs must be a non-empty array.");
  }
  if (!Array.isArray(policy.knowledgeDomains) || policy.knowledgeDomains.length === 0) {
    fail("INVALID_INPUT", "policy.knowledgeDomains must be a non-empty array.");
  }

  const drugsById = new Map();
  drugData.drugs.forEach((drug, index) => {
    requireObject(drug, `drugData.drugs[${index}]`);
    requireNonEmptyString(drug.id, `drugData.drugs[${index}].id`);
    if (drugsById.has(drug.id)) {
      fail("DUPLICATE_DRUG_ID", `Duplicate drug ID: ${drug.id}.`);
    }
    for (const field of FORBIDDEN_DRUG_FIELDS) {
      if (Object.hasOwn(drug, field)) {
        fail("FORBIDDEN_SOURCE_FIELD", `${drug.id} contains forbidden field ${field}.`, {
          drugId: drug.id,
          field
        });
      }
    }
    if (drug.semester !== policy.semester) {
      fail("SEMESTER_MISMATCH", `${drug.id} is not assigned to ${policy.semester}.`);
    }
    if (!Number.isInteger(drug.quizWeek) || drug.quizWeek < 1 || drug.quizWeek > 10) {
      fail("INVALID_DRUG_WEEK", `${drug.id} has an invalid quizWeek.`);
    }
    requireNonEmptyString(drug.genericName, `${drug.id}.genericName`);
    requireStringArray(drug.brandNames, `${drug.id}.brandNames`);
    requireStringArray(drug.fdaIndications, `${drug.id}.fdaIndications`);
    requireNonEmptyString(drug.drugClass, `${drug.id}.drugClass`);
    requireNonEmptyString(drug.mechanismOfAction, `${drug.id}.mechanismOfAction`);
    requireNonEmptyString(drug.boxWarning, `${drug.id}.boxWarning`);
    requireStringArray(drug.adverseReactions, `${drug.id}.adverseReactions`);
    drugsById.set(drug.id, drug);
  });

  const domainsById = new Map();
  for (const domain of policy.knowledgeDomains) {
    requireObject(domain, "policy knowledge domain");
    requireNonEmptyString(domain.id, "policy knowledge domain id");
    if (domainsById.has(domain.id)) {
      fail("DUPLICATE_DOMAIN_ID", `Duplicate knowledge domain: ${domain.id}.`);
    }
    if (domain.id === "brandGeneric") {
      if (domain.questionType !== "fitb") {
        fail("UNSUPPORTED_POLICY", "Brand / Generic must use FITB.");
      }
      if (
        domain.answerMatching?.spellingSensitive !== true
        || domain.answerMatching?.capitalizationSensitive !== false
      ) {
        fail(
          "UNSUPPORTED_POLICY",
          "Brand / Generic must remain spelling-sensitive and capitalization-insensitive."
        );
      }
    } else {
      if (!DOMAIN_SPECS[domain.id]) {
        fail("UNSUPPORTED_DOMAIN", `Unsupported knowledge domain: ${domain.id}.`);
      }
      if (domain.questionType !== "mcq") {
        fail("UNSUPPORTED_POLICY", `${domain.id} must use MCQ.`);
      }
    }
    domainsById.set(domain.id, domain);
  }

  const week1 = policy.composition?.week1;
  const later = policy.composition?.week2AndLater;
  requireObject(week1, "policy.composition.week1");
  requireObject(later, "policy.composition.week2AndLater");
  if (week1.quizWeek !== 1 || week1.totalItemTarget !== null || week1.reviewMaterialEligible !== false) {
    fail("UNSUPPORTED_POLICY", "Week 1 must retain its unresolved composition and disallow review.");
  }
  if (!Array.isArray(later.quizWeekRange) || later.quizWeekRange.length !== 2) {
    fail("INVALID_INPUT", "policy.composition.week2AndLater.quizWeekRange must contain two weeks.");
  }
  for (const [name, value] of [
    ["newMaterialItemTarget", later.newMaterialItemTarget],
    ["reviewMaterialItemTarget", later.reviewMaterialItemTarget],
    ["totalItemTarget", later.totalItemTarget]
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      fail("INVALID_INPUT", `policy.composition.week2AndLater.${name} must be a non-negative integer.`);
    }
  }
  if (later.newMaterialItemTarget + later.reviewMaterialItemTarget !== later.totalItemTarget) {
    fail("UNSUPPORTED_POLICY", "Week 2+ composition targets must add up to the total target.");
  }

  const newEligibility = policy.eligibility?.newMaterial;
  const reviewEligibility = policy.eligibility?.accumulatedReview;
  requireObject(newEligibility, "policy.eligibility.newMaterial");
  requireObject(reviewEligibility, "policy.eligibility.accumulatedReview");
  requireStringArray(newEligibility.eligibleDomainIds, "new-material eligibleDomainIds");
  requireStringArray(reviewEligibility.eligibleDomainIds, "review eligibleDomainIds");
  for (const domainId of [...newEligibility.eligibleDomainIds, ...reviewEligibility.eligibleDomainIds]) {
    if (!domainsById.has(domainId)) {
      fail("UNSUPPORTED_DOMAIN", `Eligibility references unknown domain ${domainId}.`);
    }
  }
  if (newEligibility.drugRule !== "sameSemesterAndAssignedWeekEqualsQuizWeek") {
    fail("UNSUPPORTED_POLICY", "Unsupported new-material eligibility rule.");
  }
  if (reviewEligibility.drugRule !== "sameSemesterAndAssignedWeekLessThanQuizWeek") {
    fail("UNSUPPORTED_POLICY", "Unsupported accumulated-review eligibility rule.");
  }
  if (reviewEligibility.startsAtQuizWeek !== 2) {
    fail("UNSUPPORTED_POLICY", "Accumulated review must start at Week 2.");
  }

  return {
    drugData,
    policy,
    semester: policy.semester,
    drugs: drugData.drugs,
    drugsById,
    domainsById,
    week1,
    later,
    newEligibility,
    reviewEligibility
  };
}

function assertQuizWeek(context, quizWeek) {
  const maximumWeek = context.later.quizWeekRange[1];
  if (!Number.isInteger(quizWeek) || quizWeek < 1 || quizWeek > maximumWeek) {
    fail("INVALID_QUIZ_WEEK", `quizWeek must be an integer from 1 through ${maximumWeek}.`, {
      quizWeek
    });
  }
}

export function validateGeneratorInputs({ drugData, policy }) {
  const context = createContext(drugData, policy);
  return {
    semester: context.semester,
    drugCount: context.drugs.length,
    supportedQuizWeekRange: [1, context.later.quizWeekRange[1]],
    knowledgeDomainIds: [...context.domainsById.keys()]
  };
}

export function getCurrentWeekDrugCohort({ drugData, policy, quizWeek }) {
  const context = createContext(drugData, policy);
  assertQuizWeek(context, quizWeek);
  return context.drugs.filter((drug) => drug.semester === context.semester && drug.quizWeek === quizWeek);
}

export function getAccumulatedReviewDrugCohort({ drugData, policy, quizWeek }) {
  const context = createContext(drugData, policy);
  assertQuizWeek(context, quizWeek);
  if (quizWeek < context.reviewEligibility.startsAtQuizWeek) return [];
  return context.drugs.filter((drug) => drug.semester === context.semester && drug.quizWeek < quizWeek);
}

function hashSeed(seed) {
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createSeededRng(seed) {
  if (seed === undefined || seed === null || String(seed).length === 0) {
    fail("INVALID_SEED", "A non-empty seed is required.");
  }
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function nextRandom(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail("INVALID_RNG", "Injected RNG must return a finite number in [0, 1).", { value });
  }
  return value;
}

function shuffleCopy(items, rng) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(rng) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getAvailableDrugsThroughWeek(context, quizWeek) {
  return context.drugs.filter(
    (drug) => drug.semester === context.semester && drug.quizWeek <= quizWeek
  );
}

function getBrandGenericIdentities(context, brandName, quizWeek) {
  const brandKey = normalizeChoiceKey(brandName);
  return new Set(
    getAvailableDrugsThroughWeek(context, quizWeek)
      .filter((drug) => drug.brandNames.some((brand) => normalizeChoiceKey(brand) === brandKey))
      .map((drug) => normalizeGenericIdentity(drug.genericName))
  );
}

function isBrandOnlyReferenceSafe(context, brandName, genericName, quizWeek) {
  const identities = getBrandGenericIdentities(context, brandName, quizWeek);
  return identities.size === 1 && identities.has(normalizeGenericIdentity(genericName));
}

function getSourceRecordsForDrugReference(context, value, quizWeek) {
  const referenceKey = normalizeChoiceKey(value);
  return getAvailableDrugsThroughWeek(context, quizWeek).filter((drug) => (
    normalizeChoiceKey(drug.genericName) === referenceKey
    || drug.brandNames.some((brandName) => normalizeChoiceKey(brandName) === referenceKey)
  ));
}

function createDrugChoiceReference(type, value) {
  return {
    value,
    metadata: { type, value }
  };
}

function getSourceRecordChoiceReferences(context, sourceDrug, quizWeek) {
  const candidates = [
    createDrugChoiceReference("generic", sourceDrug.genericName),
    ...sourceDrug.brandNames.map((brandName) => createDrugChoiceReference("brand", brandName))
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = normalizeChoiceKey(candidate.value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    const matchingRecords = getSourceRecordsForDrugReference(context, candidate.value, quizWeek);
    return matchingRecords.length === 1 && matchingRecords[0].id === sourceDrug.id;
  });
}

function createMcqStemReference(sourceDrug, type, brandName) {
  if (type === "generic") {
    return {
      html: `<b>${sourceDrug.genericName}</b>`,
      metadata: {
        type,
        genericName: sourceDrug.genericName
      }
    };
  }

  if (type === "brand") {
    return {
      html: `<b>${brandName}</b>`,
      metadata: {
        type,
        genericName: sourceDrug.genericName,
        brandName
      }
    };
  }

  fail("INVALID_STEM_REFERENCE", `Unsupported MCQ stem-reference type: ${type}`);
}

function selectMcqStemReference(context, sourceDrug, quizWeek, rng) {
  const referenceRoll = nextRandom(rng);
  const brandIndex = Math.floor(nextRandom(rng) * sourceDrug.brandNames.length);
  const brandName = sourceDrug.brandNames[brandIndex];
  const brandOnlyIsSafe = isBrandOnlyReferenceSafe(
    context,
    brandName,
    sourceDrug.genericName,
    quizWeek
  );

  if (referenceRoll < 0.5 || !brandOnlyIsSafe) {
    return createMcqStemReference(sourceDrug, "generic");
  }

  return createMcqStemReference(sourceDrug, "brand", brandName);
}

function getGenericIdentityResolution(context, sourceDrug, domainId, quizWeek) {
  const genericIdentity = normalizeGenericIdentity(sourceDrug.genericName);
  const sourceDrugs = getAvailableDrugsThroughWeek(context, quizWeek).filter(
    (drug) => normalizeGenericIdentity(drug.genericName) === genericIdentity
  );
  const canonicalDrug = sourceDrugs.reduce((canonical, drug) => (
    drug.quizWeek > canonical.quizWeek ? drug : canonical
  ));
  const sourceDrugIds = sourceDrugs.map((drug) => drug.id);

  if (domainId === "brandGeneric") {
    const brandsByIdentity = new Map();
    for (const drug of sourceDrugs) {
      for (const brandName of drug.brandNames) {
        const brandIdentity = normalizeChoiceKey(brandName);
        if (brandIdentity && !brandsByIdentity.has(brandIdentity)) {
          brandsByIdentity.set(brandIdentity, brandName);
        }
      }
    }
    return {
      status: sourceDrug.id === canonicalDrug.id ? "eligible" : "redundant",
      genericIdentity,
      canonicalDrug,
      sourceDrugs,
      sourceDrugIds,
      brandNames: [...brandsByIdentity.values()]
    };
  }

  const distinctValueKeys = new Set(sourceDrugs.map((drug) => getDomainValueKey(drug, domainId)));
  if (distinctValueKeys.size > 1) {
    return {
      status: "ambiguous",
      genericIdentity,
      canonicalDrug,
      sourceDrugs,
      sourceDrugIds,
      distinctValueCount: distinctValueKeys.size
    };
  }
  return {
    status: sourceDrug.id === canonicalDrug.id ? "eligible" : "redundant",
    genericIdentity,
    canonicalDrug,
    sourceDrugs,
    sourceDrugIds,
    distinctValueCount: distinctValueKeys.size
  };
}

function getDistinctDistractorEntries(context, domainId, sourceDrug, quizWeek) {
  const correctKey = getDomainValueKey(sourceDrug, domainId);
  const correctStructuralCardinality = getDomainStructuralCardinality(sourceDrug, domainId);
  const byValue = new Map();

  for (const drug of getAvailableDrugsThroughWeek(context, quizWeek)) {
    if (
      correctStructuralCardinality !== null
      && getDomainStructuralCardinality(drug, domainId) !== correctStructuralCardinality
    ) {
      continue;
    }
    const value = getDomainQuizValue(drug, domainId);
    const key = getDomainValueKey(drug, domainId);
    if (
      (domainId === "drugClass" && !key)
      || key === correctKey
      || byValue.has(key)
    ) continue;
    byValue.set(key, {
      value,
      sourceDrugId: drug.id,
      sourceDrugQuizWeek: drug.quizWeek,
      ...(domainId === "drugClass" ? {
        sourceDomainValue: getDomainSourceValue(drug, domainId),
        quizDomainValue: value,
        sourceDomainValueKey: getDomainSourceValueKey(drug, domainId),
        quizDomainValueKey: key
      } : {})
    });
  }
  return [...byValue.values()];
}

function createInverseChoiceEntry(context, domainId, sourceDrug, quizWeek, reference) {
  const drugReference = reference
    || getSourceRecordChoiceReferences(context, sourceDrug, quizWeek)[0];
  if (!drugReference) return null;
  return {
    value: drugReference.value,
    sourceDrugId: sourceDrug.id,
    sourceDrugQuizWeek: sourceDrug.quizWeek,
    drugReference: { ...drugReference.metadata },
    sourceDomainValue: getDomainSourceValue(sourceDrug, domainId),
    ...(domainId === "drugClass"
      ? {
        quizDomainValue: getDomainQuizValue(sourceDrug, domainId),
        quizDomainValueKey: getDomainValueKey(sourceDrug, domainId)
      }
      : {}),
    sourceDomainValueKey: getDomainSourceValueKey(sourceDrug, domainId)
  };
}

function getInverseStructuredChoicePool(context, domainId, sourceDrug, quizWeek) {
  if (getDomainStructuralCardinality(sourceDrug, domainId) === null) return null;
  const correctDomainValueKey = getDomainValueKey(sourceDrug, domainId);
  const correctEntry = createInverseChoiceEntry(
    context,
    domainId,
    sourceDrug,
    quizWeek
  );
  if (!correctEntry) return { correctEntry: null, distractors: [] };

  const distractors = [];
  const usedReferenceKeys = new Set([normalizeChoiceKey(correctEntry.value)]);
  for (const drug of getAvailableDrugsThroughWeek(context, quizWeek)) {
    const drugDomainValueKey = getDomainValueKey(drug, domainId);
    if (
      drug.id === sourceDrug.id
      || (domainId === "drugClass" && !drugDomainValueKey)
      || drugDomainValueKey === correctDomainValueKey
    ) {
      continue;
    }
    const entry = createInverseChoiceEntry(context, domainId, drug, quizWeek);
    const referenceKey = normalizeChoiceKey(entry?.value);
    if (!entry || usedReferenceKeys.has(referenceKey)) continue;
    usedReferenceKeys.add(referenceKey);
    distractors.push(entry);
  }
  return { correctEntry, distractors };
}

function buildCandidatesFromContext(context, quizWeek, materialType) {
  assertQuizWeek(context, quizWeek);
  if (!new Set(["new", "review"]).has(materialType)) {
    fail("INVALID_MATERIAL_TYPE", "materialType must be 'new' or 'review'.");
  }

  const isNew = materialType === "new";
  const eligibility = isNew ? context.newEligibility : context.reviewEligibility;
  const cohort = isNew
    ? context.drugs.filter((drug) => drug.semester === context.semester && drug.quizWeek === quizWeek)
    : quizWeek < context.reviewEligibility.startsAtQuizWeek
      ? []
      : context.drugs.filter((drug) => drug.semester === context.semester && drug.quizWeek < quizWeek);
  const candidates = [];

  for (const drug of cohort) {
    for (const domainId of eligibility.eligibleDomainIds) {
      const domain = context.domainsById.get(domainId);
      const genericResolution = getGenericIdentityResolution(context, drug, domainId, quizWeek);
      if (genericResolution.status !== "eligible") continue;
      if (domain.questionType === "mcq") {
        if (domainId === "drugClass" && !getDomainValueKey(drug, domainId)) continue;
        const distractors = getDistinctDistractorEntries(context, domainId, drug, quizWeek);
        if (distractors.length < MCQ_CHOICE_COUNT - 1) {
          const inversePool = getInverseStructuredChoicePool(
            context,
            domainId,
            drug,
            quizWeek
          );
          if (
            !inversePool?.correctEntry
            || inversePool.distractors.length < MCQ_CHOICE_COUNT - 1
          ) {
            continue;
          }
        }
      }
      candidates.push({
        id: `${GENERATOR_ID}-week-${String(quizWeek).padStart(2, "0")}-${materialType}-${drug.id}-${domainId}`,
        sourceDrugId: drug.id,
        sourceDrugIds: genericResolution.sourceDrugIds,
        sourceDrugQuizWeek: drug.quizWeek,
        sourceGenericIdentity: genericResolution.genericIdentity,
        requestedQuizWeek: quizWeek,
        materialType,
        domainId,
        questionType: domain.questionType === "fitb" ? "short" : "mcq"
      });
    }
  }
  return candidates;
}

export function buildQuestionCandidates({ drugData, policy, quizWeek, materialType }) {
  const context = createContext(drugData, policy);
  return buildCandidatesFromContext(context, quizWeek, materialType);
}

export function selectQuestionCandidates({ candidates, count, rng }) {
  if (!Array.isArray(candidates)) fail("INVALID_INPUT", "candidates must be an array.");
  if (!Number.isInteger(count) || count < 0) fail("INVALID_INPUT", "count must be a non-negative integer.");
  if (typeof rng !== "function") fail("INVALID_RNG", "An RNG function is required for selection.");
  if (candidates.length < count) {
    fail("INSUFFICIENT_CANDIDATES", `Needed ${count} candidates but found ${candidates.length}.`, {
      requestedCount: count,
      availableCount: candidates.length
    });
  }
  return shuffleCopy(candidates, rng).slice(0, count);
}

function getCandidateDrugIdentity(candidate) {
  return candidate.sourceGenericIdentity || normalizeGenericIdentity(candidate.sourceDrugId);
}

function selectPracticeQuestionCandidates({ candidates, count, rng }) {
  if (!Array.isArray(candidates)) fail("INVALID_INPUT", "candidates must be an array.");
  if (!Number.isInteger(count) || count < 0) fail("INVALID_INPUT", "count must be a non-negative integer.");
  if (typeof rng !== "function") fail("INVALID_RNG", "An RNG function is required for selection.");
  if (candidates.length < count) {
    fail("INSUFFICIENT_CANDIDATES", `Needed ${count} candidates but found ${candidates.length}.`, {
      requestedCount: count,
      availableCount: candidates.length
    });
  }

  const remaining = shuffleCopy(candidates, rng);
  const selected = [];
  const drugUseCounts = new Map();
  const domainUseCounts = new Map();

  while (selected.length < count) {
    let bestIndex = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const best = remaining[bestIndex];
      const candidateDrugUses = drugUseCounts.get(getCandidateDrugIdentity(candidate)) || 0;
      const bestDrugUses = drugUseCounts.get(getCandidateDrugIdentity(best)) || 0;
      const candidateDomainUses = domainUseCounts.get(candidate.domainId) || 0;
      const bestDomainUses = domainUseCounts.get(best.domainId) || 0;

      if (
        candidateDrugUses < bestDrugUses
        || (candidateDrugUses === bestDrugUses && candidateDomainUses < bestDomainUses)
      ) {
        bestIndex = index;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    const drugIdentity = getCandidateDrugIdentity(chosen);
    selected.push(chosen);
    drugUseCounts.set(drugIdentity, (drugUseCounts.get(drugIdentity) || 0) + 1);
    domainUseCounts.set(chosen.domainId, (domainUseCounts.get(chosen.domainId) || 0) + 1);
  }

  return selected;
}

function baseQuestionMetadata(context, candidate, extra = {}) {
  return {
    generatorId: GENERATOR_ID,
    policyId: context.policy.id,
    requestedQuizWeek: candidate.requestedQuizWeek,
    sourceMaterial: candidate.materialType,
    knowledgeDomain: candidate.domainId,
    sourceDrugId: candidate.sourceDrugId,
    sourceDrugIds: [...candidate.sourceDrugIds],
    sourceDrugQuizWeek: candidate.sourceDrugQuizWeek,
    ...extra
  };
}

function materializeBrandGenericQuestion(context, candidate, sourceDrug, genericResolution, rng) {
  const policyDomain = context.domainsById.get("brandGeneric");
  const genericToBrand = nextRandom(rng) >= 0.5;
  const brandNames = genericResolution.brandNames;

  if (genericToBrand) {
    const [answer, ...acceptedAnswers] = brandNames;
    const question = {
      id: `${candidate.id}-generic-to-brand`,
      type: "short",
      prompt: `Brand name for <b>${sourceDrug.genericName}</b>?`,
      answer,
      metadata: baseQuestionMetadata(context, candidate, {
        brandGenericDirection: "genericToBrand",
        answerMatching: { ...policyDomain.answerMatching }
      })
    };
    if (acceptedAnswers.length) question._acceptedAnswers = [...acceptedAnswers];
    return { status: "materialized", question };
  }

  const brandIndex = Math.floor(nextRandom(rng) * brandNames.length);
  const brandName = brandNames[brandIndex];
  return {
    status: "materialized",
    question: {
      id: `${candidate.id}-brand-to-generic-${brandIndex + 1}`,
      type: "short",
      prompt: `Generic name for <b>${brandName}</b>?`,
      answer: sourceDrug.genericName,
      metadata: baseQuestionMetadata(context, candidate, {
        brandGenericDirection: "brandToGeneric",
        sourceBrandName: brandName,
        answerMatching: { ...policyDomain.answerMatching }
      })
    }
  };
}

function validateInverseChoiceEntries(context, candidate, sourceDrug, choiceEntries, displayedValueKey) {
  if (choiceEntries.length !== MCQ_CHOICE_COUNT) return false;
  if (new Set(choiceEntries.map((entry) => entry.sourceDrugId)).size !== MCQ_CHOICE_COUNT) {
    return false;
  }
  if (new Set(choiceEntries.map((entry) => normalizeChoiceKey(entry.value))).size !== MCQ_CHOICE_COUNT) {
    return false;
  }
  const correctEntries = choiceEntries.filter((entry) => entry.role === "correct");
  if (correctEntries.length !== 1 || correctEntries[0].sourceDrugId !== sourceDrug.id) {
    return false;
  }

  for (const entry of choiceEntries) {
    const entryDrug = context.drugsById.get(entry.sourceDrugId);
    if (
      !entryDrug
      || entry.sourceDrugQuizWeek !== entryDrug.quizWeek
      || entryDrug.quizWeek > candidate.requestedQuizWeek
      || entry.sourceDomainValue !== getDomainSourceValue(entryDrug, candidate.domainId)
      || (
        candidate.domainId === "drugClass"
        && (
          entry.quizDomainValue !== getDomainQuizValue(entryDrug, candidate.domainId)
          || entry.quizDomainValueKey !== getDomainValueKey(entryDrug, candidate.domainId)
        )
      )
      || entry.sourceDomainValueKey !== getDomainSourceValueKey(entryDrug, candidate.domainId)
      || entry.value !== entry.drugReference?.value
    ) {
      return false;
    }
    const referenceIsSourceBacked = getSourceRecordChoiceReferences(
      context,
      entryDrug,
      candidate.requestedQuizWeek
    ).some((reference) => (
      reference.metadata.type === entry.drugReference.type
      && normalizeChoiceKey(reference.value) === normalizeChoiceKey(entry.value)
    ));
    if (!referenceIsSourceBacked) return false;
    const entryQuizValueKey = candidate.domainId === "drugClass"
      ? entry.quizDomainValueKey
      : entry.sourceDomainValueKey;
    if (entry.role === "correct") {
      if (entryQuizValueKey !== displayedValueKey) return false;
    } else if (entry.role === "distractor") {
      if (entryQuizValueKey === displayedValueKey) return false;
    } else {
      return false;
    }
  }
  return true;
}

function materializeInverseStructuredQuestion(
  context,
  candidate,
  sourceDrug,
  structuralCardinality,
  normalDistractorCount,
  rng
) {
  const inversePool = getInverseStructuredChoicePool(
    context,
    candidate.domainId,
    sourceDrug,
    candidate.requestedQuizWeek
  );
  if (
    !inversePool?.correctEntry
    || inversePool.distractors.length < MCQ_CHOICE_COUNT - 1
  ) {
    return {
      status: "unavailable",
      code: "INSUFFICIENT_SOURCE_SAFE_INVERSE_DISTRACTORS",
      candidateId: candidate.id,
      domainId: candidate.domainId,
      requiredDistractors: MCQ_CHOICE_COUNT - 1,
      availableDistractors: inversePool?.distractors.length || 0,
      normalAvailableDistractors: normalDistractorCount,
      structuralCardinality,
      correctReferenceAvailable: Boolean(inversePool?.correctEntry)
    };
  }

  const distractors = shuffleCopy(inversePool.distractors, rng)
    .slice(0, MCQ_CHOICE_COUNT - 1);
  const choiceEntries = shuffleCopy([
    { ...inversePool.correctEntry, role: "correct" },
    ...distractors.map((entry) => ({ ...entry, role: "distractor" }))
  ], rng);
  const displayedValue = getDomainQuizValue(sourceDrug, candidate.domainId);
  const displayedValueKey = getDomainValueKey(sourceDrug, candidate.domainId);
  if (!validateInverseChoiceEntries(
    context,
    candidate,
    sourceDrug,
    choiceEntries,
    displayedValueKey
  )) {
    return {
      status: "unavailable",
      code: "INVALID_SOURCE_SAFE_INVERSE_CHOICES",
      candidateId: candidate.id,
      domainId: candidate.domainId
    };
  }
  const correctEntry = choiceEntries.find((entry) => entry.role === "correct");

  return {
    status: "materialized",
    question: {
      id: candidate.id,
      type: "mcq",
      prompt: DOMAIN_SPECS[candidate.domainId].inversePrompt(displayedValue),
      choices: choiceEntries.map((entry) => entry.value),
      answer: correctEntry.value,
      metadata: baseQuestionMetadata(context, candidate, {
        questionVariant: "identifyDrugByStructuredValue",
        displayedStructuredValue: {
          value: displayedValue,
          valueKey: displayedValueKey,
          ...(candidate.domainId === "drugClass" ? {
            sourceValue: getDomainSourceValue(sourceDrug, candidate.domainId),
            sourceValueKey: getDomainSourceValueKey(sourceDrug, candidate.domainId)
          } : {}),
          sourceDrugId: sourceDrug.id,
          sourceDrugQuizWeek: sourceDrug.quizWeek,
          structuralCardinality
        },
        choiceSources: choiceEntries.map((entry) => ({ ...entry }))
      })
    }
  };
}

function materializeMcqQuestion(context, candidate, sourceDrug, rng) {
  const correctValue = getDomainQuizValue(sourceDrug, candidate.domainId);
  const structuralCardinality = getDomainStructuralCardinality(sourceDrug, candidate.domainId);
  const distractorPool = getDistinctDistractorEntries(
    context,
    candidate.domainId,
    sourceDrug,
    candidate.requestedQuizWeek
  );
  if (distractorPool.length < MCQ_CHOICE_COUNT - 1) {
    if (structuralCardinality !== null) {
      return materializeInverseStructuredQuestion(
        context,
        candidate,
        sourceDrug,
        structuralCardinality,
        distractorPool.length,
        rng
      );
    }
    return {
      status: "unavailable",
      code: "INSUFFICIENT_DISTRACTORS",
      candidateId: candidate.id,
      domainId: candidate.domainId,
      requiredDistractors: MCQ_CHOICE_COUNT - 1,
      availableDistractors: distractorPool.length
    };
  }

  const distractors = shuffleCopy(distractorPool, rng).slice(0, MCQ_CHOICE_COUNT - 1);
  const choiceEntries = shuffleCopy([
    {
      value: correctValue,
      sourceDrugId: sourceDrug.id,
      sourceDrugQuizWeek: sourceDrug.quizWeek,
      ...(candidate.domainId === "drugClass" ? {
        sourceDomainValue: getDomainSourceValue(sourceDrug, candidate.domainId),
        quizDomainValue: correctValue,
        sourceDomainValueKey: getDomainSourceValueKey(sourceDrug, candidate.domainId),
        quizDomainValueKey: getDomainValueKey(sourceDrug, candidate.domainId)
      } : {}),
      role: "correct"
    },
    ...distractors.map((entry) => ({ ...entry, role: "distractor" }))
  ], rng);
  const choiceKeys = choiceEntries.map((entry) => normalizeChoiceKey(entry.value));
  if (new Set(choiceKeys).size !== choiceEntries.length) {
    return {
      status: "unavailable",
      code: "AMBIGUOUS_CHOICES",
      candidateId: candidate.id,
      domainId: candidate.domainId
    };
  }
  const stemReference = selectMcqStemReference(
    context,
    sourceDrug,
    candidate.requestedQuizWeek,
    rng
  );

  return {
    status: "materialized",
    question: {
      id: candidate.id,
      type: "mcq",
      prompt: DOMAIN_SPECS[candidate.domainId].prompt(stemReference.html),
      choices: choiceEntries.map((entry) => entry.value),
      answer: correctValue,
      metadata: baseQuestionMetadata(context, candidate, {
        choiceSources: choiceEntries.map((entry) => ({ ...entry })),
        stemReference: stemReference.metadata,
        ...(structuralCardinality === null
          ? {}
          : { questionVariant: "structuredValueChoices" })
      })
    }
  };
}

function materializeFromContext(context, candidate, rng) {
  requireObject(candidate, "candidate");
  if (typeof rng !== "function") fail("INVALID_RNG", "An RNG function is required for materialization.");
  assertQuizWeek(context, candidate.requestedQuizWeek);
  const sourceDrug = context.drugsById.get(candidate.sourceDrugId);
  if (!sourceDrug) fail("UNKNOWN_SOURCE_DRUG", `Unknown source drug ${candidate.sourceDrugId}.`);
  if (candidate.sourceDrugQuizWeek !== sourceDrug.quizWeek) {
    fail("CANDIDATE_SOURCE_MISMATCH", `${candidate.id} does not preserve its source drug week.`);
  }
  const materialWeekIsValid = candidate.materialType === "new"
    ? sourceDrug.quizWeek === candidate.requestedQuizWeek
    : candidate.materialType === "review"
      ? sourceDrug.quizWeek < candidate.requestedQuizWeek
      : false;
  if (!materialWeekIsValid) {
    fail(
      "INELIGIBLE_CANDIDATE_SOURCE",
      `${candidate.id} is not eligible as ${candidate.materialType} material for Week ${candidate.requestedQuizWeek}.`,
      {
        sourceDrugId: sourceDrug.id,
        sourceDrugQuizWeek: sourceDrug.quizWeek,
        requestedQuizWeek: candidate.requestedQuizWeek,
        materialType: candidate.materialType
      }
    );
  }
  if (!context.domainsById.has(candidate.domainId)) {
    fail("UNSUPPORTED_DOMAIN", `Unknown candidate domain ${candidate.domainId}.`);
  }
  const genericResolution = getGenericIdentityResolution(
    context,
    sourceDrug,
    candidate.domainId,
    candidate.requestedQuizWeek
  );
  if (genericResolution.status === "ambiguous") {
    return {
      status: "unavailable",
      code: "AMBIGUOUS_DUPLICATE_GENERIC",
      candidateId: candidate.id,
      domainId: candidate.domainId,
      genericIdentity: genericResolution.genericIdentity,
      sourceDrugIds: genericResolution.sourceDrugIds,
      distinctValueCount: genericResolution.distinctValueCount
    };
  }
  if (genericResolution.status === "redundant") {
    return {
      status: "unavailable",
      code: "REDUNDANT_DUPLICATE_GENERIC",
      candidateId: candidate.id,
      domainId: candidate.domainId,
      genericIdentity: genericResolution.genericIdentity,
      sourceDrugIds: genericResolution.sourceDrugIds,
      canonicalSourceDrugId: genericResolution.canonicalDrug.id
    };
  }
  const resolvedCandidate = {
    ...candidate,
    sourceDrugIds: genericResolution.sourceDrugIds,
    sourceGenericIdentity: genericResolution.genericIdentity
  };
  if (candidate.domainId === "brandGeneric") {
    return materializeBrandGenericQuestion(
      context,
      resolvedCandidate,
      sourceDrug,
      genericResolution,
      rng
    );
  }
  return materializeMcqQuestion(context, resolvedCandidate, sourceDrug, rng);
}

function applyMcqStemReference(question, sourceDrug, stemReference) {
  return {
    ...question,
    prompt: DOMAIN_SPECS[question.metadata.knowledgeDomain].prompt(stemReference.html),
    metadata: {
      ...question.metadata,
      stemReference: stemReference.metadata
    }
  };
}

function isInverseStructuredQuestion(question) {
  return question.metadata?.questionVariant === "identifyDrugByStructuredValue";
}

function normalizePreAnswerVisibleText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function questionPreAnswerVisibleText(question) {
  return normalizePreAnswerVisibleText([
    question.prompt,
    ...(Array.isArray(question.choices) ? question.choices : [])
  ].join(" "));
}

function visibleTextContainsAnswer(visibleText, answer) {
  const normalizedAnswer = normalizePreAnswerVisibleText(answer);
  if (!normalizedAnswer) return false;
  return ` ${visibleText} `.includes(` ${normalizedAnswer} `);
}

function materializeBrandGenericDirection(context, question, direction) {
  const sourceDrug = context.drugsById.get(question.metadata.sourceDrugId);
  const genericResolution = getGenericIdentityResolution(
    context,
    sourceDrug,
    "brandGeneric",
    question.metadata.requestedQuizWeek
  );
  const baseId = question.id.replace(/-(?:generic-to-brand|brand-to-generic-\d+)$/, "");
  const baseQuestion = { ...question };
  delete baseQuestion._acceptedAnswers;
  const metadata = { ...question.metadata, brandGenericDirection: direction };
  delete metadata.sourceBrandName;

  if (direction === "genericToBrand") {
    const [answer, ...acceptedAnswers] = genericResolution.brandNames;
    const nextQuestion = {
      ...baseQuestion,
      id: `${baseId}-generic-to-brand`,
      prompt: `Brand name for <b>${sourceDrug.genericName}</b>?`,
      answer,
      metadata
    };
    if (acceptedAnswers.length) nextQuestion._acceptedAnswers = acceptedAnswers;
    return nextQuestion;
  }

  const preferredBrand = question.metadata.sourceBrandName;
  const brandNames = [preferredBrand, ...genericResolution.brandNames]
    .filter(Boolean)
    .filter((brandName, index, values) => (
      values.findIndex((value) => normalizeChoiceKey(value) === normalizeChoiceKey(brandName)) === index
    ));
  const brandName = brandNames.find((candidate) => isBrandOnlyReferenceSafe(
    context,
    candidate,
    sourceDrug.genericName,
    question.metadata.requestedQuizWeek
  ));
  if (!brandName) return null;
  const brandIndex = genericResolution.brandNames.findIndex(
    (candidate) => normalizeChoiceKey(candidate) === normalizeChoiceKey(brandName)
  );
  return {
    ...baseQuestion,
    id: `${baseId}-brand-to-generic-${brandIndex + 1}`,
    prompt: `Generic name for <b>${brandName}</b>?`,
    answer: sourceDrug.genericName,
    metadata: {
      ...metadata,
      sourceBrandName: brandName
    }
  };
}

function buildBrandGenericProtections(context, questions) {
  const protectedByIdentity = new Map();

  for (const question of questions) {
    if (question.metadata?.knowledgeDomain !== "brandGeneric") continue;
    const sourceDrug = context.drugsById.get(question.metadata.sourceDrugId);
    const genericIdentity = normalizeGenericIdentity(sourceDrug.genericName);
    if (protectedByIdentity.has(genericIdentity)) {
      fail(
        "DUPLICATE_BRAND_GENERIC_IDENTITY",
        `${sourceDrug.genericName} cannot have multiple Brand / Generic questions in one practice set.`,
        { genericIdentity }
      );
    }

    const direction = question.metadata.brandGenericDirection;
    if (!new Set(["genericToBrand", "brandToGeneric"]).has(direction)) {
      fail("INVALID_BRAND_GENERIC_DIRECTION", `${question.id} has an invalid Brand / Generic direction.`);
    }
    protectedByIdentity.set(genericIdentity, {
      questionId: question.id,
      direction,
      protectedAnswers: [question.answer, ...(question._acceptedAnswers || [])],
      brandName: question.metadata.sourceBrandName
    });
  }

  return protectedByIdentity;
}

function questionImmutablePreAnswerVisibleText(question) {
  return normalizePreAnswerVisibleText([
    ...(question.type === "mcq" && !isInverseStructuredQuestion(question)
      ? []
      : [question.prompt]),
    ...(Array.isArray(question.choices) ? question.choices : [])
  ].join(" "));
}

function referenceLeaksProtectedAnswer(reference, protectedAnswers) {
  const visibleText = normalizePreAnswerVisibleText(reference.value);
  return protectedAnswers.some((answer) => visibleTextContainsAnswer(visibleText, answer));
}

function rebuildInverseChoicesForProtections(context, question, protections) {
  const quizWeek = question.metadata.requestedQuizWeek;
  const domainId = question.metadata.knowledgeDomain;
  const sourceDrug = context.drugsById.get(question.metadata.sourceDrugId);
  const displayedValueKey = question.metadata.displayedStructuredValue?.valueKey;
  const protectedAnswers = [...protections.values()]
    .flatMap((protection) => protection.protectedAnswers);
  const originalEntries = question.metadata.choiceSources;
  const correctIndex = originalEntries.findIndex((entry) => entry.role === "correct");
  if (!sourceDrug || !displayedValueKey || correctIndex < 0) return null;

  const rebuiltEntries = new Array(originalEntries.length);
  const usedSourceDrugIds = new Set();
  const usedReferenceKeys = new Set();
  const getSafeReference = (drug) => getSourceRecordChoiceReferences(context, drug, quizWeek)
    .find((reference) => (
      !usedReferenceKeys.has(normalizeChoiceKey(reference.value))
      && !referenceLeaksProtectedAnswer(reference, protectedAnswers)
    ));

  const correctReference = getSafeReference(sourceDrug);
  if (!correctReference) return null;
  rebuiltEntries[correctIndex] = {
    ...createInverseChoiceEntry(context, domainId, sourceDrug, quizWeek, correctReference),
    role: "correct"
  };
  usedSourceDrugIds.add(sourceDrug.id);
  usedReferenceKeys.add(normalizeChoiceKey(correctReference.value));

  const preferredDistractorIds = originalEntries
    .filter((entry) => entry.role === "distractor")
    .map((entry) => entry.sourceDrugId);
  const alternateDistractorIds = getAvailableDrugsThroughWeek(context, quizWeek)
    .filter((drug) => {
      const valueKey = getDomainValueKey(drug, domainId);
      return (domainId !== "drugClass" || valueKey) && valueKey !== displayedValueKey;
    })
    .map((drug) => drug.id);
  const allDistractorIds = [...preferredDistractorIds, ...alternateDistractorIds]
    .filter((drugId, index, values) => values.indexOf(drugId) === index);

  for (let index = 0; index < originalEntries.length; index += 1) {
    if (index === correctIndex) continue;
    const preferredSourceDrugId = originalEntries[index].sourceDrugId;
    const candidateIds = [preferredSourceDrugId, ...allDistractorIds]
      .filter((drugId, candidateIndex, values) => values.indexOf(drugId) === candidateIndex);
    let rebuiltEntry = null;
    for (const drugId of candidateIds) {
      if (usedSourceDrugIds.has(drugId)) continue;
      const drug = context.drugsById.get(drugId);
      if (
        !drug
        || drug.quizWeek > quizWeek
        || (domainId === "drugClass" && !getDomainValueKey(drug, domainId))
        || getDomainValueKey(drug, domainId) === displayedValueKey
      ) {
        continue;
      }
      const reference = getSafeReference(drug);
      if (!reference) continue;
      rebuiltEntry = {
        ...createInverseChoiceEntry(context, domainId, drug, quizWeek, reference),
        role: "distractor"
      };
      usedSourceDrugIds.add(drug.id);
      usedReferenceKeys.add(normalizeChoiceKey(reference.value));
      break;
    }
    if (!rebuiltEntry) return null;
    rebuiltEntries[index] = rebuiltEntry;
  }

  const validationCandidate = {
    requestedQuizWeek: quizWeek,
    domainId
  };
  if (!validateInverseChoiceEntries(
    context,
    validationCandidate,
    sourceDrug,
    rebuiltEntries,
    displayedValueKey
  )) {
    return null;
  }
  const correctEntry = rebuiltEntries[correctIndex];
  return {
    ...question,
    choices: rebuiltEntries.map((entry) => entry.value),
    answer: correctEntry.value,
    metadata: {
      ...question.metadata,
      choiceSources: rebuiltEntries.map((entry) => ({ ...entry }))
    }
  };
}

function selectSafeBrandGenericDirections(context, questions) {
  const brandGenericIndexes = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.metadata?.knowledgeDomain === "brandGeneric");
  if (!brandGenericIndexes.length) return questions;

  let combinations = [[]];
  for (const { question, index } of brandGenericIndexes) {
    const originalDirection = question.metadata.brandGenericDirection;
    const alternateDirection = originalDirection === "genericToBrand"
      ? "brandToGeneric"
      : "genericToBrand";
    const variants = [originalDirection, alternateDirection]
      .map((direction) => materializeBrandGenericDirection(context, question, direction))
      .filter(Boolean)
      .map((variant) => ({ index, variant }));
    combinations = combinations.flatMap((combination) => (
      variants.map((variant) => [...combination, variant])
    ));
  }

  for (const combination of combinations) {
    let candidateQuestions = [...questions];
    for (const { index, variant } of combination) candidateQuestions[index] = variant;
    const protections = buildBrandGenericProtections(context, candidateQuestions);
    let inverseChoicesAreSafe = true;
    candidateQuestions = candidateQuestions.map((question) => {
      if (!isInverseStructuredQuestion(question)) return question;
      const rebuilt = rebuildInverseChoicesForProtections(context, question, protections);
      if (!rebuilt) inverseChoicesAreSafe = false;
      return rebuilt || question;
    });
    if (!inverseChoicesAreSafe) continue;
    let safe = true;
    for (const protection of protections.values()) {
      for (const question of candidateQuestions) {
        if (question.id === protection.questionId) continue;
        const immutableVisibleText = questionImmutablePreAnswerVisibleText(question);
        if (protection.protectedAnswers.some(
          (answer) => visibleTextContainsAnswer(immutableVisibleText, answer)
        )) {
          safe = false;
          break;
        }
      }
      if (!safe) break;
    }
    if (safe) return candidateQuestions;
  }

  fail(
    "CROSS_QUESTION_BRAND_GENERIC_LEAKAGE",
    "No safe Brand / Generic direction exists for the selected practice questions."
  );
}

function stemReferenceCandidates(context, question, sourceDrug, protection) {
  if (protection?.direction === "genericToBrand") {
    return [createMcqStemReference(sourceDrug, "generic")];
  }
  if (protection?.direction === "brandToGeneric") {
    return [createMcqStemReference(sourceDrug, "brand", protection.brandName)];
  }

  const current = question.metadata.stemReference;
  const candidates = [
    createMcqStemReference(sourceDrug, current.type, current.brandName),
    createMcqStemReference(sourceDrug, "generic")
  ];
  for (const brandName of sourceDrug.brandNames) {
    if (isBrandOnlyReferenceSafe(
      context,
      brandName,
      sourceDrug.genericName,
      question.metadata.requestedQuizWeek
    )) {
      candidates.push(createMcqStemReference(sourceDrug, "brand", brandName));
    }
  }
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.metadata.type}\0${normalizeChoiceKey(candidate.metadata.brandName)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyQuizLevelBrandGenericLeakageGuard(context, questions) {
  const directionSafeQuestions = selectSafeBrandGenericDirections(context, questions);
  const protectedByIdentity = buildBrandGenericProtections(context, directionSafeQuestions);
  const allProtections = [...protectedByIdentity.values()];

  const guardedQuestions = directionSafeQuestions.map((question) => {
    if (question.type !== "mcq" || isInverseStructuredQuestion(question)) return question;
    const sourceDrug = context.drugsById.get(question.metadata.sourceDrugId);
    const protection = protectedByIdentity.get(normalizeGenericIdentity(sourceDrug.genericName));
    const safeReference = stemReferenceCandidates(context, question, sourceDrug, protection)
      .find((candidate) => {
        const candidateQuestion = applyMcqStemReference(question, sourceDrug, candidate);
        const promptText = normalizePreAnswerVisibleText(candidateQuestion.prompt);
        return allProtections.every((item) => item.protectedAnswers.every(
          (answer) => !visibleTextContainsAnswer(promptText, answer)
        ));
      });
    if (!safeReference) {
      fail(
        "CROSS_QUESTION_BRAND_GENERIC_LEAKAGE",
        `${question.id} has no safe source-backed stem reference.`,
        { leakingQuestionId: question.id }
      );
    }
    return applyMcqStemReference(
      question,
      sourceDrug,
      safeReference
    );
  });

  for (const protection of protectedByIdentity.values()) {
    for (const question of guardedQuestions) {
      if (question.id === protection.questionId) continue;
      const visibleText = questionPreAnswerVisibleText(question);
      const leakedAnswer = protection.protectedAnswers.find(
        (answer) => visibleTextContainsAnswer(visibleText, answer)
      );
      if (leakedAnswer) {
        fail(
          "CROSS_QUESTION_BRAND_GENERIC_LEAKAGE",
          `${question.id} reveals a Brand / Generic answer protected by ${protection.questionId}.`,
          {
            leakingQuestionId: question.id,
            protectedQuestionId: protection.questionId,
            leakedAnswer
          }
        );
      }
    }
  }

  return guardedQuestions;
}

export function materializeQuestionCandidate({ candidate, drugData, policy, rng }) {
  const context = createContext(drugData, policy);
  return materializeFromContext(context, candidate, rng);
}

function resolveRandomSource({ quizWeek, seed, rng }) {
  if (rng !== undefined && typeof rng !== "function") {
    fail("INVALID_RNG", "rng must be a function when provided.");
  }
  if (rng && seed !== undefined) {
    fail("AMBIGUOUS_RANDOM_SOURCE", "Provide either seed or rng, not both.");
  }
  if (rng) return { rng, seed: null, randomSource: "injected-rng" };

  const effectiveSeed = seed ?? `${GENERATOR_ID}-week-${quizWeek}`;
  return {
    rng: createSeededRng(effectiveSeed),
    seed: String(effectiveSeed),
    randomSource: "seed"
  };
}

export function generateFall2026Quiz({
  drugData,
  policy,
  quizWeek,
  seed,
  rng,
  mode,
  questionCount
} = {}) {
  const context = createContext(drugData, policy);
  assertQuizWeek(context, quizWeek);

  if (quizWeek === context.week1.quizWeek) {
    if (mode === "practice") {
      if (questionCount !== WEEK_1_PRACTICE_QUESTION_COUNT) {
        fail(
          "INVALID_WEEK_1_PRACTICE_CONFIGURATION",
          `Week 1 practice requires exactly ${WEEK_1_PRACTICE_QUESTION_COUNT} questions.`,
          { questionCount }
        );
      }

      const randomSource = resolveRandomSource({ quizWeek, seed, rng });
      const newCandidates = buildCandidatesFromContext(context, quizWeek, "new");
      const selectedNew = selectPracticeQuestionCandidates({
        candidates: newCandidates,
        count: questionCount,
        rng: randomSource.rng
      });
      const materialized = selectedNew.map((candidate) => {
        const result = materializeFromContext(context, candidate, randomSource.rng);
        if (result.status !== "materialized") {
          fail("CANDIDATE_MATERIALIZATION_FAILED", `Candidate ${candidate.id} could not be materialized.`, result);
        }
        return result.question;
      });
      const guardedQuestions = applyQuizLevelBrandGenericLeakageGuard(context, materialized);
      const questions = shuffleCopy(guardedQuestions, randomSource.rng);

      return {
        status: "generated",
        id: "fall-2026-p2-lab3-week-01-practice",
        title: "Lab III Fall 2026 - Week 1 Practice",
        quizWeek,
        mode,
        practiceConfiguration: true,
        practiceNote: WEEK_1_PRACTICE_NOTE,
        seed: randomSource.seed,
        randomSource: randomSource.randomSource,
        composition: {
          newMaterialItemTarget: questionCount,
          reviewMaterialItemTarget: 0,
          totalItemTarget: questionCount
        },
        questions
      };
    }

    if (mode !== undefined || questionCount !== undefined) {
      fail(
        "INVALID_WEEK_1_PRACTICE_CONFIGURATION",
        "Week 1 overrides require mode \"practice\" and exactly 10 questions."
      );
    }

    return {
      status: "unresolved-policy",
      code: "WEEK_1_COMPOSITION_UNRESOLVED",
      quizWeek,
      canGenerateCompleteQuiz: false,
      composition: {
        newMaterialItemTarget: context.week1.newMaterialItemTarget,
        reviewMaterialEligible: context.week1.reviewMaterialEligible,
        reviewMaterialItemTarget: context.week1.reviewMaterialItemTarget,
        totalItemTarget: context.week1.totalItemTarget
      },
      message: context.week1.unresolvedDecision
    };
  }

  if (mode !== undefined || questionCount !== undefined) {
    fail(
      "INVALID_PRACTICE_OVERRIDE",
      "The explicit practice override is supported only for Week 1."
    );
  }

  const [minimumWeek, maximumWeek] = context.later.quizWeekRange;
  if (quizWeek < minimumWeek || quizWeek > maximumWeek) {
    fail("INVALID_QUIZ_WEEK", `Complete generation is supported only for Weeks ${minimumWeek}-${maximumWeek}.`, {
      quizWeek
    });
  }

  const randomSource = resolveRandomSource({ quizWeek, seed, rng });
  const newCandidates = buildCandidatesFromContext(context, quizWeek, "new");
  const reviewCandidates = buildCandidatesFromContext(context, quizWeek, "review");
  const selectedNew = selectPracticeQuestionCandidates({
    candidates: newCandidates,
    count: context.later.newMaterialItemTarget,
    rng: randomSource.rng
  });
  const selectedReview = selectPracticeQuestionCandidates({
    candidates: reviewCandidates,
    count: context.later.reviewMaterialItemTarget,
    rng: randomSource.rng
  });

  const materialized = [...selectedNew, ...selectedReview].map((candidate) => {
    const result = materializeFromContext(context, candidate, randomSource.rng);
    if (result.status !== "materialized") {
      fail("CANDIDATE_MATERIALIZATION_FAILED", `Candidate ${candidate.id} could not be materialized.`, result);
    }
    return result.question;
  });
  const guardedQuestions = applyQuizLevelBrandGenericLeakageGuard(context, materialized);
  const questions = shuffleCopy(guardedQuestions, randomSource.rng);

  if (questions.length !== context.later.totalItemTarget) {
    fail("COMPOSITION_MISMATCH", "Generated quiz does not match the policy total.");
  }

  return {
    status: "generated",
    id: `fall-2026-p2-lab3-week-${String(quizWeek).padStart(2, "0")}`,
    title: `Fall 2026 P2 Lab III Quiz ${quizWeek}`,
    quizWeek,
    seed: randomSource.seed,
    randomSource: randomSource.randomSource,
    composition: {
      newMaterialItemTarget: context.later.newMaterialItemTarget,
      reviewMaterialItemTarget: context.later.reviewMaterialItemTarget,
      totalItemTarget: context.later.totalItemTarget
    },
    questions
  };
}
