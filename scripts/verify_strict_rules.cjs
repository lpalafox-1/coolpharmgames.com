const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('assets/js/quizEngine.js', 'utf8');

// Mock environment
const sandbox = {
  document: {
    getElementById: () => ({
      addEventListener: () => {},
      classList: { add:()=>{}, remove:()=>{}, toggle:()=>{} },
      innerHTML: "",
      style:{},
      textContent: ""
    }),
    addEventListener: () => {},
    readyState: 'complete',
    documentElement: { classList: { toggle: () => {}, contains: () => false } },
    createElement: () => ({
      classList: { add:()=>{} },
      setAttribute:()=>{},
      innerHTML:"",
      addEventListener:()=>{},
      querySelector: () => ({ addEventListener: () => {} }),
      appendChild: () => {}
    })
  },
  window: {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  location: { search: '' },
  URLSearchParams: class { get() { return null; } },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  console: { ...console, error: () => {} }, // Suppress errors from main() failure
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Math: Math
};

// Create context
vm.createContext(sandbox);

// Run code
try {
  vm.runInContext(code, sandbox);
} catch (e) {
  if (e.message !== "Missing ?id=… or ?week=…") {
    // console.error("Error running script:", e);
    // Ignore params error
  }
}

// Helper to get createQuestion from sandbox
const createQuestion = sandbox.createQuestion;
const loadStaticQuiz = sandbox.loadStaticQuiz;

let logicFailures = 0;
let commentFailures = 0;

console.log("--- Logic Verification ---");

if (typeof loadStaticQuiz !== 'function') {
  console.error("FAIL: loadStaticQuiz not found. Legacy safety compromised.");
  logicFailures++;
} else {
  console.log("PASS: loadStaticQuiz exists.");
}

// Test Data
const drugBG = { brand: "BrandName", generic: "GenericName" };
const drugClass = { generic: "GenericName", class: "ClassName" };
const drugCat = { generic: "GenericName", category: "CategoryName" };
const drugMOA = { generic: "GenericName", moa: "MoaDesc" };
// Need enough data for distractors to avoid errors if any? Code handles empty.
const allDrugs = [drugBG, drugClass, drugCat, drugMOA];

// Test 1: Brand/Generic -> Short
// createQuestion randomly picks brand-generic or generic-brand. Both must be short.
const q1 = createQuestion(drugBG, allDrugs);
if (q1.type === 'short') {
  console.log("PASS: Brand/Generic -> Short");
} else {
  console.error(`FAIL: Brand/Generic -> ${q1.type} (Expected short)`);
  logicFailures++;
}

// Test 2: Class -> MCQ
const q2 = createQuestion(drugClass, allDrugs);
if (q2.type === 'mcq') {
  console.log("PASS: Class -> MCQ");
} else {
  console.error(`FAIL: Class -> ${q2.type} (Expected mcq)`);
  logicFailures++;
}

// Test 3: Category -> MCQ
const q3 = createQuestion(drugCat, allDrugs);
if (q3.type === 'mcq') {
  console.log("PASS: Category -> MCQ");
} else {
  console.error(`FAIL: Category -> ${q3.type} (Expected mcq)`);
  logicFailures++;
}

// Test 4: MOA -> MCQ
const q4 = createQuestion(drugMOA, allDrugs);
if (q4.type === 'mcq') {
  console.log("PASS: MOA -> MCQ");
} else {
  console.error(`FAIL: MOA -> ${q4.type} (Expected mcq)`);
  logicFailures++;
}

console.log("\n--- Documentation Verification ---");
// Test 5: ENFORCE Comments
const hasEnforceBG = code.includes("ENFORCE: Brand/Generic must be Fill-in-the-Blank");
const hasEnforceMCQ = code.includes("ENFORCE: MOA/Class/Category must be MCQ");

if (hasEnforceBG && hasEnforceMCQ) {
  console.log("PASS: ENFORCE comments present.");
} else {
  console.log("FAIL: ENFORCE comments missing.");
  commentFailures++;
}

// Exit logic
// If we expect failures (first pass), we just report them.
// But for the sake of the plan, I want to see the output.
const allowCommentFail = process.argv.includes('--allow-comment-fail');

if (logicFailures > 0) {
  console.log(`\nLogic Failures: ${logicFailures}`);
  process.exit(1);
}

if (commentFailures > 0) {
  if (allowCommentFail) {
    console.log(`\nComment Failures: ${commentFailures} (Allowed for this pass)`);
    process.exit(0);
  } else {
    console.log(`\nComment Failures: ${commentFailures}`);
    process.exit(1);
  }
}

console.log("\nAll tests passed.");
