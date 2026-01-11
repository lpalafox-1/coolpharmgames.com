// assets/js/quizEngine.js
const params = new URLSearchParams(location.search);
const weekParam = parseInt(params.get("week") || "", 10);
const quizId = params.get("id");

const state = { 
    questions: [], index: 0, score: 0, title: "",
    timerSeconds: 0, timerHandle: null, marked: new Set(),
    currentScale: 1.0 
};

const getEl = (id) => document.getElementById(id);

// Initialize dark mode from localStorage at startup
const savedTheme = localStorage.getItem("pharmlet.theme");
if (savedTheme === "dark") {
    document.documentElement.classList.add("dark");
    // Ensure help button is black if starting in dark mode
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
    
    // Drugs WITH brands: Use new probability distribution
    const r = Math.random();
    
    // 35% Brand & Class MCQ with Trap Logic
    if (r < 0.35 && drug.class) {
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
    
    // 30% Generic → Brand (Short Answer)
    if (r < 0.65) {
        return { 
            type: "short", 
            prompt: `Brand for <b>${drug.generic}</b>?`, 
            answer: singleBrand, 
            drugRef: drug 
        };
    }
    
    // 25% Brand → Generic (Short Answer)
    if (r < 0.90) {
        return { 
            type: "short", 
            prompt: `Generic for <b>${singleBrand}</b>?`, 
            answer: drug.generic, 
            drugRef: drug 
        };
    }
    
    // 10% Single Component MCQ with Smart Distractors
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
    
    // Reset all
    const optCont = getEl("options");
    if (optCont) optCont.innerHTML = "";
    if (getEl("short-wrap")) getEl("short-wrap").classList.add("hidden");
    if (getEl("explain")) { getEl("explain").classList.remove("show"); getEl("explain").innerHTML = ""; }
    if (getEl("check")) getEl("check").classList.toggle("hidden", !!q._answered);
    if (getEl("next")) getEl("next").classList.toggle("hidden", !q._answered);

    // Render based on type
    if (q.type === "mcq" && q.choices && optCont) {
        optCont.style.touchAction = 'manipulation';
        
        q.choices.forEach(c => {
            const lbl = document.createElement("label");
            lbl.className = `flex items-center gap-3 p-4 border rounded-xl cursor-pointer mb-2 transition-colors ${q._user === c ? 'ring-2 ring-maroon bg-maroon/5 border-maroon' : 'border-gray-200 dark:border-gray-700'}`;
            lbl.style.userSelect = 'none';
            lbl.style.WebkitUserSelect = 'none';
            lbl.style.touchAction = 'manipulation';
            
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
            
            // Use both pointerdown and click for maximum compatibility
            lbl.addEventListener('pointerdown', selectOption, { passive: false });
            lbl.addEventListener('click', selectOption, { passive: false });
            
            optCont.appendChild(lbl);
        });
    } else if (q.type === "short") {
        if (getEl("short-wrap")) getEl("short-wrap").classList.remove("hidden");
        const input = getEl("short-input");
        if (input) {
            input.value = q._user || "";
            input.focus();
            q._answered ? input.setAttribute("disabled", "true") : input.removeAttribute("disabled");
        }
    }
    
    if (q._answered) {
        const exp = getEl("explain");
        if (exp) {
            exp.innerHTML = `<div class="p-3 rounded-lg ${q._correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"><b>${q._correct ? 'Correct!' : 'Answer:'}</b> <b>${q.answer}</b></div>`;
            exp.classList.add("show");
        }
    }
    renderNavMap(); 
    
    // Update score display
    const scoreEl = getEl("score");
    if (scoreEl) scoreEl.textContent = state.score;
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
            let val = "";
            if (q.type === "mcq") {
                val = document.querySelector("#options input:checked")?.value;
            } else {
                val = getEl("short-input")?.value;
            }
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
        "hint-btn": () => {
            const q = state.questions[state.index];
            if (!q) return;
            const hint = q.hint || "No hint available for this question.";
            alert(hint);
        },
        "mark-mobile": toggleMark,
        "hint-btn-mobile": () => {
            const q = state.questions[state.index];
            if (!q) return;
            const hint = q.hint || "No hint available for this question.";
            alert(hint);
        },
        "reveal-solution-mobile": () => scoreCurrent("Revealed"),
        "restart-mobile": () => location.reload(),
    };

    Object.entries(handlers).forEach(([id, fn]) => {
        const el = getEl(id);
        if (el) el.onclick = fn;
    });

    window.onkeydown = (e) => {
        if (document.activeElement.tagName === 'INPUT' && e.key !== 'Enter') return;
        const key = e.key.toLowerCase();
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
    // Special-case reveal
    if (val === "Revealed") {
        q._answered = true;
        q._user = val;
        q._correct = false;
        render();
        return;
    }

    const normalizeWhitespace = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const splitBySeparators = s => {
        // split on hyphen, slash, or the word 'and' (as a word)
        return s.split(/(?:\s*(?:-|\/)\s*|\s+\band\b\s+)/i).map(p => normalizeWhitespace(p)).filter(Boolean);
    };

    const userRaw = String(val);
    const canonRaw = String(q.answer || "");

    const userNorm = normalizeWhitespace(userRaw);
    const canonNorm = normalizeWhitespace(canonRaw);

    let isCorrect = false;

    // If canonical answer has any of the separators, allow order-insensitive matching of parts
    const separatorPresent = /-|\/|\band\b/i.test(canonRaw);

    if (separatorPresent) {
        const canonParts = splitBySeparators(canonRaw);
        const userParts = splitBySeparators(userRaw);

        // If user provided a single chunk that exactly matches the canonical string after normalization
        if (userParts.length === 1 && userNorm === canonNorm) {
            isCorrect = true;
        } else {
            // Compare parts as multisets (order-insensitive)
            const sortParts = arr => arr.map(p => p.replace(/\s+/g, ' ').trim()).sort();
            const c = sortParts(canonParts);
            const u = sortParts(userParts);

            if (c.length === u.length && c.every((v, i) => v === u[i])) isCorrect = true;
        }
    } else {
        // Simple normalized string compare (ignore case + extra spaces)
        isCorrect = (userNorm === canonNorm);
    }

    q._answered = true;
    q._user = val;
    q._correct = !!isCorrect;
    if (isCorrect) state.score++;
    const scoreEl = getEl("score");
    if (scoreEl) scoreEl.textContent = state.score;
    render();
}

function showResults() {
    const card = getEl("question-card");
    if (card) card.innerHTML = `<div class="text-center py-10"><h2 class="text-4xl font-black mb-4">Quiz Complete!</h2><p class="text-2xl">Final Score: ${state.score} / ${state.questions.length}</p><button onclick="location.reload()" class="mt-8 px-8 py-4 bg-maroon text-white rounded-2xl font-bold">Restart Quiz</button></div>`;
}

// Track last quiz for resume functionality (format compatible with home.js)
if (weekParam) {
    localStorage.setItem(`pharmlet.week${weekParam}.easy`, JSON.stringify({ score: 0, total: state.questions.length }));
} else if (quizId) {
    localStorage.setItem(`pharmlet.${quizId}.easy`, JSON.stringify({ score: 0, total: state.questions.length }));
}

function shuffled(a) { return [...a].sort(() => 0.5 - Math.random()); }

async function main() {
    try {
        if (weekParam) {
            const pool = await smartFetch("master_pool.json");
            const GAME_PLAN = { 1:[1,2,3], 2:[4,5,6], 3:[6,7], 4:[8], 5:[9], 6:[10,11] };
            const weeks = GAME_PLAN[weekParam] || 'ALL';
            const newP = pool.filter(d => Number(d.metadata?.lab) === 2 && Number(d.metadata?.week) === weekParam);
            const revP = (weeks === 'ALL') ? pool.filter(d => Number(d.metadata?.lab) === 1) : pool.filter(d => Number(d.metadata?.lab) === 1 && weeks.includes(Number(d.metadata?.week)));
            const combined = [...shuffled(newP).slice(0, 6), ...shuffled(revP).slice(0, 4)];
            state.title = `Top Drug Quiz ${weekParam}`;
            state.questions = shuffled(combined).map((d, i) => ({ ...createQuestion(d, pool), _id: i, drugRef: d }));
        } else if (quizId) {
            const data = await smartFetch(`${quizId}.json`);
            const pool = data.pools ? Object.values(data.pools).flat() : (data.questions || []);
            state.title = data.title || "Quiz";
            state.questions = shuffled(pool).map((q, i) => ({ ...q, _id: i }));
        } else {
            throw new Error("Missing ?id=quiz-name or ?week=N parameter");
        }

        if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
        if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
        startSmartTimer();
        wireEvents();
        localStorage.setItem("pharmlet.last-quiz", weekParam ? `?week=${weekParam}` : `?id=${quizId}`);
        render();
    } catch (err) {
        console.error("Quiz Error:", err);
        const card = getEl("question-card");
        if (card) card.innerHTML = `<div class="p-4 text-red-600"><p><b>Error:</b> ${err.message}</p></div>`;
    }
}

document.addEventListener('DOMContentLoaded', main);