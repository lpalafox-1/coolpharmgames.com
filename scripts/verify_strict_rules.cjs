const fs = require('fs');
const path = require('path');
const vm = require('vm');

const enginePath = path.join(__dirname, '../assets/js/quizEngine.js');
const masterPoolPath = path.join(__dirname, '../assets/data/master_pool.json');

const masterPool = JSON.parse(fs.readFileSync(masterPoolPath, 'utf8'));

// Mock browser environment
const mockWindow = {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  location: { search: '?week=1' },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  document: {
    getElementById: () => ({ addEventListener: () => {} }),
    createElement: () => ({ style: {} }),
    querySelector: () => ({}),
    querySelectorAll: () => [],
    documentElement: { classList: { toggle: () => {}, contains: () => {} } },
    readyState: 'loading',
    addEventListener: () => {},
  },
  URLSearchParams: class {
    get() { return null; }
  },
  console: console,
};

mockWindow.window = mockWindow;
mockWindow.self = mockWindow;

const context = vm.createContext(mockWindow);

// Inject quizEngine.js
const code = fs.readFileSync(enginePath, 'utf8');
try {
  vm.runInContext(code, context);
} catch (e) {
  // Ignore errors from main() execution (e.g. missing DOM elements)
  // We only need the functions defined in the global scope.
}

// Extract functions
const createQuestion = context.createQuestion;
const createMCQ = context.createMCQ;
// const getDistractors = context.getDistractors; // Not strictly needed if createQuestion uses it internally correctly

if (typeof createQuestion !== 'function') {
  console.error("ERROR: createQuestion is not defined in quizEngine.js");
  process.exit(1);
}

// Verification Logic
console.log("Starting strict rule verification...");

let failures = 0;
const iterations = 50; // Run multiple times per drug to cover random selection

masterPool.forEach(drug => {
  for (let i = 0; i < iterations; i++) {
    const q = createQuestion(drug, masterPool);

    // Check Brand/Generic -> Short
    if (q.prompt.includes("generic name for") || q.prompt.includes("brand name for")) {
      if (q.type !== 'short') {
        console.error(`FAILURE: Brand/Generic question for ${drug.generic} has type '${q.type}', expected 'short'. Prompt: "${q.prompt}"`);
        failures++;
      }
    }

    // Check Class/Category/MOA -> MCQ
    if (q.prompt.includes("class does") || q.prompt.includes("category of") || q.prompt.includes("MOA of")) {
      if (q.type !== 'mcq') {
        console.error(`FAILURE: Class/Category/MOA question for ${drug.generic} has type '${q.type}', expected 'mcq'. Prompt: "${q.prompt}"`);
        failures++;
      }
    }
  }
});

if (failures === 0) {
  console.log("SUCCESS: All generated questions adhered to strict type rules.");
} else {
  console.error(`FAILURE: Found ${failures} violations.`);
  process.exit(1);
}
