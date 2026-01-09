// assets/js/quizEngine.js
const params = new URLSearchParams(location.search);
const quizId = params.get("id");
const weekParam = parseInt(params.get("week") || "", 10);
const limitParam = parseInt(params.get("limit") || "", 10);

const getEl = (id) => document.getElementById(id) || { 
    textContent: "", innerHTML: "", style: {}, 
    classList: { add:()=>{}, remove:()=>{}, toggle:()=>{} }, 
    setAttribute:()=>{}, removeAttribute:()=>{} 
};

const els = {
    title: getEl("quiz-title"),
    qnum: getEl("qnum"),
    qtotal: getEl("qtotal"),
    score: getEl("score"),
    prompt: getEl("prompt"),
    options: getEl("options"),
    shortWrap: getEl("short-wrap"),
    shortInput: getEl("short-input"),
    explain: getEl("explain"),
    prev: getEl("prev"),
    next: getEl("next"),
    check: getEl("check"),
    restart: getEl("restart"),
    card: getEl("question-card"),
    navMap: getEl("nav-map"), 
    timerReadout: getEl("timer-readout"),
    mark: getEl("mark"),
    hintBtn: getEl("hint-btn"),
    revealBtn: getEl("reveal-solution"),
    themeToggle: getEl("theme-toggle"),
    helpShortcuts: getEl("help-shortcuts"),
    drugCtx: getEl("drug-context")
};

const state = { 
    questions: [], index: 0, score: 0, title: "",
    timerSeconds: 0, timerHandle: null, marked: new Set(),
    currentScale: 1.0 
};

const GAME_PLAN = {
    1: [1, 2, 3], 2: [4, 5, 6], 3: [6, 7], 4: [8],
    5: [9], 6: [10, 11], 7: 'ALL', 8: 'ALL', 9: 'ALL', 10: 'ALL', 11: 'ALL'
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    main().catch(err => console.error("Init Error:", err));
});

async function main() {
    if (weekParam) await loadDynamicQuiz();
    else if (quizId) await loadStaticQuiz();
    
    els.title.textContent = state.title;
    els.qtotal.textContent = state.questions.length;
    
    startSmartTimer(); 
    wireEvents();
    render();
}

function initTheme() {
    const isDark = localStorage.getItem("quiz-theme") === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) themeBtn.onclick = () => {
        const d = document.documentElement.classList.toggle("dark");
        localStorage.setItem("quiz-theme", d ? "dark" : "light");
    };
}

async function smartFetch(fileName) {
    const paths = [`assets/data/${fileName}`, `data/${fileName}`, `../assets/data/${fileName}`, `./assets/data/${fileName}`];
    for (let path of paths) {
        try {
            const res = await fetch(path, { cache: "no-store" });
            if (res.ok) return await res.json();
        } catch (e) { continue; }
    }
    throw new Error(`Missing: ${fileName}`);
}

async function loadDynamicQuiz() {
    const pool = await smartFetch("master_pool.json");
    const reviewWeeks = GAME_PLAN[weekParam] || 'ALL';
    const newPool = pool.filter(d => Number(d.metadata?.lab) === 2 && Number(d.metadata?.week) === weekParam);
    const revPool = (reviewWeeks === 'ALL') ? pool.filter(d => Number(d.metadata?.lab) === 1) : pool.filter(d => Number(d.metadata?.lab) === 1 && reviewWeeks.includes(Number(d.metadata?.week)));
    const combined = [...shuffled(newPool).slice(0, 6), ...shuffled(revPool).slice(0, 4)];
    state.title = `Top Drug Quiz ${weekParam}`;
    state.questions = shuffled(combined).map((d, i) => ({ ...createQuestion(d, pool), _id: i, drugRef: d }));
}

async function loadStaticQuiz() {
    const data = await smartFetch(`${quizId}.json`);
    const pool = data.pools ? Object.values(data.pools).flat() : (data.questions || []);
    const limit = limitParam > 0 ? Math.min(limitParam, pool.length) : pool.length;
    state.title = data.title || "Quiz";
    state.questions = shuffled(pool).slice(0, limit).map((q, i) => ({ ...q, _id: i }));
}

