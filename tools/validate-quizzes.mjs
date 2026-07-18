// tools/validate-quizzes.mjs
// Canonical validator CLI (run by `npm run validate` and, via the scripts/
// shim, by GitHub Actions). Validation logic lives in tools/validator-core.mjs.
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { repoRoot, validateQuizSchema, validateQuizSemantics } from "./validator-core.mjs";

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

if (!ok) process.exit(1);
