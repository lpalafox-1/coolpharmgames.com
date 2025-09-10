// tools/validate-quizzes.mjs
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve files relative to the repository root (one level up from tools/)
const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'schema.json');
const quizzesDir = path.join(repoRoot, 'quizzes');

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

const files = readdirSync(quizzesDir).filter(f => f.endsWith('.json'));
let ok = true;

for (const f of files) {
  try {
    const raw = readFileSync(path.join(quizzesDir, f), 'utf8');
    const data = JSON.parse(raw);
    const valid = validate(data);
    if (!valid) {
      ok = false;
      console.error(`❌ ${f}`);
      console.error(validate.errors);
    } else {
      console.log(`✅ ${f}`);
    }
  } catch (e) {
    ok = false;
    console.error(`💥 ${f}: ${e.message}`);
  }
}

if (!ok) process.exit(1);
