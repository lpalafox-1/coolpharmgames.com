const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const quizEnginePath = path.join(__dirname, '../assets/js/quizEngine.js');
// Append code to expose state to the global context so we can access it from the test
const quizEngineCode = fs.readFileSync(quizEnginePath, 'utf8') + "\nglobalThis.exposedState = state;";

function runQuizEngine(urlParams, fetchMock) {
    const context = {
        window: {
            matchMedia: () => ({ matches: false }),
            addEventListener: () => {},
        },
        document: {
            getElementById: () => ({
                addEventListener: () => {},
                classList: { add:()=>{}, remove:()=>{}, toggle:()=>{} },
                innerHTML: '',
                textContent: '',
                style: {},
                setAttribute: () => {},
                querySelector: () => null,
                querySelectorAll: () => [],
                appendChild: () => {},
            }),
            createElement: () => ({
                classList: { add:()=>{}, remove:()=>{}, toggle:()=>{} },
                setAttribute: () => {},
                querySelector: () => ({ addEventListener:()=>{} }),
                addEventListener: () => {},
                appendChild: () => {},
                style: {},
            }),
            addEventListener: () => {},
            readyState: 'complete',
            documentElement: { classList: { toggle: () => {}, contains: () => false } }
        },
        location: { search: '?' + new URLSearchParams(urlParams).toString() },
        URLSearchParams: URLSearchParams,
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        },
        console: {
            log: () => {},
            error: (...args) => {
                // Suppress expected errors during strict type testing (due to empty master pool)
                // but show others.
                if (args[0] && args[0].toString().includes("masterPool.filter")) return;
                console.error(...args);
            },
        },
        fetch: fetchMock || (() => Promise.resolve({ ok: true, json: () => [] })), // Default mock returns array
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        Math: Math,
        Array: Array,
        Object: Object,
        Number: Number,
        String: String,
        Set: Set,
        Date: Date,
        Boolean: Boolean,
        parseInt: parseInt,
        parseFloat: parseFloat,
        isNaN: isNaN,
        Infinity: Infinity,
        JSON: JSON,
        globalThis: {} // Will be set to context self-reference by vm? No, we should define it or let vm handle it.
    };
    context.globalThis = context; // Circular reference for globalThis

    vm.createContext(context);
    vm.runInContext(quizEngineCode, context);
    return context;
}

async function testStrictTypes() {
    console.log("Testing Strict Question Types...");
    // Mock fetch to return valid array to avoid errors
    const fetchMock = () => Promise.resolve({ ok: true, json: () => [] });
    const ctx = runQuizEngine({ week: "1" }, fetchMock);

    // Mock data
    const mockDrug = {
        brand: "BrandName",
        generic: "GenericName",
        class: "ClassName",
        category: "CategoryName",
        moa: "MoaDescription",
        metadata: { lab: 2, week: 1 }
    };
    const masterPool = [
        mockDrug,
        { ...mockDrug, class: "OtherClass", category: "OtherCat", moa: "OtherMoa" },
        { ...mockDrug, class: "AnotherClass", category: "AnotherCat", moa: "AnotherMoa" },
        { ...mockDrug, class: "FinalClass", category: "FinalCat", moa: "FinalMoa" }
    ];

    let brandGenericCount = 0;
    let otherCount = 0;

    for (let i = 0; i < 1000; i++) {
        const q = ctx.createQuestion(mockDrug, masterPool);

        // Infer question type based on prompt/mapping
        if (q.prompt.includes("generic name for") || q.prompt.includes("brand name for")) {
            brandGenericCount++;
            assert.strictEqual(q.type, "short", `Brand/Generic question must be short. Got ${q.type} for prompt: ${q.prompt}`);
        } else if (q.prompt.includes("class does") || q.prompt.includes("category of") || q.prompt.includes("MOA of")) {
            otherCount++;
            assert.strictEqual(q.type, "mcq", `Class/Category/MOA question must be mcq. Got ${q.type} for prompt: ${q.prompt}`);
        } else {
             assert.fail(`Unexpected question generated: ${q.prompt}`);
        }
    }

    console.log(`Verified ${brandGenericCount} brand/generic (short) and ${otherCount} others (mcq).`);
    if (brandGenericCount === 0 || otherCount === 0) {
        console.warn("WARNING: Random distribution might be skewed or logic changed. Check test.");
    }
}

async function testLegacySafety() {
    console.log("Testing Legacy Safety...");
    const mockQuiz = {
        id: "test-legacy",
        title: "Legacy Quiz",
        questions: [
            { type: "short", prompt: "Legacy Short", answer: "A" },
            { type: "mcq", prompt: "Legacy MCQ", choices: ["A","B"], answer: "A" },
            { type: "tf", prompt: "Legacy TF", answer: "True" }
        ]
    };

    const fetchMock = (url) => {
        if (url.includes("test-legacy.json")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockQuiz)
            });
        }
        return Promise.reject("Not Found: " + url);
    };

    const ctx = runQuizEngine({ id: "test-legacy" }, fetchMock);

    // Wait for async main to complete (approx)
    await new Promise(r => setTimeout(r, 200));

    const state = ctx.exposedState;
    assert.ok(state, "State should be exposed");
    const questions = state.questions;
    assert.ok(questions, "Questions should be loaded in state");
    assert.strictEqual(questions.length, 3, "Should load 3 legacy questions");

    const shortQ = questions.find(q => q.prompt === "Legacy Short");
    assert.ok(shortQ, "Legacy Short question should exist");
    assert.strictEqual(shortQ.type, "short");

    const mcqQ = questions.find(q => q.prompt === "Legacy MCQ");
    assert.ok(mcqQ, "Legacy MCQ question should exist");
    assert.strictEqual(mcqQ.type, "mcq");

    const tfQ = questions.find(q => q.prompt === "Legacy TF");
    assert.ok(tfQ, "Legacy TF question should exist");
    assert.strictEqual(tfQ.type, "tf");

    console.log("Legacy quiz loaded correctly with preserved types.");
}

(async () => {
    try {
        await testStrictTypes();
        await testLegacySafety();
        console.log("All tests passed!");
    } catch (e) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
})();
