// assets/js/quizEngine.js
const params = new URLSearchParams(location.search);
const weekParam = parseInt(params.get("week") || "", 10);  // Single week: ?week=1
const weeksParam = params.get("weeks");                      // Cumulative range: ?weeks=1-5
const tagParam = params.get("tag");                          // Topic mode: ?tag=Anticoagulants
const labParam = parseInt(params.get("lab") || "2", 10);     // Lab isolation: &lab=1 or &lab=2 (default: 2)
const quizId = params.get("id");

const state = { 
    questions: [], index: 0, score: 0, title: "",
    timerSeconds: 0, timerHandle: null, marked: new Set(),
    currentScale: 1.0,
    originalQuestions: [],  // For restart with original pool
    hintsUsed: 0            // Track hints for stats
};

const getEl = (id) => document.getElementById(id);

// Initialize dark mode from localStorage at startup
const savedTheme = localStorage.getItem("pharmlet.theme");
if (savedTheme === "dark") {
    document.documentElement.classList.add("dark");
    const helpBtn = document.getElementById("help-shortcuts");
    if (helpBtn) helpBtn.style.color = "black";
}

// --- 1. CORE ACTIONS ---
function toggleMark() {
    if (state.marked.has(state.index)) state.marked.delete(state.index);
    else state.marked.add(state.index);
    renderNavMap();
}

function toggleTimer() {
    if (state.timerHandle) {
        clearInterval(state.timerHandle);
        state.timerHandle = null;
        if (getEl("timer-readout")) getEl("timer-readout").classList.add("opacity-30", "animate-pulse");
    } else {
        state.timerHandle = setInterval(timerTick, 1000);
        if (getEl("timer-readout")) getEl("timer-readout").classList.remove("opacity-30", "animate-pulse");
    }
}

function changeZoom(dir) {
    state.currentScale += (dir === 'in' ? 0.1 : -0.1);
    if (state.currentScale < 0.6) state.currentScale = 0.6;
    document.body.style.zoom = state.currentScale;
    document.documentElement.style.setProperty('--quiz-size', `${state.currentScale}rem`);
}

// --- SMART HINT SYSTEM ---
function showHint() {
    const q = state.questions[state.index];
    if (!q || q._answered) return;
    
    const drug = q.drugRef;
    if (!drug) {
        alert("💡 No hint available for this question.");
        return;
    }
    
    let hintText = "";
    const prompt = q.prompt.toLowerCase();
    
    // Determine hint based on question type
    if (prompt.includes("brand")) {
        // Asking for Brand → Show first letter
        const brand = drug.brand?.split(/[,/;]/)[0]?.trim() || "?";
        hintText = `💡 First letter: "${brand.charAt(0).toUpperCase()}..."\n📦 Category: ${drug.category || "N/A"}`;
    } else if (prompt.includes("generic")) {
        // Asking for Generic → Show brand as hint
        hintText = `💡 Brand: ${drug.brand || "N/A"}\n📦 Category: ${drug.category || "N/A"}`;
    } else if (prompt.includes("class") || prompt.includes("moa")) {
        // Asking for Class/MOA → Show category
        hintText = `💡 Category: ${drug.category || "N/A"}\n💊 Generic: ${drug.generic || "N/A"}`;
    } else {
        // Fallback: Show category and class
        hintText = `💡 Category: ${drug.category || "N/A"}\n🏷️ Class: ${drug.class || "N/A"}`;
    }
    
    // Mark hint as used and increment counter
    q._hintUsed = true;
    state.hintsUsed++;
    
    alert(hintText);
}

// --- REVEAL ANSWER (Give Up) ---
function revealAnswer() {
    const q = state.questions[state.index];
    if (!q || q._answered) return;
    scoreCurrent("Revealed");
}

// --- RESTART WITH CONFIRMATION ---
function restartQuiz() {
    if (confirm("🔄 Restart this quiz? Your progress will be lost.")) {
        location.reload();
    }
}

// --- REVIEW MISSED QUESTIONS ---
function reviewMissed() {
    const missed = state.questions.filter(q => q._answered && !q._correct);
    if (missed.length === 0) {
        alert("🎉 No missed questions to review!");
        return;
    }
    
    // Reset state for review mode
    state.questions = missed.map((q, i) => ({ ...q, _answered: false, _user: null, _correct: false, _id: i }));
    state.index = 0;
    state.score = 0;
    state.hintsUsed = 0;
    state.marked.clear();
    state.title = `Review: ${missed.length} Missed`;
    
    if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
    if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
    
    startSmartTimer();
    render();
}

// Expose to global scope for inline onclick handlers
window.reviewMissed = reviewMissed;

// --- 2. DATA PIPELINE ---
async function smartFetch(fileName) {
    const paths = [`assets/data/${fileName}`, `data/${fileName}`, `quizzes/${fileName}`, `../assets/data/${fileName}`];
    for (let path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) return await res.json();
        } catch (e) { continue; }
    }
    console.warn(`Warning: Unable to fetch ${fileName} from any path`);
    throw new Error(`File not found: ${fileName}`);
}

