/**
 * Pure Fall 2026 selector/generator. The choices below are implementation
 * behavior, not additional Lab III policy: one candidate per eligible
 * normalized generic identity/domain; duplicate identities aggregate official
 * brands, suppress generic-only MCQs whose official values disagree, and use
 * the latest eligible week then source order as the canonical tie-breaker;
 * four choices per MCQ; complete source arrays displayed with semicolon
 * separators; seeded uniform candidate/option shuffles; a seeded Brand/Generic
 * direction (and brand variant); no domain quotas or no-repeat drug rule; and
 * a final seeded shuffle of the ten selected questions.
 */
const GENERATOR_ID = "fall-2026-p2-lab3-deterministic-generator";
const MCQ_CHOICE_COUNT = 4;
const WEEK_1_PRACTICE_QUESTION_COUNT = 10;

export const WEEK_1_PRACTICE_NOTE = "Practice configuration: Week 1 has no prior review material. This 10-question study set uses Week 1 content only and is not intended to claim the exact official Week 1 quiz composition.";

const DOMAIN_SPECS = Object.freeze({
  drugClass: Object.freeze({
    field: "drugClass",
    prompt: (drug) => `Which complete drug-class listing is recorded for <b>${drug.genericName}</b>?`
  }),
  fdaIndication: Object.freeze({
    field: "fdaIndications",
    prompt: (drug) => `Which complete FDA indication list is recorded for <b>${drug.genericName}</b>?`
  }),
  mechanismOfAction: Object.freeze({
    field: "mechanismOfAction",
    prompt: (drug) => `Which mechanism of action belongs to <b>${drug.genericName}</b>?`
  }),
  topAdverseReactions: Object.freeze({
    field: "adverseReactions",
    prompt: (drug) => `Which complete top adverse-reaction list is recorded for <b>${drug.genericName}</b>?`
  }),
  boxWarning: Object.freeze({
    field: "boxWarning",
    prompt: (drug) => `Which boxed-warning value belongs to <b>${drug.genericName}</b>?`
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

function getDomainValueKey(drug, domainId) {
  const spec = DOMAIN_SPECS[domainId];
  if (!spec) fail("UNSUPPORTED_DOMAIN", `Unsupported MCQ domain: ${domainId}.`);
  const rawValue = drug[spec.field];
  if (Array.isArray(rawValue)) {
    return rawValue.map(normalizeChoiceKey).filter(Boolean).sort().join("\0");
  }
  return normalizeChoiceKey(rawValue);
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
  const byValue = new Map();

  for (const drug of getAvailableDrugsThroughWeek(context, quizWeek)) {
    const value = getDomainSourceValue(drug, domainId);
    const key = getDomainValueKey(drug, domainId);
    if (!key || key === correctKey || byValue.has(key)) continue;
    byValue.set(key, {
      value,
      sourceDrugId: drug.id,
      sourceDrugQuizWeek: drug.quizWeek
    });
  }
  return [...byValue.values()];
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
        const distractors = getDistinctDistractorEntries(context, domainId, drug, quizWeek);
        if (distractors.length < MCQ_CHOICE_COUNT - 1) continue;
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

function materializeMcqQuestion(context, candidate, sourceDrug, rng) {
  const correctValue = getDomainSourceValue(sourceDrug, candidate.domainId);
  const distractorPool = getDistinctDistractorEntries(
    context,
    candidate.domainId,
    sourceDrug,
    candidate.requestedQuizWeek
  );
  if (distractorPool.length < MCQ_CHOICE_COUNT - 1) {
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

  return {
    status: "materialized",
    question: {
      id: candidate.id,
      type: "mcq",
      prompt: DOMAIN_SPECS[candidate.domainId].prompt(sourceDrug),
      choices: choiceEntries.map((entry) => entry.value),
      answer: correctValue,
      metadata: baseQuestionMetadata(context, candidate, {
        choiceSources: choiceEntries.map((entry) => ({ ...entry }))
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
      const selectedNew = selectQuestionCandidates({
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
      const questions = shuffleCopy(materialized, randomSource.rng);

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
  const selectedNew = selectQuestionCandidates({
    candidates: newCandidates,
    count: context.later.newMaterialItemTarget,
    rng: randomSource.rng
  });
  const selectedReview = selectQuestionCandidates({
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
  const questions = shuffleCopy(materialized, randomSource.rng);

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
