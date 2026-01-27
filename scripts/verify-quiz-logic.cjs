const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Mock Browser Environment
const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    location: { search: '?week=1' }
};

const mockElement = {
    addEventListener: () => {},
    classList: {
        contains: () => false,
        add: () => {},
        remove: () => {},
        toggle: () => {}
    },
    style: {},
    innerHTML: '',
    textContent: '',
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    value: '',
    disabled: false,
    setAttribute: () => {},
    getAttribute: () => null,
    click: () => {}
};

const document = {
    getElementById: () => ({ ...mockElement }), // Return a new object each time
    documentElement: {
        classList: {
            toggle: () => {},
            contains: () => false
        }
    },
    createElement: () => ({ ...mockElement }),
    readyState: 'complete',
    addEventListener: () => {}
};

const location = { search: '?week=1' };
const URLSearchParams = class {
    constructor(s) { this.s = s; }
    get(k) { return k === 'week' ? '1' : null; }
};
const console = { ...global.console };

// Read source code
const engineCode = fs.readFileSync(path.join(__dirname, '../assets/js/quizEngine.js'), 'utf8');

// Attach functions to window to expose them
const codeToRun = engineCode + `
;
window.createQuestion = createQuestion;
window.createMCQ = createMCQ;
window.state = state;
window.generateQuizFromPool = generateQuizFromPool;
`;

const context = vm.createContext({
    window,
    document,
    location,
    URLSearchParams,
    localStorage: window.localStorage,
    console,
    fetch: () => Promise.resolve({ ok: true, json: () => [] }),
    HTMLElement: class {},
    Math,
    Array,
    Object,
    Number,
    String,
    Boolean,
    parseInt,
    parseFloat,
    Date,
    Set,
    JSON,
    setTimeout: (fn) => fn(),
    setInterval: () => {},
    clearInterval: () => {}
});

try {
    vm.runInContext(codeToRun, context);
} catch (e) {
    console.error("Error running engine code:", e);
    process.exit(1);
}

// Access createQuestion
const createQuestion = context.window.createQuestion;

// Load Data
let masterPool;
try {
    masterPool = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/master_pool.json'), 'utf8'));
} catch (e) {
    console.error("Failed to load master pool:", e.message);
    process.exit(1);
}

console.log(`Loaded ${masterPool.length} items from master pool.`);

// Test Rules
let errors = [];
let checks = 0;

masterPool.forEach(drug => {
    // Generate multiple times to cover random branches
    for (let i = 0; i < 20; i++) {
        const q = createQuestion(drug, masterPool);

        // Rule 1: Brand/Generic -> Fill-in-the-Blank (Input) -> type "short"
        if (q.prompt && (q.prompt.includes("generic name for") || q.prompt.includes("brand name for"))) {
            checks++;
            if (q.type !== 'short') {
                errors.push(`Violation: Brand/Generic question for ${drug.generic} is not 'short' (got ${q.type})`);
            }
        }

        // Rule 2: MOA / Class / Category -> Multiple Choice (Radio) -> type "mcq"
        if (q.prompt && (q.prompt.includes("class does") || q.prompt.includes("category of") || q.prompt.includes("MOA of"))) {
            checks++;
            if (q.type !== 'mcq') {
                errors.push(`Violation: Class/Category/MOA question for ${drug.generic} is not 'mcq' (got ${q.type})`);
            }
        }
    }
});

console.log(`Performed ${checks} checks.`);

if (errors.length > 0) {
    console.error("Strict Type Enforcement Failed:");
    errors.slice(0, 10).forEach(e => console.error(e)); // Show first 10
    if (errors.length > 10) console.error(`...and ${errors.length - 10} more.`);
    process.exit(1);
} else {
    console.log("✅ Strict Question Types Enforced (100%)");
}

// Test Legacy Safety (Static Quizzes)
const state = context.window.state;
if (!Array.isArray(state.questions)) {
    console.error("❌ State.questions is not an array");
    process.exit(1);
}

console.log("✅ Engine state structure appears compatible");