function createQuestion(drug, all) {
    // Smart Distractor Helper - Prioritizes same class, then category, excludes target drug
    const getSmartDistracters = (targetDrug, targetValue, key) => {
        // High Priority: Same class as target drug
        const sameClass = all.filter(d => 
            d !== targetDrug && 
            d[key] && 
            d[key] !== targetValue &&
            d.class === targetDrug.class
        );
        if (sameClass.length >= 3) {
            return shuffled(sameClass).slice(0, 3).map(d => d[key]);
        }
        
        // Medium Priority: Same category as target drug
        const sameCategory = all.filter(d =>
            d !== targetDrug &&
            d[key] &&
            d[key] !== targetValue &&
            d.category === targetDrug.category
        );
        if (sameCategory.length >= 3) {
            return shuffled(sameCategory).slice(0, 3).map(d => d[key]);
        }
        
        // Fall back to random drugs (exclude target drug and target value)
        const random = shuffled(
            all.filter(d => d !== targetDrug && d[key] && d[key] !== targetValue)
        ).slice(0, 3).map(d => d[key]);
        return random;
    };
    
    // Helper: Create Negative MCQ ("Which is NOT...?")
    const createNegativeMCQ = () => {
        const attributes = [
            { key: 'class', label: 'classification' },
            { key: 'category', label: 'category' },
            { key: 'moa', label: 'MOA' }
        ].filter(a => drug[a.key]);
        
        if (attributes.length === 0) return null; // Can't create negative MCQ
        
        const attr = attributes[Math.floor(Math.random() * attributes.length)];
        const targetValue = drug[attr.key];
        
        // Find 3 drugs that SHARE the target attribute (these will be wrong answers)
        const sameAttribute = shuffled(
            all.filter(d => d !== drug && d[attr.key] === targetValue && d[attr.key])
        ).slice(0, 3);
        
        if (sameAttribute.length < 3) return null; // Not enough drugs with same attribute
        
        // Find 1 drug with DIFFERENT attribute (this is the correct answer for "NOT")
        const differentAttribute = shuffled(
            all.filter(d => d !== drug && d[attr.key] && d[attr.key] !== targetValue)
        )[0];
        
        if (!differentAttribute) return null; // Can't find a different attribute
        
        const correctAnswer = differentAttribute.generic;
        const wrongAnswers = sameAttribute.map(d => d.generic);
        
        return {
            type: "mcq",
            prompt: `Which is <b>NOT</b> a drug with <b>${attr.label} ${targetValue}</b>?`,
            choices: shuffled([correctAnswer, ...wrongAnswers]),
            answer: correctAnswer,
            drugRef: drug
        };
    };
    
    // Helper: Create Correctly Paired Class MCQ (Lab 2 Only)
    const createCorrectlyPairedMCQ = () => {
        if (!drug.class) return null; // Need class information
        
        // Find other drugs from same category/therapeutic area BUT with DIFFERENT classes
        // This ensures no other drug will have the same correct class as the target
        const sameCategoryDrugs = all.filter(d => 
            d !== drug && 
            d.class && 
            d.generic && 
            d.category === drug.category &&
            d.class !== drug.class  // CRITICAL: Exclude drugs with same class
        );
        
        // If not enough in same category, use any drugs with DIFFERENT classes
        const candidateDrugs = sameCategoryDrugs.length >= 3 
            ? sameCategoryDrugs 
            : all.filter(d => d !== drug && d.class && d.generic && d.class !== drug.class);
        
        if (candidateDrugs.length < 3) return null; // Need at least 3 other drugs
        
        const selectedOthers = shuffled(candidateDrugs).slice(0, 3);
        
        // Correct answer: target drug with its correct class
        const correctAnswer = `${drug.generic}: ${drug.class}`;
        
        // Wrong answers: ALL options must be INCORRECTLY paired
        // Strategy: Show other drugs ALL wrongly claiming to be in target drug's class
        // This matches the example where multiple drugs claim "1st generation H1 antagonist"
        const wrongAnswers = selectedOthers.map(d => {
            // Always use target's class (WRONG for these other drugs)
            return `${d.generic}: ${drug.class}`;
        });
        
        return {
            type: "mcq",
            prompt: `Which of the following medications are <b>correctly paired</b> with their medication class?`,
            choices: shuffled([correctAnswer, ...wrongAnswers]),
            answer: correctAnswer,
            drugRef: drug
        };
    };
    
    // Data Handling: Check for brand existence (excluding "N/A")
    const hasBrand = drug.brand && drug.brand !== "N/A";
    const brandList = hasBrand 
        ? drug.brand.split(/[\/,]/).map(b => b.trim()).filter(Boolean)
        : [];
    const singleBrand = brandList.length > 0 
        ? brandList[Math.floor(Math.random() * brandList.length)]
        : null;
    
    // CRITICAL: If no brand exists (e.g., Rocuronium), force Single Component MCQ
    if (!hasBrand || !singleBrand) {
        const mcqTypes = [
            {l:'Classification', k:'class'}, 
            {l:'Category', k:'category'}, 
            {l:'MOA', k:'moa'}
        ].filter(x => drug[x.k]);
        
        if (mcqTypes.length === 0) {
            // Fallback for drugs with no brand and no classifiable fields
            return { 
                type: "short", 
                prompt: `Name the drug (generic):`, 
                answer: drug.generic || "Unknown",
                drugRef: drug 
            };
        }
        
        const t = mcqTypes[Math.floor(Math.random() * mcqTypes.length)];
        const correctAns = drug[t.k];
        const distractors = getSmartDistracters(drug, correctAns, t.k);
        
        return {
            type: "mcq",
            prompt: `<b>${t.l}</b> for <b>${drug.generic}</b>?`,
            choices: shuffled([correctAns, ...distractors]),
            answer: correctAns,
            drugRef: drug
        };
    }
    
    // Drugs WITH brands: Use probability distribution
    // Lab 2: 30/20/15/15/10/10 (with Correctly Paired MCQ)
    // Others: 35/25/15/15/10 (original distribution)
    const isLab2Quiz = weekParam && labParam === 2;
    const r = Math.random();
    
    // Brand & Class MCQ with Trap Logic (35% normal, 30% Lab 2)
    const brandClassThreshold = isLab2Quiz ? 0.30 : 0.35;
    if (r < brandClassThreshold && drug.class) {
        const correct = `${singleBrand} / ${drug.class}`;
        
        // Trap 1: Correct Brand / WRONG Class
        const wrongClass = all.find(d => d.class && d.class !== drug.class);
        const w1 = `${singleBrand} / ${wrongClass?.class || 'Inhibitor'}`;
        
        // Trap 2: WRONG Brand / Correct Class
        const wrongBrand = all.find(d => d.brand && d.brand !== drug.brand);
        const w2 = `${wrongBrand?.brand?.split(/[\/,]/)[0] || 'Drug'} / ${drug.class}`;
        
        // Distractor 3: Wrong Brand / Wrong Class
        const w3 = `${wrongBrand?.brand?.split(/[\/,]/)[0] || 'Drug'} / ${wrongClass?.class || 'Antagonist'}`;
        
        return { 
            type: "mcq", 
            prompt: `Identify <b>Brand & Class</b> for <b>${drug.generic}</b>?`, 
            choices: shuffled([correct, w1, w2, w3]), 
            answer: correct, 
            drugRef: drug 
        };
    }
    
    // Generic → Brand (Short Answer) (25% normal, 20% Lab 2)
    const genericBrandThreshold = isLab2Quiz ? 0.50 : 0.60;
    if (r < genericBrandThreshold) {
        return { 
            type: "short", 
            prompt: `Brand for <b>${drug.generic}</b>?`, 
            answer: singleBrand, 
            drugRef: drug 
        };
    }
    
    // Brand → Generic (Short Answer) (15% for both)
    const brandGenericThreshold = isLab2Quiz ? 0.65 : 0.75;
    if (r < brandGenericThreshold) {
        return { 
            type: "short", 
            prompt: `Generic for <b>${singleBrand}</b>?`, 
            answer: drug.generic, 
            drugRef: drug 
        };
    }
    
    // Negative MCQ ("Which is NOT...?") (15% for both)
    const negativeMCQThreshold = isLab2Quiz ? 0.80 : 0.90;
    if (r < negativeMCQThreshold) {
        const negMCQ = createNegativeMCQ();
        if (negMCQ) return negMCQ;
        // Fallback if negative MCQ can't be created
        return { 
            type: "short", 
            prompt: `Generic for <b>${singleBrand}</b>?`, 
            answer: drug.generic, 
            drugRef: drug 
        };
    }
    
    // Correctly Paired Class MCQ (10% Lab 2 only)
    if (isLab2Quiz && r < 0.90) {
        const pairedMCQ = createCorrectlyPairedMCQ();
        if (pairedMCQ) return pairedMCQ;
        // Fallback if paired MCQ can't be created
    }
    
    // Single Component MCQ with Smart Distractors (10% for both, fallback for Lab 2)
    const mcqTypes = [
        {l:'Classification', k:'class'}, 
        {l:'Category', k:'category'}, 
        {l:'MOA', k:'moa'}
    ].filter(x => drug[x.k]);
    
    if (mcqTypes.length === 0) {
        // Fallback to brand → generic
        return { 
            type: "short", 
            prompt: `Generic for <b>${singleBrand}</b>?`, 
            answer: drug.generic, 
            drugRef: drug 
        };
    }
    
    const t = mcqTypes[Math.floor(Math.random() * mcqTypes.length)];
    const correctAns = drug[t.k];
    const distractors = getSmartDistracters(drug, correctAns, t.k);
    
    return {
        type: "mcq",
        prompt: `<b>${t.l}</b> for <b>${drug.generic}</b>?`,
        choices: shuffled([correctAns, ...distractors]),
        answer: correctAns,
        drugRef: drug
    };
}

