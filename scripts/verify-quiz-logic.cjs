const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Mock Browser Environment ---
const mockElement = {
  addEventListener: () => {},
  classList: {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false
  },
  setAttribute: () => {},
  getAttribute: () => null,
  style: { setProperty: () => {} },
  textContent: '',
  innerHTML: '',
  value: '',
  querySelector: () => null, // Return null or another mockElement
  querySelectorAll: () => [],
  click: () => {},
  focus: () => {}
};

// Make sure querySelector returns a mock element if needed
mockElement.querySelector = () => ({ ...mockElement });

const window = {
  location: { search: '' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  document: {
    getElementById: () => ({ ...mockElement }),
    addEventListener: () => {},
    documentElement: { classList: { toggle: () => {}, contains: () => false } },
    createElement: () => ({ ...mockElement }),
    readyState: 'complete'
  },
  URLSearchParams: class {
    constructor() {}
    get() { return null; }
  },
  console: console
};
const document = window.document;
const location = window.location;
const localStorage = window.localStorage;
const URLSearchParams = window.URLSearchParams;
const HTMLElement = class {};

// --- Load quizEngine.js ---
const quizEngineCode = fs.readFileSync(path.join(__dirname, '../assets/js/quizEngine.js'), 'utf8');

// Create a context for the VM
const context = vm.createContext({
  window,
  document,
  location,
  localStorage,
  URLSearchParams,
  HTMLElement,
  console,
  setInterval: () => {},
  clearInterval: () => {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }), // Mock fetch
  Math,
  // Expose internal functions if they were global, but they are not.
  // We will rely on the script execution to define functions in the context.
});

// Execute the code
try {
  vm.runInContext(quizEngineCode, context);
} catch (e) {
  console.error("Error executing quizEngine.js in VM:", e);
  process.exit(1);
}

// Access the function we need to test
const createQuestion = context.createQuestion;
const masterPoolData = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/master_pool.json'), 'utf8'));

console.log("🔍 Verifying Dynamic Question Generation Rules...");

let violations = 0;
let totalChecks = 0;

masterPoolData.forEach(drug => {
  // We want to test all possible outcomes for this drug.
  // Since createQuestion is random, we'll run it multiple times.
  for (let i = 0; i < 20; i++) {
    const q = createQuestion(drug, masterPoolData);
    totalChecks++;

    // Check strict type rules
    // Rule 1: Brand/Generic -> Short
    if (q.prompt.includes("brand name") || q.prompt.includes("generic name")) {
      if (q.type !== "short") {
        console.error(`❌ Violation: Brand/Generic question must be 'short'. Got '${q.type}' for drug ${drug.generic}`);
        violations++;
      }
    }

    // Rule 2: Class/Category/MOA -> MCQ
    if (q.prompt.includes("class") || q.prompt.includes("category") || q.prompt.includes("MOA")) {
      if (q.type !== "mcq") {
        console.error(`❌ Violation: Class/Category/MOA question must be 'mcq'. Got '${q.type}' for drug ${drug.generic}`);
        violations++;
      }
    }

    // Check Constraint: No randomization for specific field.
    // If prompt is about Brand, it must always be Short. (Covered by Rule 1)
  }
});

if (violations === 0) {
  console.log(`✅ Passed ${totalChecks} dynamic generation checks. Rules enforced.`);
} else {
  console.error(`❌ Found ${violations} violations in dynamic generation.`);
  process.exit(1);
}


console.log("\n🔍 Verifying Legacy Static Quizzes...");
const quizzesDir = path.join(__dirname, '../quizzes');
const quizFiles = fs.readdirSync(quizzesDir).filter(f => f.endsWith('.json'));
let legacyIssues = 0;

// Supported types in render() function of quizEngine.js
const supportedTypes = ["mcq", "mcq-multiple", "short", "tf"];
// Note: 'tf' is handled in the same block as 'mcq' in render().

quizFiles.forEach(file => {
  try {
    const content = fs.readFileSync(path.join(quizzesDir, file), 'utf8');
    const json = JSON.parse(content);

    let questions = [];
    if (json.questions) questions = json.questions;
    else if (json.pools) {
      Object.values(json.pools).forEach(pool => {
        if (Array.isArray(pool)) questions.push(...pool);
      });
    }

    questions.forEach((q, idx) => {
      if (!q.type) {
         // Some older quizzes might imply type or be malformed, but let's check if it exists
         // console.warn(`⚠️  Warning: Question ${idx} in ${file} has no type.`);
      } else if (!supportedTypes.includes(q.type)) {
        console.error(`❌ Error: Question ${idx} in ${file} has unsupported type '${q.type}'.`);
        legacyIssues++;
      }
    });

  } catch (e) {
    console.error(`❌ Error reading/parsing ${file}:`, e.message);
    legacyIssues++;
  }
});

if (legacyIssues === 0) {
  console.log(`✅ All legacy quizzes use supported question types.`);
} else {
  console.error(`❌ Found ${legacyIssues} issues in legacy quizzes.`);
  process.exit(1);
}

console.log("\n✨ Verification Complete.");
