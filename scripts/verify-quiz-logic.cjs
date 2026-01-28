const fs = require('fs');
const vm = require('vm');
const path = require('path');

// 1. Setup Mock Environment
const mockDocument = {
    getElementById: (id) => ({
        addEventListener: () => {},
        classList: { add:()=>{}, remove:()=>{}, toggle:()=>{}, contains:()=>false },
        textContent: '',
        style: {},
        innerHTML: '',
        querySelector: () => ({ addEventListener: ()=>{}, checked: false }),
        querySelectorAll: () => []
    }),
    createElement: (tag) => ({
        className: '',
        setAttribute: ()=>{},
        classList: { add:()=>{}, remove:()=>{}, toggle:()=>{}, contains:()=>false },
        innerHTML: '',
        style: { setProperty: ()=>{} },
        appendChild: ()=>{},
        querySelector: () => ({ addEventListener: ()=>{}, checked: false }),
        querySelectorAll: () => [],
        addEventListener: ()=>{}
    }),
    documentElement: { classList: { toggle: ()=>{} } },
    readyState: 'complete',
    addEventListener: (evt, cb) => {}
};

const mockWindow = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    URLSearchParams: class {
        constructor() {}
        get(k){ return null; }
    },
    location: { search: '' },
    console: console
};

// We need to capture the fetch calls for legacy test
let fetchCalls = [];
const mockFetch = (url) => {
    fetchCalls.push(url);
    if (url.endsWith('master_pool.json')) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([])
        });
    }
    // Mock legacy quiz response
    if (url.includes('quizzes/test-legacy.json')) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                title: "Legacy Quiz",
                questions: [
                    { type: "mcq", prompt: "Q1", choices: ["A","B"], answer: "A" }
                ]
            })
        });
    }
    return Promise.resolve({ ok: false, status: 404 });
};

const context = {
    document: mockDocument,
    window: mockWindow,
    location: mockWindow.location,
    URLSearchParams: mockWindow.URLSearchParams,
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    fetch: mockFetch,
    console: console,
    setTimeout: setTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    // Expose globals that the script expects
    FormData: class {},
    URL: class {}
};

// 2. Load Code
const quizEngineCode = fs.readFileSync(path.join(__dirname, '../assets/js/quizEngine.js'), 'utf8');

// Append exports to access internal functions
const codeToRun = quizEngineCode + `
;
globalThis.createQuestion = createQuestion;
globalThis.createMCQ = createMCQ;
globalThis.loadStaticQuiz = loadStaticQuiz;
globalThis.state = state;
globalThis.els = els;
`;

vm.createContext(context);
try {
    vm.runInContext(codeToRun, context);
} catch (e) {
    console.error("Error loading quizEngine.js:", e);
    process.exit(1);
}

// 3. Verification Logic

console.log("Starting Verification...");
let failures = 0;

// Test 1: Strict Question Types
console.log("Test 1: Strict Question Types...");
const mockDrug = {
    brand: "TestBrand",
    generic: "TestGeneric",
    class: "TestClass",
    category: "TestCategory",
    moa: "TestMoa"
};
const mockPool = [mockDrug, {brand:"Other", generic:"Other", class:"Other", category:"Other", moa:"Other"}];

const counts = {
    "brand-generic": { total: 0, short: 0, mcq: 0 },
    "generic-brand": { total: 0, short: 0, mcq: 0 },
    "class": { total: 0, short: 0, mcq: 0 },
    "category": { total: 0, short: 0, mcq: 0 },
    "moa": { total: 0, short: 0, mcq: 0 }
};

for (let i = 0; i < 2000; i++) {
    const q = context.createQuestion(mockDrug, mockPool);

    // Reverse engineer the type from the prompt/structure
    let typeKey = "";
    if (q.prompt.includes("generic name for")) typeKey = "brand-generic";
    else if (q.prompt.includes("brand name for")) typeKey = "generic-brand";
    else if (q.prompt.includes("Which class")) typeKey = "class";
    else if (q.prompt.includes("category of")) typeKey = "category";
    else if (q.prompt.includes("MOA of")) typeKey = "moa";
    else {
        console.error("Unknown question generated:", q.prompt);
        continue;
    }

    counts[typeKey].total++;
    if (q.type === "short") counts[typeKey].short++;
    else if (q.type === "mcq") counts[typeKey].mcq++;
}

// Assertions
function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        failures++;
    } else {
        // console.log(`✅ PASS: ${message}`);
    }
}

assert(counts["brand-generic"].total > 0, "Generated brand-generic questions");
assert(counts["brand-generic"].short === counts["brand-generic"].total, "brand-generic MUST be short");
assert(counts["brand-generic"].mcq === 0, "brand-generic MUST NOT be mcq");

assert(counts["generic-brand"].total > 0, "Generated generic-brand questions");
assert(counts["generic-brand"].short === counts["generic-brand"].total, "generic-brand MUST be short");
assert(counts["generic-brand"].mcq === 0, "generic-brand MUST NOT be mcq");

assert(counts["class"].total > 0, "Generated class questions");
assert(counts["class"].mcq === counts["class"].total, "class MUST be mcq");
assert(counts["class"].short === 0, "class MUST NOT be short");

assert(counts["category"].total > 0, "Generated category questions");
assert(counts["category"].mcq === counts["category"].total, "category MUST be mcq");
assert(counts["category"].short === 0, "category MUST NOT be short");

assert(counts["moa"].total > 0, "Generated moa questions");
assert(counts["moa"].mcq === counts["moa"].total, "moa MUST be mcq");
assert(counts["moa"].short === 0, "moa MUST NOT be short");

console.log("Type Counts:", JSON.stringify(counts, null, 2));

// Test 2: Legacy Safety
console.log("Test 2: Legacy Safety...");

// Setup context for legacy load
// We need to shallow copy context but replace URLSearchParams
const legacyContext = { ...context };
// Reset fetch calls
fetchCalls = [];
// Reuse mockFetch but it needs to be attached to new context if strictly needed,
// but we just copied properties.

legacyContext.URLSearchParams = class {
    get(k) { if (k === 'id') return 'test-legacy'; return null; }
};

console.log("  Re-initializing VM for Legacy Test...");
vm.createContext(legacyContext);
try {
    vm.runInContext(codeToRun, legacyContext);
} catch (e) {
    console.error("Error loading quizEngine.js in legacy context:", e);
}

// Helper to wait
async function waitForQuestions() {
    for (let i=0; i<20; i++) {
        // Check if questions are loaded
        if (legacyContext.state && legacyContext.state.questions && legacyContext.state.questions.length > 0) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    return false;
}

(async () => {
    const loaded = await waitForQuestions();
    assert(loaded, "Legacy quiz questions loaded");
    if (loaded) {
        const q = legacyContext.state.questions[0];
        assert(q.type === 'mcq', "Legacy question type preserved");
        assert(q.prompt === 'Q1', "Legacy question prompt preserved");
    } else {
        console.error("Debug: Legacy fetch calls:", fetchCalls);
    }

    if (failures === 0) {
        console.log("\n✅ ALL TESTS PASSED");
        process.exit(0);
    } else {
        console.error(`\n❌ ${failures} TESTS FAILED`);
        process.exit(1);
    }
})();
