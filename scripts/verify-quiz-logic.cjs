// Strict verification script
const fs = require('fs');
const path = require('path');

// 1. Mock DOM Environment
global.window = {
  location: { search: '' },
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {},
};
global.document = {
  getElementById: (id) => ({
    classList: { add:()=>{}, remove:()=>{}, toggle:()=>{}, contains:()=>false },
    textContent: '',
    style: {},
    addEventListener: () => {},
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute: () => {},
    value: '',
    disabled: false
  }),
  createElement: () => ({
    classList: { add:()=>{}, remove:()=>{} },
    setAttribute: () => {},
    addEventListener: () => {},
    style: {}
  }),
  documentElement: { classList: { toggle:()=>{}, contains:()=>false } },
  readyState: 'complete',
  addEventListener: (evt, cb) => { if(evt==='DOMContentLoaded') cb(); },
};
global.URLSearchParams = class {
  constructor(s) { this.s = s; }
  get(k) { return null; } // Default
};
global.location = global.window.location;
global.localStorage = global.window.localStorage;
global.fetch = async (url) => {
    // Mock fetch for master_pool and quizzes
    if (url.includes('master_pool.json')) {
        const data = fs.readFileSync(path.resolve(__dirname, '../assets/data/master_pool.json'), 'utf8');
        return { ok: true, json: async () => JSON.parse(data), status: 200 };
    }
    if (url.startsWith('quizzes/')) {
        // Legacy quiz load
        try {
            const data = fs.readFileSync(path.resolve(__dirname, '../', url), 'utf8');
            return { ok: true, json: async () => JSON.parse(data), status: 200 };
        } catch(e) {
            return { ok: false, status: 404 };
        }
    }
    return { ok: false, status: 404 };
};

(async () => {
  try {
    // Dynamic import to load the ESM module after mocking globals
    const quizEngine = await import('../assets/js/quizEngine.js');

    // Test 1: Strict Question Types
    console.log("Testing Strict Question Types...");
    const masterPoolPath = path.resolve(__dirname, '../assets/data/master_pool.json');
    const masterPool = JSON.parse(fs.readFileSync(masterPoolPath, 'utf8'));

    const { createQuestion } = quizEngine;

    if (typeof createQuestion !== 'function') {
        throw new Error("createQuestion is not exported from quizEngine.js");
    }

    let errors = 0;
    const iterations = 5000;

    for (let i = 0; i < iterations; i++) {
        // Pick random drug
        const drug = masterPool[Math.floor(Math.random() * masterPool.length)];
        const q = createQuestion(drug, masterPool);

        // Rules:
        // Brand/Generic -> MUST be 'short'.
        // Class/Category/MOA -> MUST be 'mcq'.

        const prompt = (q.prompt || "").toLowerCase();

        // Identify what field was quizzed
        let field = null;
        if (q.mapping && (q.mapping.brand || q.mapping.generic)) field = 'brand-generic';
        else if (prompt.includes('class')) field = 'class';
        else if (prompt.includes('category')) field = 'category';
        else if (prompt.includes('moa') || prompt.includes('mechanism of action')) field = 'moa';
        else if (prompt.includes('brand name') || prompt.includes('generic name')) field = 'brand-generic'; // fallback
        else if (prompt.startsWith('error')) {
            // Ignore error fallbacks due to missing data if they are correct behavior
            continue;
        }

        if (field === 'brand-generic') {
            if (q.type !== 'short') {
                console.error("FAIL: Brand/Generic question is not 'short'", q);
                errors++;
            }
        } else if (field === 'class' || field === 'category' || field === 'moa') {
            if (q.type !== 'mcq') {
                 console.error(`FAIL: ${field} question is not 'mcq'`, q);
                 errors++;
            }
        } else {
             // console.warn("Unknown question generated:", q);
        }
    }

    if (errors === 0) console.log("✅ Strict Question Types verified.");
    else {
        console.error(`❌ Failed Strict Question Types with ${errors} errors.`);
        process.exit(1);
    }

    // Test 2: Legacy Safety
    console.log("Testing Legacy Quiz Loading (Validation)...");

    // We will inspect a sample legacy quiz file to ensure it matches the structure expected by the engine.
    const legacyQuizPath = path.resolve(__dirname, '../quizzes/chapter1-review.json');
    if (fs.existsSync(legacyQuizPath)) {
        const quizData = JSON.parse(fs.readFileSync(legacyQuizPath, 'utf8'));
        // Check if pools or questions exist
        if (quizData.pools || quizData.questions) {
             console.log("✅ Legacy quiz file structure is compatible.");
        } else {
             console.error("❌ Legacy quiz file missing pools/questions.");
             errors++;
        }
    } else {
        console.warn("⚠️ Legacy quiz file not found for verification.");
    }

    if (errors > 0) process.exit(1);

  } catch (e) {
    console.error("Test Failed:", e);
    process.exit(1);
  }
})();