// --- 3. UI RENDERING ---
function render() {
    const q = state.questions[state.index];
    if (!q) return;

    if (getEl("drug-context")) getEl("drug-context").textContent = "Drug Practice";
    if (getEl("qnum")) getEl("qnum").textContent = state.index + 1;
    if (getEl("prompt")) getEl("prompt").innerHTML = q.prompt;
    
    const optCont = getEl("options");
    if (optCont) optCont.innerHTML = "";
    if (getEl("short-wrap")) getEl("short-wrap").classList.add("hidden");
    if (getEl("explain")) { getEl("explain").classList.remove("show"); getEl("explain").innerHTML = ""; }
    if (getEl("check")) getEl("check").classList.toggle("hidden", !!q._answered);
    if (getEl("next")) getEl("next").classList.toggle("hidden", !q._answered);

    if (q.type === "mcq" && q.choices && optCont) {
        optCont.style.touchAction = 'manipulation';
        q.choices.forEach(c => {
            const lbl = document.createElement("label");
            lbl.className = `flex items-center gap-3 p-4 border rounded-xl cursor-pointer mb-2 transition-colors ${q._user === c ? 'ring-2 ring-maroon bg-maroon/5 border-maroon' : 'border-gray-200 dark:border-gray-700'}`;
            const rad = document.createElement("input");
            rad.type = "radio";
            rad.name = "opt";
            rad.value = c;
            rad.className = "w-5 h-5 accent-maroon";
            rad.checked = q._user === c;
            if (q._answered) rad.disabled = true;
            const span = document.createElement("span");
            span.className = "flex-1 text-base leading-tight text-[var(--text)]";
            span.innerHTML = c;
            lbl.appendChild(rad);
            lbl.appendChild(span);
            const selectOption = (e) => {
                e.preventDefault();
                if (!q._answered) {
                    rad.checked = true;
                    q._user = c;
                    render();
                }
            };
            lbl.addEventListener('pointerdown', selectOption, { passive: false });
            lbl.addEventListener('click', selectOption, { passive: false });
            optCont.appendChild(lbl);
        });
    } else if (q.type === "short") {
        if (getEl("short-wrap")) getEl("short-wrap").classList.remove("hidden");
        const input = getEl("short-input");
        if (input) {
            input.value = q._user || "";
            q._answered ? input.setAttribute("disabled", "true") : input.removeAttribute("disabled");
        }
    }
    
    if (q._answered) {
        const exp = getEl("explain");
        if (exp) {
            const raw = q.answerText || q.answer || q.correct || q.ans || "N/A";
            const displayAnswer = Array.isArray(raw) ? raw.join(", ") : raw;
            exp.innerHTML = `<div class="p-3 rounded-lg ${q._correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"><b>${q._correct ? 'Correct!' : 'Answer:'}</b> <b>${displayAnswer}</b></div>`;
            exp.classList.add("show");
        }
    }
    renderNavMap(); 
    if (getEl("score")) getEl("score").textContent = state.score;
}