function createQuestion(drug, all) {
    const distract = (val, key) => shuffled([...new Set(all.map(d => d[key]).filter(v => v && v !== val))]).slice(0, 3);
    const brandList = drug.brand ? drug.brand.split(/[,/]/).map(b => b.trim()) : ["N/A"];
    const singleBrand = brandList[Math.floor(Math.random() * brandList.length)];
    const r = Math.random();

    if (r < 0.25 && drug.class) {
        const correct = `${singleBrand} / ${drug.class}`;
        const w1 = `${singleBrand} / ${all.find(d => d.class && d.class !== drug.class)?.class || 'Inhibitor'}`;
        const w2 = `${all.find(d => d.brand && d.brand !== drug.brand)?.brand.split(/[,/]/)[0] || 'Drug'} / ${drug.class}`;
        const w3 = `${all.find(d => d.brand && d.brand !== drug.brand)?.brand.split(/[,/]/)[0] || 'Drug'} / ${all.find(d => d.class && d.class !== drug.class)?.class || 'Antagonist'}`;
        return { type: "mcq", prompt: `Identify <b>Brand & Class</b> for <b>${drug.generic}</b>?`, choices: shuffled([correct, w1, w2, w3]), answer: correct, drugRef: drug };
    }
    if (r < 0.55) return { type: "short", prompt: `Generic for <b>${singleBrand}</b>?`, answer: drug.generic, drugRef: drug };
    if (r < 0.80) return { type: "short", prompt: `Brand for <b>${drug.generic}</b>?`, answer: singleBrand, drugRef: drug };

    const mcqTypes = [{l:'Classification', k:'class'}, {l:'MOA', k:'moa'}].filter(x => drug[x.k]);
    const t = mcqTypes.length > 0 ? mcqTypes[Math.floor(Math.random() * mcqTypes.length)] : {l:'Classification', k:'class'};
    const correctAns = drug[t.k] || "N/A";
    const distractors = distract(correctAns, t.k);
    return { type: "mcq", prompt: `<b>${t.l}</b> for <b>${drug.generic}</b>?`, choices: shuffled([correctAns, ...distractors]), answer: correctAns, drugRef: drug };
}

function wireEvents() {
    const toggleTimer = (e) => {
        if (e) e.preventDefault();
        if (state.timerHandle) {
            clearInterval(state.timerHandle);
            state.timerHandle = null;
            els.timerReadout.classList.add("opacity-30", "animate-pulse");
        } else {
            state.timerHandle = setInterval(timerTick, 1000);
            els.timerReadout.classList.remove("opacity-30", "animate-pulse");
        }
    };

    const toggleMark = () => {
        if (state.marked.has(state.index)) state.marked.delete(state.index);
        else state.marked.add(state.index);
        renderNavMap();
    };

    if (els.timerReadout) els.timerReadout.onclick = toggleTimer;
    if (els.helpShortcuts) {
        els.helpShortcuts.onclick = (e) => {
            e.preventDefault();
            const m = document.getElementById("shortcuts-modal");
            if (m) { m.style.display = "flex"; m.classList.remove("hidden"); }
        };
    }
    const closeShortcuts = document.getElementById("close-shortcuts");
    if (closeShortcuts) {
        closeShortcuts.onclick = () => {
            const m = document.getElementById("shortcuts-modal");
            if (m) { m.style.display = "none"; m.classList.add("hidden"); }
        };
    }

    if (els.restart) els.restart.onclick = () => location.reload();
    if (els.hintBtn) els.hintBtn.onclick = () => alert(`Hint: Starts with "${state.questions[state.index].answer[0]}".`);
    if (els.mark) els.mark.onclick = toggleMark;

    if (els.next) els.next.onclick = () => { if (state.index < state.questions.length - 1) { state.index++; render(); } else showResults(); };
    if (els.prev) els.prev.onclick = () => { if (state.index > 0) { state.index--; render(); } };
    if (els.check) els.check.onclick = () => {
        const q = state.questions[state.index];
        const sel = els.options.querySelector("input:checked");
        let val = (q.type === "mcq") ? sel?.value : els.shortInput.value;
        if (val) scoreCurrent(val);
    };

    const fInc = document.getElementById("font-increase");
    const fDec = document.getElementById("font-decrease");
    if (fInc) fInc.onclick = () => { 
        state.currentScale += 0.1; 
        document.documentElement.style.fontSize = `${state.currentScale * 16}px`;
    };
    if (fDec) fDec.onclick = () => { 
        if(state.currentScale > 0.7) {
            state.currentScale -= 0.1; 
            document.documentElement.style.fontSize = `${state.currentScale * 16}px`;
        }
    };

    if (els.revealBtn) els.revealBtn.onclick = () => scoreCurrent("Revealed");

    window.onkeydown = (e) => {
        if (document.activeElement.tagName === 'INPUT' && e.key !== 'Enter') return;
        const key = e.key.toLowerCase();
        if (key === "t") toggleTimer();
        if (key === "m") toggleMark();
        if (key >= '1' && key <= '9') {
            const idx = parseInt(key) - 1;
            if (state.questions[idx]) { state.index = idx; render(); }
        }
        if (key === "arrowright") { if (state.index < state.questions.length - 1) { state.index++; render(); } } 
        else if (key === "arrowleft") { if (state.index > 0) { state.index--; render(); } } 
        else if (key === "enter") { 
            if (!state.questions[state.index]?._answered) els.check.click(); 
            else if (state.index < state.questions.length - 1) els.next.click(); 
        }
    };
}

