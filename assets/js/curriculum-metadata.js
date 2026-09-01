// Shared additive curriculum metadata contract for static and generated quizzes.
(function (root, factory) {
  root.PharmletCurriculumMetadata = factory(root);
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const FALL_GENERATOR_ID = "fall-2026-p2-lab3-deterministic-generator";
  const FALL_PRACTICE_KIND = "fall-2026-lab3-practice";
  const FALL_2026_LAB3_PROFILE = Object.freeze({
    professionalYear: "P2",
    academicYear: "2026-27",
    semester: "Fall 2026",
    lab: "Lab III",
    curriculumId: "p2-fall-2026-lab3",
    curriculumSource: "fall-2026-p2-top-drugs",
    origin: "generated"
  });
  const QUIZ_FIELDS = Object.freeze([
    "professionalYear",
    "academicYear",
    "semester",
    "course",
    "lab",
    "quizId",
    "sourceQuizId",
    "quizWeek",
    "curriculumId",
    "curriculumSource",
    "origin",
    "generatorId",
    "seed"
  ]);
  const QUESTION_FIELDS = Object.freeze([
    "questionId",
    "knowledgeDomain",
    "sourceMaterial",
    "sourceDrugId",
    "sourceDrugIds",
    "sourceDrugQuizWeek",
    "questionVariant",
    "brandGenericDirection"
  ]);

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function cleanText(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function readNormalized(sources, aliases, normalize) {
    let resolved;
    for (const source of sources) {
      if (!isRecord(source)) continue;
      for (const alias of aliases) {
        if (!Object.prototype.hasOwnProperty.call(source, alias)) continue;
        const value = normalize(source[alias]);
        if (value === undefined || value === null || value === "") continue;
        resolved = value;
        break;
      }
    }
    return resolved;
  }

  function readText(sources, aliases) {
    return readNormalized(sources, aliases, cleanText);
  }

  function normalizeProfessionalYear(value) {
    const normalized = cleanText(value).toUpperCase();
    return /^P[1-9]\d*$/.test(normalized) ? normalized : "";
  }

  function normalizeAcademicYear(value) {
    const normalized = cleanText(value);
    return /^\d{4}-(?:\d{2}|\d{4})$/.test(normalized) ? normalized : "";
  }

  function academicYearBounds(value) {
    const match = normalizeAcademicYear(value).match(/^(\d{4})-(\d{2}|\d{4})$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2].length === 2 ? `${match[1].slice(0, 2)}${match[2]}` : match[2]);
    return Number.isInteger(start) && Number.isInteger(end) ? { start, end } : null;
  }

  function normalizeSemester(value, academicYear = "") {
    const normalized = cleanText(value);
    const seasonMatch = normalized.match(/\b(fall|spring|summer)\b/i);
    if (!seasonMatch) return "";

    const season = seasonMatch[1].charAt(0).toUpperCase() + seasonMatch[1].slice(1).toLowerCase();
    const explicitYear = normalized.match(/\b(20\d{2})\b/);
    if (explicitYear) return `${season} ${explicitYear[1]}`;

    const bounds = academicYearBounds(academicYear);
    if (!bounds) return "";
    return `${season} ${season === "Fall" ? bounds.start : bounds.end}`;
  }

  function normalizeOrigin(value) {
    const normalized = cleanText(value).toLowerCase();
    return normalized === "static" || normalized === "generated" ? normalized : "";
  }

  function normalizeSourceMaterial(value) {
    const normalized = cleanText(value).toLowerCase();
    return normalized === "new" || normalized === "review" ? normalized : "";
  }

  function positiveInteger(value) {
    if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
  }

  function uniqueStrings(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(cleanText).filter(Boolean))];
  }

  function setText(target, key, value) {
    const normalized = cleanText(value);
    if (normalized) target[key] = normalized;
  }

  function normalizeQuizMetadata(...sources) {
    const quiz = {};
    const professionalYear = readNormalized(sources, ["professionalYear"], normalizeProfessionalYear);
    const academicYear = readNormalized(sources, ["academicYear"], normalizeAcademicYear);
    const semester = readNormalized(sources, ["semester"], (value) => normalizeSemester(value, academicYear));
    const quizWeek = readNormalized(sources, ["quizWeek", "requestedQuizWeek"], positiveInteger);
    const origin = readNormalized(sources, ["origin"], normalizeOrigin);

    if (professionalYear) quiz.professionalYear = professionalYear;
    if (academicYear) quiz.academicYear = academicYear;
    if (semester) quiz.semester = semester;
    setText(quiz, "course", readText(sources, ["course"]));
    setText(quiz, "lab", readText(sources, ["lab"]));
    setText(quiz, "quizId", readText(sources, ["quizId"]));
    setText(quiz, "sourceQuizId", readText(sources, ["sourceQuizId", "generatedFrom"]));
    if (quizWeek) quiz.quizWeek = quizWeek;
    setText(quiz, "curriculumId", readText(sources, ["curriculumId"]));
    setText(quiz, "curriculumSource", readText(sources, ["curriculumSource"]));
    if (origin) quiz.origin = origin;
    setText(quiz, "generatorId", readText(sources, ["generatorId", "generator"]));
    setText(quiz, "seed", readText(sources, ["seed"]));
    return quiz;
  }

  function normalizeQuestionMetadata(...sources) {
    const question = {};
    setText(question, "questionId", readText(sources, ["questionId", "id"]));
    setText(question, "knowledgeDomain", readText(sources, ["knowledgeDomain"]));

    const sourceMaterial = readNormalized(
      sources,
      ["sourceMaterial", "materialType"],
      normalizeSourceMaterial
    );
    if (sourceMaterial) question.sourceMaterial = sourceMaterial;

    setText(question, "sourceDrugId", readText(sources, ["sourceDrugId"]));
    const sourceDrugIds = readNormalized(sources, ["sourceDrugIds"], (value) => {
      const normalized = uniqueStrings(value);
      return normalized.length ? normalized : null;
    });
    if (sourceDrugIds?.length) question.sourceDrugIds = sourceDrugIds;

    const sourceDrugQuizWeek = readNormalized(sources, ["sourceDrugQuizWeek"], positiveInteger);
    if (sourceDrugQuizWeek) question.sourceDrugQuizWeek = sourceDrugQuizWeek;
    setText(question, "questionVariant", readText(sources, ["questionVariant"]));
    setText(question, "brandGenericDirection", readText(sources, ["brandGenericDirection"]));
    return question;
  }

  function mergeCurriculumMetadata(...contracts) {
    return {
      schemaVersion: SCHEMA_VERSION,
      quiz: normalizeQuizMetadata(...contracts.map((contract) => contract?.quiz)),
      question: normalizeQuestionMetadata(...contracts.map((contract) => contract?.question))
    };
  }

  function isFall2026Lab3(quizMetadata, questionMetadata) {
    return cleanText(quizMetadata?.kind) === FALL_PRACTICE_KIND
      || cleanText(quizMetadata?.generator) === FALL_GENERATOR_ID
      || cleanText(quizMetadata?.generatorId) === FALL_GENERATOR_ID
      || cleanText(questionMetadata?.generatorId) === FALL_GENERATOR_ID;
  }

  function resolveCatalogContext(quizId, explicitEntry) {
    const catalog = root.PharmletQuizCatalog;
    const directContext = catalog?.getCurriculumContext?.(quizId);
    if (isRecord(directContext)) return directContext;

    const entry = explicitEntry || catalog?.getEntry?.(quizId);
    if (!isRecord(entry)) return {};
    const context = isRecord(entry.curriculum) ? { ...entry.curriculum } : {};
    context.quizId = cleanText(quizId || entry.id);
    if (!context.origin) {
      if (entry.sourceType === "quiz-json") context.origin = "static";
      if (entry.sourceType === "concept-route" || entry.sourceType === "virtual") context.origin = "generated";
    }
    if (!context.curriculumSource && entry.sourcePath) context.curriculumSource = entry.sourcePath;
    return context;
  }

  function normalizeCurriculumMetadata(input = {}) {
    const quizMetadata = isRecord(input.quizMetadata) ? input.quizMetadata : {};
    const questionMetadata = isRecord(input.questionMetadata) ? input.questionMetadata : {};
    const routeQuizId = cleanText(input.quizId || quizMetadata.quizId);
    const fall = isFall2026Lab3(quizMetadata, questionMetadata);
    const sourceQuizId = cleanText(input.sourceQuizId);
    const isGeneratedContainer = routeQuizId === "custom-quiz" || routeQuizId === "review-quiz";
    const stableSourceQuizId = cleanText(
      sourceQuizId || (isGeneratedContainer ? quizMetadata.generatedFrom : "")
    );
    const catalogLookupId = isGeneratedContainer && stableSourceQuizId ? stableSourceQuizId : routeQuizId;
    const catalogContext = resolveCatalogContext(catalogLookupId, input.catalogEntry);
    const fallProfile = fall ? FALL_2026_LAB3_PROFILE : {};
    const quizRuntime = {
      ...quizMetadata,
      quizId: routeQuizId || stableSourceQuizId,
      sourceQuizId: stableSourceQuizId,
      quizWeek: quizMetadata.quizWeek || questionMetadata.requestedQuizWeek,
      generatorId: quizMetadata.generatorId || quizMetadata.generator || questionMetadata.generatorId,
      ...(isGeneratedContainer ? { origin: "generated" } : {})
    };
    const questionRuntime = {
      ...questionMetadata,
      questionId: input.questionId || questionMetadata.questionId || questionMetadata.id
    };

    return {
      schemaVersion: SCHEMA_VERSION,
      quiz: normalizeQuizMetadata(catalogContext, quizRuntime, input.quiz, fallProfile),
      question: normalizeQuestionMetadata(questionRuntime, input.question)
    };
  }

  function getSourceRecordIdentities(contractOrInput) {
    const contract = isRecord(contractOrInput?.quiz) && isRecord(contractOrInput?.question)
      ? mergeCurriculumMetadata(contractOrInput)
      : normalizeCurriculumMetadata(contractOrInput);
    const curriculumId = cleanText(contract.quiz.curriculumId);
    if (!curriculumId) return [];

    const ids = uniqueStrings([
      contract.question.sourceDrugId,
      ...(Array.isArray(contract.question.sourceDrugIds) ? contract.question.sourceDrugIds : [])
    ]);
    return ids.map((sourceDrugId) => ({ curriculumId, sourceDrugId }));
  }

  return Object.freeze({
    SCHEMA_VERSION,
    QUIZ_FIELDS,
    QUESTION_FIELDS,
    FALL_GENERATOR_ID,
    FALL_PRACTICE_KIND,
    normalizeProfessionalYear,
    normalizeAcademicYear,
    normalizeSemester,
    normalizeQuizMetadata,
    normalizeQuestionMetadata,
    normalizeCurriculumMetadata,
    mergeCurriculumMetadata,
    getSourceRecordIdentities
  });
});