function renderNavMap() {
    const nav = getEl("nav-map");
    if (!nav) return;
    nav.innerHTML = "";
    state.questions.forEach((q, i) => {
        const btn = document.createElement("button");
        let colorClass = "bg-white text-black border border-gray-300";
        if (q._answered) {
            colorClass = q._correct ? "bg-green-500 text-white" : "bg-red-500 text-white";
        } else if (state.marked.has(i)) {
            colorClass = "bg-yellow-400 text-black ring-2 ring-yellow-600";
        }
        btn.className = `w-8 h-8 rounded-lg text-xs font-bold transition-all ${i === state.index ? 'ring-2 ring-blue-500 scale-110' : ''} ${colorClass}`;
        btn.textContent = i + 1;
        btn.onclick = () => { state.index = i; render(); };
        nav.appendChild(btn);
    });
}

// --- 4. SYSTEM WIRING ---
function wireEvents() {
    const handlers = {
        "timer-readout": toggleTimer,
        "mark": toggleMark,
        "help-shortcuts": () => { getEl("shortcuts-modal").style.display="flex"; getEl("shortcuts-modal").classList.remove("hidden"); },
        "close-shortcuts": () => { getEl("shortcuts-modal").style.display="none"; getEl("shortcuts-modal").classList.add("hidden"); },
        "font-increase": () => changeZoom('in'),
        "font-decrease": () => changeZoom('out'),
        "restart": () => location.reload(),
        "next": () => { if (state.index < state.questions.length - 1) { state.index++; render(); } else showResults(); },
        "prev": () => { if (state.index > 0) { state.index--; render(); } },
        "check": () => {
            const q = state.questions[state.index];
            if (!q) return;
            let val = (q.type === "mcq") ? document.querySelector("#options input:checked")?.value : getEl("short-input")?.value;
            if (val) scoreCurrent(val);
        },
        "reveal-solution": () => scoreCurrent("Revealed"),
   "theme-toggle": () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("pharmlet.theme", isDark ? "dark" : "light");
    
    // FORCE BLACK TEXT ON HELP BUTTON IN DARK MODE
    const helpBtn = getEl("help-shortcuts");
    if (helpBtn) {
        if (isDark) {
            helpBtn.style.color = "black";
        } else {
            helpBtn.style.color = ""; // Resets to default CSS
        }
    }
},
        "hint-btn": showHint,
        "mark-mobile": toggleMark,
        "hint-btn-mobile": showHint,
        "reveal-solution-mobile": () => scoreCurrent("Revealed"),
        "restart-mobile": () => location.reload(),
    };

    Object.entries(handlers).forEach(([id, fn]) => {
        const el = getEl(id);
        if (el) el.onclick = fn;
    });

    window.onkeydown = (e) => {
        // Prevent typing shortcuts inside the short-answer input
        if (document.activeElement.tagName === 'INPUT' && e.key !== 'Enter') return;
        
        const key = e.key.toLowerCase();

        // --- NEW: ASDF Shortcuts for MCQ Option Selection ---
        const mcqMap = { 'a': 0, 's': 1, 'd': 2, 'f': 3 };
        if (mcqMap.hasOwnProperty(key)) {
            const options = document.querySelectorAll("#options label");
            // If the option exists (e.g., option 3), click it
            if (options[mcqMap[key]]) {
                options[mcqMap[key]].click();
            }
        }
        // -----------------------------------

        if (key === "t") toggleTimer();
        if (key === "m") toggleMark();
        if (key === "arrowright") { if (state.index < state.questions.length - 1) { state.index++; render(); } }
        if (key === "arrowleft") { if (state.index > 0) { state.index--; render(); } }
        if (key >= '1' && key <= '9') {
            const idx = parseInt(key) - 1;
            if (state.questions[idx]) { state.index = idx; render(); }
        }
        if (key === "enter") {
            const q = state.questions[state.index];
            if (!q || !q._answered) getEl("check")?.click();
            else getEl("next")?.click();
        }
        
        // --- NEW: R/X/H Keyboard Shortcuts ---
        if (key === "r") restartQuiz();           // R = Restart with confirm
        if (key === "x") revealAnswer();          // X = Give Up / Reveal
        if (key === "h") showHint();              // H = Show Hint
    };
}