function render() {
    const q = state.questions[state.index];
    if (!q) return;

    els.drugCtx.textContent = "Drug Practice"; 
    els.qnum.textContent = state.index + 1;
    els.prompt.innerHTML = q.prompt;
    els.options.innerHTML = "";
    els.shortWrap.classList.add("hidden");
    els.explain.classList.remove("show");
    els.explain.innerHTML = "";

    els.check.classList.toggle("hidden", !!q._answered);
    els.next.classList.toggle("hidden", !q._answered);

    if (q.type === "mcq") {
        q.choices.forEach(c => {
            const lbl = document.createElement("label");
            lbl.className = `flex items-center gap-3 p-4 border rounded-xl cursor-pointer mb-2 ${q._user === c ? 'ring-2 ring-maroon bg-maroon/5' : 'border-[var(--ring)]'}`;
            lbl.innerHTML = `<input type="radio" name="opt" value="${c}" class="w-5 h-5 accent-maroon" ${q._user === c ? 'checked' : ''} ${q._answered ? 'disabled' : ''}> <span class="flex-1 text-base leading-tight">${c}</span>`;
            lbl.onclick = () => { if (!q._answered) lbl.querySelector('input').checked = true; };
            els.options.appendChild(lbl);
        });
    } else {
        els.shortWrap.classList.remove("hidden");
        els.shortInput.value = q._user || "";
        q._answered ? els.shortInput.setAttribute("disabled", "true") : els.shortInput.removeAttribute("disabled");
    }
    
    if (q._answered) {
        els.explain.innerHTML = `<div class="p-3 rounded-lg ${q._correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"><b>${q._correct ? 'Correct!' : 'Answer:'}</b> <b>${q.answer}</b></div>`;
        els.explain.classList.add("show");
    }
    renderNavMap(); 
}

function renderNavMap() {
    els.navMap.innerHTML = "";
    state.questions.forEach((q, i) => {
        const btn = document.createElement("button");
        btn.className = `w-8 h-8 rounded-lg text-xs font-bold transition-all ${i === state.index ? 'ring-2 ring-blue-500' : ''} ${q._answered ? (q._correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : (state.marked.has(i) ? 'bg-yellow-400 text-black' : 'bg-gray-200')}`;
        btn.textContent = i + 1;
        btn.onclick = () => { state.index = i; render(); };
        els.navMap.appendChild(btn);
    });
}

function scoreCurrent(val) {
    const q = state.questions[state.index];
    const isCorrect = (val === "Revealed") ? false : (val.trim().toLowerCase() === q.answer.toLowerCase());
    q._answered = true; 
    q._user = val;
    q._correct = isCorrect;
    if (isCorrect) state.score++;
    render();
}

function startSmartTimer() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    const count = state.questions.length;
    state.timerSeconds = weekParam ? 600 : (count <= 20 ? 900 : (count <= 50 ? 2700 : 7200));
    state.timerHandle = setInterval(timerTick, 1000);
}

function timerTick() {
    if (state.timerSeconds <= 0) {
        clearInterval(state.timerHandle);
        els.timerReadout.classList.add("text-red-500", "font-bold");
        return;
    }
    state.timerSeconds--;
    const mins = Math.floor(state.timerSeconds / 60);
    const secs = state.timerSeconds % 60;
    els.timerReadout.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showResults() {
    els.card.innerHTML = `<div class="text-center py-10"><h2 class="text-4xl font-black mb-4">Quiz Complete!</h2><p class="text-2xl">Final Score: ${state.score} / ${state.questions.length}</p><button onclick="location.reload()" class="mt-8 px-8 py-4 bg-maroon text-white rounded-2xl font-bold">Restart Quiz</button></div>`;
}

function shuffled(a) { return [...a].sort(() => 0.5 - Math.random()); }
