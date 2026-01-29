const fs = require('fs');
const vm = require('vm');
const path = require('path');

// --- 1. Load Data ---
const masterPoolPath = path.join(__dirname, '../assets/data/master_pool.json');
const quizEnginePath = path.join(__dirname, '../assets/js/quizEngine.js');

if (!fs.existsSync(masterPoolPath)) {
    console.error(`❌ Master pool not found at ${masterPoolPath}`);
    process.exit(1);
}
if (!fs.existsSync(quizEnginePath)) {
    console.error(`❌ Quiz engine not found at ${quizEnginePath}`);
    process.exit(1);
}

const masterPool = JSON.parse(fs.readFileSync(masterPoolPath, 'utf8'));
const quizEngineCode = fs.readFileSync(quizEnginePath, 'utf8');

// --- 2. Create Sandbox ---
// Mock browser environment required for quizEngine.js to run without error
const sandbox = {
    window: {
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {},
        location: { search: '' }
    },
    document: {
        getElementById: () => ({ addEventListener: () => {} }),
        addEventListener: () => {},
        readyState: 'complete',
        documentElement: { classList: { toggle: () => {} } }
    },
    location: { search: '' },
    URLSearchParams: class { get() { return null; } },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: () => {},
    console: console,
    Math: Math,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
};

// --- 3. Run quizEngine.js in Sandbox ---
try {
    vm.createContext(sandbox);
    vm.runInContext(quizEngineCode, sandbox);
} catch (e) {
    console.error("❌ Failed to load quizEngine.js in sandbox:", e);
    process.exit(1);
}

// Extract createQuestion
// In non-module scripts, function declarations are hoisted to the global object (sandbox)
const createQuestion = sandbox.createQuestion;

if (typeof createQuestion !== 'function') {
    console.error("❌ createQuestion function not found in sandbox. Ensure it is defined at the top level.");
    process.exit(1);
}

// --- 4. Verify Logic ---
console.log("🔍 Verifying Question Type Strictness...");

let errors = 0;
let checks = 0;

for (const drug of masterPool) {
    // Determine expected fields based on data presence
    // Logic from createQuestion:
    // if (drug.brand) { types.push("brand-generic", "generic-brand"); }
    // if (drug.class) { types.push("class"); }
    // if (drug.category) { types.push("category"); }
    // if (drug.moa) { types.push("moa"); }

    // We can't know which type `createQuestion` picked internally without inspecting the result.
    // But we can verify that IF it picked a certain type (implied by the question content/structure),
    // THEN it must match the strict rules.

    // Or we can modify createQuestion logic? No, treat as black box.
    // We will call it multiple times to likely hit all branches.

    for (let i = 0; i < 20; i++) { // 20 times per drug to cover randomness
        try {
            const q = createQuestion(drug, masterPool);
            checks++;

            // Analyze the generated question
            // Rules:
            // 1. Brand/Generic -> Fill-in-the-Blank (type: "short")
            // 2. Class/Category/MOA -> Multiple Choice (type: "mcq")

            // Infer source field from prompt or mapping (if available)
            // Note: quizEngine.js `q` object for "short" has a `mapping` property for debugging/verification!
            // q = { type: "short", ..., mapping: { generic: ..., brand: ... } }

            let inferredSource = null;
            if (q.mapping && (q.prompt.includes('generic name') || q.prompt.includes('brand name'))) {
                inferredSource = 'brand-generic'; // or generic-brand, grouped together as "naming"
            } else if (q.prompt.includes('class')) {
                inferredSource = 'class';
            } else if (q.prompt.includes('category')) {
                inferredSource = 'category';
            } else if (q.prompt.includes('MOA')) {
                inferredSource = 'moa';
            }

            // Verification
            if (inferredSource === 'brand-generic') {
                if (q.type !== 'short') {
                    console.error(`❌ Rule Violation: Brand/Generic question must be 'short'. Got '${q.type}'. Prompt: ${q.prompt}`);
                    errors++;
                }
            } else if (['class', 'category', 'moa'].includes(inferredSource)) {
                if (q.type !== 'mcq') {
                    console.error(`❌ Rule Violation: ${inferredSource} question must be 'mcq'. Got '${q.type}'. Prompt: ${q.prompt}`);
                    errors++;
                }
            } else {
                // If it's an error fallback
                if (q.answer === 'error') continue; // Skip error fallbacks

                // If we couldn't infer, maybe regex check the prompt?
                if (q.prompt.includes("generic name") || q.prompt.includes("brand name")) {
                     if (q.type !== 'short') {
                        console.error(`❌ Rule Violation (Regex): Naming question must be 'short'. Got '${q.type}'. Prompt: ${q.prompt}`);
                        errors++;
                    }
                } else {
                    // Assuming everything else is MCQ as per rules
                     if (q.type !== 'mcq') {
                         // Only if it's not a fallback
                        console.error(`❌ Rule Violation (Default): Question must be 'mcq'. Got '${q.type}'. Prompt: ${q.prompt}`);
                        errors++;
                    }
                }
            }

        } catch (e) {
            console.error("❌ Error generating question:", e);
            errors++;
        }
    }
}

if (errors === 0) {
    console.log(`✅ Success: Verified ${checks} generated questions. All strict type rules enforced.`);
    process.exit(0);
} else {
    console.error(`❌ Failed: Found ${errors} violations.`);
    process.exit(1);
}