function timerTick() {
    if (state.timerSeconds <= 0) { clearInterval(state.timerHandle); return; }
    state.timerSeconds--;
    const mins = Math.floor(state.timerSeconds / 60);
    const secs = state.timerSeconds % 60;
    const readout = getEl("timer-readout");
    if (readout) readout.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function startSmartTimer() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    const count = state.questions.length;
    state.timerSeconds = weekParam ? 600 : (count <= 20 ? 900 : (count <= 50 ? 2700 : 7200));
    state.timerHandle = setInterval(timerTick, 1000);
}

function scoreCurrent(val) {
    const q = state.questions[state.index];
    if (!q) return;

    const raw = q.answerText || q.answer || q.correct || q.ans || "";
    const correctAnswer = Array.isArray(raw) ? raw[0] : raw;

    if (val === "Revealed") {
        q._answered = true;
        q._user = val;
        q._correct = false;
        render();
        return;
    }

    const normalizeWhitespace = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
    const userNorm = normalizeWhitespace(val);
    const canonNorm = normalizeWhitespace(correctAnswer);

    let isCorrect = false;

    // --- SMART ALIAS MATCHING ---
    // If we have a drug reference and the user is being asked for a Brand
    if (q.drugRef && q.drugRef.brand && q.prompt.includes("Brand")) {
        const allBrands = q.drugRef.brand.split(/[,/;]/).map(b => normalizeWhitespace(b));
        if (allBrands.includes(userNorm)) {
            isCorrect = true;
        }
    }

    // --- MULTI-OPTION MATCHING (semicolon, comma = ANY one is correct) ---
    if (!isCorrect && /[;,]/.test(String(correctAnswer))) {
        const validOptions = String(correctAnswer).split(/[;,]/).map(opt => normalizeWhitespace(opt)).filter(Boolean);
        if (validOptions.includes(userNorm)) {
            isCorrect = true;
        }
    }

    if (!isCorrect) {
        // --- COMBINATION MATCHING (slash, hyphen, "and" = ALL parts required) ---
        const splitBySeparators = s => {
            const str = normalizeWhitespace(s);
            if (!str) return [];
            return str.split(/(?:\s*(?:-|\/)\s*|\s+\band\b\s+)/i).map(p => p.trim()).filter(Boolean);
        };

        const separatorPresent = /-|\/|\band\b/i.test(String(correctAnswer));

        if (separatorPresent) {
            const canonParts = splitBySeparators(correctAnswer);
            const userParts = splitBySeparators(val);
            if (userParts.length === 1 && userNorm === canonNorm) {
                isCorrect = true;
            } else {
                const sortParts = arr => arr.sort();
                const c = sortParts(canonParts);
                const u = sortParts(userParts);
                if (c.length === u.length && c.every((v, i) => v === u[i])) isCorrect = true;
            }
        } else {
            isCorrect = (userNorm === canonNorm);
        }
    }

    q._answered = true;
    q._user = val;
    q._correct = !!isCorrect;
    if (isCorrect) state.score++;
    render();
}

