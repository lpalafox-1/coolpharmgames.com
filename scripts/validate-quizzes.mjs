import { readFileSync, readdirSync } from 'fs';
import Ajv from 'ajv';
const ajv = new Ajv({allErrors:true});

// Parse schema with error handling
let schema;
try {
  schema = JSON.parse(readFileSync('schema.json','utf8'));
} catch (error) {
  console.error('❌ Error parsing schema.json:', error.message);
  process.exit(1);
}

const validate = ajv.compile(schema);
const files = readdirSync('quizzes').filter(f=>f.endsWith('.json'));
let ok = true;

for (const f of files){
  try {
    const data = JSON.parse(readFileSync(`quizzes/${f}`,'utf8'));
    const valid = validate(data);
    if (!valid){ 
      ok=false; 
      console.error(`❌ ${f}`, validate.errors); 
    } else {
      console.log(`✅ ${f}`);
    }
  } catch (error) {
    ok = false;
    console.error(`❌ ${f} - JSON Parse Error:`, error.message);
    console.error(`   Error at position:`, error.message.match(/position (\d+)/)?.[1] || 'unknown');
    
    // Show problematic content around the error position
    try {
      const fileContent = readFileSync(`quizzes/${f}`, 'utf8');
      const pos = parseInt(error.message.match(/position (\d+)/)?.[1]) || 0;
      const start = Math.max(0, pos - 50);
      const end = Math.min(fileContent.length, pos + 50);
      console.error(`   Content around error (pos ${pos}):`, JSON.stringify(fileContent.substring(start, end)));
    } catch (readError) {
      console.error(`   Could not read file content for debugging:`, readError.message);
    }
  }
}

if (!ok) process.exit(1);
