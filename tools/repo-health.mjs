#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const quizzesDir = path.join(repoRoot, "quizzes");
const indexPath = path.join(repoRoot, "index.html");
const schemaPath = path.join(repoRoot, "schema.json");
const masterPoolPath = path.join(repoRoot, "assets", "data", "master_pool.json");
const conceptPoolPath = path.join(repoRoot, "assets", "data", "bdt_unit10_quiz8_master_pool.json");
const VIRTUAL_QUIZ_IDS = new Set(["log-lab-final-2", "bdt-unit10-quiz8", "custom-quiz", "review-quiz"]);
const countsOnly = process.argv.includes("--count-only");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validate = ajv.compile(schema);

const report = {
  errors: [],
  warnings: [],
  info: []
};

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function countQuizQuestions(quiz) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
  const pools = quiz?.pools && typeof quiz.pools === "object"
    ? Object.values(quiz.pools).reduce((sum, pool) => sum + (Array.isArray(pool) ? pool.length : 0), 0)
    : 0;
  return questions + pools;
}

function flattenPoolData(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.questions)) return data.questions;
  if (data?.pools && typeof data.pools === "object") {
    return Object.values(data.pools).flat().filter(Boolean);
  }
  return [];
}

function walkFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function extractLinkedQuizIds(html) {
  return [...new Set([...html.matchAll(/quiz\.html\?id=([^&"']+)/g)].map((match) => match[1]))];
}

function getFooterQuestionCount(html) {
  const match = html.match(/([\d,]+)\+?\s+practice questions/i);
  return match ? Number.parseInt(match[1].replace(/,/g, ""), 10) : null;
}

const quizFiles = readdirSync(quizzesDir).filter((file) => file.endsWith(".json")).sort();
const quizSummaries = [];

for (const file of quizFiles) {
  const fullPath = path.join(quizzesDir, file);
  try {
    const quiz = readJson(fullPath);
    const total = countQuizQuestions(quiz);
    quizSummaries.push({ file, fullPath, quiz, total, parseError: null });
  } catch (error) {
    quizSummaries.push({ file, fullPath, quiz: null, total: 0, parseError: error });
  }
}

const staticQuizTotal = quizSummaries.reduce((sum, item) => sum + item.total, 0);
const masterPoolTotal = flattenPoolData(readJson(masterPoolPath)).length;
const conceptPoolTotal = flattenPoolData(readJson(conceptPoolPath)).length;

if (countsOnly) {
  console.log(`Static quiz questions: ${staticQuizTotal}`);
  console.log(`Static quiz files: ${quizSummaries.length}`);
  console.log(`Top Drugs master pool entries: ${masterPoolTotal}`);
  console.log(`Endocrine concept pool entries: ${conceptPoolTotal}`);
  process.exit(0);
}

console.log("🔍 Pharm-let Repo Health");
console.log("========================\n");

console.log("📋 Quiz Validation");
for (const item of quizSummaries) {
  if (item.parseError) {
    report.errors.push(`${item.file}: ${item.parseError.message}`);
    console.log(`❌ ${item.file}`);
    console.log(`   - ${item.parseError.message}`);
    continue;
  }

  const valid = validate(item.quiz);
  if (!valid) {
    report.errors.push(`${item.file}: schema validation failed`);
    console.log(`❌ ${item.file}`);
    for (const err of validate.errors || []) {
      console.log(`   - ${err.instancePath || "(root)"} ${err.message}`);
    }
  } else {
    console.log(`✅ ${item.file}`);
  }

  if (!item.quiz?.id) {
    report.errors.push(`${item.file}: missing quiz id`);
  }
  if (item.total === 0) {
    report.errors.push(`${item.file}: empty quiz`);
  } else if (item.total < 10) {
    report.warnings.push(`${item.file}: very small quiz (${item.total} questions)`);
  }
}

console.log("\n📊 Counts");
console.log(`Static quiz questions: ${staticQuizTotal}`);
console.log(`Static quiz files: ${quizSummaries.length}`);
console.log(`Top Drugs master pool entries: ${masterPoolTotal}`);
console.log(`Endocrine concept pool entries: ${conceptPoolTotal}`);

const homepage = readFileSync(indexPath, "utf8");
const footerCount = getFooterQuestionCount(homepage);
console.log("\n🏠 Homepage Count");
if (footerCount === null) {
  report.errors.push("index.html: unable to find footer question count");
  console.log("❌ Footer count could not be detected");
} else if (footerCount !== staticQuizTotal) {
  report.errors.push(`index.html: footer count ${footerCount} does not match static quiz total ${staticQuizTotal}`);
  console.log(`❌ Footer shows ${footerCount}, but static quiz total is ${staticQuizTotal}`);
} else {
  console.log(`✅ Footer count matches static quiz total (${staticQuizTotal})`);
}

console.log("\n🔗 Link Check");
const quizIds = new Set(quizSummaries.map((item) => item.quiz?.id).filter(Boolean));
for (const virtualId of VIRTUAL_QUIZ_IDS) quizIds.add(virtualId);
const linkedIds = extractLinkedQuizIds(homepage);
const brokenLinks = linkedIds.filter((id) => !quizIds.has(id));

if (brokenLinks.length) {
  brokenLinks.forEach((id) => {
    report.errors.push(`index.html: broken quiz link (${id})`);
    console.log(`❌ ${id}`);
  });
} else {
  console.log("✅ All linked quiz ids resolve");
}

const unlinkedQuizIds = [...quizIds]
  .filter((id) => !VIRTUAL_QUIZ_IDS.has(id))
  .filter((id) => !linkedIds.includes(id))
  .sort();

if (unlinkedQuizIds.length) {
  report.info.push(`Unlinked quiz ids: ${unlinkedQuizIds.join(", ")}`);
  console.log(`ℹ️  ${unlinkedQuizIds.length} quiz id(s) are not linked from index.html`);
}

console.log("\n🧹 Oddities");
const zeroByteFiles = walkFiles(repoRoot)
  .filter((filePath) => statSync(filePath).size === 0)
  .map((filePath) => path.relative(repoRoot, filePath))
  .sort();

if (zeroByteFiles.length) {
  zeroByteFiles.forEach((file) => report.warnings.push(`Zero-byte file: ${file}`));
  console.log(`⚠️  Zero-byte files: ${zeroByteFiles.join(", ")}`);
} else {
  console.log("✅ No zero-byte files detected");
}

const rootMasterPoolPath = path.join(repoRoot, "master_pool.json");
if (existsSync(rootMasterPoolPath)) {
  report.warnings.push("Root master_pool.json exists alongside assets/data/master_pool.json");
  console.log("⚠️  Root master_pool.json is present alongside assets/data/master_pool.json");
}

console.log("\n📝 Summary");
if (report.errors.length) {
  console.log(`Errors: ${report.errors.length}`);
  report.errors.forEach((entry) => console.log(`- ${entry}`));
} else {
  console.log("Errors: 0");
}

if (report.warnings.length) {
  console.log(`Warnings: ${report.warnings.length}`);
  report.warnings.forEach((entry) => console.log(`- ${entry}`));
} else {
  console.log("Warnings: 0");
}

if (report.info.length) {
  console.log(`Info: ${report.info.length}`);
  report.info.forEach((entry) => console.log(`- ${entry}`));
}

process.exit(report.errors.length ? 1 : 0);