function showResults() {
    // Save high score to localStorage (only if it's better than existing)
    let storageKey = null;
    if (weekParam) {
        storageKey = `pharmlet.week${weekParam}.easy`;
    } else if (weeksParam) {
        const [startWeek, endWeek] = weeksParam.split('-').map(n => parseInt(n, 10));
        storageKey = `pharmlet.weeks${startWeek}-${endWeek}.easy`;
    } else if (tagParam) {
        storageKey = `pharmlet.tag-${tagParam.toLowerCase()}.easy`;
    } else if (quizId) {
        storageKey = `pharmlet.${quizId}.easy`;
    }
    
    if (storageKey) {
        try {
            const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const existingScore = existing.score || 0;
            
            // Only update if new score is higher
            if (state.score >= existingScore) {
                localStorage.setItem(storageKey, JSON.stringify({
                    score: state.score,
                    total: state.questions.length,
                    date: Date.now()
                }));
            }
        } catch (e) {
            console.warn('Failed to save high score:', e);
        }
    }
    
    const card = getEl("question-card");
    const missed = state.questions.filter(q => q._answered && !q._correct);
    const hintsNote = state.hintsUsed > 0 ? `<p class="text-sm opacity-60 mt-2">💡 Hints used: ${state.hintsUsed}</p>` : '';
    const reviewBtn = missed.length > 0 
        ? `<button onclick="reviewMissed()" class="mt-4 px-6 py-3 bg-red-600 text-white rounded-xl font-bold">🔄 Review ${missed.length} Missed</button>` 
        : `<p class="text-green-600 font-bold mt-4">🎉 Perfect Score!</p>`;
    
    if (card) card.innerHTML = `<div class="text-center py-10">
        <h2 class="text-4xl font-black mb-4">Quiz Complete!</h2>
        <p class="text-2xl">Final Score: ${state.score} / ${state.questions.length}</p>
        ${hintsNote}
        <div class="flex flex-col gap-3 items-center mt-6">
            ${reviewBtn}
            <button onclick="location.reload()" class="px-8 py-4 bg-maroon text-white rounded-2xl font-bold">🔁 Restart Quiz</button>
        </div>
    </div>`;
}

function shuffled(a) { return [...a].sort(() => 0.5 - Math.random()); }

