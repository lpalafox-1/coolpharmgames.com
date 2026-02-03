const fs = require('fs');
const path = require('path');
const vm = require('vm');

const quizEnginePath = path.join(__dirname, '../assets/js/quizEngine.js');
const masterPoolPath = path.join(__dirname, '../assets/data/master_pool.json');
const legacyQuizPath = path.join(__dirname, '../quizzes/chapter1-review.json');

const quizEngineCode = fs.readFileSync(quizEnginePath, 'utf8');
const masterPoolData = JSON.parse(fs.readFileSync(masterPoolPath, 'utf8'));
const legacyQuizData = JSON.parse(fs.readFileSync(legacyQuizPath, 'utf8'));

// Mock DOM and Browser Environment
const mockWindow = {
  location: { search: '' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  document: {
    readyState: 'complete',
    getElementById: (id) => ({
      addEventListener: () => {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
      },
      textContent: '',
      innerHTML: '',
      style: { setProperty: () => {} },
      querySelector: () => null,
      querySelectorAll: () => [],
      setAttribute: () => {},
    }),
    createElement: (tag) => ({
      className: '',
      style: {},
      setAttribute: () => {},
      addEventListener: () => {},
      appendChild: () => {},
      querySelector: () => null,
      classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
          contains: () => false,
      },
    }),
    addEventListener: () => {},
    documentElement: {
        classList: {
            toggle: () => {},
            contains: () => false,
        }
    }
  },
  URLSearchParams: class {
    constructor(search) {
      this.params = new Map();
      if (search.startsWith('?')) search = search.slice(1);
      if (search) {
          search.split('&').forEach(pair => {
              const [key, value] = pair.split('=');
              this.params.set(key, decodeURIComponent(value || ''));
          });
      }
    }
    get(key) { return this.params.get(key) || null; }
  },
  fetch: async (url) => {
    if (url === 'assets/data/master_pool.json') {
      return {
        ok: true,
        json: async () => masterPoolData
      };
    }
    if (url.includes('quizzes/chapter1-review.json') || url.endsWith('chapter1-review.json')) {
      return {
        ok: true,
        json: async () => legacyQuizData
      };
    }
    return { ok: false, status: 404 };
  },
  console: console,
  matchMedia: () => ({ matches: false }),
};

// Global context
const context = vm.createContext({
  ...mockWindow,
  window: mockWindow,
  document: mockWindow.document,
  location: mockWindow.location,
  localStorage: mockWindow.localStorage,
  URLSearchParams: mockWindow.URLSearchParams,
  fetch: mockWindow.fetch,
  console: console,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Math: Math,
  Date: Date,
  Number: Number,
  String: String,
  Array: Array,
  Object: Object,
  Boolean: Boolean,
  parseInt: parseInt,
  Error: Error
});

// Append code to expose internals
const codeToRun = quizEngineCode + `
;
window.exposed_generateQuizFromPool = generateQuizFromPool;
window.exposed_state = state;
window.exposed_loadStaticQuiz = loadStaticQuiz;
window.exposed_createQuestion = createQuestion; // If strictly needed, but generateQuizFromPool calls it
`;

// Execute code
try {
  vm.runInContext(codeToRun, context);
} catch (e) {
  // Ignore initial run errors due to missing elements or params
  console.log("Initial run error (expected):", e.message);
}

// --- Verification Logic ---

let errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
    console.error("FAIL:", message);
  } else {
    // console.log("PASS:", message);
  }
}

