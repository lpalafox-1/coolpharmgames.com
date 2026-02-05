const fs = require('fs');
const vm = require('vm');
const path = require('path');

const quizEnginePath = path.join(__dirname, '../assets/js/quizEngine.js');
const quizEngineCode = fs.readFileSync(quizEnginePath, 'utf8');

// Dummy master pool for testing strict rules
const mockMasterPool = [
    { generic: 'DrugA', brand: 'BrandA', class: 'ClassA', category: 'CatA', moa: 'MoaA' },
    { generic: 'DrugB', brand: 'BrandB', class: 'ClassB', category: 'CatB', moa: 'MoaB' },
    { generic: 'DrugC', brand: 'BrandC', class: 'ClassC', category: 'CatC', moa: 'MoaC' },
    { generic: 'DrugD', brand: 'BrandD', class: 'ClassD', category: 'CatD', moa: 'MoaD' },
];

function createSandbox(searchParams) {
    const sandbox = {
        window: {
            matchMedia: () => ({ matches: false }),
            addEventListener: () => {},
        },
        document: {
            getElementById: (id) => ({
                addEventListener: () => {},
                classList: { add:()=>{}, remove:()=>{}, toggle:()=>{}, contains:()=>{} },
                style: {},
                querySelector: () => ({ addEventListener:()=>{} }),
                querySelectorAll: () => [],
                setAttribute: () => {},
                textContent: '',
                innerHTML: '',
                appendChild: () => {},
            }),
            addEventListener: () => {},
            createElement: () => ({
                classList: { add:()=>{} },
                setAttribute:()=>{},
                style: {},
                addEventListener: () => {},
            }),
            documentElement: { classList: { toggle:()=>{} } },
            readyState: 'complete', // Simulate loaded
        },
        location: { search: searchParams },
        URLSearchParams: URLSearchParams,
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        },
        fetch: () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({})
        }),
        console: {
            log: () => {},
            error: (msg) => { if(!String(msg).includes('Missing ?id')) console.error(msg); },
            warn: console.warn
        },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        // Expose internal state if needed, but we rely on global vars declared in script
    };
    return sandbox;
}

function verifyStrictRules() {
    console.log("Starting Strict Rules Verification...");
    const sandbox = createSandbox('');
    vm.createContext(sandbox);
    // Append code to expose internals
    vm.runInContext(quizEngineCode + "\n;globalThis.createQuestion = createQuestion;", sandbox);

    const createQuestion = sandbox.createQuestion;
    if (!createQuestion) {
        console.error("Failed to access createQuestion");
        process.exit(1);
    }
    const errors = [];

    function check(drug, typeName, expectedType) {
        // Run multiple times to cover randomness
        for (let i = 0; i < 50; i++) {
            const q = createQuestion(drug, mockMasterPool);

            // If we are testing brand-generic/generic-brand, createQuestion might pick either.
            // Both map to 'short'.
            // If the drug ONLY has the field we are testing, it MUST pick that field.

            if (q.type !== expectedType) {
                errors.push(`[${typeName}] Expected ${expectedType}, got ${q.type} for drug ${JSON.stringify(drug)}`);
            }
        }
    }

    // 1. Brand/Generic -> MUST be Short
    // Provide drug with ONLY brand (and generic)
    check({ generic: 'TestGen', brand: 'TestBrand' }, 'Brand/Generic', 'short');

    // 2. Class -> MUST be MCQ
    check({ generic: 'TestGen', class: 'TestClass' }, 'Class', 'mcq');

    // 3. Category -> MUST be MCQ
    check({ generic: 'TestGen', category: 'TestCat' }, 'Category', 'mcq');

    // 4. MOA -> MUST be MCQ
    check({ generic: 'TestGen', moa: 'TestMoa' }, 'MOA', 'mcq');

    if (errors.length > 0) {
        console.error("Strict Rules Verification FAILED:");
        errors.forEach(e => console.error(e));
        process.exit(1);
    } else {
        console.log("Strict Rules Verification PASSED.");
    }
}

async function verifyLegacyLoading() {
    console.log("Starting Legacy Safety Verification...");
    const sandbox = createSandbox('?id=legacy-test');

    // Mock fetch to return legacy quiz
    const legacyQuiz = {
        title: "Legacy Quiz",
        questions: [
            { type: "legacy-custom", prompt: "Legacy Q1", answer: "A" }
        ]
    };

    sandbox.fetch = (url) => {
        if (url.includes('legacy-test.json')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(legacyQuiz)
            });
        }
        return Promise.reject("Not found");
    };

    vm.createContext(sandbox);

    // Run the code with exposure
    // main() is called automatically because we set readyState='complete'
    vm.runInContext(quizEngineCode + "\n;globalThis.state = state;", sandbox);

    // Wait for state.questions to be populated
    const maxRetries = 10;
    let retries = 0;

    const checkState = () => {
        if (sandbox.state && sandbox.state.questions && sandbox.state.questions.length > 0) {
            const q = sandbox.state.questions[0];
            if (q.type === 'legacy-custom') {
                console.log("Legacy Safety Verification PASSED: Loaded legacy question type correctly.");
            } else {
                console.error(`Legacy Safety Verification FAILED: Expected 'legacy-custom', got '${q.type}'`);
                process.exit(1);
            }
        } else {
            retries++;
            if (retries > maxRetries) {
                // It might be that main() failed or is still running.
                // Check for errors?
                console.error("Legacy Safety Verification FAILED: Timeout waiting for questions to load.");
                process.exit(1);
            }
            setTimeout(checkState, 100);
        }
    };

    checkState();
}

// Run tests
try {
    verifyStrictRules();
    verifyLegacyLoading();
} catch (e) {
    console.error("Unexpected error during verification:", e);
    process.exit(1);
}
