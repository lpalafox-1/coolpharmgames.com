const fs = require('fs');
const vm = require('vm');
const path = require('path');

// --- MOCKS ---

const mockLocalStorage = {
  store: {},
  getItem: (k) => mockLocalStorage.store[k] || null,
  setItem: (k, v) => mockLocalStorage.store[k] = v.toString(),
  removeItem: (k) => delete mockLocalStorage.store[k],
  clear: () => mockLocalStorage.store = {}
};

const mockClassList = {
  contains: () => false,
  add: () => {},
  remove: () => {},
  toggle: () => {}
};

const mockElement = {
  textContent: '',
  innerHTML: '',
  value: '',
  style: { setProperty: () => {} },
  classList: mockClassList,
  addEventListener: () => {},
  setAttribute: () => {},
  getAttribute: () => null,
  querySelector: () => mockElement,
  querySelectorAll: () => [mockElement],
  appendChild: () => {},
  remove: () => {},
  click: () => {},
  disabled: false,
  checked: false
};

const mockDocument = {
  getElementById: (id) => mockElement,
  createElement: (tag) => mockElement,
  documentElement: { classList: mockClassList },
  readyState: 'complete', // trigger immediate execution
  addEventListener: (event, cb) => {
    // if (event === 'DOMContentLoaded') cb(); // readyState is complete, so this might not be needed or logic handles it
  },
  body: { appendChild: () => {} },
  activeElement: mockElement
};

const mockWindow = {
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  location: { search: '?mode=test' }, // Default
  localStorage: mockLocalStorage
};

// Global Fetch Mock
global.fetch = async (url) => {
  if (url.includes('master_pool.json')) {
    const content = fs.readFileSync('assets/data/master_pool.json', 'utf8');
    return {
      ok: true,
      json: async () => JSON.parse(content)
    };
  }
  if (url.startsWith('quizzes/')) {
    // Legacy quiz load
    // url is like quizzes/chapter1-review.json
    try {
      const content = fs.readFileSync(url, 'utf8');
      return {
        ok: true,
        json: async () => JSON.parse(content)
      };
    } catch (e) {
      return { ok: false, status: 404 };
    }
  }
  return { ok: false, status: 404 };
};

// Setup Global Context
global.window = mockWindow;
global.document = mockDocument;
global.location = mockWindow.location;
global.localStorage = mockLocalStorage;
global.URLSearchParams = URLSearchParams;
global.location.search = ""; // Start empty

// --- LOAD CODE ---

const codePath = path.join(__dirname, '../assets/js/quizEngine.js');
let code = fs.readFileSync(codePath, 'utf8');

// Expose internal functions by appending assignment to global
code += `
;
global.exposed = {
  createQuestion: (typeof createQuestion !== 'undefined') ? createQuestion : undefined,
  generateQuizFromPool: (typeof generateQuizFromPool !== 'undefined') ? generateQuizFromPool : undefined,
  loadStaticQuiz: (typeof loadStaticQuiz !== 'undefined') ? loadStaticQuiz : undefined,
  state: (typeof state !== 'undefined') ? state : undefined,
  main: (typeof main !== 'undefined') ? main : undefined,
  els: (typeof els !== 'undefined') ? els : undefined
};
`;

// Run the code in the global context
// We need to handle the fact that the code runs immediately.
// We might want to set location.search before running.

// Helper to reload/rerun logic
function runEngine(searchQuery) {
    global.location.search = searchQuery || "";
    // Re-evaluating the code. Note: const/let redeclaration might fail if we use the SAME context object.
    // So we should use a new context or just use vm.runInNewContext each time?
    // But we need the shared mocks.

    // Simplest: use runInNewContext with a fresh sandbox containing our mocks.
    const sandbox = {
        console: console,
        setTimeout: setTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        URLSearchParams: URLSearchParams,
        fetch: global.fetch,
        document: { ...mockDocument }, // Shallow copy to allow modification if needed
        window: { ...mockWindow, location: { search: searchQuery || "" } },
        location: { search: searchQuery || "" },
        localStorage: { ...mockLocalStorage },
        Math: Math,
        // We need to ensure 'state' and functions are extracted.
        // We will define a 'global' object in sandbox that maps to sandbox itself or a proxy
        // so 'global.exposed = ...' works.
    };
    sandbox.global = sandbox; // self-reference
    sandbox.document.documentElement = { classList: { ...mockClassList } }; // refresh

    try {
        vm.runInNewContext(code, sandbox);
        return sandbox.exposed;
    } catch (e) {
        console.error("Error running engine:", e);
        return null;
    }
}