async function main() {
    try {
        let filteredPool = [];
        let fullPool = [];
        let storageKey = null;
        
        // ========== MODE 1: ?week=N (6 New + 4 Review) ==========
        if (weekParam) {
            fullPool = await smartFetch("master_pool.json");
            
            // CEILING FILTER: lab=1 → only Lab 1; lab=2 → Lab 1 + Lab 2 (cumulative curriculum)
            const ceilingPool = fullPool.filter(d => Number(d.metadata?.lab) <= labParam);
            
            // NEW DRUGS: For Lab 2, cumulative (weeks 1-current); for Lab 1, current week only
            const newDrugs = ceilingPool.filter(d => {
                const dWeek = Number(d.metadata?.week);
                const dLab = Number(d.metadata?.lab);
                
                if (labParam === 2) {
                    // Lab 2 cumulative: all weeks from 1 to current week
                    return dLab === 2 && dWeek >= 1 && dWeek <= weekParam;
                } else {
                    // Lab 1: only current week
                    return dLab === 1 && dWeek === weekParam;
                }
            });
            
            // DR. CHEN'S REVIEW SCHEDULE: Maps Lab 2 week → specific Lab 1 week ranges
            const getReviewSourceWeeks = (currentWeek) => {
                if (labParam === 1) {
                    // Lab 1 mode: review from prior Lab 1 weeks only
                    return [1, currentWeek - 1];
                }
                // Lab 2 mode: use Dr. Chen's syllabus schedule
                switch (currentWeek) {
                    case 1: return [1, 3];   // Lab 1 Weeks 1-3
                    case 2: return [4, 6];   // Lab 1 Weeks 4-6
                    case 3: return [6, 7];   // Lab 1 Weeks 6-7
                    case 4: return [8, 8];   // Lab 1 Week 8 only
                    case 5: return [9, 9];   // Lab 1 Week 9 only
                    case 6: return [10, 11]; // Lab 1 Weeks 10-11
                    default: return [1, 11]; // Week 7+: All Lab 1
                }
            };
            
            const [reviewStart, reviewEnd] = getReviewSourceWeeks(weekParam);
            
            // REVIEW DRUGS: Filter based on Dr. Chen's schedule
            const reviewDrugs = ceilingPool.filter(d => {
                const dWeek = Number(d.metadata?.week);
                const dLab = Number(d.metadata?.lab);
                
                if (labParam === 2) {
                    // Lab 2 mode: Review only from scheduled Lab 1 weeks
                    return dLab === 1 && dWeek >= reviewStart && dWeek <= reviewEnd;
                } else {
                    // Lab 1 mode: Prior weeks from Lab 1 only
                    return dLab === 1 && dWeek < weekParam;
                }
            });
            
            // Build 6+4 quiz: 6 new drugs + 4 review drugs (flexible if pool is small)
            let selectedNew;
            
            if (labParam === 2) {
                // Lab 2: Guarantee minimum 3 from current week, rest from cumulative
                const currentWeekDrugs = newDrugs.filter(d => Number(d.metadata?.week) === weekParam);
                const currentWeekMin = Math.min(3, currentWeekDrugs.length);
                const cumulativeRemaining = Math.min(3, Math.max(0, newDrugs.length - currentWeekMin));
                
                // Select minimum from current week
                const fromCurrent = shuffled(currentWeekDrugs).slice(0, currentWeekMin);
                // Select remaining from full cumulative pool
                const fromCumulative = shuffled(newDrugs.filter(d => !fromCurrent.includes(d))).slice(0, cumulativeRemaining);
                
                selectedNew = [...fromCurrent, ...fromCumulative];
            } else {
                // Lab 1: All from current week only
                selectedNew = shuffled(newDrugs).slice(0, Math.min(6, newDrugs.length));
            }
            
            const newCount = selectedNew.length;
            const reviewCount = Math.min(4, reviewDrugs.length);
            const selectedReview = shuffled(reviewDrugs).slice(0, reviewCount);
            
            filteredPool = [...selectedNew, ...selectedReview];
            
            // Distractor pool: Only drugs from current week and prior (no future weeks)
            fullPool = ceilingPool.filter(d => {
                const dWeek = Number(d.metadata?.week);
                const dLab = Number(d.metadata?.lab);
                // Include all Lab 1 drugs, and Lab 2 drugs only up to current week
                return dLab === 1 || (dLab === 2 && dWeek <= weekParam);
            });
            
            // Build descriptive title showing review source
            const reviewRangeLabel = reviewStart === reviewEnd 
                ? `L1-W${reviewStart}` 
                : `L1-W${reviewStart}-${reviewEnd}`;
            
            state.title = labParam === 1 
                ? `Lab I: Week ${weekParam} (${newCount} New + ${reviewCount} Review)` 
                : `Lab 2 W1-${weekParam} (${newCount} New + ${reviewCount} Rev: ${reviewRangeLabel})`;
            storageKey = `pharmlet.lab${labParam}.week${weekParam}.easy`;
        }
        // ========== MODE 2: ?weeks=Start-End (Cumulative Range) ==========
        else if (weeksParam) {
            fullPool = await smartFetch("master_pool.json");
            const [startWeek, endWeek] = weeksParam.split('-').map(n => parseInt(n, 10));
            if (isNaN(startWeek) || isNaN(endWeek)) {
                throw new Error("Invalid weeks format. Use ?weeks=1-5");
            }
            
            // CEILING FILTER: lab=1 → only Lab 1; lab=2 → Lab 1 + Lab 2 (cumulative curriculum)
            const ceilingPool = fullPool.filter(d => Number(d.metadata?.lab) <= labParam);
            
            // Filter to week range within the ceiling pool
            filteredPool = ceilingPool.filter(d => {
                const week = Number(d.metadata?.week);
                const lab = Number(d.metadata?.lab);
                // For current lab: respect week range; for prior labs: include all
                return (lab === labParam && week >= startWeek && week <= endWeek) || (lab < labParam);
            });
            
            // Distractor pool: Only drugs from endWeek and prior (no future weeks)
            fullPool = ceilingPool.filter(d => {
                const dWeek = Number(d.metadata?.week);
                const dLab = Number(d.metadata?.lab);
                // Include all Lab 1 drugs, and Lab 2 drugs only up to endWeek
                return dLab === 1 || (dLab === 2 && dWeek <= endWeek);
            });
            
            state.title = labParam === 1 
                ? `Lab I: Cumulative Weeks ${startWeek}-${endWeek}` 
                : `Cumulative Review: Weeks ${startWeek}-${endWeek}`;
            storageKey = `pharmlet.lab${labParam}.weeks${startWeek}-${endWeek}.easy`;
        }
        // ========== MODE 3: ?tag=String (Topic Mode) ==========
        else if (tagParam) {
            fullPool = await smartFetch("master_pool.json");
            const tagLower = tagParam.toLowerCase();
            
            // STRICT LAB ISOLATION: Filter by lab FIRST (if specified, else use all)
            const labPool = params.has("lab") 
                ? fullPool.filter(d => Number(d.metadata?.lab) === labParam)
                : fullPool;
            
            filteredPool = labPool.filter(d => 
                (d.class && d.class.toLowerCase().includes(tagLower)) ||
                (d.category && d.category.toLowerCase().includes(tagLower))
            );
            state.title = `${tagParam} Review`;
            storageKey = `pharmlet.tag-${tagParam.toLowerCase()}.easy`;
        }
        // ========== MODE 4: ?id=quiz-name (Legacy Static JSON) ==========
        else if (quizId) {
            const data = await smartFetch(`${quizId}.json`);
            const pool = data.pools ? Object.values(data.pools).flat() : (data.questions || []);
            state.title = data.title || "Quiz";
            state.questions = shuffled(pool).map((q, i) => ({ ...q, _id: i }));
            storageKey = `pharmlet.${quizId}.easy`;
            
            // Skip to render for legacy quizzes
            finishSetup(storageKey);
            return;
        }
        else {
            throw new Error("Missing URL parameter. Use ?week=N, ?weeks=1-5, ?tag=Topic, or ?id=quiz-name");
        }
        
        // Validate pool has drugs
        if (filteredPool.length === 0) {
            throw new Error(`No drugs found for this filter. Check your URL parameters.`);
        }
        
        // Session-based anti-repetition shuffling
        let lastRoundGenerics = [];
        const sessionKey = `pharmlet.session.lastRound.${storageKey}`;
        try {
            const stored = sessionStorage.getItem(sessionKey);
            if (stored) lastRoundGenerics = JSON.parse(stored);
        } catch (e) { /* ignore parse errors */ }
        
        // For MODE 1 (?week=N), drugs are already pre-selected (6+4 split)
        // For other modes, apply standard selection logic
        let selectedDrugs;
        if (weekParam) {
            // MODE 1: filteredPool IS the pre-selected 6+4 split (always use ALL of it)
            // Anti-repetition: shuffle fresh drugs first, then pad with repeats if needed
            const freshPool = filteredPool.filter(d => !lastRoundGenerics.includes(d.generic));
            const repeatPool = filteredPool.filter(d => lastRoundGenerics.includes(d.generic));
            
            // Always return exactly filteredPool.length drugs (the 6+4 = 10 we pre-selected)
            // Prioritize fresh drugs, fill remainder with repeats
            const targetCount = filteredPool.length;
            const shuffledFresh = shuffled(freshPool);
            const shuffledRepeat = shuffled(repeatPool);
            selectedDrugs = [...shuffledFresh, ...shuffledRepeat].slice(0, targetCount);
        } else {
            // MODE 2/3: Standard selection from filtered pool
            const unseenDrugs = filteredPool.filter(d => !lastRoundGenerics.includes(d.generic));
            const workingPool = unseenDrugs.length >= Math.min(10, filteredPool.length) ? unseenDrugs : filteredPool;
            const quizSize = Math.min(10, workingPool.length);
            selectedDrugs = shuffled(workingPool).slice(0, quizSize);
        }
        
        // Save this round for anti-repetition
        sessionStorage.setItem(sessionKey, JSON.stringify(selectedDrugs.map(d => d.generic)));
        
        // Generate questions using the full pool for distractor context
        state.questions = shuffled(selectedDrugs).map((d, i) => ({
            ...createQuestion(d, fullPool),  // Use full ceiling pool for density-safe distractors
            _id: i,
            drugRef: d
        }));
        
        finishSetup(storageKey);
        
    } catch (err) {
        console.error("Quiz Error:", err);
        const card = getEl("question-card");
        if (card) card.innerHTML = `<div class="p-4 text-red-600"><p><b>Error:</b> ${err.message}</p></div>`;
    }
}

// Helper function to complete quiz setup
function finishSetup(storageKey) {
    if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
    if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
    
    // Initialize high score storage ONLY if it doesn't exist yet
    if (storageKey && !localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, JSON.stringify({ score: 0, total: state.questions.length, date: Date.now() }));
    }
    
    startSmartTimer();
    wireEvents();
    
    // Save last quiz for quick resume (include lab param for week-based modes)
    const labSuffix = (weekParam || weeksParam) ? `&lab=${labParam}` : '';
    const lastQuizParam = weekParam ? `?week=${weekParam}${labSuffix}` 
                        : weeksParam ? `?weeks=${weeksParam}${labSuffix}`
                        : tagParam ? `?tag=${tagParam}`
                        : `?id=${quizId}`;
    localStorage.setItem("pharmlet.last-quiz", lastQuizParam);
    
    render();
}

document.addEventListener('DOMContentLoaded', main);
