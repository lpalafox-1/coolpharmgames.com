// tools/validate-quizzes.mjs
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(repoRoot, "schema.json");
const quizzesDir = path.join(repoRoot, "quizzes");

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const validate = ajv.compile(schema);

const files = readdirSync(quizzesDir).filter((file) => file.endsWith(".json")).sort();
let ok = true;

function flattenQuizQuestions(quiz) {
  if (Array.isArray(quiz?.questions)) {
    return quiz.questions.map((question, index) => ({ question, index, poolName: "questions" }));
  }

  if (!quiz?.pools || typeof quiz.pools !== "object") return [];

  const entries = [];
  for (const [poolName, items] of Object.entries(quiz.pools)) {
    if (!Array.isArray(items)) continue;
    items.forEach((question, index) => {
      entries.push({ question, index, poolName });
    });
  }
  return entries;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLooseText(value) {
  return normalizeText(value).toLowerCase();
}

function deriveQuestionKind(question) {
  const explicit = normalizeLooseText(question?.questionKind || question?.metadata?.questionKind);
  if (explicit) return explicit;
  if (question?.type === "calc") return "calculation";
  if (question?.type === "open") return "openresponse";
  if (question?.type === "short" && (question?.formula || question?.units || question?.tolerance !== undefined)) return "calculation";
  if (question?.type === "short") return "fitb";
  if (question?.type === "fitb") return "fitb";
  if (question?.type === "mcq" || question?.type === "tf" || question?.type === "mcq-multiple") return "choice";
  return normalizeLooseText(question?.type);
}

function deriveSourceSection(question) {
  return normalizeLooseText(question?.sourceSection || question?.section || question?.metadata?.sourceSection);
}

function validateMcqAnswer(question, context, errors) {
  if (!Array.isArray(question?.choices) || !question.choices.length) return;
  if (typeof question?.answer === "string" && !question.choices.includes(question.answer)) {
    errors.push(`${context}: mcq answer must exactly match one listed choice`);
  }
  if (Number.isInteger(question?.answerIndex)) {
    if (question.answerIndex < 0 || question.answerIndex >= question.choices.length) {
      errors.push(`${context}: mcq answerIndex is out of bounds`);
    }
  }
}

function validateFitbArrays(question, context, errors) {
  if (!Array.isArray(question?.answer) || question.answer.length === 0 || question.answer.some((value) => !normalizeText(value))) {
    errors.push(`${context}: fitb questions must provide a non-empty answer array`);
  }
  if (!Array.isArray(question?.acceptableAnswers) || question.acceptableAnswers.length === 0 || question.acceptableAnswers.some((value) => !normalizeText(value))) {
    errors.push(`${context}: fitb questions must provide a non-empty acceptableAnswers array`);
  }
}

function validateCalculationShape(question, context, errors) {
  validateFitbArrays(question, context, errors);

  if (!normalizeText(question?.units)) {
    errors.push(`${context}: calculation questions must include units`);
  }

  if (!normalizeText(question?.formula)) {
    errors.push(`${context}: calculation questions must include a formula`);
  }

  if (!Number.isFinite(Number(question?.tolerance)) || Number(question?.tolerance) < 0) {
    errors.push(`${context}: calculation questions must include a numeric tolerance`);
  }
}

function validateCeuticsFinalBlueprint(quiz, errors) {
  if (quiz?.id !== "ceutics2-final") return;

  const modeConfigs = quiz?.settings?.modeConfigs;
  if (!modeConfigs || typeof modeConfigs !== "object") {
    errors.push(`ceutics2-final: settings.modeConfigs is required`);
    return;
  }

  const examMode = modeConfigs.trueExam || modeConfigs.exam;
  const hardMode = modeConfigs.quickHard || modeConfigs.quickQuiz || modeConfigs.hard;
  const pkMode = modeConfigs.pkMath || modeConfigs.pkQuiz || modeConfigs.pkGenerator || modeConfigs["pk-generator"];
  const adaptiveMode = modeConfigs.adaptive;
  const masterPoolMode = modeConfigs.masterPool;
  const ruleUsesDifficulty = (rule) => {
    const explicitDifficulty = normalizeLooseText(rule?.difficulty);
    if (explicitDifficulty) return true;

    return Array.isArray(rule?.difficulties)
      && rule.difficulties.some((value) => normalizeLooseText(value));
  };

  if (!examMode || typeof examMode !== "object") {
    errors.push(`ceutics2-final: settings.modeConfigs.trueExam is required`);
  } else {
    if (Number(examMode.questionLimit) !== 65) errors.push(`ceutics2-final: exam mode questionLimit must be 65`);
    if (Number(examMode.timerSeconds) !== 6600) errors.push(`ceutics2-final: exam mode timerSeconds must be 6600`);

    const rules = Array.isArray(examMode?.selection?.rules) ? examMode.selection.rules : [];
    const totals = { choice: 0, fitb: 0, openresponse: 0, calculation: 0 };
    for (const rule of rules) {
      const key = normalizeLooseText(rule?.questionKind);
      const count = Number(rule?.count || 0);
      if (totals[key] !== undefined) totals[key] += count;
    }

    if (totals.choice !== 39) errors.push(`ceutics2-final: exam mode must target 39 choice questions`);
    if (totals.fitb !== 8) errors.push(`ceutics2-final: exam mode must target 8 fitb questions`);
    if (totals.openresponse !== 2) errors.push(`ceutics2-final: exam mode must target 2 open response questions`);
    if (totals.calculation !== 16) errors.push(`ceutics2-final: exam mode must target 16 calculation questions`);

    const pointsByKind = examMode.pointsByQuestionKind || {};
    const weightedTotal = (totals.choice * Number(pointsByKind.choice || 0))
      + (totals.fitb * Number(pointsByKind.fitb || 0))
      + (totals.openresponse * Number(pointsByKind.openresponse || 0))
      + (totals.calculation * Number(pointsByKind.calculation || 0));

    if (Number(pointsByKind.choice) !== 2) errors.push(`ceutics2-final: exam mode choice points must be 2`);
    if (Number(pointsByKind.fitb) !== 2) errors.push(`ceutics2-final: exam mode fitb points must be 2`);
    if (Number(pointsByKind.openresponse) !== 4) errors.push(`ceutics2-final: exam mode open response points must be 4`);
    if (Number(pointsByKind.calculation) !== 3) errors.push(`ceutics2-final: exam mode calculation points must be 3`);
    if (weightedTotal !== 150) errors.push(`ceutics2-final: exam mode weighted total must equal 150 points`);

    if (rules.some(ruleUsesDifficulty)) {
      errors.push(`ceutics2-final: trueExam must not filter by difficulty`);
    }
  }

  if (!hardMode || typeof hardMode !== "object") {
    errors.push(`ceutics2-final: settings.modeConfigs.quickHard is required`);
  } else {
    if (Number(hardMode.questionLimit) !== 10) errors.push(`ceutics2-final: hard mode questionLimit must be 10`);
    if (Number(hardMode.timerSeconds) !== 600) errors.push(`ceutics2-final: hard mode timerSeconds must be 600`);
    const rules = Array.isArray(hardMode?.selection?.rules) ? hardMode.selection.rules : [];
    if (rules.some(ruleUsesDifficulty)) {
      errors.push(`ceutics2-final: quickHard must not filter by difficulty`);
    }
  }

  if (!pkMode || typeof pkMode !== "object") {
    errors.push(`ceutics2-final: settings.modeConfigs.pkMath is required`);
  } else {
    if (Number(pkMode.questionLimit) !== 16) errors.push(`ceutics2-final: pkMath questionLimit must be 16`);
    const rules = Array.isArray(pkMode?.selection?.rules) ? pkMode.selection.rules : [];
    const invalidRule = rules.find((rule) => normalizeLooseText(rule?.questionKind) !== "calculation" || normalizeLooseText(rule?.sourceSection) !== "pharmacokineticscalculations");
    if (invalidRule) {
      errors.push(`ceutics2-final: pkMath rules must only target pharmacokinetics calculations`);
    }
    if (rules.some(ruleUsesDifficulty)) {
      errors.push(`ceutics2-final: pkMath must not filter by difficulty`);
    }
  }

  if (adaptiveMode && typeof adaptiveMode === "object") {
    if (Number(adaptiveMode.questionLimit) !== 10) errors.push(`ceutics2-final: adaptive questionLimit must default to 10`);
    if (Number(adaptiveMode.timerSeconds) !== 600) errors.push(`ceutics2-final: adaptive timerSeconds must default to 600`);
    if (adaptiveMode?.selection?.adaptive !== true) errors.push(`ceutics2-final: adaptive mode must set selection.adaptive = true`);
    if (normalizeLooseText(adaptiveMode?.selection?.startDifficulty) !== "medium") {
      errors.push(`ceutics2-final: adaptive mode must start at medium difficulty`);
    }
    const adaptiveRules = Array.isArray(adaptiveMode?.selection?.rules) ? adaptiveMode.selection.rules : [];
    if (adaptiveRules.some(ruleUsesDifficulty)) {
      errors.push(`ceutics2-final: adaptive mode should use runtime difficulty adjustment, not rule difficulty filters`);
    }

    const expectedCounts = {
      pharmacokineticscalculations: 3,
      pharmacokineticsconcepts: 4,
      exam1review: 2,
      exam2review: 1
    };
    const seenAdaptiveCounts = {};
    adaptiveRules.forEach((rule) => {
      const section = normalizeLooseText(rule?.sourceSection);
      if (!section || !(section in expectedCounts)) return;
      seenAdaptiveCounts[section] = Number(rule?.count || 0);
    });

    Object.entries(expectedCounts).forEach(([section, expectedCount]) => {
      if (Number(seenAdaptiveCounts[section] || 0) !== expectedCount) {
        errors.push(`ceutics2-final: adaptive mode must keep ${section} count at ${expectedCount}`);
      }
    });
  }

  if (masterPoolMode && typeof masterPoolMode === "object" && Number(masterPoolMode.questionLimit) !== 100) {
    errors.push(`ceutics2-final: masterPool questionLimit must be 100`);
  }
}

function validateQuizSemantics(quiz, fileName) {
  const errors = [];
  const items = flattenQuizQuestions(quiz);

  const seenIds = new Map();
  for (const { question, index, poolName } of items) {
    const context = `${fileName}:${poolName}[${index}]`;
    const type = normalizeLooseText(question?.type);
    const questionId = normalizeText(question?.id);
    const questionKind = deriveQuestionKind(question);
    const sourceSection = deriveSourceSection(question);

    if (quiz?.id === "ceutics2-final") {
      if (!questionId) {
        errors.push(`${context}: ceutics2-final questions must include an id`);
      } else if (seenIds.has(questionId)) {
        errors.push(`${context}: duplicate question id "${questionId}" also used at ${seenIds.get(questionId)}`);
      } else {
        seenIds.set(questionId, context);
      }
    } else if (questionId) {
      if (seenIds.has(questionId)) {
        errors.push(`${context}: duplicate question id "${questionId}" also used at ${seenIds.get(questionId)}`);
      } else {
        seenIds.set(questionId, context);
      }
    }

    if (type === "mcq") {
      validateMcqAnswer(question, context, errors);
    }

    if ((type === "short" || type === "open" || type === "calc" || type === "fitb") && quiz?.id === "ceutics2-final") {
      if (questionKind === "fitb") {
        validateFitbArrays(question, context, errors);
      }

      if (questionKind === "calculation") {
        validateCalculationShape(question, context, errors);
        if (sourceSection !== "pharmacokineticscalculations") {
          errors.push(`${context}: non-PK calculation questions are not allowed in ceutics2-final`);
        }
      }
    }
  }

  validateCeuticsFinalBlueprint(quiz, errors);
  return errors;
}

for (const file of files) {
  try {
    const fullPath = path.join(quizzesDir, file);
    const raw = readFileSync(fullPath, "utf8");
    const data = JSON.parse(raw);
    const schemaValid = validate(data);
    const semanticErrors = validateQuizSemantics(data, file);

    if (!schemaValid || semanticErrors.length) {
      ok = false;
      console.error(`❌ ${file}`);
      (validate.errors || []).forEach((error) => console.error(error));
      semanticErrors.forEach((error) => console.error(error));
    } else {
      console.log(`✅ ${file}`);
    }
  } catch (error) {
    ok = false;
    console.error(`💥 ${file}: ${error.message}`);
  }
}

if (!ok) process.exit(1);