// --- TESTS ---

async function runTests() {
    console.log("Starting Verification...");

    const masterPool = JSON.parse(fs.readFileSync('assets/data/master_pool.json', 'utf8'));

    // 1. Verify Strict Question Types
    console.log("Test 1: Strict Question Types (Dynamic Generation)");

    // We need 'createQuestion'. We can get it from a run with any param, e.g. week=1
    const engine = runEngine("?week=1");
    if (!engine) {
        console.error("FAILED: Could not load engine.");
        process.exit(1);
    }
    const { createQuestion } = engine;

    let passStrict = true;
    let counts = { brandGeneric: 0, classCategoryMoa: 0 };

    // Test a large sample or all items
    // We call createQuestion repeatedly to ensure coverage of random logic
    masterPool.forEach(drug => {
        for (let i = 0; i < 5; i++) {
            const q = createQuestion(drug, masterPool);

            // Analyze the prompt/mapping to infer what field was tested
            // q.mapping exists for brand/generic types

            if (q.mapping && (q.mapping.brand || q.mapping.generic)) {
                // This is a Brand/Generic question
                if (q.type !== 'short') {
                    console.error(`FAILURE: Brand/Generic question for ${drug.generic} has type '${q.type}', expected 'short'.`);
                    passStrict = false;
                }
                counts.brandGeneric++;
            }

            // Check Class/Category/MOA
            // Currently createQuestion sets prompt text.
            const p = q.prompt.toLowerCase();
            const isClass = p.includes("which class") || p.includes("belong to");
            const isCat = p.includes("what is the category");
            const isMoa = p.includes("what is the moa");

            if (isClass || isCat || isMoa) {
                if (q.type !== 'mcq') {
                    console.error(`FAILURE: Class/Category/MOA question for ${drug.generic} has type '${q.type}', expected 'mcq'.`);
                    passStrict = false;
                }
                counts.classCategoryMoa++;
            }
        }
    });

    if (passStrict) {
        console.log(`PASS: Strict types enforced. Checked ${counts.brandGeneric} B/G and ${counts.classCategoryMoa} C/C/M instances.`);
    } else {
        console.error("FAILED: Strict types check failed.");
        process.exit(1);
    }

    // 2. Verify Legacy Safety
    console.log("Test 2: Legacy Quiz Loading");

    // We pick 'chapter1-review' as a sample
    const legacyId = 'chapter1-review';
    const legacyEngine = runEngine(`?id=${legacyId}`);

    // Wait for main() async to finish?
    // loading happens in main() which is async.
    // The script calls main().catch(...) but we don't get the promise returned.
    // However, in the mocked environment, fetch is async.
    // We can't easily await the internal main() unless we exposed it and call it ourselves.
    // But the script calls main() immediately.

    // Strategy: We exposed 'main'. We can call it manually if we prevent the auto-run,
    // OR we just wait a bit? No, waiting is flaky.

    // Better: In our code append, we exported 'main'.
    // If we call 'await legacyEngine.main()', it might run twice (once auto, once manual).
    // The auto run might fail or succeed.
    // The state is what matters.

    // Let's rely on calling `loadStaticQuiz` manually if needed, or checking state after a delay?
    // Actually, `main` calls `loadStaticQuiz`.
    // Let's manually invoke `loadStaticQuiz` via the exposed reference to be sure we await it.

    try {
        await legacyEngine.loadStaticQuiz();
        const state = legacyEngine.state;

        if (!state.questions || state.questions.length === 0) {
            console.error(`FAILURE: Legacy quiz '${legacyId}' loaded 0 questions.`);
            process.exit(1);
        }

        // Check a known question from chapter1-review
        // "Each TYLENOL WITH CODEINE tablet contains..."
        const found = state.questions.some(q => q.prompt.includes("TYLENOL WITH CODEINE"));
        if (!found) {
             console.error(`FAILURE: Did not find expected question in '${legacyId}'.`);
             process.exit(1);
        }

        console.log(`PASS: Legacy quiz '${legacyId}' loaded ${state.questions.length} questions.`);

    } catch (e) {
        console.error("FAILURE: Error loading legacy quiz:", e);
        process.exit(1);
    }

    console.log("ALL TESTS PASSED.");
}

runTests().catch(e => {
    console.error("UNHANDLED ERROR:", e);
    process.exit(1);
});
