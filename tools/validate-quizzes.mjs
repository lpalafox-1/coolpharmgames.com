// tools/validate-quizzes.mjs
// Canonical validator CLI (run by `npm run validate` and, via the scripts/
// shim, by GitHub Actions). Validation logic lives in tools/validator-core.mjs.
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import {
  loadCatalogExternalQuizSources,
  repoRoot,
  validateQuizSchema,
  validateQuizSemantics
} from "./validator-core.mjs";

const quizzesDir = path.join(repoRoot, "quizzes");

const files = readdirSync(quizzesDir).filter((file) => file.endsWith(".json")).sort();
let ok = true;

for (const file of files) {
  try {
    const fullPath = path.join(quizzesDir, file);
    const raw = readFileSync(fullPath, "utf8");
    const data = JSON.parse(raw);
    const { valid: schemaValid, errors: schemaErrors } = validateQuizSchema(data);
    const semanticErrors = validateQuizSemantics(data, file);

    if (!schemaValid || semanticErrors.length) {
      ok = false;
      console.error(`❌ ${file}`);
      schemaErrors.forEach((error) => console.error(error));
      semanticErrors.forEach((error) => console.error(error));
    } else {
      console.log(`✅ ${file}`);
    }
  } catch (error) {
    ok = false;
    console.error(`💥 ${file}: ${error.message}`);
  }
}

// Advisory pass over cataloged quiz sources outside quizzes/ (e.g. basis2-quiz9).
// Warnings only: this never sets `ok` and never affects the exit code. Emitted
// after the quizzes/ results so that output is unchanged; nothing here runs when
// the catalog is absent (fixture repositories).
const MAX_WARNING_DETAIL = 5;

function collectExternalSourceWarnings(source) {
  const fullPath = path.join(repoRoot, source.sourcePath);
  if (!existsSync(fullPath)) return ["file not found"];

  let data;
  try {
    data = JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    return [`invalid JSON: ${error.message}`];
  }

  const warnings = [];
  const { valid, errors } = validateQuizSchema(data);
  if (!valid) {
    errors.forEach((error) => warnings.push(`schema: ${error.instancePath || "(root)"} ${error.message}`));
  }
  validateQuizSemantics(data, path.basename(source.sourcePath)).forEach((error) => warnings.push(`semantic: ${error}`));
  return warnings;
}

const externalSources = loadCatalogExternalQuizSources();
if (externalSources.length) {
  console.log("");
  console.log("⚠️  Cataloged data sources outside quizzes/ (warnings only — does not affect exit code)");
  for (const source of externalSources) {
    const warnings = collectExternalSourceWarnings(source);
    if (!warnings.length) {
      console.log(`✅ ${source.sourcePath} (id: ${source.id}): no warnings`);
      continue;
    }
    console.log(`⚠️  ${source.sourcePath} (id: ${source.id}): ${warnings.length} warning(s)`);
    warnings.slice(0, MAX_WARNING_DETAIL).forEach((warning) => console.log(`   - ${warning}`));
    if (warnings.length > MAX_WARNING_DETAIL) {
      console.log(`   … (+${warnings.length - MAX_WARNING_DETAIL} more)`);
    }
  }
}

if (!ok) process.exit(1);
