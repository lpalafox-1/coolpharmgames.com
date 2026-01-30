const fs = require('fs');
const vm = require('vm');
const path = require('path');

const enginePath = path.join(__dirname, '../assets/js/quizEngine.js');
const code = fs.readFileSync(enginePath, 'utf8');

const sandbox = {
  window: {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {}
  },
  document: {
    getElementById: () => null,
    readyState: 'complete',
    addEventListener: () => {},
    documentElement: { classList: { toggle: () => {} } },
    createElement: () => ({
      classList: { add:()=>{}, remove:()=>{}, toggle:()=>{} },
      setAttribute: ()=>{},
      appendChild: ()=>{},
      querySelector: ()=>null,
      querySelectorAll: ()=>[],
      addEventListener: ()=>{}
    })
  },
  location: { search: '' },
  URLSearchParams: class { get() { return null; } },
  localStorage: { getItem: () => null, setItem: () => {} },
  console: { error: () => {}, log: () => {} },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
  globalThis: {}, // To attach results
};
sandbox.globalThis = sandbox; // Self-reference for global properties

const testScript = `
  ${code}

  // --- Verification Logic ---
  const mockDrug = {
    generic: "GenericName",
    brand: "BrandName",
    class: "ClassName",
    category: "CategoryName",
    moa: "MoaDescription"
  };
  const mockPool = [
    mockDrug,
    { generic: "D2", brand: "B2", class: "C2", category: "Cat2", moa: "M2" },
    { generic: "D3", brand: "B3", class: "C3", category: "Cat3", moa: "M3" },
    { generic: "D4", brand: "B4", class: "C4", category: "Cat4", moa: "M4" }
  ];

  const results = [];
  const iterations = 5000;

  for(let i=0; i<iterations; i++) {
    const q = createQuestion(mockDrug, mockPool);
    results.push(q);
  }

  globalThis.verificationResults = results;
`;

try {
  console.log("Running Dynamic Generation Verification...");
  vm.createContext(sandbox);
  vm.runInContext(testScript, sandbox);

  const results = sandbox.verificationResults;
  const errors = [];

  let counts = {
    brandGeneric: 0,
    class: 0,
    category: 0,
    moa: 0
  };

  results.forEach(q => {
    if (q.prompt.includes("generic name for") || q.prompt.includes("brand name for")) {
      counts.brandGeneric++;
      if (q.type !== 'short') {
        errors.push("FAILURE: Brand/Generic question is NOT 'short'. Type: " + q.type + " Prompt: " + q.prompt);
      }
    }
    else if (q.prompt.includes("class does")) {
      counts.class++;
      if (q.type !== 'mcq') {
        errors.push("FAILURE: Class question is NOT 'mcq'. Type: " + q.type);
      }
    }
    else if (q.prompt.includes("category of")) {
      counts.category++;
      if (q.type !== 'mcq') {
        errors.push("FAILURE: Category question is NOT 'mcq'. Type: " + q.type);
      }
    }
    else if (q.prompt.includes("MOA of")) {
      counts.moa++;
      if (q.type !== 'mcq') {
        errors.push("FAILURE: MOA question is NOT 'mcq'. Type: " + q.type);
      }
    }
  });

  console.log("Distribution:", counts);

  if (errors.length > 0) {
    console.error("Errors found:");
    errors.slice(0, 10).forEach(e => console.error(e));
    process.exit(1);
  } else {
    console.log("SUCCESS: All generated questions adhered to strict type rules.");
  }

  // --- Legacy Quiz Verification ---
  console.log("\nVerifying Legacy Quizzes...");
  const quizDir = path.join(__dirname, '../quizzes');
  if (fs.existsSync(quizDir)) {
    const files = fs.readdirSync(quizDir).filter(f => f.endsWith('.json'));
    let passed = 0;
    let failed = 0;

    files.forEach(f => {
      // Known empty files to skip
      if (f === 'practice-e2b-exam2-prep-expanded.json' || f === 'test-sample-3.json') {
        console.log(`Skipping known empty file: ${f}`);
        return;
      }

      try {
        const content = fs.readFileSync(path.join(quizDir, f), 'utf8');
        const json = JSON.parse(content);

        let qCount = 0;
        if (Array.isArray(json.questions)) qCount = json.questions.length;
        else if (json.pools) {
          Object.values(json.pools).forEach(p => {
            if (Array.isArray(p)) qCount += p.length;
          });
        }

        if (qCount === 0) {
           console.warn(`Warning: ${f} has 0 questions.`);
        }
        passed++;
      } catch(e) {
        console.error(`FAILED: ${f} is invalid. ${e.message}`);
        failed++;
      }
    });

    if (failed > 0) {
      console.error(`${failed} legacy quizzes failed verification.`);
      process.exit(1);
    } else {
      console.log(`SUCCESS: Verified ${passed} legacy quizzes.`);
    }
  }

} catch (e) {
  console.error("Script Execution Error:", e);
  process.exit(1);
}