async function verifyStrictTypes() {
  console.log("--- Verifying Strict Question Types ---");
  const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const generate = context.window.exposed_generateQuizFromPool;

  for (const week of weeks) {
    for (let i = 0; i < 5; i++) { // Generate 5 quizzes per week
      const quiz = generate(masterPoolData, week);
      quiz.questions.forEach((q, idx) => {
        // Identify field based on prompt or mapping
        let field = null;
        if (q.mapping && (q.mapping.brand && q.mapping.generic)) {
           // Brand/Generic question
           field = 'brand_generic';
        } else if (q.prompt.includes("generic name for")) {
           field = 'brand_generic';
        } else if (q.prompt.includes("brand name for")) {
           field = 'brand_generic';
        } else if (q.prompt.includes("class")) {
           field = 'class';
        } else if (q.prompt.includes("category")) {
           field = 'category';
        } else if (q.prompt.includes("MOA")) {
           field = 'moa';
        }

        if (field === 'brand_generic') {
          assert(q.type === 'short', `Week ${week} Q${idx}: Brand/Generic must be 'short'. Got '${q.type}'. Prompt: ${q.prompt}`);
        } else if (field === 'class') {
          assert(q.type === 'mcq', `Week ${week} Q${idx}: Class must be 'mcq'. Got '${q.type}'. Prompt: ${q.prompt}`);
        } else if (field === 'category') {
           assert(q.type === 'mcq', `Week ${week} Q${idx}: Category must be 'mcq'. Got '${q.type}'. Prompt: ${q.prompt}`);
        } else if (field === 'moa') {
           assert(q.type === 'mcq', `Week ${week} Q${idx}: MOA must be 'mcq'. Got '${q.type}'. Prompt: ${q.prompt}`);
        } else {
           // Could be legacy or unknown, but dynamic generation usually only produces these types
           // If we encounter "Error: No data", ignore
           if (!q.prompt.startsWith("Error")) {
               console.warn(`Week ${week} Q${idx}: Unknown question type/field. Prompt: ${q.prompt}`);
           }
        }
      });
    }
  }
}

async function verifyLegacyLoading() {
  console.log("--- Verifying Legacy Static Quiz Loading ---");
  const loadStatic = context.window.exposed_loadStaticQuiz;
  const state = context.window.exposed_state;

  // Set ID
  context.window.location.search = '?id=chapter1-review';
  // params is parsed at top level of script, so we might need to re-run or manually trigger
  // Since we exposed loadStaticQuiz, we can call it directly, but it relies on 'quizId' variable which is top-level const.
  // We can't change top-level const in the executed script easily without re-running.
  // HOWEVER, loadStaticQuiz uses the `quizId` variable.
  // Let's try to reload the script with the param set.

  // Create NEW context for this test to avoid state pollution and set params correctly
  const newWindow = { ...mockWindow, location: { search: '?id=chapter1-review' } };
  const newContext = vm.createContext({
      ...newWindow,
      window: newWindow,
      document: newWindow.document,
      location: newWindow.location,
      localStorage: newWindow.localStorage,
      URLSearchParams: newWindow.URLSearchParams,
      fetch: newWindow.fetch,
      console: console,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      Math: Math,
      Date: Date,
      Number: Number,
      String: String,
      Array: Array,
      Object: Object,
      Boolean: Boolean,
      parseInt: parseInt,
      Error: Error
  });

  const codeToRunLegacy = quizEngineCode + `
    ;
    window.exposed_state = state;
    window.exposed_main = main;
  `;

  try {
      // Main executes automatically
      await vm.runInContext(codeToRunLegacy, newContext);

      // Wait for main promise if it's async (it is)
      // Since main() is called at top level: main().catch(...)
      // We can inspect exposed_state.questions after a brief tick or verify explicitly
      // But better: we can manually call exposed_main() if we want to ensure it finished?
      // Actually the top level call might race.
      // Let's rely on exposed_state after a short delay or check if it's populated.

      // Actually, since main() is async and top-level await isn't there, we might need to wait.
      // But we can check newContext.window.exposed_state
      const legacyState = newContext.window.exposed_state;

      // Give it a moment (mock fetch is immediate though)
      // We need to wait for the promise chain in main to resolve.
      // Since we mocked fetch as async, the microtask queue needs to drain.
      await new Promise(resolve => setTimeout(resolve, 100));

      assert(legacyState.questions.length > 0, "Legacy quiz should have questions");
      if (legacyState.questions.length > 0) {
          console.log(`Loaded ${legacyState.questions.length} legacy questions.`);
          // Verify types
          const mcqCount = legacyState.questions.filter(q => q.type === 'mcq').length;
          const shortCount = legacyState.questions.filter(q => q.type === 'short').length;
          assert(mcqCount > 0, "Should have some MCQ questions");
          assert(shortCount > 0, "Should have some Short questions");
          // Check specific known questions from chapter1-review.json
          // First one is MCQ
          assert(legacyState.questions[0].type === 'mcq', "First question should be MCQ");
          // Third one is Short
          assert(legacyState.questions[2].type === 'short', "Third question should be Short");
      }

  } catch (e) {
      errors.push(`Legacy loading failed: ${e.message}`);
      console.error(e);
  }
}

async function run() {
  await verifyStrictTypes();
  await verifyLegacyLoading();

  if (errors.length === 0) {
    console.log("SUCCESS: All checks passed.");
    process.exit(0);
  } else {
    console.error("FAILURE: Some checks failed.");
    process.exit(1);
  }
}

run();
