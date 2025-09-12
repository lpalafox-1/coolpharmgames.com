import { readFileSync, readdirSync } from 'fs';
import Ajv from 'ajv';
const ajv = new Ajv({allErrors:true});
const schema = JSON.parse(readFileSync('schema.json','utf8'));
const validate = ajv.compile(schema);
const files = readdirSync('quizzes').filter(f=>f.endsWith('.json'));
let ok = true;
for (const f of files){
  const data = JSON.parse(readFileSync(`quizzes/${f}`,'utf8'));
  const valid = validate(data);
  if (!valid){ ok=false; console.error(`❌ ${f}`, validate.errors); }
  else console.log(`✅ ${f}`);
}
if (!ok) process.exit(1);
