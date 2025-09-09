// tools/validate-quizzes.mjs
import { readFileSync, readdirSync } from 'fs';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const schema = JSON.parse(readFileSync('schema.json', 'utf8'));
const validate = ajv.compile(schema);

const files = readdirSync('quizzes').filter(f => f.endsWith('.json'));
let ok = true;

for (const f of files) {
  try {
    const raw = readFileSync(`quizzes/${f}`, 'utf8');
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