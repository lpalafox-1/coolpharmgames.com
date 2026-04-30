// assets/js/quizEngine.js
const params = new URLSearchParams(location.search);
const weekParam = parseInt(params.get("week") || "", 10);  // Single week: ?week=1
const weeksParam = params.get("weeks");                      // Cumulative range: ?weeks=1-5
const tagParam = params.get("tag");                          // Topic mode: ?tag=Anticoagulants
const labParam = parseInt(params.get("lab") || "2", 10);     // Lab isolation: &lab=1 or &lab=2 (default: 2)
const quizId = params.get("id");
const modeParamProvided = params.has("mode");
const modeParam = params.get("mode") || "easy";
const limitParam = parseInt(params.get("limit") || "", 10);
const examModeParam = params.get("exam") === "1";
const resumeRequestedParam = params.get("resume") === "1";
const HISTORY_KEY = "pharmlet.history";
const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const REVIEW_KEY = "pharmlet.review-queue";
const QUESTION_REPORTS_KEY = "pharmlet.question-reports";
const THEME_KEY = "pharmlet.theme";
const QUIZ_PROGRESS_PREFIX = "pharmlet.quiz-progress.";
const MAX_QUESTION_REPORTS = 200;
const QUIZ_PROGRESS_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const TIMER_AUTOSAVE_INTERVAL_SECONDS = 15;
const quizCatalog = window.PharmletQuizCatalog || null;
const CEUTICS2_FINAL_ID = "ceutics2-final";

const state = {
    questions: [],
    index: 0,
    score: 0,
    title: "",

    pointScore: 0,
    totalPoints: 0,

    hintsUsed: 0,
    currentStreak: 0,
    bestStreak: 0,

    marked: new Set(),
    seen: new Set(),
    originalQuestions: [],

    reviewMode: false,
    bossMode: false,
    timedOut: false,

    resultsRecorded: false,
    signalsRecorded: false,
    finalBreakdown: null,

    timerSeconds: 0,
    timerPaused: false,
    timerHandle: null,

    generatedTimerSeconds: 0,
    generatedQuestionLimit: 0,
    generatedAttemptIdentity: null,

    adaptiveSummary: null,
    quizConfig: null,
    activeModeConfig: null,
    configuredModeKey: "",

    placeholderQuiz: false,
    modeNotice: "",

    progressKey: "",
    progressCompleted: false,
    progressLifecycleBound: false,
    autosaveTimeout: null,
    lastAutosaveAt: 0,
    saveStatusMessage: "",

    currentScale: 1.0,
    adaptiveSession: null
};

function changeZoom(dir) {
    state.currentScale += (dir === 'in' ? 0.1 : -0.1);
    if (state.currentScale < 0.6) state.currentScale = 0.6;
    document.body.style.zoom = state.currentScale;
    document.documentElement.style.setProperty('--quiz-size', `${state.currentScale}rem`);
    queueQuizProgressSave(100);
}

const getEl = (id) => document.getElementById(id);

function openShortcutsModal() {
    const modal = getEl("shortcuts-modal");
    if (!modal) return;
    modal.style.display = "flex";
    modal.classList.remove("hidden");
}

function closeShortcutsModal() {
    const modal = getEl("shortcuts-modal");
    if (!modal) return;
    modal.style.display = "none";
    modal.classList.add("hidden");
}

function markCurrentQuestionSeen() {
    if (!state.questions[state.index]) return;
    state.seen.add(state.index);
}

function getSeenCount() {
    return Math.min(state.seen.size, state.questions.length);
}

function hasSeenAllQuestions() {
    return state.questions.length > 0 && getSeenCount() === state.questions.length;
}

function getUnansweredCount() {
    return state.questions.reduce((count, question) => count + (question?._answered ? 0 : 1), 0);
}

function isReviewRoundComplete() {
    return state.reviewMode && state.questions.length > 0 && getUnansweredCount() === 0;
}

function isPerfectReviewRoundComplete() {
    return isReviewRoundComplete() && state.questions.every((question) => question?._correct);
}

function getFirstUnseenQuestionIndex() {
    return state.questions.findIndex((_, index) => !state.seen.has(index));
}

function syncCurrentDraftFromDom() {
    const q = state.questions[state.index];
    if (!q || q._answered) return;

    if (q.type === "short" || q.type === "open") {
        q._user = getEl("short-input")?.value ?? q._user ?? "";
        return;
    }

    if (q.type === "mcq" || q.type === "tf") {
        const selected = document.querySelector("#options input:checked")?.value;
        if (selected !== undefined) q._user = selected;
        return;
    }

    if (q.type === "mcq-multiple") {
        q._user = Array.from(document.querySelectorAll("#options input:checked")).map(input => input.value);
    }
}

function jumpToQuestion(index) {
    if (!state.questions[index]) return;
    syncCurrentDraftFromDom();
    state.index = index;
    render();
}

function renderQuizStatus() {
    const status = getEl("quiz-status");
    if (!status) return;

    const total = state.questions.length;
    const seen = getSeenCount();
    const unanswered = getUnansweredCount();
    const marked = state.marked.size;
    const notes = [];

    if (state.saveStatusMessage) {
        notes.push(state.saveStatusMessage);
    }

    if (state.bossMode) {
        notes.push("Boss mode active");
    } else if (!state.reviewMode) {
        const answeredCount = state.questions.reduce((count, question) => count + (question?._answered ? 1 : 0), 0);
        if (answeredCount >= 4) {
            notes.push(`Boss ready ${getBossRoundTargetCount(answeredCount)}`);
        }
    }

    const suffix = notes.length ? ` • ${notes.join(" • ")}` : "";
    status.textContent = `Seen ${seen}/${total} • ${unanswered} unanswered • ${marked} marked${suffix}`;
}

function getStreakFlavorText() {
    const streak = state.currentStreak;
    if (streak >= 15) return "Boss energy";
    if (streak >= 10) return "On fire";
    if (streak >= 6) return "Combo locked";
    if (streak >= 3) return "Momentum building";
    if (streak >= 1) return "Combo started";
    return "Combo warming up";
}

function renderStreakMeter() {
    const panel = getEl("streak-panel");
    const label = getEl("streak-label");
    const best = getEl("streak-best");
    const flavor = getEl("streak-flavor");
    const fill = getEl("streak-fill");
    if (!panel || !label || !best || !flavor || !fill) return;

    const streak = Math.max(0, Number(state.currentStreak) || 0);
    const bestStreak = Math.max(0, Number(state.bestStreak) || 0);
    const fillPercent = Math.min(100, streak <= 0 ? 0 : 14 + (Math.min(streak, 12) / 12) * 86);

    label.textContent = `Streak ${streak}`;
    best.textContent = `Best ${bestStreak}`;
    flavor.textContent = getStreakFlavorText();
    fill.style.width = `${fillPercent}%`;
    panel.classList.toggle("hot", streak >= 3);
}

function applyStreakOutcome(isCorrect) {
    if (isCorrect) {
        state.currentStreak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
    } else {
        state.currentStreak = 0;
    }

    renderStreakMeter();
}

function renderMarkControls() {
    const isMarked = state.marked.has(state.index);
    const configs = [
        { id: "mark", idle: "🚩 Mark (M)", active: "🚩 Marked (M)" },
        { id: "mark-mobile", idle: "🚩 Mark", active: "🚩 Marked" }
    ];

    configs.forEach(({ id, idle, active }) => {
        const button = getEl(id);
        if (!button) return;

        button.textContent = isMarked ? active : idle;
        button.style.background = isMarked ? "#facc15" : "";
        button.style.borderColor = isMarked ? "#ca8a04" : "";
        button.style.color = isMarked ? "#111827" : "";
    });
}

function toggleMark() {
    if (!state.questions[state.index]) return;

    if (state.marked.has(state.index)) {
        state.marked.delete(state.index);
    } else {
        state.marked.add(state.index);
    }

    renderMarkControls();
    renderNavMap();
    renderQuizStatus();
    queueQuizProgressSave(150);
}

function getAdaptiveSummaryFocusText(summary) {
    if (!summary?.topFocusLabels?.length) return "";
    return summary.topFocusLabels.join(", ");
}

function getAdaptiveSummaryBannerCopy(summary) {
    if (!summary?.active) {
        return "This final is using the balanced 110-question blueprint now. Complete a few more full finals on this browser to sharpen the adaptive memory.";
    }

    const runText = `${summary.runCount} completed final run${summary.runCount === 1 ? "" : "s"}`;
    const signalText = `${summary.signalCount} tracked weak point${summary.signalCount === 1 ? "" : "s"}`;
    const anchorText = summary.targetedDrugCount > 0
        ? `${summary.targetedDrugCount} selected drug${summary.targetedDrugCount === 1 ? "" : "s"} were boosted by your weak-area memory.`
        : "Weak-area memory is active across the current selection.";
    const focusText = getAdaptiveSummaryFocusText(summary);
    const repeatText = summary.repeatPenaltyCount > 0
        ? `Repeat guard softened ${summary.repeatPenaltyCount} recently used drug${summary.repeatPenaltyCount === 1 ? "" : "s"}.`
        : "Repeat guard is active.";
    const legacyText = summary.legacyRecoveredCount > 0
        ? `Recovered ${summary.legacyRecoveredCount} older completed run${summary.legacyRecoveredCount === 1 ? "" : "s"} from your saved history.`
        : "";

    return `Using ${runText} and ${signalText}. Strongest push: ${focusText || "mixed review"}. ${anchorText} ${repeatText}${legacyText ? ` ${legacyText}` : ""}`;
}

function renderAdaptiveFinalBanner() {
    const wrap = getEl("adaptive-final-banner");
    const title = getEl("adaptive-final-title");
    const copy = getEl("adaptive-final-copy");
    if (!wrap || !title || !copy) return;

    const active = quizId === FINAL_EXAM_ID && !state.reviewMode && !state.bossMode;
    wrap.classList.toggle("hidden", !active);
    if (!active) return;

    const summary = state.adaptiveSummary;
    const adaptiveActive = Boolean(summary?.active);
    wrap.dataset.state = adaptiveActive ? "active" : "warming";

    title.textContent = adaptiveActive ? "Adaptive Final Active" : "Adaptive Final Warming Up";
    copy.textContent = getAdaptiveSummaryBannerCopy(summary);
    wrap.style.borderColor = "";
    wrap.style.background = "";
    wrap.style.color = "";
}

function renderFooterActions(q) {
    const checkBtn = getEl("check");
    const nextBtn = getEl("next");
    const checkAllBtn = getEl("check-all");
    const isLastQuestion = state.index === state.questions.length - 1;
    const unansweredCount = getUnansweredCount();
    const unseenCount = Math.max(0, state.questions.length - getSeenCount());
    const canCheckAllHere = isLastQuestion && hasSeenAllQuestions() && unansweredCount > 0;
    const reviewRoundComplete = isReviewRoundComplete();
    const perfectReviewRound = isPerfectReviewRoundComplete();

    if (checkBtn) {
        checkBtn.classList.toggle("hidden", !!q._answered);
        checkBtn.textContent = canCheckAllHere ? "Check This Answer" : "Check Answer";
    }

    if (nextBtn) {
        nextBtn.classList.toggle("hidden", !q._answered);
        nextBtn.style.background = "";
        nextBtn.style.boxShadow = "";
        nextBtn.style.letterSpacing = "";
        nextBtn.style.textTransform = "";

        if (!q._answered) {
            nextBtn.textContent = "Next →";
        } else if (perfectReviewRound) {
            nextBtn.textContent = "Replay Round";
            nextBtn.style.background = "linear-gradient(135deg, #0f766e 0%, #0891b2 100%)";
            nextBtn.style.boxShadow = "0 12px 30px rgba(8, 145, 178, 0.28)";
            nextBtn.style.letterSpacing = "0.08em";
            nextBtn.style.textTransform = "uppercase";
        } else if (reviewRoundComplete) {
            nextBtn.textContent = "See Review Results";
        } else if (!isLastQuestion) {
            nextBtn.textContent = "Next →";
        } else if (unseenCount > 0) {
            nextBtn.textContent = unseenCount === 1 ? "Review 1 Unseen Question" : `Review ${unseenCount} Unseen Questions`;
        } else if (unansweredCount > 0) {
            nextBtn.textContent = "Check All Answers & Finish";
        } else {
            nextBtn.textContent = "Finish Quiz";
        }
    }

    if (checkAllBtn) {
        checkAllBtn.classList.toggle("hidden", !canCheckAllHere || !!q._answered);
        checkAllBtn.textContent = "Check All Answers & Finish";
    }
}

function syncQuizThemeAffordances(isDark) {
    const helpBtn = getEl("help-shortcuts");
    if (!helpBtn) return;
    helpBtn.style.color = isDark ? "black" : "";
}

function applyStoredQuizTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const start = saved || (prefersDark ? "dark" : "light");
    const isDark = start === "dark";

    document.documentElement.classList.toggle("dark", isDark);
    syncQuizThemeAffordances(isDark);
}

function toggleQuizTheme() {
    const isDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    syncQuizThemeAffordances(isDark);
}

const CONCEPT_QUIZ_ID = "bdt-unit10-quiz8";
const CONCEPT_QUIZ_TITLE = "Endocrine Concept Practice";
const CONCEPT_QUIZ_SIZE = 10;
const CONCEPT_QUIZ_POOL_FILE = "bdt_unit10_quiz8_master_pool.json";
const EXAM4_CONCEPT_QUIZ_ID = "bdt-unit10-exam4";
const EXAM4_CONCEPT_QUIZ_POOL_FILE = "bdt_unit10_exam4_master_pool_draft.json";
const EXAM4_HIGH_YIELD_CONCEPT_QUIZ_ID = "bdt-unit10-exam4-high-yield";
const EXAM4_HIGH_YIELD_CONCEPT_QUIZ_POOL_FILE = "bdt_unit10_exam4_master_pool_high_yield_draft.json";
const EXAM4_CONCEPT_BLUEPRINT = Object.freeze([
    { type: "mcq", count: 32, label: "MCQ" },
    { type: "short", count: 10, label: "Fill In" },
    { type: "open", count: 4, label: "Open Response" }
]);
const CONCEPT_QUIZ_CONFIGS = Object.freeze({
    [CONCEPT_QUIZ_ID]: {
        id: CONCEPT_QUIZ_ID,
        title: CONCEPT_QUIZ_TITLE,
        questionContextLabel: "Endocrine Concept Practice",
        poolFile: CONCEPT_QUIZ_POOL_FILE,
        quizSize: CONCEPT_QUIZ_SIZE,
        timerSeconds: 10 * 60
    },
    [EXAM4_CONCEPT_QUIZ_ID]: {
        id: EXAM4_CONCEPT_QUIZ_ID,
        title: "Unit 10 Endocrine Exam 4 Draft",
        questionContextLabel: "Endocrine Exam 4 Draft",
        poolFile: EXAM4_CONCEPT_QUIZ_POOL_FILE,
        quizSize: 46,
        blueprint: EXAM4_CONCEPT_BLUEPRINT,
        timerSeconds: 60 * 60,
        missingPoolMessage: `Exam 4 draft route is waiting for ${EXAM4_CONCEPT_QUIZ_POOL_FILE}.`,
        insufficientPoolMessage: "Exam 4 generator needs enough endocrine concept entries to build 32 MCQ, 10 fill-in, and 4 open-response questions."
    },
    [EXAM4_HIGH_YIELD_CONCEPT_QUIZ_ID]: {
        id: EXAM4_HIGH_YIELD_CONCEPT_QUIZ_ID,
        title: "Unit 10 Endocrine Exam 4 High-Yield Draft",
        questionContextLabel: "Endocrine Exam 4 High-Yield",
        poolFile: EXAM4_HIGH_YIELD_CONCEPT_QUIZ_POOL_FILE,
        quizSize: 10,
        timerSeconds: 10 * 60,
        missingPoolMessage: `Exam 4 high-yield draft route is waiting for ${EXAM4_HIGH_YIELD_CONCEPT_QUIZ_POOL_FILE}.`
    }
});

const FINAL_EXAM_ID = "log-lab-final-2";
const FINAL_EXAM_TITLE = "Top Drugs Final Lab 2 — 110 Questions";
const FINAL_EXAM_TOTAL = 110;
const FINAL_EXAM_TIMER_SECONDS = 90 * 60;
const FINAL_RECENT_RUNS_KEY = "pharmlet.finalLab2.recentRuns";
const TOP_DRUGS_SIGNALS_KEY = "pharmlet.topDrugs.signals";
const FINAL_RECENT_RUN_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const FINAL_LEGACY_RUN_MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;
const GENERATED_QUIZ_IDS = new Set(["custom-quiz", "review-quiz"]);
const FINAL_FOCUS_AREAS = ["brand", "class", "category", "moa"];
const FINAL_FOCUS_AREA_LABELS = {
    brand: "Brand",
    class: "Class",
    category: "Category",
    moa: "MOA",
    generic: "Generic"
};

const FINAL_BLUEPRINT_FAMILY_WEIGHTS = [
    { family: "generic_to_brand", weight: 0.13 },
    { family: "brand_to_generic", weight: 0.13 },
    { family: "brand_class_pair", weight: 0.07 },
    { family: "brand_category_pair", weight: 0.05 },
    { family: "drug_to_class", weight: 0.09 },
    { family: "drug_to_category", weight: 0.09 },
    { family: "drug_to_moa", weight: 0.07 },
    { family: "class_to_drug", weight: 0.07 },
    { family: "category_to_drug", weight: 0.09 },
    { family: "moa_to_drug", weight: 0.07 },
    { family: "paired_med_class", weight: 0.06 },
    { family: "paired_med_category", weight: 0.04 },
    { family: "negative_mcq", weight: 0.04 }
];

function normalizeDrugKey(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitBrandNames(brandValue) {
    if (!brandValue || String(brandValue).trim().toLowerCase() === "n/a") return [];

    const seen = new Set();
    const values = [];

    String(brandValue)
        .split(/[;,/]/)
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(part => {
            const key = normalizeDrugKey(part);
            if (!key || seen.has(key)) return;
            seen.add(key);
            values.push(part);
        });

    return values;
}

function getBrandQualifier(brandValue) {
    const match = String(brandValue ?? "").match(/\(([^)]+)\)\s*$/);
    return match ? match[1].trim() : "";
}

function stripBrandQualifier(brandValue) {
    return String(brandValue ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function getGenericBrandPromptLabel(drug, brandValue) {
    const generic = String(drug?.generic ?? "").trim();
    const qualifier = getBrandQualifier(brandValue);
    if (!generic || !qualifier) return generic;

    const genericKey = normalizeDrugKey(generic);
    const qualifierKey = normalizeDrugKey(qualifier);
    if (genericKey && qualifierKey && genericKey.includes(qualifierKey)) {
        return generic;
    }

    return `${generic} ${qualifier}`;
}

function getSpecificGenericAnswerForBrand(drug, brandValue) {
    const generic = String(drug?.generic ?? "").trim();
    const qualifier = getBrandQualifier(brandValue);
    if (!generic || !qualifier) return generic;

    const genericKey = normalizeDrugKey(generic);
    const qualifierKey = normalizeDrugKey(qualifier);
    if (genericKey && qualifierKey && genericKey.includes(qualifierKey)) {
        return generic;
    }

    return `${generic} ${qualifier}`.trim();
}

function getAcceptedGenericAnswersForBrand(drug, brandValue) {
    const accepted = [];
    const pushUnique = (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) return;
        if (accepted.some((entry) => normalizeDrugKey(entry) === normalizeDrugKey(trimmed))) return;
        accepted.push(trimmed);
    };

    pushUnique(getSpecificGenericAnswerForBrand(drug, brandValue));
    pushUnique(drug?.generic);

    return accepted;
}

function buildBrandToGenericQuestion(drug, brandValue) {
    const acceptedAnswers = getAcceptedGenericAnswersForBrand(drug, brandValue);
    if (!brandValue || !acceptedAnswers.length) return null;

    const [answer, ...extraAcceptedAnswers] = acceptedAnswers;
    return {
        type: "short",
        prompt: `Generic for <b>${brandValue}</b>?`,
        answer,
        drugRef: drug,
        _brandVariant: brandValue,
        _acceptedAnswers: extraAcceptedAnswers
    };
}

function findBrandVariantInText(value, drug) {
    const text = normalizeDrugKey(toPlainText(value));
    if (!text) return "";

    const rankedBrands = splitBrandNames(drug?.brand)
        .map((brand) => {
            const exactKey = normalizeDrugKey(brand);
            const strippedKey = normalizeDrugKey(stripBrandQualifier(brand));
            return {
                brand,
                exactKey,
                strippedKey,
                matchLength: Math.max(exactKey.length, strippedKey.length)
            };
        })
        .sort((a, b) => b.matchLength - a.matchLength);

    for (const entry of rankedBrands) {
        if (entry.exactKey && text.includes(entry.exactKey)) return entry.brand;
        if (entry.strippedKey && entry.strippedKey !== entry.exactKey && text.includes(entry.strippedKey)) return entry.brand;
    }

    return "";
}

function resolveQuestionBrandVariant(question, drug) {
    const explicitBrand = String(question?._brandVariant || "").trim();
    if (explicitBrand) return explicitBrand;

    const brandAnswers = splitBrandNames(drug?.brand);
    if (!brandAnswers.length) return "";

    const answerText = String(question?.answerText ?? question?.answer ?? "").trim();
    const answerBrandCandidate = String(answerText.split("/")[0] || "").trim();
    if (answerBrandCandidate) {
        const matchedAnswerBrand = brandAnswers.find((brand) => normalizeDrugKey(brand) === normalizeDrugKey(answerBrandCandidate));
        if (matchedAnswerBrand) return matchedAnswerBrand;
    }

    const promptBrand = findBrandVariantInText(question?.prompt, drug);
    if (promptBrand) return promptBrand;

    return brandAnswers.length === 1 ? brandAnswers[0] : "";
}

const DRUG_ANSWER_ALIAS_GROUPS = [
    ["Hormone Replacement", "Horomone Replacement"],
    ["Beta Blocker", "Beta-Blocker"],
    ["Rapid-acting Insulin", "Rapid-acting insulin"],
    ["Alpha-1 Antagonist", "Agent Alpha-1 Antagonist"],
    [
        "Serotonin 5-HT1B, 2D Receptor Agonist",
        "Serotonin 5-HT1B,2D Receptor Agonist",
        "Serotonin 5-HT1B, 1D Receptor Agonist",
        "Serotonin 5-HT1B,1D Receptor Agonist",
        "Serotonin 5-HT1B/1D Receptor Agonist"
    ]
];

// Keep this list curated and high-confidence so brand matching stays helpful
// without becoming overly loose.
const EXTRA_BRAND_ACCEPTABLE_ANSWERS = Object.freeze({
    naproxen: ["Naprosyn"],
    albuterol: ["Proventil", "Proventil HFA", "Ventolin HFA", "ProAir HFA"],
    nitrofurantoin: ["Macrodantin"],
    tadalafil: ["Adcirca"],
    prednisone: ["Rayos"],
    diltiazem: ["Tiazac"],
    omeprazole: ["Prilosec OTC"],
    esomeprazole: ["Nexium 24HR"]
});

const DRUG_ANSWER_ALIAS_LOOKUP = (() => {
    const normalizeAliasKey = (value) => String(value ?? "")
        .toLowerCase()
        .replace(/[()]/g, " ")
        .replace(/[.,;:!?]+/g, " ")
        .replace(/[-/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const lookup = new Map();
    for (const group of DRUG_ANSWER_ALIAS_GROUPS) {
        const normalizedGroup = [...new Set(group.map(normalizeAliasKey).filter(Boolean))];
        for (const key of normalizedGroup) {
            lookup.set(key, normalizedGroup);
        }
    }
    return { lookup, normalizeAliasKey };
})();

function getDrugAnswerAliasForms(value) {
    const key = DRUG_ANSWER_ALIAS_LOOKUP.normalizeAliasKey(value);
    return DRUG_ANSWER_ALIAS_LOOKUP.lookup.get(key) || [];
}

function getExtraBrandAcceptableAnswers(drug) {
    const genericKey = normalizeDrugKey(drug?.generic);
    return EXTRA_BRAND_ACCEPTABLE_ANSWERS[genericKey] || [];
}

function getAcceptedBrandAnswersForDrug(drug, options = {}) {
    const restrictToVariant = Boolean(options?.restrictToVariant);
    const brandVariant = options?.brandVariant || "";
    const rawValues = restrictToVariant && brandVariant
        ? [brandVariant]
        : [...splitBrandNames(drug?.brand), ...getExtraBrandAcceptableAnswers(drug)];

    const seen = new Set();
    return rawValues.filter((value) => {
        const key = normalizeDrugKey(value);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function isFullTopDrugsFinalAttempt(questions = state.questions) {
    return quizId === FINAL_EXAM_ID && Array.isArray(questions) && questions.length === FINAL_EXAM_TOTAL;
}

function isConfiguredTrueExamModeKey(modeKey) {
    const normalized = normalizeQuizValue(modeKey);
    return normalized === "trueexam" || normalized === "exam";
}

function getConfiguredModeStorageLabel() {
    return String(state.configuredModeKey || "").trim();
}

function isTrueExamMode() {
    return (!!quizId && examModeParam) || isConfiguredTrueExamModeKey(getConfiguredModeStorageLabel());
}

function isBossRoundMode() {
    return !!state.bossMode;
}

function isRestrictedAttemptMode() {
    return isTrueExamMode() || isBossRoundMode();
}

function getHistoryModeLabel() {
    if (state.generatedAttemptIdentity?.modeLabel) {
        return state.generatedAttemptIdentity.modeLabel;
    }

    if (state.configuredModeKey) {
        return state.configuredModeKey;
    }

    if (state.bossMode) {
        return "boss";
    }

    if (isTrueExamMode()) {
        return "exam";
    }

    if (quizId === FINAL_EXAM_ID) {
        return "practice";
    }

    return modeParam;
}

function getQuizModeConfigs(data) {
    const modeConfigs = data?.settings?.modeConfigs;
    return modeConfigs && typeof modeConfigs === "object" ? modeConfigs : null;
}

function normalizeConfiguredModeRequest(value) {
    const normalized = normalizeQuizValue(value);
    if (!normalized) return "";
    if (normalized === "hard" || normalized === "quickhard" || normalized === "quick-hard" || normalized === "quickquiz" || normalized === "quick-quiz" || normalized === "quick") return "quickHard";
    if (normalized === "trueexam" || normalized === "true-exam" || normalized === "exam") return "trueExam";
    if (normalized === "pkgenerator" || normalized === "pk-generator" || normalized === "pkgen" || normalized === "pkquiz" || normalized === "pk-quiz" || normalized === "pkmath" || normalized === "pk-math" || normalized === "pk") return "pkMath";
    if (normalized === "masterpool" || normalized === "master-pool" || normalized === "master") return "masterPool";
    return String(value || "").trim();
}

function getEffectiveQuizModeKey(data) {
    const modeConfigs = getQuizModeConfigs(data);
    if (!modeConfigs) {
        return examModeParam ? "exam" : modeParam;
    }

    if (examModeParam) {
        if (modeConfigs.trueExam) return "trueExam";
        if (modeConfigs.exam) return "exam";
    }

    const requestedMode = normalizeConfiguredModeRequest(modeParam);
    if (modeParamProvided && modeConfigs?.[requestedMode]) return requestedMode;

    const defaultMode = normalizeConfiguredModeRequest(data?.settings?.defaultMode);
    if (!modeParamProvided && !examModeParam && defaultMode && modeConfigs?.[defaultMode]) {
        return defaultMode;
    }

    if (modeConfigs?.[requestedMode]) return requestedMode;
    if (modeConfigs?.easy) return "easy";
    return examModeParam ? "exam" : requestedMode || modeParam;
}

function getEffectiveQuizModeConfig(data) {
    const modeConfigs = getQuizModeConfigs(data);
    if (!modeConfigs) return null;

    const modeKey = getEffectiveQuizModeKey(data);
    const config = modeConfigs?.[modeKey];
    if (config && typeof config === "object") {
        return { ...config, _modeKey: modeKey };
    }

    return null;
}

function getConfiguredModeTitle(data, modeConfig) {
    const baseTitle = data?.title || "Quiz";
    if (modeConfig?.title) return String(modeConfig.title).trim();
    if (modeConfig?.titleSuffix) return `${baseTitle} ${String(modeConfig.titleSuffix).trim()}`.trim();
    if (isTrueExamMode()) return `${baseTitle} (True Exam Mode)`;
    return baseTitle;
}

function applyAttemptModeUI() {
    const active = isRestrictedAttemptMode();
    const title = getEl("mode-banner-title");
    const copy = getEl("mode-banner-copy");
    const banner = getEl("mode-banner");
    const shortcutNote = getEl("restricted-shortcut-note");

    if (title) {
        title.textContent = isBossRoundMode() ? "Boss Round" : "True Exam Mode";
    }

    if (copy) {
        copy.textContent = isBossRoundMode()
            ? "Hints and answer reveals are locked. Clear the challenge clean to beat the boss."
            : "Hints and answer reveals are disabled for this attempt.";
    }

    banner?.classList.toggle("hidden", !active);
    shortcutNote?.classList.toggle("hidden", !active);

    if (shortcutNote) {
        shortcutNote.textContent = isBossRoundMode()
            ? "Boss Round removes the hint and reveal shortcuts for this run."
            : "True Exam Mode removes the hint and reveal shortcuts for this run.";
    }

    document.querySelectorAll("[data-exam-hidden='true']").forEach((el) => {
        el.classList.toggle("hidden", active);
    });
}

function safeReadStorageJson(key, fallbackValue) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallbackValue;
        return JSON.parse(raw);
    } catch (error) {
        return fallbackValue;
    }
}

function toPlainText(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value ?? "");
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function updateTopDrugsVersionBadge(pool) {
    const badge = getEl("top-drugs-version-badge");
    if (!badge || !Array.isArray(pool) || !pool.length) return;

    const versionInfo = window.TopDrugsData?.computePoolVersion?.(pool);
    if (!versionInfo) return;

    window.TopDrugsData.renderVersionBadge(badge, versionInfo);
}

function loadQuestionReports() {
    const parsed = safeReadStorageJson(QUESTION_REPORTS_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
}

function saveQuestionReports(reports) {
    localStorage.setItem(QUESTION_REPORTS_KEY, JSON.stringify(reports));
}

function serializeReportValue(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value === undefined || value === null) return "";
    return String(value);
}

function buildQuestionReportPayload(question) {
    const rawCorrectAnswer = getCorrectAnswerValue(question);
    return {
        quizId: quizId || "unknown",
        title: state.title || quizId || "Quiz",
        mode: getHistoryModeLabel(),
        questionNumber: state.index + 1,
        totalQuestions: state.questions.length,
        prompt: String(question?.prompt ?? ""),
        promptText: toPlainText(question?.prompt ?? ""),
        correctAnswer: serializeReportValue(rawCorrectAnswer),
        userAnswer: serializeReportValue(question?._user),
        questionType: question?.type || "",
        questionFamily: question?._finalFamily || question?._mode || "",
        drugGeneric: question?.drugRef?.generic || "",
        note: "",
        timestamp: new Date().toISOString()
    };
}

function reportCurrentQuestion() {
    const question = state.questions[state.index];
    if (!question || !question._answered || question._reported) return;

    const note = window.prompt("Optional note for this report. Example: 'Multiple answers looked correct' or 'Prompt wording felt vague.' Leave blank to save without a note.");
    if (note === null) return;

    const reports = loadQuestionReports();
    const payload = buildQuestionReportPayload(question);
    payload.note = String(note).trim();

    reports.unshift(payload);
    saveQuestionReports(reports.slice(0, MAX_QUESTION_REPORTS));
    question._reported = true;
    render();
    alert("Question report saved locally. You can review it later on the Stats page.");
}

function createEmptyTopDrugsSignals() {
    return {
        version: 1,
        updatedAt: 0,
        seenDrugs: {},
        missedDrugs: {},
        seenClasses: {},
        missedClasses: {},
        seenCategories: {},
        missedCategories: {},
        seenBrands: {},
        missedBrands: {}
    };
}

function loadTopDrugsSignals() {
    const parsed = safeReadStorageJson(TOP_DRUGS_SIGNALS_KEY, null);
    if (!parsed || typeof parsed !== "object") return createEmptyTopDrugsSignals();

    const base = createEmptyTopDrugsSignals();
    return {
        ...base,
        ...parsed,
        seenDrugs: parsed.seenDrugs || {},
        missedDrugs: parsed.missedDrugs || {},
        seenClasses: parsed.seenClasses || {},
        missedClasses: parsed.missedClasses || {},
        seenCategories: parsed.seenCategories || {},
        missedCategories: parsed.missedCategories || {},
        seenBrands: parsed.seenBrands || {},
        missedBrands: parsed.missedBrands || {}
    };
}

function saveTopDrugsSignals(signals) {
    try {
        localStorage.setItem(TOP_DRUGS_SIGNALS_KEY, JSON.stringify({
            ...createEmptyTopDrugsSignals(),
            ...signals,
            updatedAt: Date.now()
        }));
    } catch (error) {
        console.warn("Unable to persist Top Drugs signals:", error);
    }
}

function loadCompletedFinalAttemptTimestampsFromHistory() {
    const parsed = safeReadStorageJson(HISTORY_KEY, []);
    if (!Array.isArray(parsed)) return [];

    return parsed
        .filter((entry) => entry?.quizId === FINAL_EXAM_ID && Number(entry?.total) === FINAL_EXAM_TOTAL)
        .map((entry) => Number(entry?.timestamp) || 0)
        .filter(Boolean)
        .sort((a, b) => a - b);
}

function claimLegacyFinalRunHistoryMatch(runTimestamp, completedAttemptTimestamps, usedAttemptIndexes) {
    if (!runTimestamp || !completedAttemptTimestamps.length) return false;

    for (let index = 0; index < completedAttemptTimestamps.length; index += 1) {
        if (usedAttemptIndexes.has(index)) continue;
        if (Math.abs(completedAttemptTimestamps[index] - runTimestamp) > FINAL_LEGACY_RUN_MATCH_WINDOW_MS) continue;
        usedAttemptIndexes.add(index);
        return true;
    }

    return false;
}

function loadRecentFinalRuns() {
    const parsed = safeReadStorageJson(FINAL_RECENT_RUNS_KEY, []);
    if (!Array.isArray(parsed)) return [];
    const completedAttemptTimestamps = loadCompletedFinalAttemptTimestampsFromHistory();
    const usedAttemptIndexes = new Set();

    return parsed
        .filter((run) => {
            if (!run || typeof run !== "object") return false;
            if (run.completed === true) return true;

            const timestamp = Number(run?.timestamp || 0);
            return claimLegacyFinalRunHistoryMatch(timestamp, completedAttemptTimestamps, usedAttemptIndexes);
        })
        .map(run => ({
            timestamp: Number(run.timestamp) || 0,
            generics: Array.isArray(run.generics) ? run.generics.map(normalizeDrugKey).filter(Boolean) : [],
            familiesByGeneric: run.familiesByGeneric && typeof run.familiesByGeneric === "object" ? run.familiesByGeneric : {},
            brandsByGeneric: run.brandsByGeneric && typeof run.brandsByGeneric === "object" ? run.brandsByGeneric : {},
            legacyRecovered: run.completed !== true
        }))
        .slice(-10);
}

function saveRecentFinalRuns(runs) {
    try {
        localStorage.setItem(FINAL_RECENT_RUNS_KEY, JSON.stringify(runs.slice(-10)));
    } catch (error) {
        console.warn("Unable to persist recent final runs:", error);
    }
}

function getFinalFocusAreaLabel(areaKey) {
    return FINAL_FOCUS_AREA_LABELS[areaKey] || "Other";
}

function getQuestionFocusArea(question) {
    const familyAreaMap = {
        generic_to_brand: "brand",
        brand_to_generic: "brand",
        brand_class_pair: "class",
        brand_category_pair: "category",
        drug_to_class: "class",
        drug_to_category: "category",
        drug_to_moa: "moa",
        class_to_drug: "class",
        category_to_drug: "category",
        moa_to_drug: "moa",
        paired_med_class: "class",
        paired_med_category: "category"
    };

    const familyArea = familyAreaMap[question?._finalFamily];
    if (familyArea) return familyArea;

    const prompt = String(question?.prompt || "").toLowerCase();
    if (/\bbrand\b|\bgeneric\b/.test(prompt)) return "brand";
    if (/\bmechanism of action\b|\bmoa\b/.test(prompt)) return "moa";
    if (/\bcategory\b/.test(prompt)) return "category";
    if (/\bclass\b/.test(prompt)) return "class";
    return "other";
}

function buildFinalPerformanceBreakdown(questions) {
    if (!isFullTopDrugsFinalAttempt(questions)) return null;

    const areas = FINAL_FOCUS_AREAS.map((key) => ({
        key,
        label: getFinalFocusAreaLabel(key),
        total: 0,
        correct: 0,
        missed: 0,
        accuracy: 0,
        questions: [],
        missedQuestions: []
    }));
    const areaLookup = new Map(areas.map((area) => [area.key, area]));

    for (const question of questions) {
        const areaKey = getQuestionFocusArea(question);
        const bucket = areaLookup.get(areaKey);
        if (!bucket) continue;

        bucket.total += 1;
        bucket.questions.push(question);

        if (question?._answered && question?._correct) {
            bucket.correct += 1;
        } else if (question?._answered && !question?._correct) {
            bucket.missed += 1;
            bucket.missedQuestions.push(question);
        }
    }

    areas.forEach((area) => {
        area.accuracy = area.total ? Math.round((area.correct / area.total) * 100) : 0;
    });

    const weakAreas = areas
        .filter((area) => area.total > 0 && area.missed > 0)
        .sort((a, b) => a.accuracy - b.accuracy || b.missed - a.missed || b.total - a.total);

    return {
        areas,
        weakAreas,
        focusAreas: weakAreas.slice(0, 2).map((area) => area.key)
    };
}

function splitQuicksheetFieldValues(areaKey, value) {
    if (!value) return [];

    if (areaKey === "brand") {
        return splitBrandNames(value);
    }

    if (areaKey === "category") {
        return String(value)
            .split(/[;,]/)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    return [String(value).trim()].filter(Boolean);
}

function buildQuicksheetDeepLink(field, value) {
    const params = new URLSearchParams();
    params.set("field", field);
    params.set("value", String(value || "").trim());
    return `top-drugs-quicksheet.html?${params.toString()}`;
}

function buildAreaQuicksheetLinks(area, limit = 2) {
    const fieldMap = {
        brand: "brand",
        class: "class",
        category: "category",
        moa: "moa"
    };
    const field = fieldMap[area?.key];
    if (!field) return [];

    const sourceQuestions = area?.missedQuestions?.length ? area.missedQuestions : area?.questions || [];
    const counts = new Map();

    for (const question of sourceQuestions) {
        const drug = question?.drugRef;
        if (!drug) continue;

        let rawValues = [];
        if (area.key === "brand") {
            rawValues = question?._brandVariant ? [question._brandVariant] : splitBrandNames(drug?.brand);
        } else {
            rawValues = splitQuicksheetFieldValues(area.key, drug?.[field]);
        }

        for (const rawValue of rawValues) {
            const trimmed = String(rawValue || "").trim();
            const key = normalizeDrugKey(trimmed);
            if (!key) continue;

            const existing = counts.get(key) || { label: trimmed, count: 0 };
            existing.count += 1;
            counts.set(key, existing);
        }
    }

    return [...counts.values()]
        .sort((a, b) => b.count - a.count || a.label.length - b.label.length || a.label.localeCompare(b.label))
        .slice(0, limit)
        .map((entry) => ({
            field,
            label: entry.label,
            href: buildQuicksheetDeepLink(field, entry.label)
        }));
}

function buildStoredFinalAttemptSummary(questions) {
    const breakdown = buildFinalPerformanceBreakdown(questions);
    if (!breakdown) return null;

    return {
        areas: breakdown.areas
            .filter((area) => area.total > 0)
            .map((area) => ({
                key: area.key,
                label: area.label,
                total: area.total,
                correct: area.correct,
                missed: area.missed,
                accuracy: area.accuracy
            })),
        weakAreas: breakdown.weakAreas.slice(0, 3).map((area) => ({
            key: area.key,
            label: area.label,
            missed: area.missed,
            accuracy: area.accuracy
        }))
    };
}

function cloneQuestionForGeneratedQuiz(question) {
    const cloned = JSON.parse(JSON.stringify(question));
    delete cloned._answered;
    delete cloned._user;
    delete cloned._correct;
    delete cloned._id;
    delete cloned._hintUsed;
    return cloned;
}

function buildWeakAreaRetakeQuestions(questions) {
    const breakdown = buildFinalPerformanceBreakdown(questions);
    if (!breakdown) return [];

    const focusAreas = breakdown.focusAreas.length ? breakdown.focusAreas : breakdown.areas.filter((area) => area.missed > 0).map((area) => area.key);
    if (!focusAreas.length) return [];

    const areaLookup = new Map(breakdown.areas.map((area) => [area.key, area]));
    const picked = [];
    const seen = new Set();
    const addQuestion = (question) => {
        if (!question) return;
        const identity = normalizeQuizValue(`${question.prompt || ""}||${JSON.stringify(getCorrectAnswerValue(question))}`);
        if (!identity || seen.has(identity)) return;
        seen.add(identity);
        picked.push(cloneQuestionForGeneratedQuiz(question));
    };

    for (const areaKey of focusAreas) {
        (areaLookup.get(areaKey)?.missedQuestions || []).forEach(addQuestion);
    }

    if (picked.length < 12) {
        for (const areaKey of focusAreas) {
            (areaLookup.get(areaKey)?.questions || [])
                .filter((question) => question?._correct)
                .forEach(addQuestion);
            if (picked.length >= 12) break;
        }
    }

    if (picked.length < 12) {
        breakdown.areas
            .flatMap((area) => area.missedQuestions)
            .forEach(addQuestion);
    }

    return picked.slice(0, Math.min(20, picked.length));
}

function getBossRoundTargetCount(answeredCount) {
    if (answeredCount >= 80) return 10;
    if (answeredCount >= 40) return 8;
    if (answeredCount >= 20) return 6;
    return Math.min(5, answeredCount);
}

function getBossRoundTimerSeconds(questionCount) {
    return Math.max(180, questionCount * 50);
}

function getBossRoundCandidateScore(question, weakAreaLookup) {
    if (!question?._answered) return -Infinity;

    let score = 0;
    if (!question._correct) score += 7.5;
    if (question._user === "Revealed") score += 2.5;
    if (question._hintUsed) score += 1.35;

    if (question.type === "short" || question.type === "open") score += 0.45;
    if (question.type === "mcq-multiple") score += 0.3;

    const weakArea = weakAreaLookup.get(getQuestionFocusArea(question));
    if (weakArea) {
        score += Math.max(0.6, 2.2 - (weakArea.rank * 0.55));
        score += Math.min(1.8, weakArea.missed * 0.18);
    }

    return score;
}

function buildBossRoundQuestions(questions) {
    const answeredQuestions = (questions || []).filter((question) => question?._answered);
    if (answeredQuestions.length < 4) return [];

    const breakdown = buildFinalPerformanceBreakdown(questions);
    const weakAreaLookup = new Map((breakdown?.weakAreas || []).map((area, index) => [
        area.key,
        { rank: index, missed: area.missed }
    ]));
    const targetCount = getBossRoundTargetCount(answeredQuestions.length);
    const seen = new Set();
    const picked = [];
    const addQuestion = (question) => {
        if (!question) return;
        const identity = normalizeQuizValue(`${question.prompt || ""}||${JSON.stringify(getCorrectAnswerValue(question))}`);
        if (!identity || seen.has(identity)) return;
        seen.add(identity);
        picked.push(cloneQuestionForGeneratedQuiz(question));
    };

    answeredQuestions
        .map((question) => ({
            question,
            score: getBossRoundCandidateScore(question, weakAreaLookup)
        }))
        .sort((a, b) => b.score - a.score || Number(a.question?._correct) - Number(b.question?._correct))
        .forEach(({ question }) => {
            if (picked.length < targetCount) addQuestion(question);
        });

    if (picked.length < targetCount) {
        buildWeakAreaRetakeQuestions(questions).forEach((question) => {
            if (picked.length < targetCount) addQuestion(question);
        });
    }

    return picked.slice(0, targetCount);
}

function getBossRoundTitle(questions) {
    const breakdown = buildFinalPerformanceBreakdown(questions);
    const focusLabel = (breakdown?.focusAreas || [])
        .map(getFinalFocusAreaLabel)
        .join(" + ");

    if (focusLabel) {
        return `Boss Round — ${focusLabel}`;
    }

    return "Boss Round — Toughest Misses";
}

function launchBossRound() {
    const bossQuestions = buildBossRoundQuestions(state.questions);
    if (!bossQuestions.length) {
        alert("Finish a few questions first so the boss round has something real to challenge you with.");
        return;
    }

    const payload = {
        id: "custom-quiz",
        title: getBossRoundTitle(state.questions),
        metadata: {
            generatedFrom: quizId || getHistoryQuizId(),
            sourceTitle: state.title || "Quiz",
            kind: "boss-round",
            createdAt: Date.now(),
            timerSeconds: getBossRoundTimerSeconds(bossQuestions.length),
            bossRoundSize: bossQuestions.length
        },
        questions: bossQuestions
    };

    localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
    location.href = "quiz.html?id=custom-quiz";
}

function launchWeakAreaRetake() {
    const retakeQuestions = buildWeakAreaRetakeQuestions(state.questions);
    if (!retakeQuestions.length) {
        alert("No weak-area retake is available yet for this attempt.");
        return;
    }

    const breakdown = buildFinalPerformanceBreakdown(state.questions);
    const focusLabels = (breakdown?.focusAreas || [])
        .map(getFinalFocusAreaLabel)
        .join(" + ");

    const payload = {
        id: "custom-quiz",
        title: focusLabels
            ? `Weak Area Retake — ${focusLabels}`
            : "Weak Area Retake",
        metadata: {
            generatedFrom: FINAL_EXAM_ID,
            kind: "weak-area-retake",
            createdAt: Date.now(),
            focusAreas: breakdown?.focusAreas || []
        },
        questions: retakeQuestions
    };

    localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
    location.href = "quiz.html?id=custom-quiz";
}

function incrementCounter(counter, key, step = 1) {
    const normalizedKey = normalizeDrugKey(key);
    if (!normalizedKey) return;
    counter[normalizedKey] = (Number(counter[normalizedKey]) || 0) + step;
}

function getCounterValue(counter, key) {
    return Number(counter?.[normalizeDrugKey(key)] || 0);
}

function tokenizeTherapeuticText(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token && token.length > 2 && !["and", "for", "the", "with", "agent", "drug"].includes(token));
}

function getDrugTherapeuticTokens(drug) {
    const tokenSet = new Set([
        ...tokenizeTherapeuticText(drug?.class),
        ...tokenizeTherapeuticText(drug?.category)
    ]);
    return [...tokenSet];
}

function getTherapeuticSimilarity(drugA, drugB) {
    const a = getDrugTherapeuticTokens(drugA);
    const b = getDrugTherapeuticTokens(drugB);
    if (!a.length || !b.length) return 0;

    const bSet = new Set(b);
    let overlap = 0;
    for (const token of a) {
        if (bSet.has(token)) overlap += 1;
    }

    return overlap / Math.max(a.length, b.length);
}

const BRAND_CLASS_NEARBY_CLASS_GROUPS = [
    ["atypical antipsychotic", "typical antipsychotic", "first generation antipsychotic", "second generation antipsychotic"],
    ["ace inhibitor", "angiotensin converting enzyme inhibitor", "arb", "angiotensin ii receptor blocker"],
    ["beta blocker", "calcium channel blocker"],
    ["proton pump inhibitor", "ppi", "h2 receptor antagonist", "h2ra", "histamine 2 receptor antagonist"],
    ["thiazide", "loop diuretic", "potassium sparing diuretic"],
    [
        "selective serotonin reuptake inhibitor",
        "ssri",
        "serotonin norepinephrine reuptake inhibitor",
        "snri",
        "dopamine norepinephrine reuptake inhibitor",
        "norepinephrine dopamine reuptake inhibitor",
        "dnri",
        "tricyclic antidepressant",
        "tca",
        "monoamine oxidase inhibitor",
        "maoi",
        "serotonin antagonist and reuptake inhibitor",
        "sari",
        "noradrenergic and specific serotonergic antidepressant",
        "nassa",
        "atypical antidepressant"
    ],
    ["basal insulin", "long acting insulin", "rapid acting insulin", "short acting insulin", "prandial insulin"]
];

const ANTIDEPRESSANT_CLASS_TERMS = [
    "selective serotonin reuptake inhibitor",
    "ssri",
    "serotonin norepinephrine reuptake inhibitor",
    "snri",
    "dopamine norepinephrine reuptake inhibitor",
    "norepinephrine dopamine reuptake inhibitor",
    "dnri",
    "tricyclic antidepressant",
    "tca",
    "monoamine oxidase inhibitor",
    "maoi",
    "serotonin antagonist and reuptake inhibitor",
    "sari",
    "noradrenergic and specific serotonergic antidepressant",
    "nassa",
    "atypical antidepressant",
    "antidepressant"
];

const medicationNameTokenCache = new WeakMap();

function normalizeClassForMatch(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isAntidepressantClassValue(value) {
    const classNorm = normalizeClassForMatch(value);
    if (!classNorm) return false;
    return ANTIDEPRESSANT_CLASS_TERMS.some(term => classNorm.includes(term));
}

function getAntidepressantClassCueScore(value) {
    const classNorm = normalizeClassForMatch(value);
    if (!classNorm) return 0;

    let score = 0;
    if (/\bssri\b/.test(classNorm) || classNorm.includes("selective serotonin reuptake inhibitor")) score += 0.36;
    if (/\bsnri\b/.test(classNorm) || classNorm.includes("serotonin norepinephrine reuptake inhibitor")) score += 0.33;
    if (/(\bdnri\b|dopamine norepinephrine reuptake inhibitor|norepinephrine dopamine reuptake inhibitor)/.test(classNorm)) score += 0.31;
    if (classNorm.includes("reuptake inhibitor")) score += 0.18;
    if (classNorm.includes("antidepressant")) score += 0.14;
    return score;
}

function getTokenOverlapScore(textA, textB) {
    const tokensA = new Set(tokenizeTherapeuticText(textA));
    const tokensB = new Set(tokenizeTherapeuticText(textB));
    if (!tokensA.size || !tokensB.size) return 0;

    let overlap = 0;
    for (const token of tokensA) {
        if (tokensB.has(token)) overlap += 1;
    }

    return overlap / Math.max(tokensA.size, tokensB.size);
}

function getUniqueTherapeuticTokens(value) {
    return [...new Set(tokenizeTherapeuticText(value))];
}

function areTherapeuticTokensSubset(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return false;
    const tokenSetB = new Set(tokensB);
    return tokensA.every(token => tokenSetB.has(token));
}

function getMedicationNameTokens(allPool) {
    if (!Array.isArray(allPool)) return new Set();

    const cached = medicationNameTokenCache.get(allPool);
    if (cached) return cached;

    const tokens = new Set();
    for (const item of allPool) {
        for (const rawValue of [item?.generic, item?.brand]) {
            const parts = String(rawValue ?? "")
                .split(/[\/,;+]/)
                .map(part => part.trim())
                .filter(Boolean);

            for (const part of parts) {
                for (const token of tokenizeTherapeuticText(part)) {
                    tokens.add(token);
                }
            }
        }
    }

    medicationNameTokenCache.set(allPool, tokens);
    return tokens;
}

// Prevent MCQs from offering broad/specific or name-swapped variants that still read as correct.
function isAmbiguousTherapeuticFieldMatch(targetValue, candidateValue, key, allPool = []) {
    const targetNorm = normalizeClassForMatch(targetValue);
    const candidateNorm = normalizeClassForMatch(candidateValue);
    if (!targetNorm || !candidateNorm) return false;
    if (targetNorm === candidateNorm) return true;
    if (targetNorm.includes(candidateNorm) || candidateNorm.includes(targetNorm)) return true;

    const targetTokens = getUniqueTherapeuticTokens(targetValue);
    const candidateTokens = getUniqueTherapeuticTokens(candidateValue);
    if (!targetTokens.length || !candidateTokens.length) return false;

    if (
        areTherapeuticTokensSubset(targetTokens, candidateTokens)
        || areTherapeuticTokensSubset(candidateTokens, targetTokens)
    ) {
        return true;
    }

    if (key !== "moa") return false;

    const overlap = getTokenOverlapScore(targetValue, candidateValue);
    if (overlap < 0.82) return false;

    const candidateTokenSet = new Set(candidateTokens);
    const targetTokenSet = new Set(targetTokens);
    const medicationNameTokens = getMedicationNameTokens(allPool);
    const targetDistinctiveTokens = targetTokens.filter(
        token => !candidateTokenSet.has(token) && !medicationNameTokens.has(token)
    );
    const candidateDistinctiveTokens = candidateTokens.filter(
        token => !targetTokenSet.has(token) && !medicationNameTokens.has(token)
    );

    return !targetDistinctiveTokens.length || !candidateDistinctiveTokens.length;
}

function isCombinationGenericName(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return false;

    if (/[+/]/.test(text)) return true;
    if (/\b(and|with)\b/.test(text)) return true;

    if (text.includes("-")) {
        const parts = text.split("-").map(part => part.trim()).filter(Boolean);
        if (parts.length >= 2) return true;
    }

    return false;
}

function isContraceptiveLikeText(value) {
    const text = normalizeClassForMatch(value);
    if (!text) return false;

    return /(contracept|ethinyl estradiol|norethindrone|levonorgestrel|norgestimate|desogestrel|drospirenone|etonogestrel|progestin)/.test(text);
}

function isContraceptiveCombinationDrug(drug) {
    if (!drug) return false;

    return isCombinationGenericName(drug?.generic) && (
        isContraceptiveLikeText(drug?.generic)
        || isContraceptiveLikeText(drug?.class)
        || isContraceptiveLikeText(drug?.category)
        || isContraceptiveLikeText(drug?.moa)
    );
}

function isAntiinfectiveLikeText(value) {
    const text = normalizeClassForMatch(value);
    if (!text) return false;

    return /(antiinfective|antimicrobial|antibiotic|antibacterial|antiviral|antifungal|penicillin|beta lactam|cephalosporin|macrolide|aminoglycoside|fluoroquinolone|tetracycline|glycopeptide|sulfonamide|carbapenem)/.test(text);
}

function getNearbyClassAlternatives(targetClass, allClasses) {
    const targetNorm = normalizeClassForMatch(targetClass);
    if (!targetNorm) return [];

    const classValues = [...new Set((allClasses || []).filter(Boolean))];
    const targetKey = normalizeDrugKey(targetClass);
    const nearby = [];
    const seen = new Set([targetKey]);
    const targetIsAntidepressant = isAntidepressantClassValue(targetClass);

    for (const group of BRAND_CLASS_NEARBY_CLASS_GROUPS) {
        if (!group.some(term => targetNorm.includes(term))) continue;

        for (const classValue of classValues) {
            const classKey = normalizeDrugKey(classValue);
            if (!classKey || seen.has(classKey)) continue;

            const classNorm = normalizeClassForMatch(classValue);
            if (!group.some(term => classNorm.includes(term))) continue;

            seen.add(classKey);
            nearby.push(classValue);
        }
    }

    // Keep antidepressant distractors inside adjacent antidepressant classes when possible.
    if (targetIsAntidepressant) {
        const antidepressantAdjacents = classValues
            .filter(classValue => {
                const classKey = normalizeDrugKey(classValue);
                return classKey && !seen.has(classKey) && isAntidepressantClassValue(classValue);
            })
            .map(classValue => ({
                classValue,
                score: getTokenOverlapScore(targetClass, classValue) + getAntidepressantClassCueScore(classValue)
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.classValue);

        for (const classValue of antidepressantAdjacents) {
            const classKey = normalizeDrugKey(classValue);
            if (!classKey || seen.has(classKey)) continue;
            seen.add(classKey);
            nearby.push(classValue);
        }
    }

    if (nearby.length) return nearby.slice(0, 8);

    return classValues
        .filter(classValue => normalizeDrugKey(classValue) !== targetKey)
        .map(classValue => ({
            classValue,
            score: getTokenOverlapScore(targetClass, classValue)
        }))
        .filter(item => item.score >= 0.34)
        .sort((a, b) => b.score - a.score)
        .map(item => item.classValue)
        .slice(0, 6);
}

function getPlausibleWrongClassesForDrug(drug, allPool, maxCount = 4) {
    const targetClass = String(drug?.class || "").trim();
    const targetClassKey = normalizeDrugKey(targetClass);
    if (!targetClassKey) return [];

    const targetCategoryKey = normalizeDrugKey(drug?.category);
    const targetIsAntidepressant = isAntidepressantClassValue(targetClass);
    const targetLab = Number(drug?.metadata?.lab || 0);
    const targetWeek = Number(drug?.metadata?.week || 0);
    const allClasses = [...new Set((allPool || []).map(item => item?.class).filter(Boolean))];
    const nearbySet = new Set(getNearbyClassAlternatives(targetClass, allClasses).map(normalizeDrugKey));
    const classScores = new Map();

    const setCandidate = (candidateClassKey, candidateClass, bucket, score, isNearby) => {
        const existing = classScores.get(candidateClassKey);
        if (!existing) {
            classScores.set(candidateClassKey, { className: candidateClass, bucket, score, isNearby });
            return;
        }

        if (bucket < existing.bucket || (bucket === existing.bucket && score > existing.score)) {
            classScores.set(candidateClassKey, { className: candidateClass, bucket, score, isNearby });
        }
    };

    for (const candidate of allPool || []) {
        if (!candidate || candidate === drug) continue;

        const candidateClass = String(candidate?.class || "").trim();
        const candidateClassKey = normalizeDrugKey(candidateClass);
        if (!candidateClassKey || candidateClassKey === targetClassKey) continue;
        if (isAmbiguousTherapeuticFieldMatch(targetClass, candidateClass, "class", allPool)) continue;

        const sameCategory = targetCategoryKey && normalizeDrugKey(candidate?.category) === targetCategoryKey;
        const similarity = getTherapeuticSimilarity(drug, candidate);
        const overlap = getTokenOverlapScore(targetClass, candidateClass);
        const isNearby = nearbySet.has(candidateClassKey);
        const candidateIsAntidepressant = isAntidepressantClassValue(candidateClass);

        let bucket = 5;
        if (isNearby && sameCategory) {
            bucket = 1;
        } else if (targetIsAntidepressant && candidateIsAntidepressant && isNearby) {
            bucket = 2;
        } else if (targetIsAntidepressant && candidateIsAntidepressant) {
            bucket = 2;
        } else if (sameCategory && (similarity >= 0.24 || overlap >= 0.24)) {
            bucket = 2;
        } else if (isNearby) {
            bucket = 3;
        } else if (similarity >= 0.32 || overlap >= 0.36) {
            bucket = 4;
        }

        let score = Math.random() * 0.18;
        if (sameCategory) score += 2.9;
        score += overlap * 3.7;
        score += similarity * 3.1;
        if (isNearby) score += 4.2;
        if (targetIsAntidepressant && candidateIsAntidepressant) {
            score += 2.6;
            score += getAntidepressantClassCueScore(candidateClass) * 1.4;
        }

        if (targetLab && Number(candidate?.metadata?.lab || 0) === targetLab) score += 0.28;
        if (targetWeek) {
            const weekDelta = Math.abs(targetWeek - Number(candidate?.metadata?.week || 0));
            score += Math.max(0, 0.9 - (weekDelta * 0.12));
        }

        setCandidate(candidateClassKey, candidateClass, bucket, score, isNearby);
    }

    let ranked = [...classScores.values()]
        .sort((a, b) => {
            if (a.bucket !== b.bucket) return a.bucket - b.bucket;
            if (a.isNearby !== b.isNearby) return Number(b.isNearby) - Number(a.isNearby);
            return b.score - a.score;
        });

    const plausibleOnly = ranked.filter(item => item.bucket <= 4);
    if (plausibleOnly.length >= maxCount) {
        ranked = plausibleOnly;
    }

    return ranked.slice(0, maxCount).map(item => item.className);
}

function getPlausibleWrongCategoriesForDrug(drug, allPool, maxCount = 4) {
    const targetCategory = String(drug?.category || "").trim();
    const targetCategoryKey = normalizeDrugKey(targetCategory);
    if (!targetCategoryKey) return [];

    const targetClassKey = normalizeDrugKey(drug?.class);
    const targetWeek = Number(drug?.metadata?.week || 0);
    const targetLab = Number(drug?.metadata?.lab || 0);
    const categoryScores = new Map();

    const setCandidate = (candidateCategoryKey, candidateCategory, bucket, score) => {
        const existing = categoryScores.get(candidateCategoryKey);
        if (!existing) {
            categoryScores.set(candidateCategoryKey, { categoryName: candidateCategory, bucket, score });
            return;
        }

        if (bucket < existing.bucket || (bucket === existing.bucket && score > existing.score)) {
            categoryScores.set(candidateCategoryKey, { categoryName: candidateCategory, bucket, score });
        }
    };

    for (const candidate of allPool || []) {
        if (!candidate || candidate === drug) continue;

        const candidateCategory = String(candidate?.category || "").trim();
        const candidateCategoryKey = normalizeDrugKey(candidateCategory);
        if (!candidateCategoryKey || candidateCategoryKey === targetCategoryKey) continue;
        if (isAmbiguousTherapeuticFieldMatch(targetCategory, candidateCategory, "category", allPool)) continue;

        const sameClass = targetClassKey && normalizeDrugKey(candidate?.class) === targetClassKey;
        const similarity = getTherapeuticSimilarity(drug, candidate);
        const overlap = getTokenOverlapScore(targetCategory, candidateCategory);

        let bucket = 5;
        if (sameClass && (similarity >= 0.22 || overlap >= 0.22)) {
            bucket = 1;
        } else if (sameClass) {
            bucket = 2;
        } else if (similarity >= 0.28 || overlap >= 0.28) {
            bucket = 3;
        } else if (targetClassKey && normalizeDrugKey(candidate?.class) && getTokenOverlapScore(drug?.class, candidate?.class) >= 0.3) {
            bucket = 4;
        }

        let score = Math.random() * 0.16;
        if (sameClass) score += 3.1;
        score += overlap * 3.3;
        score += similarity * 4.4;

        if (targetLab && Number(candidate?.metadata?.lab || 0) === targetLab) score += 0.28;
        if (targetWeek) {
            const weekDelta = Math.abs(targetWeek - Number(candidate?.metadata?.week || 0));
            score += Math.max(0, 0.9 - (weekDelta * 0.12));
        }

        setCandidate(candidateCategoryKey, candidateCategory, bucket, score);
    }

    let ranked = [...categoryScores.values()]
        .sort((a, b) => {
            if (a.bucket !== b.bucket) return a.bucket - b.bucket;
            return b.score - a.score;
        });

    const plausibleOnly = ranked.filter(item => item.bucket <= 4);
    if (plausibleOnly.length >= maxCount) {
        ranked = plausibleOnly;
    }

    return ranked.slice(0, maxCount).map(item => item.categoryName);
}

function pickRealBrandClassDistractors(drug, allPool, signals, count = 2, targetBrand = "", options = {}) {
    const targetClass = String(drug?.class || "").trim();
    const targetClassKey = normalizeDrugKey(targetClass);
    const targetCategoryKey = normalizeDrugKey(drug?.category);
    const targetBrandKey = normalizeDrugKey(targetBrand);
    const targetIsAntidepressant = isAntidepressantClassValue(targetClass);
    const nearbySet = new Set(
        getNearbyClassAlternatives(
            targetClass,
            [...new Set((allPool || []).map(item => item?.class).filter(Boolean))]
        ).map(normalizeDrugKey)
    );

    const ranked = [];
    for (const candidate of allPool || []) {
        if (!candidate || candidate === drug || !candidate?.class || !candidate?.generic) continue;
        if (normalizeDrugKey(candidate?.generic) === normalizeDrugKey(drug?.generic)) continue;

        const candidateBrand = pickBrandVariantForFinal(candidate, signals, options) || splitBrandNames(candidate?.brand)[0];
        if (!candidateBrand) continue;
        if (targetBrandKey && normalizeDrugKey(candidateBrand) === targetBrandKey) continue;

        const candidateClass = String(candidate.class).trim();
        const candidateClassKey = normalizeDrugKey(candidateClass);
        const sameCategory = targetCategoryKey && normalizeDrugKey(candidate?.category) === targetCategoryKey;
        const similarity = getTherapeuticSimilarity(drug, candidate);
        const overlap = getTokenOverlapScore(targetClass, candidateClass);
        const isNearby = nearbySet.has(candidateClassKey);
        const sameClass = candidateClassKey === targetClassKey;
        const candidateIsAntidepressant = isAntidepressantClassValue(candidateClass);

        let bucket = 5;
        if (sameClass && sameCategory) {
            bucket = 1;
        } else if (sameClass) {
            bucket = 2;
        } else if (isNearby && (sameCategory || (targetIsAntidepressant && candidateIsAntidepressant))) {
            bucket = 2;
        } else if (sameCategory && (similarity >= 0.2 || overlap >= 0.2)) {
            bucket = 3;
        } else if (isNearby || similarity >= 0.28 || overlap >= 0.28) {
            bucket = 4;
        }

        let score = Math.random() * 0.16;
        if (sameCategory) score += 2.1;
        if (sameClass) score += 2.6;
        score += similarity * 4.6;
        score += overlap * 2.7;
        if (isNearby) score += 1.8;
        if (targetIsAntidepressant && candidateIsAntidepressant) {
            score += 2.2;
            score += getAntidepressantClassCueScore(candidateClass) * 1.1;
        }

        ranked.push({
            brand: candidateBrand,
            className: candidateClass,
            brandKey: normalizeDrugKey(candidateBrand),
            classKey: candidateClassKey,
            pairKey: normalizeDrugKey(`${candidateBrand} / ${candidateClass}`),
            bucket,
            isNearby,
            score
        });
    }

    ranked.sort((a, b) => {
        if (a.bucket !== b.bucket) return a.bucket - b.bucket;
        if (a.isNearby !== b.isNearby) return Number(b.isNearby) - Number(a.isNearby);
        return b.score - a.score;
    });

    const plausibleRanked = ranked.filter(item => item.bucket <= 4);
    const rankedPool = plausibleRanked.length >= count ? plausibleRanked : ranked;

    const usedPairs = new Set();
    const usedBrands = new Set();
    const usedClasses = new Set();
    const picks = [];

    for (const item of rankedPool) {
        if (usedPairs.has(item.pairKey)) continue;
        if (usedBrands.has(item.brandKey) || usedClasses.has(item.classKey)) continue;

        usedPairs.add(item.pairKey);
        usedBrands.add(item.brandKey);
        usedClasses.add(item.classKey);
        picks.push(item);
        if (picks.length >= count) break;
    }

    for (const item of rankedPool) {
        if (picks.length >= count) break;
        if (usedPairs.has(item.pairKey)) continue;
        if (usedBrands.has(item.brandKey) && usedClasses.has(item.classKey)) continue;

        usedPairs.add(item.pairKey);
        usedBrands.add(item.brandKey);
        usedClasses.add(item.classKey);
        picks.push(item);
    }

    return picks;
}

function pickRealBrandCategoryDistractors(drug, allPool, signals, count = 2, targetBrand = "", options = {}) {
    const targetCategory = String(drug?.category || "").trim();
    const targetCategoryKey = normalizeDrugKey(targetCategory);
    const targetClassKey = normalizeDrugKey(drug?.class);
    const targetBrandKey = normalizeDrugKey(targetBrand);

    const ranked = [];
    for (const candidate of allPool || []) {
        if (!candidate || candidate === drug || !candidate?.category || !candidate?.generic) continue;
        if (normalizeDrugKey(candidate?.generic) === normalizeDrugKey(drug?.generic)) continue;

        const candidateBrand = pickBrandVariantForFinal(candidate, signals, options) || splitBrandNames(candidate?.brand)[0];
        if (!candidateBrand) continue;
        if (targetBrandKey && normalizeDrugKey(candidateBrand) === targetBrandKey) continue;

        const candidateCategory = String(candidate.category).trim();
        const candidateCategoryKey = normalizeDrugKey(candidateCategory);
        const sameCategory = candidateCategoryKey === targetCategoryKey;
        const sameClass = targetClassKey && normalizeDrugKey(candidate?.class) === targetClassKey;
        const similarity = getTherapeuticSimilarity(drug, candidate);
        const overlap = getTokenOverlapScore(targetCategory, candidateCategory);

        let bucket = 5;
        if (sameCategory && sameClass) {
            bucket = 1;
        } else if (sameCategory) {
            bucket = 2;
        } else if (sameClass) {
            bucket = 3;
        } else if (similarity >= 0.28 || overlap >= 0.24) {
            bucket = 4;
        }

        let score = Math.random() * 0.16;
        if (sameCategory) score += 2.7;
        if (sameClass) score += 2.1;
        score += similarity * 4.8;
        score += overlap * 2.7;

        ranked.push({
            brand: candidateBrand,
            categoryName: candidateCategory,
            brandKey: normalizeDrugKey(candidateBrand),
            categoryKey: candidateCategoryKey,
            pairKey: normalizeDrugKey(`${candidateBrand} / ${candidateCategory}`),
            sameCategory,
            bucket,
            score
        });
    }

    ranked.sort((a, b) => {
        if (a.bucket !== b.bucket) return a.bucket - b.bucket;
        return b.score - a.score;
    });

    const plausibleRanked = ranked.filter(item => item.bucket <= 4);
    const preferredWithoutSameCategory = plausibleRanked.filter(item => !item.sameCategory);
    const fallbackWithoutSameCategory = ranked.filter(item => !item.sameCategory);
    const rankedPool = preferredWithoutSameCategory.length >= count
        ? preferredWithoutSameCategory
        : fallbackWithoutSameCategory.length >= count
        ? fallbackWithoutSameCategory
        : plausibleRanked.length >= count
        ? plausibleRanked
        : ranked;

    const usedPairs = new Set();
    const usedBrands = new Set();
    const usedCategories = new Set();
    const picks = [];

    for (const item of rankedPool) {
        if (usedPairs.has(item.pairKey)) continue;
        if (usedBrands.has(item.brandKey) || usedCategories.has(item.categoryKey)) continue;

        usedPairs.add(item.pairKey);
        usedBrands.add(item.brandKey);
        usedCategories.add(item.categoryKey);
        picks.push(item);
        if (picks.length >= count) break;
    }

    for (const item of rankedPool) {
        if (picks.length >= count) break;
        if (usedPairs.has(item.pairKey)) continue;
        if (usedBrands.has(item.brandKey) && usedCategories.has(item.categoryKey)) continue;

        usedPairs.add(item.pairKey);
        usedBrands.add(item.brandKey);
        usedCategories.add(item.categoryKey);
        picks.push(item);
    }

    return picks;
}

function buildTopDrugsBrandClassQuestion(drug, allPool, options = {}) {
    if (!drug?.class) return null;

    const signals = options?.signals || loadTopDrugsSignals();
    const targetBrand = options?.targetBrand || pickBrandVariantForFinal(drug, signals, options) || splitBrandNames(drug?.brand)[0];
    if (!targetBrand) return null;

    const wrongClasses = getPlausibleWrongClassesForDrug(drug, allPool, 6);
    if (!wrongClasses.length) return null;

    const nearbySet = new Set(
        getNearbyClassAlternatives(
            drug?.class,
            [...new Set((allPool || []).map(item => item?.class).filter(Boolean))]
        ).map(normalizeDrugKey)
    );

    const nearbyWrongClasses = wrongClasses.filter(className => nearbySet.has(normalizeDrugKey(className)));
    const plausibleWrongClasses = [
        ...nearbyWrongClasses,
        ...wrongClasses.filter(className => !nearbySet.has(normalizeDrugKey(className)))
    ];

    const primaryWrongClass = plausibleWrongClasses[0];
    const primaryWrongKey = normalizeDrugKey(primaryWrongClass || "");
    const secondaryNearbyWrongClass = nearbyWrongClasses.find(className => normalizeDrugKey(className) !== primaryWrongKey);
    const secondaryWrongClass = secondaryNearbyWrongClass
        || plausibleWrongClasses.find(className => normalizeDrugKey(className) !== primaryWrongKey);

    const decoyPairs = pickRealBrandClassDistractors(drug, allPool, signals, 4, targetBrand, options);
    if (!primaryWrongClass || !decoyPairs.length) return null;

    const optionCandidates = [];
    const seen = new Set();
    const patternCounts = {
        sameBrandWrong: 0,
        differentBrandReal: 0
    };

    const pushOption = (value, pattern = "") => {
        if (pattern && patternCounts[pattern] >= 2) return;

        const normalized = normalizeDrugKey(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);

        if (pattern) {
            patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
        }

        optionCandidates.push(value);
    };

    const correct = `${targetBrand} / ${drug.class}`;
    pushOption(correct);
    pushOption(`${targetBrand} / ${primaryWrongClass}`, "sameBrandWrong");
    pushOption(`${decoyPairs[0].brand} / ${decoyPairs[0].className}`, "differentBrandReal");

    if (secondaryNearbyWrongClass) {
        pushOption(`${targetBrand} / ${secondaryNearbyWrongClass}`, "sameBrandWrong");
    }

    for (const decoy of decoyPairs.slice(1)) {
        if (optionCandidates.length >= 4) break;
        pushOption(`${decoy.brand} / ${decoy.className}`, "differentBrandReal");
    }

    if (optionCandidates.length < 4 && secondaryWrongClass) {
        pushOption(`${targetBrand} / ${secondaryWrongClass}`, "sameBrandWrong");
    }

    for (const className of plausibleWrongClasses) {
        if (optionCandidates.length >= 4) break;
        if (normalizeDrugKey(className) === primaryWrongKey) continue;
        pushOption(`${targetBrand} / ${className}`, "sameBrandWrong");
    }

    for (const decoy of decoyPairs) {
        if (optionCandidates.length >= 4) break;
        pushOption(`${decoy.brand} / ${decoy.className}`, "differentBrandReal");
    }

    if (optionCandidates.length < 4) return null;

    return {
        type: "mcq",
        prompt: `Identify <b>Brand & Class</b> for <b>${drug.generic}</b>?`,
        choices: shuffled(optionCandidates.slice(0, 4)),
        answer: correct,
        drugRef: drug,
        _brandVariant: targetBrand,
        _focusFieldKey: "class",
        _focusFieldValue: drug.class
    };
}

function buildTopDrugsBrandCategoryQuestion(drug, allPool, options = {}) {
    if (!drug?.category) return null;

    const signals = options?.signals || loadTopDrugsSignals();
    const targetBrand = options?.targetBrand || pickBrandVariantForFinal(drug, signals, options) || splitBrandNames(drug?.brand)[0];
    if (!targetBrand) return null;

    const wrongCategories = getPlausibleWrongCategoriesForDrug(drug, allPool, 6);
    if (!wrongCategories.length) return null;

    const primaryWrongCategory = wrongCategories[0];
    const primaryWrongKey = normalizeDrugKey(primaryWrongCategory || "");
    const secondaryWrongCategory = wrongCategories.find(categoryName => normalizeDrugKey(categoryName) !== primaryWrongKey);

    const decoyPairs = pickRealBrandCategoryDistractors(drug, allPool, signals, 4, targetBrand, options);
    if (!primaryWrongCategory || !decoyPairs.length) return null;

    const optionCandidates = [];
    const seen = new Set();
    const patternCounts = {
        sameBrandWrong: 0,
        differentBrandReal: 0
    };

    const pushOption = (value, pattern = "") => {
        if (pattern && patternCounts[pattern] >= 2) return;

        const normalized = normalizeDrugKey(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);

        if (pattern) {
            patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
        }

        optionCandidates.push(value);
    };

    const correct = `${targetBrand} / ${drug.category}`;
    pushOption(correct);
    pushOption(`${targetBrand} / ${primaryWrongCategory}`, "sameBrandWrong");
    pushOption(`${decoyPairs[0].brand} / ${decoyPairs[0].categoryName}`, "differentBrandReal");

    if (secondaryWrongCategory) {
        pushOption(`${targetBrand} / ${secondaryWrongCategory}`, "sameBrandWrong");
    }

    for (const decoy of decoyPairs.slice(1)) {
        if (optionCandidates.length >= 4) break;
        pushOption(`${decoy.brand} / ${decoy.categoryName}`, "differentBrandReal");
    }

    for (const categoryName of wrongCategories) {
        if (optionCandidates.length >= 4) break;
        if (normalizeDrugKey(categoryName) === primaryWrongKey) continue;
        pushOption(`${targetBrand} / ${categoryName}`, "sameBrandWrong");
    }

    for (const decoy of decoyPairs) {
        if (optionCandidates.length >= 4) break;
        pushOption(`${decoy.brand} / ${decoy.categoryName}`, "differentBrandReal");
    }

    if (optionCandidates.length < 4) return null;

    return {
        type: "mcq",
        prompt: `Which exact <b>Brand / Category</b> pair belongs to <b>${drug.generic}</b>?`,
        choices: shuffled(optionCandidates.slice(0, 4)),
        answer: correct,
        drugRef: drug,
        _brandVariant: targetBrand,
        _focusFieldKey: "category",
        _focusFieldValue: drug.category
    };
}

function getWeaknessScore(seenCount, missedCount) {
    const seen = Number(seenCount || 0);
    const missed = Number(missedCount || 0);
    if (seen <= 0 && missed <= 0) return 0;

    const missRate = missed / Math.max(1, seen);
    return Math.min(4, (missed * 0.35) + (missRate * 1.25) - (seen * 0.02));
}

function getDrugWeaknessScore(drug, signals) {
    const genericKey = normalizeDrugKey(drug?.generic);
    const classKey = normalizeDrugKey(drug?.class);
    const categoryKey = normalizeDrugKey(drug?.category);

    return (
        getWeaknessScore(getCounterValue(signals.seenDrugs, genericKey), getCounterValue(signals.missedDrugs, genericKey)) * 0.7 +
        getWeaknessScore(getCounterValue(signals.seenClasses, classKey), getCounterValue(signals.missedClasses, classKey)) * 0.45 +
        getWeaknessScore(getCounterValue(signals.seenCategories, categoryKey), getCounterValue(signals.missedCategories, categoryKey)) * 0.45
    );
}

function getBrandWeaknessScore(drug, signals) {
    const brands = splitBrandNames(drug?.brand);
    if (!brands.length) return 0;

    let maxScore = 0;
    for (const brand of brands) {
        const seen = getCounterValue(signals.seenBrands, brand);
        const missed = getCounterValue(signals.missedBrands, brand);
        const underPracticedBoost = Math.max(0, 3 - seen) * 0.12;
        const score = getWeaknessScore(seen, missed) + underPracticedBoost;
        if (score > maxScore) maxScore = score;
    }

    return maxScore;
}

function getFinalAdaptiveFocusScores(drug, signals) {
    const genericKey = normalizeDrugKey(drug?.generic);
    const classKey = normalizeDrugKey(drug?.class);
    const categoryKey = normalizeDrugKey(drug?.category);

    const generic = getWeaknessScore(getCounterValue(signals.seenDrugs, genericKey), getCounterValue(signals.missedDrugs, genericKey));
    const classScore = getWeaknessScore(getCounterValue(signals.seenClasses, classKey), getCounterValue(signals.missedClasses, classKey));
    const categoryScore = getWeaknessScore(getCounterValue(signals.seenCategories, categoryKey), getCounterValue(signals.missedCategories, categoryKey));
    const brand = getBrandWeaknessScore(drug, signals);
    const moa = drug?.moa ? (generic * 0.68) + (classScore * 0.24) + (categoryScore * 0.08) : 0;

    return {
        brand,
        class: classScore,
        category: categoryScore,
        moa,
        generic
    };
}

function getDominantFinalAdaptiveFocusKey(drug, signals) {
    const focusScores = getFinalAdaptiveFocusScores(drug, signals);
    return Object.entries(focusScores)
        .sort((a, b) => b[1] - a[1])
        .find(([, score]) => score > 0)?.[0] || "";
}

function buildRecentFinalUsageContext(runs) {
    const now = Date.now();
    const recentGenericUsage = {};
    const recentFamilyUsageByGeneric = {};
    const recentBrandUsageByGeneric = {};
    let runCount = 0;
    let legacyRecoveredCount = 0;

    for (const run of runs) {
        const timestamp = Number(run?.timestamp || 0);
        if (!timestamp) continue;

        const ageMs = now - timestamp;
        if (ageMs < 0 || ageMs > FINAL_RECENT_RUN_LOOKBACK_MS) continue;

        const recencyWeight = Math.max(0.2, 1 - (ageMs / FINAL_RECENT_RUN_LOOKBACK_MS));
        runCount += 1;
        if (run?.legacyRecovered) legacyRecoveredCount += 1;

        for (const genericKey of run.generics || []) {
            incrementCounter(recentGenericUsage, genericKey, recencyWeight);
        }

        for (const [genericKeyRaw, familyRaw] of Object.entries(run.familiesByGeneric || {})) {
            const genericKey = normalizeDrugKey(genericKeyRaw);
            const family = String(familyRaw || "").trim();
            if (!genericKey || !family) continue;

            if (!recentFamilyUsageByGeneric[genericKey]) recentFamilyUsageByGeneric[genericKey] = {};
            recentFamilyUsageByGeneric[genericKey][family] = (Number(recentFamilyUsageByGeneric[genericKey][family]) || 0) + recencyWeight;
        }

        for (const [genericKeyRaw, brandRaw] of Object.entries(run.brandsByGeneric || {})) {
            const genericKey = normalizeDrugKey(genericKeyRaw);
            const brandKey = normalizeDrugKey(brandRaw);
            if (!genericKey || !brandKey) continue;

            if (!recentBrandUsageByGeneric[genericKey]) recentBrandUsageByGeneric[genericKey] = {};
            recentBrandUsageByGeneric[genericKey][brandKey] = (Number(recentBrandUsageByGeneric[genericKey][brandKey]) || 0) + recencyWeight;
        }
    }

    return { recentGenericUsage, recentFamilyUsageByGeneric, recentBrandUsageByGeneric, runCount, legacyRecoveredCount };
}

function createFinalSelectionState() {
    return {
        selected: [],
        counts: { 1: 0, 2: 0 },
        seenGenerics: new Set(),
        classCounts: {},
        categoryCounts: {}
    };
}

function addDrugToFinalSelection(drug, state, targetCounts) {
    const lab = Number(drug?.metadata?.lab);
    const genericKey = normalizeDrugKey(drug?.generic);
    if (![1, 2].includes(lab) || !genericKey) return false;
    if (state.counts[lab] >= targetCounts[lab] || state.seenGenerics.has(genericKey)) return false;

    state.seenGenerics.add(genericKey);
    state.selected.push(drug);
    state.counts[lab] += 1;

    incrementCounter(state.classCounts, drug?.class);
    incrementCounter(state.categoryCounts, drug?.category);
    return true;
}

function scoreFinalDrugCandidate(drug, state, context) {
    const signals = context.signals;
    const genericKey = normalizeDrugKey(drug?.generic);
    const classKey = normalizeDrugKey(drug?.class);
    const categoryKey = normalizeDrugKey(drug?.category);
    const focusScores = getFinalAdaptiveFocusScores(drug, signals);
    const adaptivePeak = Math.max(focusScores.brand, focusScores.class, focusScores.category, focusScores.moa, focusScores.generic, 0);

    let score = Math.random() * 0.18;
    score += getDrugWeaknessScore(drug, signals) * 0.35;
    score += getBrandWeaknessScore(drug, signals) * 0.12;
    score += adaptivePeak * 0.26;

    const recentPenaltyScale = Math.max(0.45, 0.95 - (adaptivePeak * 0.1));
    const recentGenericPenalty = Number(context.recentGenericUsage[genericKey] || 0) * recentPenaltyScale;
    score -= recentGenericPenalty;

    const classCount = Number(state.classCounts[classKey] || 0);
    const categoryCount = Number(state.categoryCounts[categoryKey] || 0);
    score += Math.max(0, 2 - classCount) * 0.28;
    score += Math.max(0, 2 - categoryCount) * 0.24;
    if (classCount > 3) score -= (classCount - 3) * 0.55;
    if (categoryCount > 4) score -= (categoryCount - 4) * 0.45;

    return score;
}

function pickBestFinalDrugFromCandidates(candidates, state, context) {
    if (!candidates.length) return null;

    const ranked = candidates
        .map(drug => ({ drug, score: scoreFinalDrugCandidate(drug, state, context) }))
        .sort((a, b) => b.score - a.score);

    const topSlice = ranked.slice(0, Math.min(5, ranked.length));
    if (!topSlice.length) return ranked[0]?.drug || null;

    const secondScore = Number(topSlice[1]?.score || 0);
    if (topSlice[0].score >= secondScore + 0.9) {
        return topSlice[0].drug;
    }

    const floorScore = topSlice[topSlice.length - 1].score;
    const weightedPool = topSlice.map((entry, index) => ({
        drug: entry.drug,
        weight: Math.max(0.08, (entry.score - floorScore) + 0.32 + ((topSlice.length - index) * 0.02))
    }));
    const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const entry of weightedPool) {
        roll -= entry.weight;
        if (roll <= 0) return entry.drug;
    }

    return weightedPool[0]?.drug || ranked[0]?.drug || null;
}

function selectFromFinalBucket({ bucket, lab, limit, respectBucketLimit, state, targetCounts, context }) {
    let pickedInBucket = 0;

    while (state.counts[lab] < targetCounts[lab]) {
        if (respectBucketLimit && pickedInBucket >= limit) break;

        const available = bucket.filter(drug => {
            const genericKey = normalizeDrugKey(drug?.generic);
            return genericKey && !state.seenGenerics.has(genericKey);
        });
        if (!available.length) break;

        const chosen = pickBestFinalDrugFromCandidates(available, state, context);
        if (!chosen) break;
        if (!addDrugToFinalSelection(chosen, state, targetCounts)) break;
        pickedInBucket += 1;
    }
}

function fillRemainingFinalLab(pool, lab, state, targetCounts, context) {
    while (state.counts[lab] < targetCounts[lab]) {
        const available = pool.filter(drug => Number(drug?.metadata?.lab) === lab)
            .filter(drug => {
                const genericKey = normalizeDrugKey(drug?.generic);
                return genericKey && !state.seenGenerics.has(genericKey);
            });

        if (!available.length) break;

        const chosen = pickBestFinalDrugFromCandidates(available, state, context);
        if (!chosen || !addDrugToFinalSelection(chosen, state, targetCounts)) break;
    }
}

function selectFinalExamDrugs(pool) {
    const byLabWeek = new Map();

    for (const drug of pool) {
        const lab = Number(drug?.metadata?.lab);
        const week = Number(drug?.metadata?.week);
        if (![1, 2].includes(lab) || !week) continue;

        const key = `${lab}-${week}`;
        if (!byLabWeek.has(key)) byLabWeek.set(key, []);
        byLabWeek.get(key).push(drug);
    }

    const targetCounts = { 1: 44, 2: 66 };
    const state = createFinalSelectionState();
    const signals = loadTopDrugsSignals();
    const recentRuns = loadRecentFinalRuns();
    const recentUsageContext = buildRecentFinalUsageContext(recentRuns);
    const context = {
        signals,
        recentGenericUsage: recentUsageContext.recentGenericUsage,
        recentFamilyUsageByGeneric: recentUsageContext.recentFamilyUsageByGeneric
    };

    const bucketPlan = [];
    for (let week = 1; week <= 10; week++) {
        bucketPlan.push({ bucket: shuffled(byLabWeek.get(`1-${week}`) || []), lab: 1, limit: 4 });
        bucketPlan.push({ bucket: shuffled(byLabWeek.get(`2-${week}`) || []), lab: 2, limit: 4 });
    }
    bucketPlan.push({ bucket: shuffled(byLabWeek.get("1-11") || []), lab: 1, limit: 4 });
    bucketPlan.push({ bucket: shuffled(byLabWeek.get("2-11") || []), lab: 2, limit: 3 });

    for (const step of bucketPlan) {
        selectFromFinalBucket({
            ...step,
            respectBucketLimit: true,
            state,
            targetCounts,
            context
        });
    }

    if (state.counts[1] < targetCounts[1] || state.counts[2] < targetCounts[2]) {
        for (const step of bucketPlan) {
            selectFromFinalBucket({
                ...step,
                respectBucketLimit: false,
                state,
                targetCounts,
                context
            });
        }
    }

    fillRemainingFinalLab(pool, 1, state, targetCounts, context);
    fillRemainingFinalLab(pool, 2, state, targetCounts, context);

    if (state.selected.length !== FINAL_EXAM_TOTAL || state.counts[1] !== targetCounts[1] || state.counts[2] !== targetCounts[2]) {
        throw new Error(`Final exam generator expected 44 Lab 1 and 66 Lab 2 unique drugs, got ${state.counts[1]} and ${state.counts[2]}.`);
    }

    return state.selected;
}

// --- SMART HINT SYSTEM ---
function showHint() {
    const q = state.questions[state.index];
    if (!q || q._answered) return;
    if (isRestrictedAttemptMode()) {
        alert(isBossRoundMode()
            ? "Boss Round disables hints for this challenge."
            : "True Exam Mode disables hints for this attempt.");
        return;
    }

    const isCalculationHint = q.questionKind === "calculation"
        || (q.type === "short" && (q.formula || q.units || q.tolerance !== undefined));
    if (isCalculationHint) {
        const formula = String(q.formula || "").trim();
        const units = String(q.units || "").trim();
        const hintLines = [];
        if (formula) hintLines.push(`Formula: ${formula}`);
        if (units) hintLines.push(`Units: ${units}`);
        if (!hintLines.length) {
            alert("No hint available for this question.");
            return;
        }

        q._hintUsed = true;
        state.hintsUsed++;
        queueQuizProgressSave(100);
        alert(hintLines.join("\n"));
        return;
    }

    if (q._mode === "concept" || q.conceptRef) {
        const conceptHint = buildConceptHintText(q);
        if (!conceptHint) {
            alert("💡 No hint available for this question.");
            return;
        }

        q._hintUsed = true;
        state.hintsUsed++;
        queueQuizProgressSave(100);
        alert(conceptHint);
        return;
    }

    const drug = q.drugRef;
    if (!drug) {
        alert("💡 No hint available for this question.");
        return;
    }
    
    let hintText = "";
    const prompt = q.prompt.toLowerCase();
    const targetedBrand = q._brandVariant || splitBrandNames(drug?.brand)[0] || String(drug?.brand || "").split(/[,/;]/)[0]?.trim() || "?";
    
    // Determine hint based on question type
    if (prompt.includes("brand")) {
        // Asking for Brand → Show first letter
        hintText = `💡 First letter: "${targetedBrand.charAt(0).toUpperCase()}..."\n📦 Category: ${drug.category || "N/A"}`;
    } else if (prompt.includes("generic")) {
        // Asking for Generic → Show brand as hint
        hintText = `💡 Brand: ${targetedBrand || "N/A"}\n📦 Category: ${drug.category || "N/A"}`;
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
    queueQuizProgressSave(100);
    
    alert(hintText);
}

// --- REVEAL ANSWER (Give Up) ---
function revealAnswer() {
    const q = state.questions[state.index];
    if (!q || q._answered) return;
    if (isRestrictedAttemptMode()) {
        alert(isBossRoundMode()
            ? "Boss Round disables answer reveals for this challenge."
            : "True Exam Mode disables answer reveals for this attempt.");
        return;
    }
    scoreCurrent("Revealed");
}

function normalizeStorageKeySegment(value, fallback = "na") {
    const normalized = String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

    return normalized || fallback;
}

function buildGeneratedAttemptIdentity(data) {
    const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
    const questionCount = Array.isArray(data?.questions)
        ? data.questions.length
        : Array.isArray(data?.items)
        ? data.items.length
        : 0;

    const quizSegment = normalizeStorageKeySegment(quizId || data?.id || "generated");
    const kindSegment = normalizeStorageKeySegment(metadata.kind || (state.bossMode ? "boss-round" : "generated"));
    const sourceSegment = normalizeStorageKeySegment(metadata.generatedFrom || metadata.sourceQuizId || metadata.sourceTitle || "");
    const generatorSegment = normalizeStorageKeySegment(metadata.generator || "");
    const playlistSegment = normalizeStorageKeySegment(metadata.playlistKey || "");
    const focusSegment = normalizeStorageKeySegment(metadata.promptFocus || "");
    const titleSegment = normalizeStorageKeySegment(data?.title || "");

    const parts = [quizSegment, kindSegment];
    if (sourceSegment !== "na") parts.push(`from-${sourceSegment}`);
    if (generatorSegment !== "na") parts.push(`gen-${generatorSegment}`);
    if (playlistSegment !== "na") parts.push(`list-${playlistSegment}`);
    if (focusSegment !== "na") parts.push(`focus-${focusSegment}`);
    if (questionCount > 0) parts.push(`q${questionCount}`);
    if (parts.length <= 2 && titleSegment !== "na") parts.push(titleSegment);

    const identity = `generated-${parts.join("-")}`;
    const modeLabel = state.bossMode
        ? "boss"
        : kindSegment === "weak-area-playlist"
        ? "playlist"
        : modeParam;

    return {
        historyQuizId: identity,
        modeLabel,
        scoreStorageKey: `pharmlet.${identity}.${modeLabel}`
    };
}

function getHistoryQuizId() {
    if (state.generatedAttemptIdentity?.historyQuizId) {
        return state.generatedAttemptIdentity.historyQuizId;
    }

    if (quizId) return quizId;
    if (weekParam) return `lab-${labParam}-week-${weekParam}`;
    if (weeksParam) return `lab-${labParam}-weeks-${weeksParam}`;
    if (tagParam) return params.has("lab")
        ? `lab-${labParam}-tag-${tagParam.toLowerCase()}`
        : `tag-${tagParam.toLowerCase()}`;
    return "quiz";
}

function getScoreStorageKey() {
    if (state.generatedAttemptIdentity?.scoreStorageKey) {
        return state.generatedAttemptIdentity.scoreStorageKey;
    }

    const configuredModeLabel = getConfiguredModeStorageLabel() || modeParam;

    if (state.bossMode && quizId) {
        return `pharmlet.${quizId}.boss`;
    }

    if (weekParam) {
        return `pharmlet.lab${labParam}.week${weekParam}.easy`;
    }

    if (weeksParam) {
        return `pharmlet.lab${labParam}.weeks${weeksParam}.easy`;
    }

    if (tagParam) {
        return params.has("lab")
            ? `pharmlet.lab${labParam}.tag-${tagParam.toLowerCase()}.easy`
            : `pharmlet.tag-${tagParam.toLowerCase()}.easy`;
    }

    if (!quizId) return null;

    if (isTrueExamMode()) {
        return `pharmlet.${quizId}.${configuredModeLabel}.exam`;
    }

    if (quizId === FINAL_EXAM_ID || getConceptQuizConfig(quizId)) {
        return `pharmlet.${quizId}.easy`;
    }

    return `pharmlet.${quizId}.${configuredModeLabel}`;
}

function getQuizProgressRouteId() {
    if (weekParam) return `week-${labParam}-${weekParam}`;
    if (weeksParam) return `weeks-${labParam}-${weeksParam}`;
    if (tagParam) return params.has("lab")
        ? `tag-${labParam}-${tagParam.toLowerCase()}`
        : `tag-all-${tagParam.toLowerCase()}`;
    if (quizId) {
        const generatedSignature = GENERATED_QUIZ_IDS.has(quizId)
            ? `${state.bossMode ? "boss" : "standard"}-${state.questions.length}-${state.questions.reduce((hash, question) => {
                const text = normalizeQuizValue(stripHtmlTags(question?.prompt || ""));
                for (const char of text) {
                    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
                }
                return hash;
            }, 0)}`
            : "";
        const modeLabel = getConfiguredModeStorageLabel() || modeParam;

        return `id-${quizId}-${modeLabel}-${isTrueExamMode() ? "exam" : "practice"}${generatedSignature ? `-${generatedSignature}` : ""}`;
    }
    return `route-${location.search || "quiz"}`;
}

function getQuizProgressKey() {
    return `${QUIZ_PROGRESS_PREFIX}${getQuizProgressRouteId()}`;
}

function getQuizSessionNoteElements() {
    return {
        wrap: getEl("quiz-session-note"),
        text: getEl("quiz-session-note-text")
    };
}

function showQuizSessionNote(message, tone = "good") {
    const { wrap, text } = getQuizSessionNoteElements();
    if (!wrap || !text || !message) return;

    wrap.classList.remove("hidden");
    text.textContent = message;
    wrap.dataset.tone = tone === "accent" || tone === "muted" ? tone : "good";
    wrap.style.borderColor = "";
    wrap.style.background = "";
    wrap.style.color = "";
}

function hideQuizSessionNote() {
    const { wrap, text } = getQuizSessionNoteElements();
    if (!wrap || !text) return;
    wrap.classList.add("hidden");
    text.textContent = "";
    delete wrap.dataset.tone;
}

function formatSavedSessionAge(savedAt) {
    const elapsedMs = Math.max(0, Date.now() - (Number(savedAt) || 0));
    const minutes = Math.round(elapsedMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes === 1) return "1 minute ago";
    if (minutes < 60) return `${minutes} minutes ago`;

    const hours = Math.round(minutes / 60);
    if (hours === 1) return "1 hour ago";
    return `${hours} hours ago`;
}

function getSavedSessionPromptLabel(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return "this saved quiz";
    if (snapshot.bossMode) return "this saved Boss Round";
    if (snapshot.reviewMode) return "this saved review round";
    if (snapshot.title) return `"${snapshot.title}"`;
    return "this saved quiz";
}

function clearQueuedQuizProgressSave() {
    if (!state.autosaveTimeout) return;
    clearTimeout(state.autosaveTimeout);
    state.autosaveTimeout = null;
}

function serializeQuizProgress() {
    if (!state.questions.length || !state.progressKey) return null;

    syncCurrentDraftFromDom();

    return {
        version: 1,
        routeId: getQuizProgressRouteId(),
        savedAt: Date.now(),
        title: state.title,
        index: state.index,
        score: state.score,
        pointScore: state.pointScore,
        totalPoints: state.totalPoints,
        timerSeconds: Math.max(0, Number(state.timerSeconds) || 0),
        timerPaused: !!state.timerPaused,
        currentStreak: Math.max(0, Number(state.currentStreak) || 0),
        bestStreak: Math.max(0, Number(state.bestStreak) || 0),
        hintsUsed: state.hintsUsed,
        timedOut: !!state.timedOut,
        reviewMode: !!state.reviewMode,
        bossMode: !!state.bossMode,
        generatedTimerSeconds: Math.max(0, Number(state.generatedTimerSeconds) || 0),
        generatedQuestionLimit: Math.max(0, Number(state.generatedQuestionLimit) || 0),
        adaptiveSummary: state.adaptiveSummary,
        currentScale: Number(state.currentScale) || 1,
        marked: [...state.marked],
        seen: [...state.seen],
        questions: state.questions,
        originalQuestions: state.originalQuestions,
        quizConfigId: state.quizConfig?.id || null,
        configuredModeKey: state.configuredModeKey || "",
        placeholderQuiz: !!state.placeholderQuiz,
        modeNotice: state.modeNotice || ""
    };
}

function persistQuizProgress(force = false) {
    if (!state.progressKey || !state.questions.length || state.progressCompleted) return;
    if (force) clearQueuedQuizProgressSave();

    const now = Date.now();
    if (!force && now - state.lastAutosaveAt < 250) return;

    const snapshot = serializeQuizProgress();
    if (!snapshot) return;

    try {
        localStorage.setItem(state.progressKey, JSON.stringify(snapshot));
        state.lastAutosaveAt = now;
        const saveLabel = force ? "Saved" : "Autosaved";
        const saveTime = new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        state.saveStatusMessage = `${saveLabel} ${saveTime}`;
        renderQuizStatus();
    } catch (error) {
        console.warn("Unable to save quiz progress:", error);
    }
}

function queueQuizProgressSave(delay = 250) {
    if (!state.progressKey || !state.questions.length) return;
    clearQueuedQuizProgressSave();
    state.autosaveTimeout = setTimeout(() => {
        state.autosaveTimeout = null;
        persistQuizProgress();
    }, delay);
}

function clearQuizProgress() {
    clearQueuedQuizProgressSave();
    state.lastAutosaveAt = 0;
    state.saveStatusMessage = "";
    if (!state.progressKey) return;

    try {
        localStorage.removeItem(state.progressKey);
    } catch (error) {
        console.warn("Unable to clear quiz progress:", error);
    }
}

function loadSavedQuizProgress() {
    if (!state.progressKey) return null;

    const saved = safeReadStorageJson(state.progressKey, null);
    if (!saved || typeof saved !== "object") return null;
    if (saved.routeId !== getQuizProgressRouteId()) return null;

    const savedAt = Number(saved.savedAt) || 0;
    if (!savedAt || (Date.now() - savedAt) > QUIZ_PROGRESS_MAX_AGE_MS) {
        clearQuizProgress();
        return null;
    }

    if (!Array.isArray(saved.questions) || !saved.questions.length) {
        clearQuizProgress();
        return null;
    }

    const savedTimerSeconds = Math.max(0, Number(saved.generatedTimerSeconds) || 0);
    const savedQuestionLimit = Math.max(0, Number(saved.generatedQuestionLimit) || 0);
    const currentTimerSeconds = Math.max(0, Number(state.generatedTimerSeconds) || 0);
    const currentQuestionLimit = Math.max(0, Number(state.generatedQuestionLimit) || 0);

    if (savedTimerSeconds !== currentTimerSeconds || savedQuestionLimit !== currentQuestionLimit) {
        clearQuizProgress();
        return null;
    }

    // Guard against older buggy snapshots that saved the wrong question list length.
    // If the stored list doesn't match what this mode expects, start fresh.
    if (currentQuestionLimit > 0 && saved.questions.length !== currentQuestionLimit) {
        clearQuizProgress();
        return null;
    }

    return saved;
}

function restoreSavedQuizProgress(snapshot) {
    if (!snapshot) return false;

    state.questions = snapshot.questions.map((question, index) => ({
        ...question,
        _id: Number(question?._id) === index ? question._id : index
    }));
    state.originalQuestions = Array.isArray(snapshot.originalQuestions) ? snapshot.originalQuestions.map((question) => ({ ...question })) : [];
    state.index = Math.min(Math.max(0, Number(snapshot.index) || 0), Math.max(0, state.questions.length - 1));
    state.score = Math.max(0, Number(snapshot.score) || 0);
    state.pointScore = Math.max(0, Number(snapshot.pointScore) || 0);
    state.totalPoints = Math.max(0, Number(snapshot.totalPoints) || 0);
    state.hintsUsed = Math.max(0, Number(snapshot.hintsUsed) || 0);
    state.timerSeconds = Math.max(0, Number(snapshot.timerSeconds) || 0);
    state.timerPaused = !!snapshot.timerPaused;
    state.currentStreak = Math.max(0, Number(snapshot.currentStreak) || 0);
    state.bestStreak = Math.max(0, Number(snapshot.bestStreak) || 0);
    state.timedOut = !!snapshot.timedOut;
    state.reviewMode = !!snapshot.reviewMode;
    state.bossMode = !!snapshot.bossMode;
    state.generatedTimerSeconds = Math.max(0, Number(snapshot.generatedTimerSeconds) || 0);
    state.generatedQuestionLimit = Math.max(0, Number(snapshot.generatedQuestionLimit) || 0);
    state.adaptiveSummary = snapshot.adaptiveSummary && typeof snapshot.adaptiveSummary === "object"
        ? snapshot.adaptiveSummary
        : null;
    state.configuredModeKey = String(snapshot.configuredModeKey || state.configuredModeKey || "");
    state.placeholderQuiz = !!snapshot.placeholderQuiz;
    state.modeNotice = String(snapshot.modeNotice || state.modeNotice || "");
    state.progressCompleted = false;
    state.currentScale = Number(snapshot.currentScale) || 1;
    state.marked = new Set(Array.isArray(snapshot.marked) ? snapshot.marked : []);
    state.seen = new Set(Array.isArray(snapshot.seen) ? snapshot.seen : []);
    state.title = String(snapshot.title || state.title || "Quiz");
    state.resultsRecorded = false;
    state.signalsRecorded = false;
    state.finalBreakdown = null;
    syncPointTotalsFromQuestions();

    document.body.style.zoom = state.currentScale;
    document.documentElement.style.setProperty("--quiz-size", `${state.currentScale}rem`);

    if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
    if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
    renderStreakMeter();
    renderAdaptiveFinalBanner();

    const savedAt = Number(snapshot.savedAt) || Date.now();
    const when = formatSavedSessionAge(savedAt);
    state.saveStatusMessage = `Restored ${when}`;
    renderQuizStatus();
    showQuizSessionNote(`Saved progress restored from ${when}. Answers, marks, and timer are back where you left them.`);
    return true;
}

function startRestoredTimer() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    state.timerHandle = null;

    const readout = getEl("timer-readout");
    if (readout) {
        const mins = Math.floor(state.timerSeconds / 60);
        const secs = state.timerSeconds % 60;
        readout.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
        readout.classList.toggle("opacity-30", !!state.timerPaused);
        readout.classList.toggle("animate-pulse", !!state.timerPaused);
    }

    if (!state.timerPaused && state.timerSeconds > 0) {
        state.timerHandle = setInterval(timerTick, 1000);
    }
}

function saveQuizHistory() {
    if (state.resultsRecorded || state.reviewMode) return;

    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const history = raw ? JSON.parse(raw) : [];
        const letterGradeInfo = getLetterGradeInfoForQuiz(state.score, state.questions.length);
        const finalSummary = buildStoredFinalAttemptSummary(state.questions);

        history.push({
            quizId: getHistoryQuizId(),
            mode: getHistoryModeLabel(),
            title: state.title || FINAL_EXAM_TITLE,
            score: state.score,
            total: state.questions.length,
            pointScore: state.pointScore,
            pointTotal: state.totalPoints,
            bestStreak: state.bestStreak,
            timestamp: Date.now(),
            examMode: isTrueExamMode(),
            hintsUsed: state.hintsUsed,
            letterGrade: letterGradeInfo?.letter || null,
            finalSummary
        });

        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-200)));
        state.resultsRecorded = true;
    } catch (e) {
        console.warn("Failed to save quiz history:", e);
    }
}

function getLetterGradeInfoForQuiz(score, total) {
    if (quizId !== FINAL_EXAM_ID || total !== FINAL_EXAM_TOTAL) return null;

    const cutoffs = [
        { letter: "A", minCorrect: Math.ceil(total * 0.9) },
        { letter: "B", minCorrect: Math.ceil(total * 0.8) },
        { letter: "C", minCorrect: Math.ceil(total * 0.7) },
        { letter: "D", minCorrect: Math.ceil(total * 0.6) }
    ];

    for (const cutoff of cutoffs) {
        if (score >= cutoff.minCorrect) {
            return {
                letter: cutoff.letter,
                minCorrect: cutoff.minCorrect,
                cutoffs
            };
        }
    }

    return {
        letter: "F",
        minCorrect: 0,
        cutoffs
    };
}

// --- RESTART WITH CONFIRMATION ---
function restartQuiz() {
    if (confirm("🔄 Restart this quiz? Your progress will be lost.")) {
        state.progressCompleted = true;
        clearQuizProgress();
        location.reload();
    }
}

function buildFreshReviewRoundQuestions(sourceQuestions = []) {
    return sourceQuestions.map((q, i) => {
        const nextQuestion = { ...q, _id: i, _answered: false, _correct: false, _user: null };
        delete nextQuestion._hintUsed;
        return nextQuestion;
    });
}

function restoreQuestionCardShell() {
    const card = getEl("question-card");
    if (!card) return;

    card.innerHTML = `
        <div id="drug-context" class="text-[10px] uppercase tracking-widest text-[#8b1e3f] font-black mb-3 opacity-60 h-4"></div>
        <h2 id="prompt" class="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight mb-8">Loading...</h2>
        <div id="options" class="space-y-4"></div>
        <div id="short-wrap" class="mt-8 hidden">
            <input id="short-input" class="w-full rounded-2xl border border-[var(--ring)] bg-[var(--bg)] px-5 py-5 text-xl outline-[#8b1e3f]" placeholder="Type answer...">
        </div>
        <div id="explain" class="mt-8"></div>
    `;
}

function replayCurrentReviewRound() {
    if (!state.reviewMode || !state.originalQuestions.length) {
        showResults();
        return;
    }

    state.questions = buildFreshReviewRoundQuestions(state.originalQuestions);
    state.progressKey = getQuizProgressKey();
    state.index = 0;
    state.score = 0;
    state.pointScore = 0;
    state.totalPoints = getTotalQuestionPoints(state.questions);
    state.hintsUsed = 0;
    state.currentStreak = 0;
    state.bestStreak = 0;
    state.marked.clear();
    state.seen.clear();
    state.timedOut = false;
    state.resultsRecorded = false;
    state.signalsRecorded = false;
    state.finalBreakdown = null;
    state.progressCompleted = false;
    state.title = `Review: ${state.originalQuestions.length} Missed`;

    restoreQuestionCardShell();
    if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
    if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
    applyAttemptModeUI();
    render();
}

function checkAllAnswersAndFinish() {
    syncCurrentDraftFromDom();

    const firstUnseen = getFirstUnseenQuestionIndex();
    if (firstUnseen >= 0) {
        jumpToQuestion(firstUnseen);
        alert(`Review question ${firstUnseen + 1} before finishing this run.`);
        return;
    }

    state.questions.forEach((question) => {
        if (!question || question._answered) return;
        applyAnswerToQuestion(question, question._user);
    });

    showResults();
}

function finishQuizDueToTimeout() {
    if (state.timedOut) return;

    syncCurrentDraftFromDom();
    state.timedOut = true;

    if (state.timerHandle) {
        clearInterval(state.timerHandle);
        state.timerHandle = null;
    }

    state.timerSeconds = 0;
    state.timerPaused = true;
    const readout = getEl("timer-readout");
    if (readout) {
        readout.textContent = "0:00";
        readout.classList.add("opacity-30");
    }

    state.questions.forEach((question) => {
        if (!question || question._answered) return;
        applyAnswerToQuestion(question, question._user);
    });

    showResults();
}

function handleNextAction() {
    if (isPerfectReviewRoundComplete()) {
        replayCurrentReviewRound();
        return;
    }

    if (isReviewRoundComplete()) {
        showResults();
        return;
    }

    if (state.index < state.questions.length - 1) {
        jumpToQuestion(state.index + 1);
        return;
    }

    const firstUnseen = getFirstUnseenQuestionIndex();
    if (firstUnseen >= 0) {
        jumpToQuestion(firstUnseen);
        alert(`You still have ${state.questions.length - getSeenCount()} unseen question${state.questions.length - getSeenCount() === 1 ? "" : "s"} to review before finishing.`);
        return;
    }

    if (getUnansweredCount() > 0) {
        checkAllAnswersAndFinish();
        return;
    }

    showResults();
}

// --- REVIEW MISSED QUESTIONS ---
function reviewMissed() {
    const missed = state.questions.filter(q => q._answered && !q._correct);
    
    if (missed.length === 0) {
        alert("🎉 No missed questions to review!");
        return;
    }
    
    // Reset state for review mode
    state.reviewMode = true;
    state.bossMode = false;
    state.generatedTimerSeconds = 0;
    state.originalQuestions = missed.map((q) => ({ ...q }));
    state.questions = buildFreshReviewRoundQuestions(state.originalQuestions);
    state.progressKey = getQuizProgressKey();
    state.index = 0;
    state.score = 0;
    state.pointScore = 0;
    state.totalPoints = getTotalQuestionPoints(state.questions);
    state.hintsUsed = 0;
    state.currentStreak = 0;
    state.bestStreak = 0;
    state.marked.clear();
    state.seen.clear();
    state.timedOut = false;
    state.resultsRecorded = false;
    state.signalsRecorded = false;
    state.finalBreakdown = null;
    state.progressCompleted = false;
    state.title = `Review: ${missed.length} Missed`;
    
    if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
    if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
    
    // Restore the quiz shell but keep the same countdown running for arcade-style retries.
    restoreQuestionCardShell();
    applyAttemptModeUI();
    render();
}

// Expose to global scope for inline onclick handlers
window.reviewMissed = reviewMissed;
window.launchWeakAreaRetake = launchWeakAreaRetake;
window.launchBossRound = launchBossRound;
window.reportCurrentQuestion = reportCurrentQuestion;
window.restartQuiz = restartQuiz;

// --- 2. DATA PIPELINE ---
async function smartFetch(fileName) {
    const paths = [`assets/data/${fileName}`, `data/${fileName}`, `quizzes/${fileName}`, `../assets/data/${fileName}`];
    for (let path of paths) {
        let res;
        try {
            res = await fetch(path, { cache: "no-store" });
        } catch (e) {
            continue;
        }

        if (!res.ok) continue;

        try {
            return await res.json();
        } catch (error) {
            throw new Error(`Invalid JSON in ${fileName} (${path}): ${error.message}`);
        }
    }
    console.warn(`Warning: Unable to fetch ${fileName} from any path`);
    throw new Error(`File not found: ${fileName}`);
}

async function fetchJsonFromSourcePath(sourcePath) {
    if (!sourcePath) {
        throw new Error("Missing source path for quiz.");
    }

    let res;
    try {
        res = await fetch(sourcePath, { cache: "no-store" });
    } catch (error) {
        throw new Error(`Unable to fetch ${sourcePath}: ${error.message}`);
    }

    if (!res.ok) {
        throw new Error(`Unable to fetch ${sourcePath}: HTTP ${res.status}`);
    }

    try {
        return await res.json();
    } catch (error) {
        throw new Error(`Invalid JSON in ${sourcePath}: ${error.message}`);
    }
}

async function loadQuizDataForId(quizIdentifier) {
    const entry = quizCatalog?.getEntry?.(quizIdentifier);
    if (entry?.sourceType === "quiz-json" && entry.sourcePath) {
        try {
            return await fetchJsonFromSourcePath(entry.sourcePath);
        } catch (catalogError) {
            console.warn(`Catalog load failed for ${quizIdentifier}:`, catalogError);
        }
    }

    return smartFetch(`${quizIdentifier}.json`);
}

function normalizeQuizValue(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function flattenPoolData(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.questions)) return data.questions;
    if (data?.pools && typeof data.pools === "object") return Object.values(data.pools).flat();
    return [];
}

function computeQuizInitialism(value) {
    return String(value ?? "")
        .match(/[A-Za-z]+/g)
        ?.map((segment) => segment[0])
        .join("")
        .toLowerCase() || "";
}

function buildCompositeAnswerVariants(parts, acceptableAnswers = []) {
    const cleanParts = parts
        .map((part) => String(part ?? "").trim())
        .filter(Boolean);

    if (!cleanParts.length) return [];

    const normalizeCompact = (value) => normalizeQuizValue(value).replace(/[^a-z0-9]+/g, "");
    const addUnique = (bucket, seen, value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) return;
        const key = normalizeCompact(trimmed);
        if (!key || seen.has(key)) return;
        seen.add(key);
        bucket.push(trimmed);
    };

    const synonymsByPart = cleanParts.map((part) => {
        const partValues = [];
        const partSeen = new Set();
        addUnique(partValues, partSeen, part);
        return { values: partValues, seen: partSeen };
    });

    const singleAcceptableAnswers = acceptableAnswers
        .map((answer) => String(answer ?? "").trim())
        .filter(Boolean)
        .filter((answer) => !/[,&/]/.test(answer) && !/\band\b/i.test(answer));

    cleanParts.forEach((part, index) => {
        const partKey = normalizeCompact(part);
        const synonymBucket = synonymsByPart[index];

        singleAcceptableAnswers.forEach((answer) => {
            const answerKey = normalizeCompact(answer);
            const answerInitialism = computeQuizInitialism(answer);

            if (answerKey === partKey || (partKey.length <= 5 && answerInitialism === partKey)) {
                addUnique(synonymBucket.values, synonymBucket.seen, answer);
            }
        });
    });

    const variants = [];
    const seen = new Set();
    const delimiters = [" and ", " & ", ", ", " "];

    if (cleanParts.length === 2) {
        const [left, right] = synonymsByPart;
        left.values.forEach((leftValue) => {
            right.values.forEach((rightValue) => {
                delimiters.forEach((delimiter) => {
                    addUnique(variants, seen, `${leftValue}${delimiter}${rightValue}`);
                    addUnique(variants, seen, `${rightValue}${delimiter}${leftValue}`);
                });
            });
        });
    } else {
        delimiters.forEach((delimiter) => {
            addUnique(variants, seen, cleanParts.join(delimiter));
        });
    }

    acceptableAnswers.forEach((answer) => {
        const candidate = String(answer ?? "").trim();
        if (!candidate) return;
        if (/[,&/]/.test(candidate) || /\band\b/i.test(candidate)) {
            addUnique(variants, seen, candidate);
        }
    });

    return variants;
}

function normalizeLoadedQuizQuestion(item) {
    if (!item || typeof item !== "object" || Array.isArray(item) || isConceptEntry(item)) {
        return item;
    }

    const rawType = normalizeQuizValue(item.type);
    const normalizedType = rawType === "fitb"
        ? "short"
        : rawType === "calc"
        ? "short"
        : (item.type || "mcq");
    const prompt = String(item.prompt ?? item.question ?? "").trim();
    const rawChoices = Array.isArray(item.choices)
        ? item.choices
        : (Array.isArray(item.options) ? item.options : null);
    const stripChoiceLabel = (value) => String(value ?? "").replace(/^[A-Z]\.\s*/, "").trim();
    const normalizedChoices = Array.isArray(rawChoices)
        ? rawChoices.map((choice) => stripChoiceLabel(choice)).filter(Boolean)
        : undefined;
    const rawAnswerValue = item.answerText ?? item.answer ?? item.correct ?? item.ans;
    let normalizedAnswer = rawAnswerValue;

    if (normalizedChoices && typeof rawAnswerValue === "string" && /^[A-Z]$/i.test(rawAnswerValue.trim())) {
        const answerIndex = rawAnswerValue.trim().toUpperCase().charCodeAt(0) - 65;
        if (answerIndex >= 0 && answerIndex < normalizedChoices.length) {
            normalizedAnswer = normalizedChoices[answerIndex];
        }
    }

    const inferredQuestionKind = item.questionKind
        || item.kind
        || (rawType === "calc" ? "calculation" : (rawType === "fitb" ? "fitb" : undefined));
    const normalized = {
        ...item,
        type: normalizedType,
        prompt,
        answer: normalizedAnswer,
        choices: normalizedChoices,
        sourceSection: item.sourceSection ?? item.section ?? item.metadata?.sourceSection,
        questionKind: inferredQuestionKind
    };

    const acceptableAnswers = Array.isArray(item.acceptableAnswers)
        ? item.acceptableAnswers.map((answer) => String(answer ?? "").trim()).filter(Boolean)
        : [];

    if ((normalizedType === "short" || normalizedType === "open") && Array.isArray(item.answer)) {
        const answers = item.answer.map((answer) => String(answer ?? "").trim()).filter(Boolean);
        if (answers.length === 1) {
            normalized.answer = answers[0];

            const extraAcceptedAnswers = acceptableAnswers.filter((answer) => normalizeQuizValue(answer) !== normalizeQuizValue(answers[0]));
            if (extraAcceptedAnswers.length) {
                normalized._acceptedAnswers = [...new Set(extraAcceptedAnswers)];
            }
        } else if (answers.length > 1) {
            const compositeAnswers = buildCompositeAnswerVariants(answers, acceptableAnswers);
            normalized.answer = compositeAnswers[0] || answers.join(" and ");

            const extraAcceptedAnswers = compositeAnswers.slice(1);
            if (extraAcceptedAnswers.length) {
                normalized._acceptedAnswers = extraAcceptedAnswers;
            }
        }
    } else if ((normalizedType === "short" || normalizedType === "open") && normalized.answer === undefined && acceptableAnswers.length) {
        normalized.answer = acceptableAnswers[0];
        if (acceptableAnswers.length > 1) {
            normalized._acceptedAnswers = acceptableAnswers.slice(1);
        }
    }

    if ((normalizedType === "short" || normalizedType === "open") && !Array.isArray(item.answer) && normalized.answer !== undefined && normalized.answer !== null && normalized.answer !== "") {
        normalized.answer = String(normalized.answer).trim();

        if (!acceptableAnswers.length && rawType === "fitb") {
            normalized._acceptedAnswers = [normalized.answer];
        }
    }

    delete normalized.acceptableAnswers;
    delete normalized.options;
    delete normalized.section;
    return normalized;
}

function normalizeLoadedQuizQuestions(items) {
    return Array.isArray(items) ? items.map(normalizeLoadedQuizQuestion) : [];
}

function buildQuestionPoolFromQuizData(data, requestedMode = "easy") {
    if (Array.isArray(data?.questions)) return normalizeLoadedQuizQuestions(data.questions);

    const pools = data?.pools && typeof data.pools === "object" ? data.pools : {};
    const availablePools = Object.entries(pools).filter(([, items]) => Array.isArray(items) && items.length > 0);
    if (!availablePools.length) return [];

    if (requestedMode === "mix") {
        return normalizeLoadedQuizQuestions(availablePools.flatMap(([, items]) => items));
    }

    if (Array.isArray(pools[requestedMode]) && pools[requestedMode].length > 0) {
        return normalizeLoadedQuizQuestions(pools[requestedMode]);
    }

    if (availablePools.length === 1) {
        return normalizeLoadedQuizQuestions(availablePools[0][1]);
    }

    throw new Error(`Mode "${requestedMode}" is not available for this quiz.`);
}

function toNormalizedValueList(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeQuizValue(entry)).filter(Boolean);
    }

    const single = normalizeQuizValue(value);
    return single ? [single] : [];
}

function getConfiguredQuestionKind(question) {
    const explicit = normalizeQuizValue(question?.questionKind ?? question?.metadata?.questionKind);
    if (explicit) return explicit;
    if (question?.type === "calc") return "calculation";
    if (question?.type === "open") return "openresponse";
    if (question?.type === "short" && (question?.formula || question?.units || question?.tolerance !== undefined)) return "calculation";
    if (question?.type === "short") return "fitb";
    if (question?.type === "mcq" || question?.type === "tf" || question?.type === "mcq-multiple") return "choice";
    return normalizeQuizValue(question?.type);
}

function getConfiguredQuestionSourceSection(question) {
    return normalizeQuizValue(question?.sourceSection ?? question?.section ?? question?.metadata?.sourceSection);
}

function getConfiguredQuestionDifficulty(question) {
    return normalizeQuizValue(question?.difficulty ?? question?.metadata?.difficulty);
}

function getConfiguredQuestionTagSet(question) {
    const values = [
        ...(Array.isArray(question?.tags) ? question.tags : []),
        ...(Array.isArray(question?.topicTags) ? question.topicTags : []),
        ...(Array.isArray(question?.objectiveTags) ? question.objectiveTags : [])
    ];

    return new Set(values.map((value) => normalizeQuizValue(value)).filter(Boolean));
}

function matchesConfiguredRule(question, rule, options = {}) {
    if (!question || !rule) return false;
    const useDifficulty = options.useDifficulty !== false;

    const sourceSection = getConfiguredQuestionSourceSection(question);
    const questionKind = getConfiguredQuestionKind(question);
    const questionType = normalizeQuizValue(question?.type);
    const difficulty = getConfiguredQuestionDifficulty(question);
    const tags = getConfiguredQuestionTagSet(question);

    const allowedSourceSections = toNormalizedValueList(rule.sourceSections ?? rule.sourceSection);
    if (allowedSourceSections.length && !allowedSourceSections.includes(sourceSection)) return false;

    const allowedKinds = toNormalizedValueList(rule.questionKinds ?? rule.questionKind);
    if (allowedKinds.length && !allowedKinds.includes(questionKind)) return false;

    const allowedTypes = toNormalizedValueList(rule.types ?? rule.type);
    if (allowedTypes.length && !allowedTypes.includes(questionType)) return false;

    if (useDifficulty) {
        const allowedDifficulties = toNormalizedValueList(rule.difficulties ?? rule.difficulty);
        if (allowedDifficulties.length && !allowedDifficulties.includes(difficulty)) return false;
    }

    const requiredTags = toNormalizedValueList(rule.tags);
    if (requiredTags.length && !requiredTags.some((tag) => tags.has(tag))) return false;

    return true;
}

function applyModeConfigQuestionMetadata(question, modeConfig, rule) {
    const clone = { ...question };
    const questionKind = getConfiguredQuestionKind(clone);
    const sourceSection = getConfiguredQuestionSourceSection(clone);

    if (!clone.questionKind && questionKind) clone.questionKind = questionKind;
    if (!clone.sourceSection && sourceSection) clone.sourceSection = sourceSection;

    const explicitPoints = Number(clone?.points);
    if (!Number.isFinite(explicitPoints) || explicitPoints <= 0) {
        const rulePoints = Number(rule?.points);
        const modePoints = Number(modeConfig?.pointsByQuestionKind?.[questionKind]);
        const nextPoints = Number.isFinite(rulePoints) && rulePoints > 0
            ? rulePoints
            : (Number.isFinite(modePoints) && modePoints > 0 ? modePoints : 0);
        if (nextPoints > 0) clone.points = nextPoints;
    }

    return clone;
}

function buildConfiguredModeQuestions(data, modeConfig) {
    const allQuestions = normalizeLoadedQuizQuestions(data?.questions);
    if (!allQuestions.length) {
        throw new Error(`Quiz "${data?.id || quizId || "unknown"}" does not have any master questions yet.`);
    }

    const selection = modeConfig?.selection && typeof modeConfig.selection === "object"
        ? modeConfig.selection
        : {};
    const rules = Array.isArray(selection.rules) ? selection.rules : [];
    const allowPartial = !!selection.allowPartial;
    const useDifficulty = Boolean(selection.useDifficulty);
    const adaptiveEnabled = selection.adaptive === true;
    const difficultyWeights = selection?.difficultyWeights && typeof selection.difficultyWeights === "object"
        ? selection.difficultyWeights
        : null;
    const selected = [];
    const seenQuestions = new Set();
    const shortfalls = [];

    const addQuestion = (question, rule) => {
        if (!question || seenQuestions.has(question)) return;
        seenQuestions.add(question);
        selected.push(applyModeConfigQuestionMetadata(question, modeConfig, rule));
    };

    if (!rules.length) {
        applyQuestionLimit(allQuestions).forEach((question) => addQuestion(question, null));
        return {
            questions: shuffled(selected),
            shortfalls,
            adaptiveSession: null
        };
    }

    const normalizeDifficultyKey = (value) => {
        const key = normalizeQuizValue(value);
        if (key === "easy" || key === "medium" || key === "hard") return key;
        return "medium";
    };

    const stepDifficulty = (current, correct) => {
        const order = ["easy", "medium", "hard"];
        const idx = Math.max(0, order.indexOf(normalizeDifficultyKey(current)));
        const nextIdx = correct ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1);
        return order[nextIdx];
    };

    const pickClosestDifficultyCandidate = (candidates, targetDifficulty) => {
        if (!candidates.length) return null;
        const target = normalizeDifficultyKey(targetDifficulty);
        const buckets = { easy: [], medium: [], hard: [] };
        for (const q of candidates) {
            buckets[normalizeDifficultyKey(getConfiguredQuestionDifficulty(q))].push(q);
        }

        const order = target === "easy"
            ? ["easy", "medium", "hard"]
            : target === "hard"
            ? ["hard", "medium", "easy"]
            : ["medium", "easy", "hard"];

        for (const key of order) {
            const bucket = buckets[key];
            if (!bucket.length) continue;
            const idx = Math.floor(Math.random() * bucket.length);
            return bucket[idx] || null;
        }

        return null;
    };

    const buildAdaptiveConfiguredSession = () => {
        const questionLimit = Number.isFinite(limitParam) && limitParam > 0
            ? limitParam
            : Math.max(0, Number(modeConfig?.questionLimit) || 0);
        const targetTotal = questionLimit > 0 ? questionLimit : 10;

        // Create a shuffled slot list that mirrors the rule mix.
        const slots = [];
        for (const rule of rules) {
            const count = Math.max(0, Number(rule?.count) || 0);
            for (let i = 0; i < count; i += 1) slots.push(rule);
        }
        // If counts don't sum to the limit, trim/pad by repeating the last rule.
        while (slots.length < targetTotal && rules.length) slots.push(rules[rules.length - 1]);
        slots.splice(targetTotal);
        const shuffledSlots = shuffled(slots);

        const startDifficulty = normalizeDifficultyKey(selection.startDifficulty || "medium");
        const session = {
            slots: shuffledSlots,
            cursor: 0,
            difficulty: startDifficulty,
            used: new Set()
        };

        const pickNext = (wasCorrect) => {
            if (session.cursor >= session.slots.length) return null;
            if (wasCorrect !== undefined) {
                session.difficulty = stepDifficulty(session.difficulty, !!wasCorrect);
            }

            const rule = session.slots[session.cursor];
            session.cursor += 1;

            const candidates = allQuestions.filter((q) => !session.used.has(q) && matchesConfiguredRule(q, rule, { useDifficulty: false }));
            const chosen = pickClosestDifficultyCandidate(candidates, session.difficulty) || candidates[0] || null;
            if (!chosen) return null;
            session.used.add(chosen);
            return applyModeConfigQuestionMetadata(chosen, modeConfig, rule);
        };

        return { session, pickNext };
    };

    if (adaptiveEnabled) {
        const { session, pickNext } = buildAdaptiveConfiguredSession();
        const built = [];
        for (let i = 0; i < session.slots.length; i += 1) {
            const next = pickNext(undefined);
            if (!next) break;
            built.push(next);
        }
        if (!built.length) {
            throw new Error(`Quiz "${data?.id || quizId || "unknown"}" does not have enough items to build adaptive mode yet.`);
        }
        return {
            questions: built,
            shortfalls,
            adaptiveSession: { difficulty: session.difficulty }
        };
    }

    const pickWeightedDifficulty = (candidates, targetCount) => {
        if (!difficultyWeights) return candidates.slice(0, Math.min(targetCount, candidates.length));

        const normalizedWeights = Object.entries(difficultyWeights)
            .map(([key, weight]) => [normalizeQuizValue(key), Number(weight) || 0])
            .filter(([, weight]) => weight > 0);

        if (!normalizedWeights.length) return candidates.slice(0, Math.min(targetCount, candidates.length));

        const buckets = new Map();
        const fallbackBucket = [];
        const addToBucket = (key, question) => {
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(question);
        };

        for (const question of candidates) {
            const difficulty = getConfiguredQuestionDifficulty(question) || "medium";
            addToBucket(difficulty, question);
            fallbackBucket.push(question);
        }

        const pickDifficulty = (entries) => {
            const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
            if (totalWeight <= 0) return entries[0]?.[0] || "";
            let roll = Math.random() * totalWeight;
            for (const [key, weight] of entries) {
                roll -= weight;
                if (roll <= 0) return key;
            }
            return entries[entries.length - 1][0];
        };

        const picked = [];
        for (let i = 0; i < targetCount; i += 1) {
            const availableEntries = normalizedWeights.filter(([key]) => (buckets.get(key) || []).length > 0);
            const candidateEntries = availableEntries.length
                ? availableEntries
                : [...buckets.entries()].filter(([, items]) => items.length > 0).map(([key]) => [key, 1]);
            if (!candidateEntries.length) break;

            const selectedKey = pickDifficulty(candidateEntries);
            const pool = buckets.get(selectedKey) || [];
            const fallbackPool = pool.length ? pool : fallbackBucket;
            if (!fallbackPool.length) break;

            const index = Math.floor(Math.random() * fallbackPool.length);
            const question = fallbackPool.splice(index, 1)[0];
            if (!question) continue;

            const questionKey = getConfiguredQuestionDifficulty(question) || "medium";
            const bucket = buckets.get(questionKey);
            if (bucket) {
                const bucketIndex = bucket.indexOf(question);
                if (bucketIndex >= 0) bucket.splice(bucketIndex, 1);
            }

            picked.push(question);
        }

        return picked;
    };

    const effectiveTotal = Number.isFinite(limitParam) && limitParam > 0
        ? limitParam
        : Math.max(0, Number(modeConfig?.questionLimit) || 0);
    const explicitTotal = rules.reduce((sum, rule) => sum + Math.max(0, Number(rule?.count) || 0), 0);
    const weightedRules = rules.filter((rule) => !Number.isFinite(Number(rule?.count)) && Number(rule?.countWeight) > 0);
    const totalWeight = weightedRules.reduce((sum, rule) => sum + Math.max(0, Number(rule?.countWeight) || 0), 0);
    const weightedTotal = totalWeight > 0 && effectiveTotal > 0
        ? Math.max(0, effectiveTotal - explicitTotal)
        : 0;
    const weightedCounts = new Map();

    if (weightedRules.length && totalWeight > 0 && weightedTotal > 0) {
        const allocations = weightedRules.map((rule) => {
            const weight = Math.max(0, Number(rule?.countWeight) || 0);
            const exact = (weightedTotal * weight) / totalWeight;
            return {
                rule,
                base: Math.floor(exact),
                fraction: exact - Math.floor(exact)
            };
        });

        let remaining = weightedTotal - allocations.reduce((sum, entry) => sum + entry.base, 0);
        allocations.sort((a, b) => b.fraction - a.fraction);
        for (let i = 0; i < allocations.length && remaining > 0; i += 1) {
            allocations[i].base += 1;
            remaining -= 1;
        }

        allocations.forEach((entry) => weightedCounts.set(entry.rule, entry.base));
    }

    for (const rule of rules) {
        const weightedCount = weightedCounts.get(rule);
        const targetCount = Math.max(0, Number.isFinite(weightedCount) ? weightedCount : Number(rule?.count) || 0);
        if (!targetCount) continue;

        const candidates = shuffled(allQuestions.filter((question) => !seenQuestions.has(question) && matchesConfiguredRule(question, rule, { useDifficulty })));
        const picked = useDifficulty
            ? pickWeightedDifficulty(candidates, targetCount)
            : candidates.slice(0, Math.min(targetCount, candidates.length));
        picked.forEach((question) => addQuestion(question, rule));

        if (picked.length < targetCount) {
            shortfalls.push({
                rule,
                expected: targetCount,
                actual: picked.length
            });
        }
    }

    if (shortfalls.length && !allowPartial) {
        const summary = shortfalls
            .map(({ rule, expected, actual }) => {
                const section = rule?.sourceSection || rule?.sourceSections?.join("/") || "any section";
                const kind = rule?.questionKind || rule?.questionKinds?.join("/") || "any kind";
                return `${expected - actual} short for ${kind} in ${section}`;
            })
            .join("; ");
        throw new Error(`This quiz bank cannot build the requested mode yet: ${summary}.`);
    }

    return {
        questions: applyQuestionLimit(selected),
        shortfalls,
        adaptiveSession: null
    };
}

function buildConfiguredModeNotice(data, modeConfig, buildResult) {
    const titleBits = [];
    if (data?.meta?.placeholder === true) {
        titleBits.push("Placeholder scaffold active.");
    }

    if (Array.isArray(buildResult?.shortfalls) && buildResult.shortfalls.length) {
        const requested = Math.max(0, Number(modeConfig?.questionLimit) || 0);
        const built = Array.isArray(buildResult?.questions) ? buildResult.questions.length : 0;
        titleBits.push(`This preview currently builds ${built}${requested ? ` of the requested ${requested}` : ""} questions.`);
    }

    if (modeConfig?.notice) {
        titleBits.push(String(modeConfig.notice).trim());
    }

    return titleBits.join(" ");
}

function applyQuestionLimit(items) {
    if (!Array.isArray(items)) return [];
    const configuredLimit = Number.isFinite(limitParam) && limitParam > 0
        ? limitParam
        : Math.max(0, Number(state.generatedQuestionLimit) || 0);
    if (!configuredLimit) return items;
    return shuffled(items).slice(0, Math.min(configuredLimit, items.length));
}

function getCorrectAnswerValue(question) {
    const directAnswer = question?.answerText ?? question?.answer ?? question?.correct ?? question?.ans;
    if (directAnswer !== undefined && directAnswer !== null && directAnswer !== "") {
        return directAnswer;
    }

    if (Number.isInteger(question?.answerIndex) && Array.isArray(question?.choices)) {
        return question.choices[question.answerIndex];
    }

    return "";
}

function loadGeneratedQuizFromStorage(expectedId) {
    try {
        const raw = localStorage.getItem(CUSTOM_QUIZ_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;

        if (expectedId && parsed.id && parsed.id !== expectedId) {
            throw new Error(`Saved generated quiz does not match "${expectedId}". Please build it again from the source page.`);
        }

        return parsed;
    } catch (error) {
        throw new Error(`Unable to load saved generated quiz: ${error.message}`);
    }
}

function isTopDrugsPlaylistPayload(data) {
    return Boolean(
        data?.metadata?.generator === "top-drugs-playlist"
        && Array.isArray(data?.items)
        && data.items.length
    );
}

function getTopDrugsPlaylistFocusScores(drug, signals) {
    return {
        brand: splitBrandNames(drug?.brand).length ? getBrandWeaknessScore(drug, signals) + 0.35 : -Infinity,
        class: drug?.class ? getWeaknessScore(getCounterValue(signals.seenClasses, drug?.class), getCounterValue(signals.missedClasses, drug?.class)) + (getDrugWeaknessScore(drug, signals) * 0.18) : -Infinity,
        category: drug?.category ? getWeaknessScore(getCounterValue(signals.seenCategories, drug?.category), getCounterValue(signals.missedCategories, drug?.category)) + (getDrugWeaknessScore(drug, signals) * 0.16) : -Infinity,
        moa: drug?.moa ? getDrugWeaknessScore(drug, signals) + (getCounterValue(signals.missedDrugs, drug?.generic) * 0.18) : -Infinity
    };
}

function buildAdaptiveTopDrugsPlaylistQuestion(drug, fullPool, signals) {
    const focusScores = getTopDrugsPlaylistFocusScores(drug, signals);
    const focusOrder = Object.entries(focusScores)
        .sort((a, b) => b[1] - a[1])
        .map(([focus]) => focus);

    const builders = {
        brand: () => buildFinalGenericToBrandQuestion(drug, { signals }),
        class: () => buildFinalDrugToFieldQuestion(drug, fullPool, "class", "Class"),
        category: () => buildFinalDrugToFieldQuestion(drug, fullPool, "category", "Category"),
        moa: () => buildFinalDrugToFieldQuestion(drug, fullPool, "moa", "MOA")
    };

    for (const focus of focusOrder) {
        const built = builders[focus]?.();
        if (built) return built;
    }

    return createQuestionFromItem(drug, fullPool);
}

function buildTopDrugsPlaylistQuestionForDrug(drug, fullPool, playlistKey, signals) {
    switch (playlistKey) {
        case "brand-recovery":
            return buildFinalGenericToBrandQuestion(drug, { signals }) || buildAdaptiveTopDrugsPlaylistQuestion(drug, fullPool, signals);
        case "class-recovery":
            return buildFinalDrugToFieldQuestion(drug, fullPool, "class", "Class") || buildAdaptiveTopDrugsPlaylistQuestion(drug, fullPool, signals);
        case "category-recovery":
            return buildFinalDrugToFieldQuestion(drug, fullPool, "category", "Category") || buildAdaptiveTopDrugsPlaylistQuestion(drug, fullPool, signals);
        case "moa-recovery":
            return buildFinalDrugToFieldQuestion(drug, fullPool, "moa", "MOA") || buildAdaptiveTopDrugsPlaylistQuestion(drug, fullPool, signals);
        case "most-missed-mix":
        default:
            return buildAdaptiveTopDrugsPlaylistQuestion(drug, fullPool, signals);
    }
}

function buildTopDrugsPlaylistQuestions(data, fullPool) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const playlistKey = String(data?.metadata?.playlistKey || "most-missed-mix");
    const signals = loadTopDrugsSignals();

    return items
        .map((drug) => {
            const question = buildTopDrugsPlaylistQuestionForDrug(drug, fullPool, playlistKey, signals);
            if (!question) return null;
            return {
                ...question,
                _playlistKey: playlistKey
            };
        })
        .filter(Boolean);
}

function isConceptEntry(item) {
    return Boolean(item && (
        item.concept_type ||
        (item.source && item.target && item.relationship)
    ));
}

function formatConceptTerm(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (/^[A-Z]{2,}(?:[-/][A-Z0-9]+)*(?:\s+(?:and|or|to)\s+[A-Z0-9-]+)*$/.test(text)) return text;
    if (/^[A-Z]-[A-Za-z0-9]/.test(text)) return text;
    return text.toLowerCase();
}

function isLikelyConceptSource(value) {
    const text = String(value ?? "").trim();
    if (!text) return false;
    if (/^[A-Z]{2,}(?:[-/][A-Z0-9]+)*(?:\s+(?:and|or|to)\s+[A-Z0-9-]+)*$/.test(text)) return true;
    if (/^[A-Z]-[A-Za-z0-9]/.test(text)) return true;
    const tokens = text.split(/\s+/);
    return tokens.length <= 2 && /^[A-Z][a-z]+(?:\s+[A-Z0-9-]+)?$/.test(text);
}

function getConceptAxisLabel(item) {
    const axisTag = Array.isArray(item?.tags)
        ? item.tags.find(tag => /axis/i.test(String(tag)))
        : "";
    const scope = String(axisTag || item?.topic || item?.subtopic || "").trim();
    return scope ? formatConceptTerm(scope) : "the HPA axis";
}

function getQuestionContextLabel(question) {
    if (question?._mode === "concept" || question?.conceptRef) {
        return state.quizConfig?.questionContextLabel || "Endocrine Concept Practice";
    }

    return state.title || quizCatalog?.getEntry?.(quizId)?.title || "Drug Practice";
}

function getQuestionIdentity(item) {
    if (isConceptEntry(item)) {
        return normalizeQuizValue(item.id || [item.concept_type, item.source, item.target, item.relationship].filter(Boolean).join("|"));
    }

    return normalizeQuizValue(item?.generic || item?.id || item?.brand || item?.class || item?.category || item?.moa);
}

function getTemptingWrongAnswerInsight(question) {
    const reviewQueueStore = window.PharmletReviewQueueStore;
    if (!reviewQueueStore || !question) return null;

    const targetPrompt = normalizeQuizValue(toPlainText(question.prompt || ""));
    const answerValue = question?.answerText !== undefined ? question.answerText : getCorrectAnswerValue(question);
    const targetAnswer = normalizeQuizValue(reviewQueueStore.serializeAnswerValue(answerValue));
    if (!targetPrompt || !targetAnswer) return null;

    const sourceQuizId = normalizeQuizValue(question?.sourceQuizId || getHistoryQuizId());
    const queue = reviewQueueStore.normalizeQueue(safeReadStorageJson(REVIEW_KEY, []));
    const matched = queue.find((entry) => {
        const entryPrompt = normalizeQuizValue(reviewQueueStore.toPlainText(entry.prompt || entry.promptText || ""));
        const entryAnswer = normalizeQuizValue(reviewQueueStore.serializeAnswerValue(entry.answerText !== undefined ? entry.answerText : entry.answer));
        if (entryPrompt !== targetPrompt || entryAnswer !== targetAnswer) return false;

        if (!sourceQuizId) return true;
        return normalizeQuizValue(entry.quizId) === sourceQuizId;
    });

    if (!matched) return null;

    const commonWrong = reviewQueueStore.getCommonWrongAnswer(matched);
    const commonWrongCount = reviewQueueStore.getCommonWrongAnswerCount(matched);
    if (!commonWrong || commonWrongCount <= 0) return null;

    return { commonWrong, commonWrongCount };
}

function saveMissedQuestionsToReviewQueue(questions) {
    const reviewQueueStore = window.PharmletReviewQueueStore;
    const missedEntries = (questions || [])
        .filter(question => question?._answered && !question?._correct)
        .map(question => ({
            quizId: question?.sourceQuizId || getHistoryQuizId(),
            title: question?.sourceTitle || state.title || "",
            type: question?.type || "mcq",
            prompt: question?.prompt || "",
            choices: Array.isArray(question?.choices) ? question.choices : undefined,
            answer: getCorrectAnswerValue(question),
            answerText: question?.answerText,
            userAnswer: Array.isArray(question?._user) ? question._user : (question?._user ?? ""),
            timestamp: new Date().toISOString()
        }))
        .filter(entry => entry.prompt && (entry.answer || Array.isArray(entry.answer)));

    if (!missedEntries.length || !reviewQueueStore) return;

    try {
        const existing = safeReadStorageJson(REVIEW_KEY, []);
        const nextQueue = reviewQueueStore.mergeMissedEntries(existing, missedEntries);
        localStorage.setItem(REVIEW_KEY, JSON.stringify(nextQueue));
    } catch (error) {
        console.warn("Failed to save review queue:", error);
    }
}

function saveReviewRoundResultsToReviewQueue(questions) {
    const reviewQueueStore = window.PharmletReviewQueueStore;
    if (!reviewQueueStore) return;

    const reviewResults = (questions || [])
        .filter(question => question?._answered)
        .map(question => ({
            quizId: question?.sourceQuizId || getHistoryQuizId(),
            title: question?.sourceTitle || state.title || "",
            type: question?.type || "mcq",
            prompt: question?.prompt || "",
            choices: Array.isArray(question?.choices) ? question.choices : undefined,
            answer: getCorrectAnswerValue(question),
            answerText: question?.answerText,
            userAnswer: Array.isArray(question?._user) ? question._user : (question?._user ?? ""),
            correct: !!question?._correct,
            timestamp: new Date().toISOString()
        }))
        .filter(entry => entry.prompt && (entry.answer || Array.isArray(entry.answer)));

    if (!reviewResults.length) return;

    try {
        const existing = safeReadStorageJson(REVIEW_KEY, []);
        const nextQueue = reviewQueueStore.applyReviewResults(existing, reviewResults);
        localStorage.setItem(REVIEW_KEY, JSON.stringify(nextQueue));
    } catch (error) {
        console.warn("Failed to update review queue after review round:", error);
    }
}

function getConceptScopeLabel(item) {
    return [
        item?.unit ? `Unit ${item.unit}` : "",
        item?.topic || "",
        item?.subtopic || ""
    ].filter(Boolean).join(" | ");
}

function getRelationshipVariants(relationship) {
    const base = normalizeQuizValue(relationship);
    if (!base) return [];

    const variants = new Set([base]);
    if (base.endsWith("ies")) variants.add(base.replace(/ies$/, "y"));
    if (/(xes|zes|ches|shes|sses|oes)$/.test(base)) variants.add(base.replace(/es$/, ""));
    if (base.endsWith("s")) variants.add(base.replace(/s$/, ""));
    return [...variants];
}

const CONCEPT_ANSWER_ALIAS_GROUPS = [
    ["growth hormone", "gh", "somatotropin"],
    ["luteinizing hormone", "lh", "lutropin"],
    ["follicle stimulating hormone", "follicle-stimulating hormone", "fsh", "follitropin"],
    ["thyroid stimulating hormone", "thyroid-stimulating hormone", "tsh", "thyrotropin"],
    ["adrenocorticotropic hormone", "acth", "corticotropin"],
    ["corticotropin releasing hormone", "corticotropin-releasing hormone", "crh"],
    ["thyrotropin releasing hormone", "thyrotropin-releasing hormone", "trh"],
    ["growth hormone releasing hormone", "growth hormone-releasing hormone", "ghrh"],
    ["androgen", "androgens"],
    ["prolactin", "prl"],
    ["epinephrine", "adrenaline"],
    ["norepinephrine", "noradrenaline"],
    ["triiodothyronine", "t3"],
    ["thyroxine", "t4"],
    ["parathyroid hormone", "pth"],
    ["antidiuretic hormone", "adh", "vasopressin"]
];

const CONCEPT_ANSWER_ALIAS_LOOKUP = (() => {
    const lookup = new Map();

    const normalizeAliasKey = (value) => String(value ?? "")
        .toLowerCase()
        .replace(/[()]/g, " ")
        .replace(/[-/]+/g, " ")
        .replace(/[.,;:!?]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    for (const group of CONCEPT_ANSWER_ALIAS_GROUPS) {
        const canonical = normalizeAliasKey(group[0]);
        for (const alias of group) {
            const key = normalizeAliasKey(alias);
            if (key) lookup.set(key, canonical);
        }
    }

    return lookup;
})();

function normalizeConceptAnswerKey(value) {
    const text = String(value ?? "")
        .toLowerCase()
        .replace(/[()]/g, " ")
        .replace(/[.,;:!?]+/g, " ")
        .replace(/[-/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!text) return "";

    const direct = CONCEPT_ANSWER_ALIAS_LOOKUP.get(text);
    if (direct) return direct;

    const words = text.split(" ").filter(Boolean);
    const lastWord = words[words.length - 1] || "";
    let singularLast = lastWord;
    if (lastWord.endsWith("ies")) {
        singularLast = lastWord.replace(/ies$/, "y");
    } else if (lastWord.endsWith("s") && !/(ss|us|is|ous)$/i.test(lastWord)) {
        singularLast = lastWord.replace(/s$/, "");
    }

    if (singularLast !== lastWord) {
        const singularText = [...words.slice(0, -1), singularLast].join(" ");
        const singularDirect = CONCEPT_ANSWER_ALIAS_LOOKUP.get(singularText);
        if (singularDirect) return singularDirect;
        return singularText;
    }

    return text;
}

function isConceptAnswerList(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return false;

    if (/[,&/]/.test(raw)) return true;
    if (!/\s+\b(?:and|or)\b\s+/i.test(raw)) return false;

    const lower = raw.toLowerCase();
    if (/\b(stimulat|inhibi|promot|caus|trigger|convert|releas|secret|responsible for|essential for|mediat|process)\b/i.test(lower)) {
        return false;
    }

    const parts = raw.split(/(?:\s*(?:,|\/|&)\s*|\s+\b(?:and|or)\b\s+)/i).map(part => part.trim()).filter(Boolean);
    return parts.length > 1;
}

function normalizeConceptAnswerParts(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return [];

    const parts = isConceptAnswerList(raw)
        ? raw.split(/(?:\s*(?:,|\/|&)\s*|\s+\b(?:and|or)\b\s+)/i)
        : [raw];

    return parts
        .map(part => normalizeConceptAnswerKey(part))
        .filter(Boolean)
        .sort();
}

function areConceptAnswersEquivalent(expected, actual) {
    const expectedParts = normalizeConceptAnswerParts(expected);
    const actualParts = normalizeConceptAnswerParts(actual);

    if (!expectedParts.length || !actualParts.length) return false;
    if (expectedParts.length !== actualParts.length) return false;

    return expectedParts.every((part, index) => part === actualParts[index]);
}

function isStimulusLikeSource(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return false;

    return /\b(increased|decreased|increase|decrease|low|high|elevated|reduced|plasma|blood|glucose|potassium|calcium|sodium|osmolar|pressure|stretch|volume|fasting|fed state|hypoglycemia|hyperglycemia|ph|temperature)\b/.test(text);
}

function getRegulationActorLabel(source) {
    return isStimulusLikeSource(source) ? "What factor" : "Which hormone";
}

function getMultiAnswerPromptNote(answer) {
    return isConceptAnswerList(answer) ? " (More than one answer is expected.)" : "";
}

function stripHtmlTags(value) {
    return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isStatementRecognitionPrompt(prompt) {
    const plain = normalizeQuizValue(stripHtmlTags(prompt));
    return plain.startsWith("which statement") || /\bstatement\b.*\bdescribes\b/.test(plain) || /\bbest describes\b/.test(plain);
}

function isDirectRecallConceptPrompt(prompt) {
    const plain = normalizeQuizValue(stripHtmlTags(prompt));
    if (!plain || isStatementRecognitionPrompt(plain)) return false;

    return /^(what|which)\s+(hormone|hormones|cell|cells|gland|zone|step|steps|factor|process|mechanism|function|comes|happens|is|are|does|do|can)\b/.test(plain)
        || /\bderived from what\b/.test(plain)
        || plain.startsWith("complete the relationship");
}

function isConciseConceptAnswer(answer) {
    const text = String(answer ?? "").trim();
    if (!text) return false;
    if (looksLikeConceptStatement(text)) return false;
    if (isConceptAnswerList(text)) return false;
    return text.split(/\s+/).length <= 7;
}

function normalizeConceptPreferredType(value, preferShort = false) {
    const normalized = normalizeQuizValue(value);
    switch (normalized) {
        case "mcq-only":
        case "mcq_required":
            return "mcq-only";
        case "short-only":
        case "short_required":
            return "short-only";
        case "short_preferred":
        case "short":
            return "short_preferred";
        case "mcq_preferred":
        case "mcq":
            return "mcq_preferred";
        case "mcq_or_short":
        case "mcq-or-short":
            return preferShort ? "short_preferred" : "mcq_preferred";
        default:
            return preferShort ? "short_preferred" : "mcq_preferred";
    }
}

function collectConceptDistractorCandidates(all, item, key, answer) {
    const answerValues = key === "relationship"
        ? getRelationshipVariants(answer)
        : [normalizeQuizValue(answer)];
    const excluded = new Set(answerValues.filter(Boolean));
    const conceptType = normalizeQuizValue(item?.concept_type);
    const scopeKey = normalizeQuizValue(item?.subtopic || item?.topic || item?.unit);
    const pools = [];

    if (conceptType) {
        pools.push(all.filter(entry =>
            isConceptEntry(entry) &&
            entry !== item &&
            entry?.[key] &&
            normalizeQuizValue(entry.concept_type) === conceptType
        ));
    }

    if (scopeKey) {
        pools.push(all.filter(entry =>
            isConceptEntry(entry) &&
            entry !== item &&
            entry?.[key] &&
            normalizeQuizValue(entry?.subtopic || entry?.topic || entry?.unit) === scopeKey
        ));
    }

    pools.push(all.filter(entry => isConceptEntry(entry) && entry !== item && entry?.[key]));

    const seen = new Set();
    const candidates = [];

    for (const pool of pools) {
        for (const entry of shuffled(pool)) {
            const value = entry?.[key];
            const normalized = normalizeQuizValue(value);
            if (!value || excluded.has(normalized) || seen.has(normalized)) continue;
            seen.add(normalized);
            candidates.push({ value, normalized, entry });
            if (candidates.length >= 12) return candidates;
        }
    }

    return candidates;
}

function filterConceptDistractorCandidates({ item, key, conceptPromptKind, candidates }) {
    let filtered = [...candidates];
    const conceptType = normalizeQuizValue(item?.concept_type);
    const sourceNorm = normalizeQuizValue(item?.source);

    // Prevent one-best-answer ambiguity for statement MCQs by excluding other facts about the same source.
    if (conceptType === "fact_statement" && key === "target" && sourceNorm) {
        filtered = filtered.filter(candidate => normalizeQuizValue(candidate?.entry?.source) !== sourceNorm);
    }

    // Keep origin-style adrenal question unambiguous by excluding receptor-action statements.
    if (item?.id === "adrenal-cortex-cholesterol-derived" && conceptPromptKind === "fact-origin") {
        filtered = filtered.filter(candidate => !/diffuse through the cell membrane|intracellular receptors?/i.test(String(candidate?.value)));
    }

    // Keep steroid-action statements focused on mechanism, not biosynthetic origin.
    if (conceptPromptKind === "fact-action") {
        filtered = filtered.filter(candidate => !/derived from cholesterol|cholesterol precursor/i.test(String(candidate?.value)));
    }

    return filtered;
}

function buildConceptMcqQuestion({ item, all, prompt, answer, answerText, key, conceptPromptKind }) {
    let distractorCandidates = collectConceptDistractorCandidates(all, item, key, answer);
    distractorCandidates = filterConceptDistractorCandidates({
        item,
        key,
        conceptPromptKind,
        candidates: distractorCandidates
    });
    const distractors = distractorCandidates.map(candidate => candidate.value);

    if (distractors.length < 3 || !answer) return null;

    return {
        type: "mcq",
        prompt,
        choices: shuffled([answer, ...distractors.slice(0, 3)]),
        answer,
        answerText,
        conceptRef: item,
        conceptPromptKind,
        _mode: "concept"
    };
}

function buildConceptTextQuestion({ item, prompt, answer, answerText, conceptPromptKind, responseType = "short" }) {
    if (!answer) return null;

    return {
        type: responseType === "open" ? "open" : "short",
        prompt,
        answer,
        answerText: answerText || (conceptPromptKind === "relationship" ? getRelationshipVariants(answer) : undefined),
        conceptRef: item,
        conceptPromptKind,
        _mode: "concept"
    };
}

function buildConceptShortQuestion({ item, prompt, answer, answerText, conceptPromptKind }) {
    return buildConceptTextQuestion({
        item,
        prompt,
        answer,
        answerText,
        conceptPromptKind,
        responseType: "short"
    });
}

function buildConceptOpenQuestion({ item, prompt, answer, answerText, conceptPromptKind }) {
    return buildConceptTextQuestion({
        item,
        prompt,
        answer,
        answerText,
        conceptPromptKind,
        responseType: "open"
    });
}

function getConceptHintThemeClue(concept) {
    const conceptType = normalizeQuizValue(concept?.concept_type);
    const context = `${concept?.topic || ""} ${concept?.subtopic || ""} ${concept?.source || ""} ${concept?.target || ""} ${(concept?.tags || []).join(" ")}`.toLowerCase();

    switch (conceptType) {
        case "cell_to_hormone":
            return /anterior pituitary/i.test(context)
                ? "Think anterior pituitary cell-to-hormone pairing."
                : "Think endocrine cell-type to hormone pairing in this tissue.";
        case "gland_to_hormone":
            return "Think gland-level hormone secretion and release patterns.";
        case "zone_to_hormone":
            return "Think adrenal cortical zone specialization and its signature outputs.";
        case "regulation_pair":
            return "Think upstream-to-downstream control direction: stimulatory vs inhibitory.";
        case "sequence_step":
        case "axis_sequence":
            return "Think immediate next-step ordering in the endocrine pathway.";
        case "function_pair":
            if (/thyroid hormone synthesis|iodide|organification|peroxidase|tpo|thyroglobulin|nis/.test(context)) {
                return "Think about iodide processing during thyroid hormone formation.";
            }
            if (/adrenal|cortisol|aldosterone|raas|hpa/.test(context)) {
                return "Think about the key physiologic function within adrenal regulation.";
            }
            return "Think about the core physiologic role or mechanism.";
        case "fact_statement":
            if (/feedback|homeostasis/.test(context)) return "Think core endocrine feedback principles and direction.";
            if (/cholesterol|derived|origin|precursor/.test(context)) return "Think hormone class origin and precursor chemistry.";
            if (/receptor|intracellular|membrane/.test(context)) return "Think hormone class properties and receptor location.";
            return "Think a defining property or mechanism of this concept.";
        default:
            return "Think endocrine pathway context, role, and category clues.";
    }
}

function getConceptHintPathwayClue(concept) {
    const subtopic = String(concept?.subtopic || "").trim();
    const topic = String(concept?.topic || "").trim();

    if (subtopic) return `Pathway/family clue: ${subtopic}.`;
    if (topic) return `Pathway/family clue: ${topic}.`;
    return "";
}

function getConceptHintPromptCue(question, isMcqConceptQuestion) {
    const kind = normalizeQuizValue(question?.conceptPromptKind);
    if (!kind) return "";

    const cues = {
        relationship: "Focus on control direction (upregulation vs downregulation).",
        "sequence-forward": "Focus on the immediate next step, not a distant downstream effect.",
        "sequence-backward": "Focus on the immediate upstream step in the sequence.",
        source: "Focus on the regulator or producer category rather than a process description.",
        target: "Focus on the output hormone/process category.",
        fact: "Focus on definition-level mechanism or property clues.",
        "fact-origin": "Focus on biosynthetic origin and precursor class.",
        "fact-action": "Focus on mechanism of action rather than biosynthetic source."
    };

    if (isMcqConceptQuestion) {
        return cues[kind] || "Use pathway-level clues to eliminate options.";
    }

    return cues[kind] || "Use the pathway context to recall the best matching concept.";
}

function buildConceptHintText(question) {
    const concept = question?.conceptRef;
    if (!concept) return null;

    const lines = [];
    const scope = getConceptScopeLabel(concept);
    if (scope) lines.push(`📘 ${scope}`);
    if (concept.concept_type) lines.push(`🧠 Type: ${concept.concept_type}`);

    const isMcqConceptQuestion = question?.type === "mcq";
    const themeClue = getConceptHintThemeClue(concept);
    const pathwayClue = getConceptHintPathwayClue(concept);
    const promptCue = getConceptHintPromptCue(question, isMcqConceptQuestion);

    if (themeClue) lines.push(`💡 ${themeClue}`);
    if (pathwayClue) lines.push(`🧭 ${pathwayClue}`);
    if (!isMcqConceptQuestion && promptCue) {
        lines.push(`📝 ${promptCue}`);
    } else if (isMcqConceptQuestion && promptCue) {
        lines.push(`🧩 ${promptCue}`);
    }

    return lines.join("\n");
}

function getConceptScopeName(item) {
    return String(item?.topic || item?.subtopic || "").trim();
}

function getConceptStateClause(item) {
    const text = [
        item?.topic,
        item?.subtopic,
        Array.isArray(item?.tags) ? item.tags.join(" ") : ""
    ].filter(Boolean).join(" ").toLowerCase();

    if (!text) return "";
    if (text.includes("fed") || text.includes("postprandial")) return " in the fed state";
    if (text.includes("fasting") || text.includes("fast")) return " in the fasting state";
    return "";
}

function looksLikeConceptStatement(value) {
    const text = String(value ?? "").trim();
    if (!text) return false;
    return text.length > 24 && (/[.?!]$/.test(text) || /\b(is|are|was|were|does|do|causes|cause|stimulates|inhibits|promotes|produces|releases|secretes|triggers|closes|opens)\b/i.test(text));
}

function getConceptPromptSpecs(item) {
    const source = String(item?.source ?? "").trim();
    const target = String(item?.target ?? "").trim();
    const relationship = String(item?.relationship ?? "").trim();
    const conceptType = normalizeQuizValue(item?.concept_type);
    const sourceTerm = formatConceptTerm(source);
    const targetTerm = formatConceptTerm(target);
    const relationshipTerm = formatConceptTerm(relationship);
    const sourceLike = isLikelyConceptSource(source);
    const stateClause = getConceptStateClause(item);
    const scopeName = getConceptScopeName(item);
    const scopeLabel = formatConceptTerm(scopeName);
    const specs = [];

    const addSpec = (prompt, answer, key, conceptPromptKind, answerText, preferredType = "mcq_preferred") => {
        if (!prompt || answer === undefined || answer === null || String(prompt).trim() === "") return;
        specs.push({ prompt, answer, key, conceptPromptKind, answerText, preferredType });
    };

    const relationQuestion = source && target && relationship
        ? `What relationship best describes <b>${sourceTerm}</b> and <b>${targetTerm}</b>?`
        : null;

    switch (conceptType) {
        case "regulation_pair": {
            if (source && target && relationship) {
                const actorLabel = getRegulationActorLabel(source);
                if (/^stimulates$/i.test(relationshipTerm)) {
                    addSpec(`${actorLabel} stimulates ${targetTerm} release?`, source, "source", "relationship");
                    addSpec(`${actorLabel} stimulates ${targetTerm} secretion?`, source, "source", "relationship");
                } else if (/^inhibits$/i.test(relationshipTerm)) {
                    addSpec(`${actorLabel} inhibits ${targetTerm} secretion?`, source, "source", "relationship");
                    addSpec(`${actorLabel} inhibits ${targetTerm} release?`, source, "source", "relationship");
                } else if (/^stimulates\s+/i.test(relationshipTerm) || /^inhibits\s+/i.test(relationshipTerm)) {
                    addSpec(`${actorLabel} ${relationshipTerm}?`, source, "source", "relationship");
                } else if (relationship) {
                    addSpec(relationQuestion, relationship, "relationship", "relationship", getRelationshipVariants(relationship));
                }
                addSpec(
                    `<b>${sourceTerm}</b> _____ <b>${targetTerm}</b>.`,
                    relationship,
                    "relationship",
                    "relationship",
                    getRelationshipVariants(relationship),
                    "short"
                );
            }
            break;
        }
        case "cell_to_hormone": {
            if (source && target) {
                const sourceAnswerNote = getMultiAnswerPromptNote(source);
                const targetAnswerNote = getMultiAnswerPromptNote(target);
                const isPlural = isConceptAnswerList(target);
                const hormoneLabel = isPlural ? "Which hormones" : "Which hormone";
                const verb = isPlural ? "are" : "is";
                if (/anterior pituitary/i.test(item?.topic || "")) {
                    addSpec(`Which anterior pituitary cell secretes ${targetTerm}?${sourceAnswerNote}`, source, "source", "source");
                } else if (/endocrine pancreas|islet/i.test(item?.topic || "")) {
                    addSpec(`Which pancreatic islet cell secretes ${targetTerm}?${sourceAnswerNote}`, source, "source", "source");
                } else {
                    addSpec(`Which cell secretes ${targetTerm}?${sourceAnswerNote}`, source, "source", "source");
                }

                addSpec(`${hormoneLabel} ${verb} secreted by the ${sourceTerm}?${targetAnswerNote}`, target, "target", "target");
            }
            break;
        }
        case "gland_to_hormone": {
            if (source && target) {
                const multiAnswerNote = getMultiAnswerPromptNote(target);
                const isPlural = isConceptAnswerList(target);
                const hormoneLabel = isPlural ? "Which hormones" : "Which hormone";
                const verb = isPlural ? "are" : "is";
                const glandPrompt = /medulla/i.test(source) || /medulla/i.test(item?.topic || "")
                    ? `${hormoneLabel} ${verb} released by the ${sourceTerm}?${multiAnswerNote}`
                    : `${hormoneLabel} ${verb} secreted by the ${sourceTerm}?${multiAnswerNote}`;
                addSpec(glandPrompt, target, "target", "target");
                addSpec(`Which gland secretes ${targetTerm}?`, source, "source", "source");
            }
            break;
        }
        case "zone_to_hormone": {
            if (source && target) {
                const multiAnswerNote = getMultiAnswerPromptNote(target);
                const isPlural = isConceptAnswerList(target);
                const hormoneLabel = isPlural ? "Which hormones" : "Which hormone";
                const verb = isPlural ? "are" : "is";
                addSpec(`${hormoneLabel} ${verb} produced by the ${sourceTerm}?${multiAnswerNote}`, target, "target", "target");
                addSpec(`Which adrenal zone produces ${targetTerm}?`, source, "source", "source");
            }
            break;
        }
        case "function_pair": {
            if (source && target) {
                const contextText = `${item?.topic || ""} ${item?.subtopic || ""} ${source} ${target}`.toLowerCase();
                const relationshipBase = normalizeQuizValue(relationship);
                const isThyroidSynthesisContext = /thyroid hormone synthesis|iodide|organification|peroxidase|tpo|thyroglobulin|nis/.test(contextText);

                if (item?.id === "na-k-atpase-supports-nis") {
                    addSpec(
                        "Na+/K+ ATPase supports iodide trapping by maintaining what?",
                        target,
                        "target",
                        "target",
                        undefined,
                        "short_preferred"
                    );
                    addSpec(
                        "What does Na+/K+ ATPase help maintain during iodide trapping?",
                        target,
                        "target",
                        "target",
                        undefined,
                        "short_preferred"
                    );
                    break;
                }

                if (isThyroidSynthesisContext && /peroxidase|tpo/.test(contextText)) {
                    addSpec(
                        "Thyroid peroxidase is directly involved in what process?",
                        target,
                        "target",
                        "target",
                        undefined,
                        "short_preferred"
                    );
                    addSpec(
                        "Which thyroid hormone synthesis step is catalyzed by thyroid peroxidase?",
                        target,
                        "target",
                        "target",
                        undefined,
                        "mcq_preferred"
                    );
                    break;
                }

                if (/(\band\b|,)/i.test(source)) {
                    addSpec(`What are ${sourceTerm} primarily responsible for${stateClause}?`, target, "target", "fact", undefined, "short_preferred");
                } else {
                    if (/supports|maintain/.test(relationshipBase) || /\bmaintain/i.test(target)) {
                        addSpec(`What does ${sourceTerm} help maintain${stateClause}?`, target, "target", "target", undefined, "short_preferred");
                    } else if (/catalyz|mediat|facilitat|responsible_for|helps_with|serves_as|does/.test(relationshipBase)) {
                        addSpec(`${sourceTerm} is directly involved in what process${stateClause}?`, target, "target", "target", undefined, "short_preferred");
                    } else {
                        addSpec(`What is a key function of ${sourceTerm}${stateClause}?`, target, "target", "target", undefined, "short_preferred");
                    }
                }

                addSpec(`Which process best matches the role of ${sourceTerm}${stateClause}?`, target, "target", "target", undefined, "mcq_preferred");
            }
            break;
        }
        case "fact_statement": {
            if (source && target) {
                const isSteroidActionFact = /steroid hormones?/i.test(source)
                    && /(diffuse through the cell membrane|bind intracellular receptors?|intracellular receptors?)/i.test(target);
                if (isSteroidActionFact) {
                    const actionAliases = Array.isArray(item?.answer_aliases)
                        ? item.answer_aliases
                        : undefined;
                    addSpec(
                        "Which statement best describes how steroid hormones act at target cells?",
                        target,
                        "target",
                        "fact-action",
                        actionAliases,
                        "mcq-only"
                    );
                    addSpec(
                        "Steroid hormones primarily act through what receptor location?",
                        "Intracellular receptors",
                        "target",
                        "fact-action",
                        ["intracellular receptors", "inside the cell", "nuclear receptors"],
                        "short_preferred"
                    );
                    break;
                }

                const isAdrenocorticalOriginFact = /adrenocortical hormones/i.test(source)
                    && /cholesterol/i.test(`${target} ${relationship}`);
                if (isAdrenocorticalOriginFact) {
                    const originStatement = "Are derived from cholesterol";

                    addSpec(
                        "Which statement specifically describes the origin of adrenocortical hormones?",
                        originStatement,
                        "target",
                        "fact-origin",
                        undefined,
                        "mcq-only"
                    );
                    addSpec(
                        "Adrenocortical hormones are derived from what?",
                        "Cholesterol",
                        "target",
                        "fact-origin",
                        undefined,
                        "short"
                    );
                    break;
                }

                const isSteroidOriginFact = /steroid hormones?/i.test(source)
                    && /cholesterol/i.test(`${target} ${relationship}`);
                if (isSteroidOriginFact) {
                    const originAnswer = /derived from/i.test(target)
                        ? target
                        : `Derived from ${formatConceptTerm(target)}`;
                    const originAliases = Array.isArray(item?.answer_aliases)
                        ? [...item.answer_aliases, target]
                        : [target];
                    addSpec(
                        "Which statement specifically describes the origin of steroid hormones?",
                        originAnswer,
                        "target",
                        "fact-origin",
                        originAliases,
                        "mcq-only"
                    );
                    addSpec(
                        "Steroid hormones are derived from what precursor?",
                        "Cholesterol",
                        "target",
                        "fact-origin",
                        ["cholesterol"],
                        "short_preferred"
                    );
                    break;
                }

                const useTargetAsTopic = looksLikeConceptStatement(source) && !looksLikeConceptStatement(target);
                const factTopic = useTargetAsTopic ? targetTerm : sourceTerm;
                const factAnswer = useTargetAsTopic ? source : target;
                addSpec(`Which statement about ${factTopic} is correct?`, factAnswer, useTargetAsTopic ? "source" : "target", "fact");
            }
            break;
        }
        case "sequence_step": {
            if (source && target) {
                if (/glucose metabolism in beta cells/i.test(source)) {
                    addSpec(`What happens after glucose metabolism in beta cells?`, target, "target", "sequence-forward");
                } else if (/increased atp/i.test(source)) {
                    addSpec(`What happens after increased ATP?`, target, "target", "sequence-forward");
                } else if (/cholesterol/i.test(source) && /pregnenolone/i.test(target)) {
                    addSpec(`What is the first step in steroid hormone synthesis?`, target, "target", "sequence-forward");
                } else {
                    addSpec(`What comes next after ${sourceTerm}${scopeLabel ? ` in ${scopeLabel}` : ""}?`, target, "target", "sequence-forward");
                }

                addSpec(`Which step comes before ${targetTerm}?`, source, "source", "sequence-backward");
            }
            break;
        }
        case "consequence_pair": {
            if (source && target) {
                addSpec(`What can ${sourceTerm} cause?`, target, "target", "fact");
                addSpec(`Which consequence is associated with ${sourceTerm}?`, target, "target", "fact");
            }
            break;
        }
        case "axis_sequence": {
            if (source && target) {
                addSpec(`Which sequence correctly describes the ${getConceptAxisLabel(item)}?`, target, "target", "sequence-forward");
                addSpec(`What comes after ${sourceTerm} in the ${getConceptAxisLabel(item)}?`, target, "target", "sequence-forward");
            }
            break;
        }
        default: {
            if (source && target) {
                if (/^stimulates$/i.test(relationshipTerm)) {
                    addSpec(`${getRegulationActorLabel(source)} stimulates ${targetTerm} release?`, source, "source", "relationship");
                } else if (/^inhibits$/i.test(relationshipTerm)) {
                    addSpec(`${getRegulationActorLabel(source)} inhibits ${targetTerm} secretion?`, source, "source", "relationship");
                } else if (relationship) {
                    addSpec(relationQuestion, relationship, "relationship", "relationship", getRelationshipVariants(relationship));
                }

                if (/\b(cell|cells|gland|pituitary|adrenal|thyroid|zona|zone|cortex|medulla|hypothalamus|pancreas|ovary|testis)\b/i.test(source)) {
                    addSpec(`Which hormone is secreted by the ${sourceTerm}?`, target, "target", "target");
                }

                if (!looksLikeConceptStatement(source) && looksLikeConceptStatement(target)) {
                    addSpec(`Which statement about ${sourceTerm} is correct?`, target, "target", "fact");
                }

                addSpec(`What relationship best describes ${sourceTerm} and ${targetTerm}?`, relationship || target, relationship ? "relationship" : "target", relationship ? "relationship" : "target", relationship ? getRelationshipVariants(relationship) : undefined);
            }
        }
    }

    return specs;
}

function getConceptBuildersForPreference(preference, mcqBuilder, shortBuilder, openBuilder) {
    switch (preference) {
        case "mcq-only":
            return [mcqBuilder];
        case "short-only":
            return [shortBuilder];
        case "open-only":
            return [openBuilder];
        case "short_preferred":
            return [shortBuilder, mcqBuilder];
        case "open_preferred":
            return [openBuilder, shortBuilder, mcqBuilder];
        case "mcq_preferred":
        default:
            return [mcqBuilder, shortBuilder];
    }
}

function resolveConceptSpecPreference(item, spec, preferShort, forcedType = "") {
    const forced = normalizeQuizValue(forcedType);
    if (forced === "mcq") return "mcq-only";
    if (forced === "short") return "short-only";
    if (forced === "open") return "open-only";

    const itemPreference = normalizeConceptPreferredType(item?.prompt_bias, preferShort);
    let specPreference = normalizeConceptPreferredType(spec?.preferredType, preferShort);
    const conceptType = normalizeQuizValue(item?.concept_type);
    const hasMultiTargetAnswer = isConceptAnswerList(item?.target);

    if (isStatementRecognitionPrompt(spec?.prompt)) {
        specPreference = "mcq-only";
    }

    const obviousMcqConcept = ["cell_to_hormone", "gland_to_hormone", "zone_to_hormone"].includes(conceptType)
        && hasMultiTargetAnswer;
    if (obviousMcqConcept && specPreference !== "mcq-only" && itemPreference !== "mcq-only") {
        specPreference = "short_preferred";
    }

    if (isDirectRecallConceptPrompt(spec?.prompt)
        && isConciseConceptAnswer(spec?.answer)
        && specPreference === "mcq_preferred"
        && itemPreference !== "mcq-only") {
        specPreference = "short_preferred";
    }

    if (itemPreference === "mcq-only") {
        return specPreference === "short-only" ? "skip" : "mcq-only";
    }

    if (itemPreference === "short-only") {
        return specPreference === "mcq-only" ? "skip" : "short-only";
    }

    if (specPreference === "mcq-only" || specPreference === "short-only") {
        return specPreference;
    }

    if (itemPreference === "short_preferred" && specPreference !== "mcq-only") {
        return "short_preferred";
    }

    if (itemPreference === "mcq_preferred" && specPreference !== "short-only") {
        return "mcq_preferred";
    }

    return specPreference;
}

function createConceptQuestion(item, all, options = {}) {
    const difficulty = normalizeQuizValue(item?.difficulty);
    const preferShort = /hard|advanced|challenging/.test(difficulty);
    const forcedType = normalizeQuizValue(options?.forcedType);
    const promptSpecs = shuffled(getConceptPromptSpecs(item));

    for (const spec of promptSpecs) {
        const mcqBuilder = () => buildConceptMcqQuestion({
            item,
            all,
            prompt: spec.prompt,
            answer: spec.answer,
            answerText: spec.answerText,
            key: spec.key,
            conceptPromptKind: spec.conceptPromptKind
        });
        const shortBuilder = () => buildConceptShortQuestion({
            item,
            prompt: spec.prompt,
            answer: spec.answer,
            answerText: spec.answerText,
            conceptPromptKind: spec.conceptPromptKind
        });
        const openBuilder = () => buildConceptOpenQuestion({
            item,
            prompt: spec.prompt,
            answer: spec.answer,
            answerText: spec.answerText,
            conceptPromptKind: spec.conceptPromptKind
        });

        const preference = resolveConceptSpecPreference(item, spec, preferShort, forcedType);
        if (preference === "skip") continue;
        const builders = getConceptBuildersForPreference(preference, mcqBuilder, shortBuilder, openBuilder);

        for (const build of builders) {
            const question = build();
            if (question) return question;
        }
    }

    if (forcedType === "mcq") return null;

    const source = String(item?.source ?? "").trim();
    const target = String(item?.target ?? "").trim();
    const relationship = String(item?.relationship ?? "").trim();
    const fallbackAnswer = relationship || target || source || item?.id || "Unknown";
    const fallbackResponseType = forcedType === "open" ? "open" : "short";
    return {
        type: fallbackResponseType,
        prompt: source && target
            ? `<b>${formatConceptTerm(source)}</b> _____ <b>${formatConceptTerm(target)}</b>.`
            : source
                ? `What is a key concept linked to <b>${formatConceptTerm(source)}</b>?`
                : `Endocrine concept practice`,
        answer: fallbackAnswer,
        answerText: relationship ? getRelationshipVariants(relationship) : undefined,
        conceptRef: item,
        conceptPromptKind: relationship ? "relationship" : "target",
        _mode: "concept"
    };
}

function createQuestionFromItem(item, all, options = {}) {
    return isConceptEntry(item)
        ? createConceptQuestion(item, all, options)
        : createQuestion(item, all);
}

function getConceptQuizConfig(quizIdentifier = quizId) {
    return quizIdentifier ? CONCEPT_QUIZ_CONFIGS[quizIdentifier] || null : null;
}

async function loadConceptQuizPool(config) {
    const loadConfiguredFile = async (fileName) => {
        const rawPool = await smartFetch(fileName);
        const conceptPool = flattenPoolData(rawPool).filter(isConceptEntry);
        return { rawPool, conceptPool };
    };

    try {
        const loaded = await loadConfiguredFile(config.poolFile);
        return { ...loaded, usingFallbackPool: false, resolvedPoolFile: config.poolFile };
    } catch (primaryError) {
        if (!config.fallbackPoolFile) {
            throw new Error(config.missingPoolMessage || primaryError.message);
        }

        try {
            const loaded = await loadConfiguredFile(config.fallbackPoolFile);
            return { ...loaded, usingFallbackPool: true, resolvedPoolFile: config.fallbackPoolFile };
        } catch (fallbackError) {
            throw new Error(config.missingPoolMessage || fallbackError.message || primaryError.message);
        }
    }
}

function getConceptQuizSize(config) {
    return Number(config?.quizSize || CONCEPT_QUIZ_SIZE);
}

function getConceptBlueprintLabel(config) {
    if (!Array.isArray(config?.blueprint) || !config.blueprint.length) return "";
    return config.blueprint.map((section) => `${section.count} ${section.label}`).join(" • ");
}

function prioritizeConceptPoolItems(pool, lastRoundKeys = [], forcedType = "") {
    const lastRoundSet = new Set(Array.isArray(lastRoundKeys) ? lastRoundKeys : []);
    const typeKey = normalizeQuizValue(forcedType);

    const scoreItem = (item) => {
        const conceptType = normalizeQuizValue(item?.concept_type);
        const answerCandidate = String(item?.relationship || item?.target || item?.source || "").trim();
        const conciseAnswer = isConciseConceptAnswer(answerCandidate);
        const longAnswer = looksLikeConceptStatement(answerCandidate) || answerCandidate.split(/\s+/).length > 7;
        const preference = normalizeConceptPreferredType(item?.prompt_bias);
        let score = Math.random() * 0.2;

        if (typeKey === "mcq") {
            if (preference === "mcq-only" || preference === "mcq_preferred") score += 2.2;
            if (looksLikeConceptStatement(item?.target)) score += 1.4;
            if (["fact_statement", "function_pair", "axis_sequence", "sequence_step"].includes(conceptType)) score += 0.8;
        } else if (typeKey === "short") {
            if (preference === "short-only" || preference === "short_preferred") score += 2.2;
            if (conciseAnswer) score += 1.7;
            if (isConceptAnswerList(answerCandidate)) score += 0.5;
            if (longAnswer) score -= 1.3;
        } else if (typeKey === "open") {
            if (longAnswer) score += 2.3;
            if (["function_pair", "fact_statement", "sequence_step", "axis_sequence", "consequence_pair"].includes(conceptType)) score += 1.6;
            if (conciseAnswer) score -= 1.5;
        }

        return score;
    };

    const unseenItems = shuffled(pool.filter((item) => !lastRoundSet.has(getQuestionIdentity(item))))
        .sort((a, b) => scoreItem(b) - scoreItem(a));
    const repeatItems = shuffled(pool.filter((item) => lastRoundSet.has(getQuestionIdentity(item))))
        .sort((a, b) => scoreItem(b) - scoreItem(a));

    return [...unseenItems, ...repeatItems];
}

function buildConceptBlueprintQuestions({ config, pool, fullPool, lastRoundKeys }) {
    const blueprint = Array.isArray(config?.blueprint) ? config.blueprint : [];
    if (!blueprint.length) return null;

    const selectedItems = [];
    const builtQuestions = [];
    const usedIdentities = new Set();

    for (const section of blueprint) {
        const forcedType = normalizeQuizValue(section?.type);
        const targetCount = Number(section?.count || 0);
        if (!forcedType || targetCount <= 0) continue;

        const orderedItems = prioritizeConceptPoolItems(pool, lastRoundKeys, forcedType);
        let builtCount = 0;

        for (const item of orderedItems) {
            const identity = getQuestionIdentity(item);
            if (!identity || usedIdentities.has(identity)) continue;

            const question = createConceptQuestion(item, fullPool, { forcedType });
            if (!question) continue;

            selectedItems.push(item);
            builtQuestions.push({
                ...question,
                _conceptSectionType: forcedType
            });
            usedIdentities.add(identity);
            builtCount += 1;

            if (builtCount >= targetCount) break;
        }

        if (builtCount < targetCount) {
            throw new Error(`${config?.title || "Concept quiz"} could only build ${builtCount} of ${targetCount} required ${section.label || forcedType} question(s).`);
        }
    }

    return {
        selectedItems,
        questions: shuffled(builtQuestions)
    };
}

function createQuestion(drug, all) {
    // Smart Distractor Helper - Prioritizes same class, then category, excludes target drug
    const normalizeChoiceValue = (value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
    const uniqueChoiceValues = (pool, key, excluded = new Set()) => {
        const seen = new Set();
        const values = [];

        for (const item of shuffled(pool)) {
            const value = item?.[key];
            const normalized = normalizeChoiceValue(value);

            if (!value || excluded.has(normalized) || seen.has(normalized)) continue;
            seen.add(normalized);
            values.push(value);
        }

        return values;
    };

    const getSmartDistracters = (targetDrug, targetValue, key) => {
        const excluded = new Set([normalizeChoiceValue(targetValue)]);

        // High Priority: Same class as target drug
        const sameClass = uniqueChoiceValues(
            all.filter(d => 
                d !== targetDrug && 
                d[key] && 
                d.class === targetDrug.class &&
                !isAmbiguousTherapeuticFieldMatch(targetValue, d[key], key, all)
            ),
            key,
            excluded
        );
        if (sameClass.length >= 3) {
            return sameClass.slice(0, 3);
        }
        
        // Medium Priority: Same category as target drug
        const sameCategory = uniqueChoiceValues(
            all.filter(d =>
                d !== targetDrug &&
                d[key] &&
                d.category === targetDrug.category &&
                !isAmbiguousTherapeuticFieldMatch(targetValue, d[key], key, all)
            ),
            key,
            excluded
        );
        if (sameCategory.length >= 3) {
            return sameCategory.slice(0, 3);
        }
        
        // Fall back to random drugs (exclude target drug and target value)
        const random = uniqueChoiceValues(
            all.filter(d => d !== targetDrug && d[key] && !isAmbiguousTherapeuticFieldMatch(targetValue, d[key], key, all)),
            key,
            excluded
        ).slice(0, 3);
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
            all.filter(
                d => d !== drug
                    && d[attr.key]
                    && d[attr.key] !== targetValue
                    && !isAmbiguousTherapeuticFieldMatch(targetValue, d[attr.key], attr.key, all)
            )
        )[0];
        
        if (!differentAttribute) return null; // Can't find a different attribute
        
        const correctAnswer = differentAttribute.generic;
        const wrongAnswers = sameAttribute.map(d => d.generic);
        
        return {
            type: "mcq",
            prompt: `Which is <b>NOT</b> a drug with <b>${attr.label} ${targetValue}</b>?`,
            choices: shuffled([correctAnswer, ...wrongAnswers]),
            answer: correctAnswer,
            drugRef: drug,
            _focusFieldKey: attr.key,
            _focusFieldValue: targetValue
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
        
        // Wrong answers: Each drug paired with a WRONG class (not their own, not target's)
        // This creates distinct options so students can identify the correctly paired one
        const wrongAnswers = selectedOthers.map((d, idx) => {
            // Get a random wrong class from other drugs (exclude this drug's class and target's class)
            const wrongClassPool = all
                .filter(
                    other => other.class
                        && other.class !== d.class
                        && other.class !== drug.class
                        && !isAmbiguousTherapeuticFieldMatch(d.class, other.class, "class", all)
                )
                .map(other => other.class);

            if (!wrongClassPool.length) return null;

            // Use different wrong classes for variety (rotate through pool)
            const wrongClass = wrongClassPool[idx % wrongClassPool.length] || wrongClassPool[0];
            return `${d.generic}: ${wrongClass}`;
        }).filter(Boolean);

        if (wrongAnswers.length < 3) return null;
        
        return {
            type: "mcq",
            prompt: `Which of the following medications are <b>correctly paired</b> with their medication class?`,
            choices: shuffled([correctAnswer, ...wrongAnswers]),
            answer: correctAnswer,
            drugRef: drug,
            _focusFieldKey: "class",
            _focusFieldValue: drug.class
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
            drugRef: drug,
            _focusFieldKey: t.k,
            _focusFieldValue: correctAns
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
        const signals = loadTopDrugsSignals();
        const brandClassQuestion = buildTopDrugsBrandClassQuestion(drug, all, {
            signals,
            targetBrand: singleBrand
        });
        if (brandClassQuestion) return brandClassQuestion;
    }
    
    // Generic → Brand (Short Answer) (25% normal, 20% Lab 2)
    const genericBrandThreshold = isLab2Quiz ? 0.50 : 0.60;
    if (r < genericBrandThreshold) {
        const brandPromptLabel = getGenericBrandPromptLabel(drug, singleBrand);
        return { 
            type: "short", 
            prompt: `Brand for <b>${brandPromptLabel || drug.generic}</b>?`,
            answer: singleBrand, 
            drugRef: drug,
            _brandVariant: singleBrand,
            _restrictBrandVariantAnswers: !!getBrandQualifier(singleBrand)
        };
    }
    
    // Brand → Generic (Short Answer) (15% for both)
    const brandGenericThreshold = isLab2Quiz ? 0.65 : 0.75;
    if (r < brandGenericThreshold) {
        return buildBrandToGenericQuestion(drug, singleBrand);
    }
    
    // Negative MCQ ("Which is NOT...?") (15% for both)
    const negativeMCQThreshold = isLab2Quiz ? 0.80 : 0.90;
    if (r < negativeMCQThreshold) {
        const negMCQ = createNegativeMCQ();
        if (negMCQ) return negMCQ;
        // Fallback if negative MCQ can't be created
        return buildBrandToGenericQuestion(drug, singleBrand);
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
        return buildBrandToGenericQuestion(drug, singleBrand);
    }
    
    const t = mcqTypes[Math.floor(Math.random() * mcqTypes.length)];
    const correctAns = drug[t.k];
    const distractors = getSmartDistracters(drug, correctAns, t.k);
    
    return {
        type: "mcq",
        prompt: `<b>${t.l}</b> for <b>${drug.generic}</b>?`,
        choices: shuffled([correctAns, ...distractors]),
        answer: correctAns,
        drugRef: drug,
        _focusFieldKey: t.k,
        _focusFieldValue: correctAns
    };
}

function computeFinalQuestionFamilyTargets(totalCount) {
    const targets = {};
    const withFractions = [];
    let assigned = 0;

    for (const { family, weight } of FINAL_BLUEPRINT_FAMILY_WEIGHTS) {
        const exact = totalCount * weight;
        const base = Math.floor(exact);
        targets[family] = base;
        assigned += base;
        withFractions.push({ family, fraction: exact - base });
    }

    let remainder = totalCount - assigned;
    withFractions.sort((a, b) => b.fraction - a.fraction);
    let index = 0;

    while (remainder > 0 && withFractions.length) {
        const family = withFractions[index % withFractions.length].family;
        targets[family] += 1;
        index += 1;
        remainder -= 1;
    }

    return targets;
}

function buildFinalPoolStats(pool) {
    const classToDrugs = new Map();
    const categoryToDrugs = new Map();
    const moaToDrugs = new Map();
    const allClasses = [];
    const allCategories = [];

    const addToMap = (map, key, drug) => {
        const normalized = normalizeDrugKey(key);
        if (!normalized) return;
        if (!map.has(normalized)) map.set(normalized, []);
        map.get(normalized).push(drug);
    };

    for (const drug of pool) {
        addToMap(classToDrugs, drug?.class, drug);
        addToMap(categoryToDrugs, drug?.category, drug);
        addToMap(moaToDrugs, drug?.moa, drug);
        if (drug?.class) allClasses.push(drug.class);
        if (drug?.category) allCategories.push(drug.category);
    }

    return {
        classToDrugs,
        categoryToDrugs,
        moaToDrugs,
        allClasses: [...new Set(allClasses.filter(Boolean))],
        allCategories: [...new Set(allCategories.filter(Boolean))]
    };
}

function canBuildFinalQuestionFamily(drug, family, poolStats) {
    const classKey = normalizeDrugKey(drug?.class);
    const categoryKey = normalizeDrugKey(drug?.category);
    const moaKey = normalizeDrugKey(drug?.moa);
    const brandCount = splitBrandNames(drug?.brand).length;

    switch (family) {
        case "generic_to_brand":
        case "brand_to_generic":
            return brandCount > 0;
        case "brand_class_pair":
            return brandCount > 0 && Boolean(classKey) && poolStats.allClasses.length >= 4;
        case "brand_category_pair":
            return brandCount > 0 && Boolean(categoryKey) && poolStats.allCategories.length >= 4;
        case "drug_to_class":
            return Boolean(classKey);
        case "drug_to_category":
            return Boolean(categoryKey);
        case "drug_to_moa":
            return Boolean(moaKey);
        case "class_to_drug":
            return Boolean(classKey);
        case "category_to_drug":
            return Boolean(categoryKey);
        case "moa_to_drug":
            return Boolean(moaKey);
        case "paired_med_class":
            return Boolean(classKey) && poolStats.allClasses.length >= 4;
        case "paired_med_category":
            return Boolean(categoryKey) && poolStats.allCategories.length >= 4;
        case "negative_mcq": {
            const classCount = classKey ? (poolStats.classToDrugs.get(classKey)?.length || 0) : 0;
            const categoryCount = categoryKey ? (poolStats.categoryToDrugs.get(categoryKey)?.length || 0) : 0;
            return classCount >= 4 || categoryCount >= 4;
        }
        default:
            return false;
    }
}

function getFinalQuestionFamilyCandidates(drug, poolStats) {
    return FINAL_BLUEPRINT_FAMILY_WEIGHTS
        .map(item => item.family)
        .filter(family => canBuildFinalQuestionFamily(drug, family, poolStats));
}

function getFinalQuestionFamilyFocusKey(family) {
    switch (family) {
        case "generic_to_brand":
        case "brand_to_generic":
            return "brand";
        case "brand_class_pair":
        case "drug_to_class":
        case "class_to_drug":
        case "paired_med_class":
            return "class";
        case "brand_category_pair":
        case "drug_to_category":
        case "category_to_drug":
        case "paired_med_category":
            return "category";
        case "drug_to_moa":
        case "moa_to_drug":
            return "moa";
        case "negative_mcq":
            return "generic";
        default:
            return "";
    }
}

function getFinalFamilyAdaptiveBonus(drug, family, context) {
    const focusScores = getFinalAdaptiveFocusScores(drug, context.signals);
    const focusKey = getFinalQuestionFamilyFocusKey(family);
    const dominantFocus = getDominantFinalAdaptiveFocusKey(drug, context.signals);
    const comboGeneric = isCombinationGenericName(drug?.generic);
    const comboContraceptive = isContraceptiveCombinationDrug(drug);

    let score = 0;
    if (focusKey && focusScores[focusKey]) {
        score += focusScores[focusKey] * 0.46;
    }

    if (dominantFocus && focusKey && dominantFocus === focusKey) {
        score += 0.42;
    }

    if (focusKey === "brand" && focusScores.generic > 0) {
        score += focusScores.generic * 0.08;
    }

    if (focusKey === "moa" && focusScores.generic > 0) {
        score += focusScores.generic * 0.12;
    }

    if (comboGeneric && [
        "generic_to_brand",
        "brand_to_generic",
        "brand_category_pair",
        "drug_to_class",
        "drug_to_category",
        "class_to_drug",
        "category_to_drug",
        "paired_med_category"
    ].includes(family)) {
        score += 0.32;
    }

    if (comboContraceptive && [
        "generic_to_brand",
        "brand_to_generic",
        "brand_category_pair",
        "drug_to_class",
        "drug_to_category",
        "class_to_drug",
        "category_to_drug",
        "paired_med_category"
    ].includes(family)) {
        score += 0.38;
    }

    return score;
}

function scoreFinalFamilyChoice(drug, family, currentCounts, targetCounts, context) {
    const genericKey = normalizeDrugKey(drug?.generic);
    const deficit = Math.max(0, (targetCounts[family] || 0) - (currentCounts[family] || 0));
    const familyRecentPenalty = Number(context.recentFamilyUsageByGeneric?.[genericKey]?.[family] || 0);
    const genericRecentPenalty = Number(context.recentGenericUsage?.[genericKey] || 0);

    let score = Math.random() * 0.16;
    score += deficit * 1.1;
    score += getDrugWeaknessScore(drug, context.signals) * 0.12;
    score += getFinalFamilyAdaptiveBonus(drug, family, context);

    score -= familyRecentPenalty * 1.2;
    score -= genericRecentPenalty * 0.16;
    return score;
}

function assignFinalQuestionFamilies(selectedDrugs, poolStats, context) {
    const families = FINAL_BLUEPRINT_FAMILY_WEIGHTS.map(item => item.family);
    const targetCounts = computeFinalQuestionFamilyTargets(selectedDrugs.length);
    const currentCounts = Object.fromEntries(families.map(family => [family, 0]));
    const assignments = new Map();

    const candidatesByFamily = new Map();
    for (const family of families) {
        candidatesByFamily.set(family, selectedDrugs.filter(drug => canBuildFinalQuestionFamily(drug, family, poolStats)));
    }

    const familyOrder = [...families].sort((a, b) => {
        const slackA = (candidatesByFamily.get(a)?.length || 0) - (targetCounts[a] || 0);
        const slackB = (candidatesByFamily.get(b)?.length || 0) - (targetCounts[b] || 0);
        return slackA - slackB;
    });

    for (const family of familyOrder) {
        while ((currentCounts[family] || 0) < (targetCounts[family] || 0)) {
            const available = (candidatesByFamily.get(family) || [])
                .filter(drug => !assignments.has(normalizeDrugKey(drug?.generic)));
            if (!available.length) break;

            const ranked = available
                .map(drug => ({
                    drug,
                    score: scoreFinalFamilyChoice(drug, family, currentCounts, targetCounts, context)
                }))
                .sort((a, b) => b.score - a.score);

            const top = ranked.slice(0, Math.min(4, ranked.length));
            const chosen = top[Math.floor(Math.random() * top.length)]?.drug || ranked[0]?.drug;
            if (!chosen) break;

            assignments.set(normalizeDrugKey(chosen?.generic), family);
            currentCounts[family] = (currentCounts[family] || 0) + 1;
        }
    }

    for (const drug of selectedDrugs) {
        const genericKey = normalizeDrugKey(drug?.generic);
        if (!genericKey || assignments.has(genericKey)) continue;

        const familyCandidates = getFinalQuestionFamilyCandidates(drug, poolStats);
        if (!familyCandidates.length) continue;

        const ranked = familyCandidates
            .map(family => ({
                family,
                score: scoreFinalFamilyChoice(drug, family, currentCounts, targetCounts, context)
            }))
            .sort((a, b) => b.score - a.score);

        const chosenFamily = ranked[0]?.family;
        if (!chosenFamily) continue;

        assignments.set(genericKey, chosenFamily);
        currentCounts[chosenFamily] = (currentCounts[chosenFamily] || 0) + 1;
    }

    return { assignments, currentCounts, targetCounts };
}

function rankByTherapeuticSimilarity(targetDrug, candidates) {
    return [...candidates].sort((a, b) => {
        const similarityDelta = getTherapeuticSimilarity(targetDrug, b) - getTherapeuticSimilarity(targetDrug, a);
        if (Math.abs(similarityDelta) > 0.0001) return similarityDelta;

        const weekA = Number(a?.metadata?.week || 0);
        const weekB = Number(b?.metadata?.week || 0);
        const targetWeek = Number(targetDrug?.metadata?.week || 0);
        const weekDeltaA = Math.abs(targetWeek - weekA);
        const weekDeltaB = Math.abs(targetWeek - weekB);
        return weekDeltaA - weekDeltaB;
    });
}

function getFinalFieldDistractors(drug, allPool, key, maxCount = 3) {
    const targetValue = drug?.[key];
    const targetNorm = normalizeDrugKey(targetValue);
    if (!targetValue || !targetNorm) return [];

    const selected = [];
    const seen = new Set([targetNorm]);
    const classKey = normalizeDrugKey(drug?.class);
    const categoryKey = normalizeDrugKey(drug?.category);
    const targetWeek = Number(drug?.metadata?.week || 0);
    const targetLab = Number(drug?.metadata?.lab || 0);

    const addFromPhase = (phaseFilter) => {
        const ranked = [];

        for (const candidate of allPool) {
            if (candidate === drug) continue;
            const value = candidate?.[key];
            const valueNorm = normalizeDrugKey(value);
            if (!value || !valueNorm || seen.has(valueNorm)) continue;
            if (isAmbiguousTherapeuticFieldMatch(targetValue, value, key, allPool)) continue;
            if (!phaseFilter(candidate)) continue;

            const candidateClassKey = normalizeDrugKey(candidate?.class);
            const candidateCategoryKey = normalizeDrugKey(candidate?.category);
            const similarity = getTherapeuticSimilarity(drug, candidate);

            let score = Math.random() * 0.2;
            if (classKey && candidateClassKey && classKey === candidateClassKey) score += 3.2;
            if (categoryKey && candidateCategoryKey && categoryKey === candidateCategoryKey) score += 2.6;
            score += similarity * 5;

            const weekDelta = Math.abs(targetWeek - Number(candidate?.metadata?.week || 0));
            if (targetWeek && Number.isFinite(weekDelta)) {
                score += Math.max(0, 1.3 - (weekDelta * 0.12));
            }
            if (targetLab && Number(candidate?.metadata?.lab || 0) === targetLab) {
                score += 0.4;
            }

            ranked.push({ value, valueNorm, score });
        }

        ranked.sort((a, b) => b.score - a.score);
        for (const item of ranked) {
            if (selected.length >= maxCount) break;
            if (seen.has(item.valueNorm)) continue;
            selected.push(item.value);
            seen.add(item.valueNorm);
        }
    };

    addFromPhase(candidate => normalizeDrugKey(candidate?.class) === classKey && classKey);
    addFromPhase(candidate => normalizeDrugKey(candidate?.category) === categoryKey && categoryKey);
    addFromPhase(candidate => getTherapeuticSimilarity(drug, candidate) > 0);
    addFromPhase(() => true);

    return selected.slice(0, maxCount);
}

function pickBrandVariantForFinal(drug, signals, options = {}) {
    const brands = splitBrandNames(drug?.brand);
    if (!brands.length) return null;
    if (brands.length === 1) return brands[0];

    const genericKey = normalizeDrugKey(drug?.generic);
    const recentBrandUsage = genericKey && options?.recentBrandUsageByGeneric?.[genericKey]
        ? options.recentBrandUsageByGeneric[genericKey]
        : {};

    const ranked = brands
        .map(brand => {
            const seen = getCounterValue(signals.seenBrands, brand);
            const missed = getCounterValue(signals.missedBrands, brand);
            const recentPenalty = Number(recentBrandUsage?.[normalizeDrugKey(brand)] || 0);
            const score =
                (missed * 1.2) -
                (seen * 0.35) -
                (recentPenalty * 0.95) +
                (Math.max(0, 3 - seen) * 0.2) +
                (Math.random() * 0.1);
            return { brand, score };
        })
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.brand || brands[0];
}

function buildFinalDrugToFieldQuestion(drug, allPool, key, label) {
    const answer = drug?.[key];
    if (!answer) return null;

    const distractors = getFinalFieldDistractors(drug, allPool, key, 3);
    if (distractors.length < 3) return null;

    return {
        type: "mcq",
        prompt: `<b>${label}</b> for <b>${drug.generic}</b>?`,
        choices: shuffled([answer, ...distractors]),
        answer,
        drugRef: drug,
        _focusFieldKey: key,
        _focusFieldValue: answer
    };
}

function getFinalDrugDistractorsForReversePrompt(drug, allPool, key, maxCount = 3) {
    const targetValue = String(drug?.[key] || "").trim();
    const targetValueKey = normalizeDrugKey(targetValue);
    if (!targetValueKey) return [];

    const targetCategoryKey = normalizeDrugKey(drug?.category);
    const targetClassKey = normalizeDrugKey(drug?.class);
    const targetLab = Number(drug?.metadata?.lab || 0);
    const targetWeek = Number(drug?.metadata?.week || 0);
    const classValues = [...new Set((allPool || []).map(item => item?.class).filter(Boolean))];
    const nearbyClassSet = new Set(getNearbyClassAlternatives(drug?.class, classValues).map(normalizeDrugKey));
    const targetIsAntiinfective = isAntiinfectiveLikeText(drug?.class) || isAntiinfectiveLikeText(drug?.category);
    const targetIsContraceptiveCombo = isContraceptiveCombinationDrug(drug);

    const ranked = [];
    for (const candidate of allPool || []) {
        if (!candidate || candidate === drug || !candidate?.generic) continue;

        const candidateGenericKey = normalizeDrugKey(candidate?.generic);
        if (!candidateGenericKey || candidateGenericKey === normalizeDrugKey(drug?.generic)) continue;

        const candidateValue = String(candidate?.[key] || "").trim();
        const candidateValueKey = normalizeDrugKey(candidateValue);
        if (!candidateValueKey || candidateValueKey === targetValueKey) continue;
        if (isAmbiguousTherapeuticFieldMatch(targetValue, candidateValue, key, allPool)) continue;

        const sameCategory = targetCategoryKey && normalizeDrugKey(candidate?.category) === targetCategoryKey;
        const sameClass = targetClassKey && normalizeDrugKey(candidate?.class) === targetClassKey;
        const similarity = getTherapeuticSimilarity(drug, candidate);
        const candidateClassKey = normalizeDrugKey(candidate?.class);
        const candidateIsAntiinfective = isAntiinfectiveLikeText(candidate?.class) || isAntiinfectiveLikeText(candidate?.category);
        const candidateIsContraceptive = isContraceptiveCombinationDrug(candidate)
            || isContraceptiveLikeText(candidate?.generic)
            || isContraceptiveLikeText(candidate?.class)
            || isContraceptiveLikeText(candidate?.category);

        let score = Math.random() * 0.14;
        if (sameCategory) score += 2.6;
        if (sameClass) score += 1.4;
        score += similarity * 4.8;

        if (key === "class") {
            if (nearbyClassSet.has(candidateClassKey)) score += 2.2;
            score += getTokenOverlapScore(targetValue, candidate?.class) * 2.2;
        } else if (key === "category") {
            score += getTokenOverlapScore(targetValue, candidate?.category) * 2.5;
            if (targetClassKey && candidateClassKey === targetClassKey) score += 1.6;
        } else if (key === "moa") {
            score += getTokenOverlapScore(targetValue, candidate?.moa) * 2.8;
            if (nearbyClassSet.has(candidateClassKey)) score += 1.3;
        }

        if (targetIsAntiinfective && candidateIsAntiinfective) score += 2.2;
        if (targetIsAntiinfective && !candidateIsAntiinfective) score -= 0.7;

        if (targetIsContraceptiveCombo && candidateIsContraceptive) score += 2.3;
        if (targetIsContraceptiveCombo && !candidateIsContraceptive) score -= 0.5;

        if (targetLab && Number(candidate?.metadata?.lab || 0) === targetLab) score += 0.35;
        if (targetWeek) {
            const weekDelta = Math.abs(targetWeek - Number(candidate?.metadata?.week || 0));
            score += Math.max(0, 0.9 - (weekDelta * 0.12));
        }

        ranked.push({
            generic: candidate.generic,
            genericKey: candidateGenericKey,
            score
        });
    }

    ranked.sort((a, b) => b.score - a.score);
    const picks = [];
    const used = new Set();
    for (const candidate of ranked) {
        if (used.has(candidate.genericKey)) continue;
        used.add(candidate.genericKey);
        picks.push(candidate.generic);
        if (picks.length >= maxCount) break;
    }

    return picks;
}

function buildFinalFieldToDrugQuestion(drug, allPool, key, label) {
    const fieldValue = String(drug?.[key] || "").trim();
    const answer = String(drug?.generic || "").trim();
    if (!fieldValue || !answer) return null;

    const distractors = getFinalDrugDistractorsForReversePrompt(drug, allPool, key, 3);
    if (distractors.length < 3) return null;

    let prompt = `Which medication has this ${label}: <b>${fieldValue}</b>?`;
    if (key === "class") {
        prompt = `Which medication's documented class is <b>${fieldValue}</b>?`;
    } else if (key === "category") {
        prompt = `Which medication's documented category is <b>${fieldValue}</b>?`;
    } else if (key === "moa") {
        prompt = `Which medication has this documented <b>MOA</b>: <b>${fieldValue}</b>?`;
    }

    return {
        type: "mcq",
        prompt,
        choices: shuffled([answer, ...distractors]),
        answer,
        drugRef: drug,
        _focusFieldKey: key,
        _focusFieldValue: fieldValue
    };
}

function buildFinalGenericToBrandQuestion(drug, context) {
    const brand = pickBrandVariantForFinal(drug, context.signals, context);
    if (!brand) return null;
    const brandPromptLabel = getGenericBrandPromptLabel(drug, brand);

    return {
        type: "short",
        prompt: `Brand for <b>${brandPromptLabel || drug.generic}</b>?`,
        answer: brand,
        drugRef: drug,
        _brandVariant: brand,
        _restrictBrandVariantAnswers: !!getBrandQualifier(brand)
    };
}

function buildFinalBrandToGenericQuestion(drug, context) {
    const brand = pickBrandVariantForFinal(drug, context.signals, context);
    if (!brand) return null;
    return buildBrandToGenericQuestion(drug, brand);
}

function buildFinalPairedClassQuestion(drug, allPool, poolStats) {
    if (!drug?.class || !drug?.generic) return null;

    const classPool = (poolStats?.allClasses || []).filter(Boolean);
    if (classPool.length < 4) return null;

    const targetCategoryKey = normalizeDrugKey(drug?.category);
    const targetClass = String(drug?.class || "").trim();

    const isAntiinfectiveText = (value) => {
        const text = normalizeClassForMatch(value);
        if (!text) return false;
        return /(antiinfective|antimicrobial|antibiotic|antibacterial|antiviral|antifungal|penicillin|beta lactam|cephalosporin|macrolide|aminoglycoside|fluoroquinolone|tetracycline|glycopeptide|sulfonamide|carbapenem)/.test(text);
    };

    const isAntiinfectiveDrug = (item) => isAntiinfectiveText(item?.class) || isAntiinfectiveText(item?.category);
    const targetIsAntiinfective = isAntiinfectiveDrug(drug);

    const candidates = allPool.filter(other => other !== drug && other?.generic && other?.class);
    if (candidates.length < 3) return null;

    const sameCategoryCandidates = targetCategoryKey
        ? candidates.filter(other => normalizeDrugKey(other?.category) === targetCategoryKey)
        : [];
    const nonCategoryCandidates = candidates.filter(other => normalizeDrugKey(other?.category) !== targetCategoryKey);

    const selectedOthers = [
        ...rankByTherapeuticSimilarity(drug, sameCategoryCandidates),
        ...rankByTherapeuticSimilarity(drug, nonCategoryCandidates)
    ].slice(0, 14);
    if (selectedOthers.length < 3) return null;

    const wrongPairs = [];
    const usedPairs = new Set();
    const usedWrongClasses = new Set();

    const pickWrongClassForDrug = (otherDrug, avoidReusedWrongClass) => {
        const otherClass = String(otherDrug?.class || "").trim();
        const otherClassKey = normalizeDrugKey(otherClass);
        if (!otherClassKey) return null;

        const otherCategoryKey = normalizeDrugKey(otherDrug?.category);
        const nearbySet = new Set(getNearbyClassAlternatives(otherClass, classPool).map(normalizeDrugKey));
        const otherIsAntiinfective = isAntiinfectiveDrug(otherDrug);

        const ranked = classPool
            .map(classValue => {
                const classKey = normalizeDrugKey(classValue);
                if (!classKey || classKey === otherClassKey) return null;
                if (avoidReusedWrongClass && usedWrongClasses.has(classKey)) return null;
                if (isAmbiguousTherapeuticFieldMatch(otherClass, classValue, "class", allPool)) return null;

                const classDrugs = poolStats?.classToDrugs?.get(classKey) || [];
                const sameOtherCategory = otherCategoryKey
                    ? classDrugs.some(item => normalizeDrugKey(item?.category) === otherCategoryKey)
                    : false;
                const sameTargetCategory = targetCategoryKey
                    ? classDrugs.some(item => normalizeDrugKey(item?.category) === targetCategoryKey)
                    : false;

                const classIsNearby = nearbySet.has(classKey);
                const candidateIsAntiinfective = isAntiinfectiveText(classValue);

                let score = Math.random() * 0.12;
                if (classIsNearby) score += 3.8;
                if (sameOtherCategory) score += 2.4;
                if (sameTargetCategory) score += 1.5;

                score += getTokenOverlapScore(otherClass, classValue) * 3.2;
                score += getTokenOverlapScore(targetClass, classValue) * 1.1;

                if ((targetIsAntiinfective || otherIsAntiinfective) && candidateIsAntiinfective) {
                    score += 2.6;
                } else if ((targetIsAntiinfective || otherIsAntiinfective) && !candidateIsAntiinfective) {
                    score -= 1.0;
                }

                return {
                    classValue,
                    classKey,
                    sameOtherCategory,
                    sameTargetCategory,
                    classIsNearby,
                    candidateIsAntiinfective,
                    score
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (a.sameOtherCategory !== b.sameOtherCategory) return Number(b.sameOtherCategory) - Number(a.sameOtherCategory);
                if (a.candidateIsAntiinfective !== b.candidateIsAntiinfective && (targetIsAntiinfective || otherIsAntiinfective)) {
                    return Number(b.candidateIsAntiinfective) - Number(a.candidateIsAntiinfective);
                }
                if (a.classIsNearby !== b.classIsNearby) return Number(b.classIsNearby) - Number(a.classIsNearby);
                if (a.sameTargetCategory !== b.sameTargetCategory) return Number(b.sameTargetCategory) - Number(a.sameTargetCategory);
                return b.score - a.score;
            });

        return ranked[0] || null;
    };

    for (const avoidReuse of [true, false]) {
        for (const other of selectedOthers) {
            if (wrongPairs.length >= 3) break;

            const wrongPick = pickWrongClassForDrug(other, avoidReuse);
            if (!wrongPick) continue;

            const pair = `${other.generic}: ${wrongPick.classValue}`;
            const pairKey = normalizeDrugKey(pair);
            if (usedPairs.has(pairKey)) continue;

            usedPairs.add(pairKey);
            usedWrongClasses.add(wrongPick.classKey);
            wrongPairs.push(pair);
        }

        if (wrongPairs.length >= 3) break;
    }

    if (wrongPairs.length < 3) return null;

    const correctPair = `${drug.generic}: ${drug.class}`;
    return {
        type: "mcq",
        prompt: "Which medication/class pair is <b>correctly matched</b>?",
        choices: shuffled([correctPair, ...wrongPairs.slice(0, 3)]),
        answer: correctPair,
        drugRef: drug,
        _focusFieldKey: "class",
        _focusFieldValue: drug.class
    };
}

function buildFinalPairedCategoryQuestion(drug, allPool, poolStats) {
    if (!drug?.category || !drug?.generic) return null;

    const categoryPool = (poolStats?.allCategories || []).filter(Boolean);
    if (categoryPool.length < 4) return null;

    const targetClassKey = normalizeDrugKey(drug?.class);
    const targetCategory = String(drug?.category || "").trim();

    const candidates = allPool.filter(other => other !== drug && other?.generic && other?.category);
    if (candidates.length < 3) return null;

    const sameClassCandidates = targetClassKey
        ? candidates.filter(other => normalizeDrugKey(other?.class) === targetClassKey)
        : [];
    const nonClassCandidates = candidates.filter(other => normalizeDrugKey(other?.class) !== targetClassKey);

    const selectedOthers = [
        ...rankByTherapeuticSimilarity(drug, sameClassCandidates),
        ...rankByTherapeuticSimilarity(drug, nonClassCandidates)
    ].slice(0, 14);
    if (selectedOthers.length < 3) return null;

    const wrongPairs = [];
    const usedPairs = new Set();
    const usedWrongCategories = new Set();

    const pickWrongCategoryForDrug = (otherDrug, avoidReusedWrongCategory) => {
        const otherCategory = String(otherDrug?.category || "").trim();
        const otherCategoryKey = normalizeDrugKey(otherCategory);
        if (!otherCategoryKey) return null;

        const otherClassKey = normalizeDrugKey(otherDrug?.class);

        const ranked = categoryPool
            .map(categoryValue => {
                const categoryKey = normalizeDrugKey(categoryValue);
                if (!categoryKey || categoryKey === otherCategoryKey) return null;
                if (avoidReusedWrongCategory && usedWrongCategories.has(categoryKey)) return null;
                if (isAmbiguousTherapeuticFieldMatch(otherCategory, categoryValue, "category", allPool)) return null;

                const categoryDrugs = poolStats?.categoryToDrugs?.get(categoryKey) || [];
                const sameOtherClass = otherClassKey
                    ? categoryDrugs.some(item => normalizeDrugKey(item?.class) === otherClassKey)
                    : false;
                const sameTargetClass = targetClassKey
                    ? categoryDrugs.some(item => normalizeDrugKey(item?.class) === targetClassKey)
                    : false;

                let score = Math.random() * 0.12;
                if (sameOtherClass) score += 3.0;
                if (sameTargetClass) score += 1.8;
                score += getTokenOverlapScore(otherCategory, categoryValue) * 3.0;
                score += getTokenOverlapScore(targetCategory, categoryValue) * 1.6;

                return {
                    categoryValue,
                    categoryKey,
                    sameOtherClass,
                    sameTargetClass,
                    score
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (a.sameOtherClass !== b.sameOtherClass) return Number(b.sameOtherClass) - Number(a.sameOtherClass);
                if (a.sameTargetClass !== b.sameTargetClass) return Number(b.sameTargetClass) - Number(a.sameTargetClass);
                return b.score - a.score;
            });

        return ranked[0] || null;
    };

    for (const avoidReuse of [true, false]) {
        for (const other of selectedOthers) {
            if (wrongPairs.length >= 3) break;

            const wrongPick = pickWrongCategoryForDrug(other, avoidReuse);
            if (!wrongPick) continue;

            const pair = `${other.generic}: ${wrongPick.categoryValue}`;
            const pairKey = normalizeDrugKey(pair);
            if (usedPairs.has(pairKey)) continue;

            usedPairs.add(pairKey);
            usedWrongCategories.add(wrongPick.categoryKey);
            wrongPairs.push(pair);
        }

        if (wrongPairs.length >= 3) break;
    }

    if (wrongPairs.length < 3) return null;

    const correctPair = `${drug.generic}: ${drug.category}`;
    return {
        type: "mcq",
        prompt: "Which medication/category pair is <b>correctly matched</b>?",
        choices: shuffled([correctPair, ...wrongPairs.slice(0, 3)]),
        answer: correctPair,
        drugRef: drug,
        _focusFieldKey: "category",
        _focusFieldValue: drug.category
    };
}

function buildFinalNegativeQuestion(drug, allPool) {
    const attributes = [
        { key: "class", label: "class" },
        { key: "category", label: "category" }
    ].filter(attr => drug?.[attr.key]);

    for (const attr of attributes) {
        const targetValue = drug[attr.key];
        const targetNorm = normalizeDrugKey(targetValue);
        if (!targetNorm) continue;

        const sameGroup = allPool
            .filter(other => other !== drug && other?.generic && normalizeDrugKey(other?.[attr.key]) === targetNorm);
        if (sameGroup.length < 3) continue;

        const wrongChoices = rankByTherapeuticSimilarity(drug, sameGroup)
            .slice(0, 3)
            .map(other => other.generic)
            .filter(Boolean);
        if (wrongChoices.length < 3) continue;

        const wrongSet = new Set(wrongChoices.map(normalizeDrugKey));
        const differentCandidates = allPool
            .filter(other => other !== drug && other?.generic && normalizeDrugKey(other?.[attr.key]) !== targetNorm)
            .filter(other => !isAmbiguousTherapeuticFieldMatch(targetValue, other?.[attr.key], attr.key, allPool))
            .filter(other => !wrongSet.has(normalizeDrugKey(other.generic)));
        if (!differentCandidates.length) continue;

        const rankedDifferent = rankByTherapeuticSimilarity(drug, differentCandidates);
        const correctDrug = rankedDifferent[0];
        if (!correctDrug?.generic) continue;

        return {
            type: "mcq",
            prompt: `Which drug is <b>NOT</b> in the <b>${targetValue}</b> ${attr.label}?`,
            choices: shuffled([correctDrug.generic, ...wrongChoices]),
            answer: correctDrug.generic,
            drugRef: drug,
            _focusFieldKey: attr.key,
            _focusFieldValue: targetValue
        };
    }

    return null;
}

function getFinalQuestionFocusSignature(question) {
    const fieldKey = normalizeDrugKey(question?._focusFieldKey);
    const fieldValue = normalizeDrugKey(question?._focusFieldValue);
    if (!fieldKey || !fieldValue) return null;
    return `${fieldKey}:${fieldValue}`;
}

function buildLegacyFinalFallbackQuestion(drug, fullPool, usedFocusSignatures, context, maxAttempts = 8) {
    let fallback = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = createQuestion(drug, fullPool);
        if (!candidate) continue;

        const focusSignature = getFinalQuestionFocusSignature(candidate);
        if (!focusSignature || !usedFocusSignatures.has(focusSignature)) {
            return { question: candidate, focusSignature };
        }

        if (!fallback) {
            fallback = { question: candidate, focusSignature };
        }
    }

    const brandVariants = splitBrandNames(drug?.brand);
    if (brandVariants.length) {
        const brand = pickBrandVariantForFinal(drug, context?.signals || loadTopDrugsSignals(), context || {}) || brandVariants[0];
        return {
            question: buildBrandToGenericQuestion(drug, brand),
            focusSignature: null
        };
    }

    if (drug?.generic) {
        return {
            question: {
                type: "short",
                prompt: "Name the drug (generic):",
                answer: drug.generic,
                drugRef: drug
            },
            focusSignature: null
        };
    }

    return fallback;
}

function buildFinalExamQuestionFromFamily(drug, allPool, family, context, poolStats) {
    switch (family) {
        case "generic_to_brand":
            return buildFinalGenericToBrandQuestion(drug, context);
        case "brand_to_generic":
            return buildFinalBrandToGenericQuestion(drug, context);
        case "brand_class_pair":
            return buildTopDrugsBrandClassQuestion(drug, allPool, context);
        case "brand_category_pair":
            return buildTopDrugsBrandCategoryQuestion(drug, allPool, context);
        case "drug_to_class":
            return buildFinalDrugToFieldQuestion(drug, allPool, "class", "Class");
        case "drug_to_category":
            return buildFinalDrugToFieldQuestion(drug, allPool, "category", "Category");
        case "drug_to_moa":
            return buildFinalDrugToFieldQuestion(drug, allPool, "moa", "MOA");
        case "class_to_drug":
            return buildFinalFieldToDrugQuestion(drug, allPool, "class", "class");
        case "category_to_drug":
            return buildFinalFieldToDrugQuestion(drug, allPool, "category", "category");
        case "moa_to_drug":
            return buildFinalFieldToDrugQuestion(drug, allPool, "moa", "MOA");
        case "paired_med_class":
            return buildFinalPairedClassQuestion(drug, allPool, poolStats);
        case "paired_med_category":
            return buildFinalPairedCategoryQuestion(drug, allPool, poolStats);
        case "negative_mcq":
            return buildFinalNegativeQuestion(drug, allPool);
        default:
            return null;
    }
}

function countPositiveCounterKeys(counter) {
    if (!counter || typeof counter !== "object") return 0;
    return Object.values(counter).filter((value) => Number(value) > 0).length;
}

function buildFinalAdaptiveSummary(selectedDrugs, context, assignmentInfo) {
    const signals = context.signals || createEmptyTopDrugsSignals();
    const focusTotals = { brand: 0, class: 0, category: 0, moa: 0, generic: 0 };
    let targetedDrugCount = 0;
    let repeatPenaltyCount = 0;

    for (const drug of selectedDrugs) {
        const focusScores = getFinalAdaptiveFocusScores(drug, signals);
        const peak = Math.max(focusScores.brand, focusScores.class, focusScores.category, focusScores.moa, focusScores.generic, 0);
        if (peak >= 0.9) targetedDrugCount += 1;

        const genericKey = normalizeDrugKey(drug?.generic);
        if (genericKey && Number(context.recentGenericUsage?.[genericKey] || 0) > 0) {
            repeatPenaltyCount += 1;
        }

        Object.entries(focusScores).forEach(([key, value]) => {
            focusTotals[key] = (focusTotals[key] || 0) + Math.max(0, Number(value) || 0);
        });
    }

    const topFocusLabels = Object.entries(focusTotals)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key]) => FINAL_FOCUS_AREA_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1)));

    const signalCount =
        countPositiveCounterKeys(signals.missedDrugs) +
        countPositiveCounterKeys(signals.missedClasses) +
        countPositiveCounterKeys(signals.missedCategories) +
        countPositiveCounterKeys(signals.missedBrands);

    return {
        active: Boolean(signalCount || context.runCount),
        runCount: Math.max(0, Number(context.runCount) || 0),
        legacyRecoveredCount: Math.max(0, Number(context.legacyRecoveredCount) || 0),
        signalCount,
        targetedDrugCount,
        repeatPenaltyCount,
        topFocusLabels,
        familyCounts: assignmentInfo?.currentCounts || {}
    };
}

function buildFinalExamQuestions(selectedDrugs, fullPool) {
    const signals = loadTopDrugsSignals();
    const recentUsageContext = buildRecentFinalUsageContext(loadRecentFinalRuns());
    const context = {
        signals,
        recentGenericUsage: recentUsageContext.recentGenericUsage,
        recentFamilyUsageByGeneric: recentUsageContext.recentFamilyUsageByGeneric,
        recentBrandUsageByGeneric: recentUsageContext.recentBrandUsageByGeneric,
        runCount: recentUsageContext.runCount,
        legacyRecoveredCount: recentUsageContext.legacyRecoveredCount
    };

    const poolStats = buildFinalPoolStats(fullPool);
    const assignmentInfo = assignFinalQuestionFamilies(selectedDrugs, poolStats, context);

    const questions = [];
    const usedFocusSignatures = new Set();
    for (const drug of selectedDrugs) {
        const genericKey = normalizeDrugKey(drug?.generic);
        const preferredFamily = assignmentInfo.assignments.get(genericKey) || null;
        const fallbackFamilies = getFinalQuestionFamilyCandidates(drug, poolStats);

        const familyOrder = [];
        if (preferredFamily) familyOrder.push(preferredFamily);
        for (const family of fallbackFamilies) {
            if (!familyOrder.includes(family)) familyOrder.push(family);
        }

        let builtQuestion = null;
        let usedFamily = "legacy";
        let usedFocusSignature = null;

        for (const family of familyOrder) {
            const candidate = buildFinalExamQuestionFromFamily(drug, fullPool, family, context, poolStats);
            if (!candidate) continue;
            const focusSignature = getFinalQuestionFocusSignature(candidate);
            if (focusSignature && usedFocusSignatures.has(focusSignature)) continue;
            builtQuestion = candidate;
            usedFamily = family;
            usedFocusSignature = focusSignature;
            break;
        }

        if (!builtQuestion) {
            const legacyFallback = buildLegacyFinalFallbackQuestion(drug, fullPool, usedFocusSignatures, context);
            builtQuestion = legacyFallback?.question || createQuestion(drug, fullPool);
            usedFocusSignature = legacyFallback?.focusSignature || getFinalQuestionFocusSignature(builtQuestion);
        }

        if (usedFocusSignature) usedFocusSignatures.add(usedFocusSignature);

        questions.push({
            ...builtQuestion,
            _finalFamily: usedFamily
        });
    }

    return {
        questions: shuffled(questions),
        adaptiveSummary: buildFinalAdaptiveSummary(selectedDrugs, context, assignmentInfo)
    };
}

function saveFinalRunSnapshot(questions) {
    const runs = loadRecentFinalRuns();
    const generics = [];
    const familiesByGeneric = {};
    const brandsByGeneric = {};

    for (const question of questions) {
        const drug = question?.drugRef;
        const genericKey = normalizeDrugKey(drug?.generic);
        if (!genericKey) continue;
        generics.push(genericKey);
        if (question?._finalFamily) familiesByGeneric[genericKey] = question._finalFamily;
        const brandVariant = resolveQuestionBrandVariant(question, drug);
        if (brandVariant) brandsByGeneric[genericKey] = brandVariant;
    }

    runs.push({
        timestamp: Date.now(),
        completed: true,
        generics: [...new Set(generics)],
        familiesByGeneric,
        brandsByGeneric
    });

    saveRecentFinalRuns(runs);
}

function recordTopDrugsSignalsFromQuestions(questions) {
    if (!Array.isArray(questions) || !questions.length) return;

    const topDrugQuestions = questions.filter(question => question?.drugRef && !question?.conceptRef);
    if (!topDrugQuestions.length) return;

    const signals = loadTopDrugsSignals();

    for (const question of topDrugQuestions) {
        const drug = question?.drugRef;
        if (!drug) continue;

        incrementCounter(signals.seenDrugs, drug.generic);
        incrementCounter(signals.seenClasses, drug.class);
        incrementCounter(signals.seenCategories, drug.category);

        const missed = question?._answered && !question?._correct;
        if (missed) {
            incrementCounter(signals.missedDrugs, drug.generic);
            incrementCounter(signals.missedClasses, drug.class);
            incrementCounter(signals.missedCategories, drug.category);
        }

        const brandFocusedPrompt = /\bbrand\b|\bgeneric\b/i.test(String(question?.prompt || ""));
        const familyBrandFocus = question?._finalFamily === "generic_to_brand" || question?._finalFamily === "brand_to_generic";
        if (!brandFocusedPrompt && !familyBrandFocus) continue;

        const resolvedBrand = resolveQuestionBrandVariant(question, drug);
        const brandVariants = resolvedBrand ? [resolvedBrand] : [];

        for (const brand of brandVariants) {
            incrementCounter(signals.seenBrands, brand);
            if (missed) incrementCounter(signals.missedBrands, brand);
        }
    }

    saveTopDrugsSignals(signals);
}

// --- 3. UI RENDERING ---
function render() {
    const q = state.questions[state.index];
    if (!q) return;
    const singleChoiceTypes = new Set(["mcq", "tf"]);
    const renderedChoices = q.type === "tf"
        ? (Array.isArray(q.choices) && q.choices.length ? q.choices : ["True", "False"])
        : q.choices;

    markCurrentQuestionSeen();
    if (getEl("drug-context")) getEl("drug-context").textContent = getQuestionContextLabel(q);
    if (getEl("qnum")) getEl("qnum").textContent = state.index + 1;
    if (getEl("prompt")) getEl("prompt").innerHTML = q.prompt;
    renderQuizStatus();
    renderStreakMeter();
    renderAdaptiveFinalBanner();
    renderMarkControls();
    renderFooterActions(q);
    
    const optCont = getEl("options");
    if (optCont) optCont.innerHTML = "";
    if (getEl("short-wrap")) getEl("short-wrap").classList.add("hidden");
    if (getEl("explain")) { getEl("explain").classList.remove("show"); getEl("explain").innerHTML = ""; }

    if (singleChoiceTypes.has(q.type) && renderedChoices && optCont) {
        optCont.style.touchAction = 'manipulation';
        renderedChoices.forEach(c => {
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
    } else if (q.type === "mcq-multiple" && q.choices && optCont) {
        optCont.style.touchAction = 'manipulation';
        const selectedValues = Array.isArray(q._user) ? q._user : [];

        q.choices.forEach(choice => {
            const isSelected = selectedValues.includes(choice);
            const lbl = document.createElement("label");
            lbl.className = `flex items-center gap-3 p-4 border rounded-xl cursor-pointer mb-2 transition-colors ${isSelected ? 'ring-2 ring-maroon bg-maroon/5 border-maroon' : 'border-gray-200 dark:border-gray-700'}`;
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = "opt-multi";
            checkbox.value = choice;
            checkbox.className = "w-5 h-5 accent-maroon";
            checkbox.checked = isSelected;
            if (q._answered) checkbox.disabled = true;

            const span = document.createElement("span");
            span.className = "flex-1 text-base leading-tight text-[var(--text)]";
            span.innerHTML = choice;

            const toggleOption = (e) => {
                e.preventDefault();
                if (q._answered) return;

                const nextValues = new Set(Array.isArray(q._user) ? q._user : []);
                if (nextValues.has(choice)) nextValues.delete(choice);
                else nextValues.add(choice);

                q._user = [...nextValues];
                render();
            };

            lbl.appendChild(checkbox);
            lbl.appendChild(span);
            lbl.addEventListener('pointerdown', toggleOption, { passive: false });
            lbl.addEventListener('click', toggleOption, { passive: false });
            optCont.appendChild(lbl);
        });
    } else if (q.type === "short" || q.type === "open") {
        if (getEl("short-wrap")) getEl("short-wrap").classList.remove("hidden");
        const input = getEl("short-input");
        if (input) {
            input.value = q._user || "";
            input.placeholder = q.type === "open" ? "Type response..." : "Type answer...";
            q._answered ? input.setAttribute("disabled", "true") : input.removeAttribute("disabled");
            input.oninput = () => {
                if (!q._answered) {
                    q._user = input.value;
                    queueQuizProgressSave(400);
                }
            };
        }
    }
    
    if (q._answered) {
        const exp = getEl("explain");
        if (exp) {
            const raw = getCorrectAnswerValue(q) || "N/A";
            const displayAnswer = Array.isArray(raw) ? raw.join(", ") : raw;
            exp.innerHTML = `<div class="p-3 rounded-lg ${q._correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}"><b>${q._correct ? 'Correct!' : 'Answer:'}</b> <b>${displayAnswer}</b></div>`;

            if (!q._correct) {
                const temptingWrong = getTemptingWrongAnswerInsight(q);
                if (temptingWrong) {
                    const insight = document.createElement("div");
                    insight.className = "mt-2 p-3 rounded-lg bg-yellow-50 text-yellow-900 border border-yellow-200";
                    insight.innerHTML = `<b>Tempting wrong pattern:</b> ${escapeHtml(temptingWrong.commonWrong)} (${temptingWrong.commonWrongCount}x in your history)`;
                    exp.appendChild(insight);
                }
            }

            const reportWrap = document.createElement("div");
            reportWrap.className = "mt-3 flex flex-wrap items-center gap-2";

            const reportBtn = document.createElement("button");
            reportBtn.type = "button";
            reportBtn.className = "px-4 py-2 rounded-xl border border-[var(--ring)] text-sm font-semibold transition-colors";
            reportBtn.textContent = q._reported ? "Question Flagged" : "Report This Question";
            reportBtn.disabled = !!q._reported;
            if (q._reported) {
                reportBtn.classList.add("opacity-60", "cursor-not-allowed");
            } else {
                reportBtn.addEventListener("click", reportCurrentQuestion);
            }

            const reportHelp = document.createElement("span");
            reportHelp.className = "text-xs opacity-70";
            reportHelp.textContent = q._reported
                ? "Saved to your local question reports."
                : "Save ambiguous or incorrect items to review later on Stats.";

            reportWrap.appendChild(reportBtn);
            reportWrap.appendChild(reportHelp);
            exp.appendChild(reportWrap);
            exp.classList.add("show");
        }
    }
    renderNavMap(); 
    if (getEl("score")) getEl("score").textContent = state.score;
    queueQuizProgressSave(150);
}

function renderNavMap() {
    const nav = getEl("nav-map");
    if (!nav) return;
    nav.innerHTML = "";
    state.questions.forEach((q, i) => {
        const btn = document.createElement("button");
        const isMarked = state.marked.has(i);
        let colorClass = "bg-white text-black border border-gray-300";
        if (q._answered) {
            colorClass = q._correct ? "bg-green-500 text-white" : "bg-red-500 text-white";
        } else if (isMarked) {
            colorClass = "bg-yellow-400 text-black ring-2 ring-yellow-600";
        } else if (state.seen.has(i)) {
            colorClass = "bg-slate-200 text-slate-800 border border-slate-400";
        }
        btn.className = `w-8 h-8 rounded-lg text-xs font-bold transition-all ${i === state.index ? 'ring-2 ring-blue-500 scale-110' : ''} ${colorClass}`;
        btn.textContent = i + 1;
        btn.title = isMarked ? `Question ${i + 1} marked for review` : `Question ${i + 1}`;
        btn.style.outline = isMarked ? "2px solid #facc15" : "";
        btn.style.outlineOffset = isMarked ? "2px" : "";
        btn.onclick = () => { jumpToQuestion(i); };
        nav.appendChild(btn);
    });
}

// --- 4. SYSTEM WIRING ---
function wireEvents() {
    const handlers = {
        "timer-readout": toggleTimer,
        "mark": toggleMark,
        "help-shortcuts": openShortcutsModal,
        "close-shortcuts": closeShortcutsModal,
        "font-increase": () => changeZoom('in'),
        "font-decrease": () => changeZoom('out'),
        "restart": restartQuiz,
        "next": handleNextAction,
        "prev": () => { if (state.index > 0) jumpToQuestion(state.index - 1); },
        "check": () => {
            const q = state.questions[state.index];
            if (!q) return;
            let val = null;

            if (q.type === "mcq" || q.type === "tf") {
                val = document.querySelector("#options input:checked")?.value;
            } else if (q.type === "mcq-multiple") {
                val = Array.from(document.querySelectorAll("#options input:checked")).map(input => input.value);
            } else {
                val = getEl("short-input")?.value;
            }

            if (Array.isArray(val) ? val.length > 0 : val) scoreCurrent(val);
        },
        "check-all": checkAllAnswersAndFinish,
        "reveal-solution": revealAnswer,
        "theme-toggle": toggleQuizTheme,
        "hint-btn": showHint,
        "mark-mobile": toggleMark,
        "hint-btn-mobile": showHint,
        "reveal-solution-mobile": revealAnswer,
        "restart-mobile": restartQuiz,
    };

    Object.entries(handlers).forEach(([id, fn]) => {
        const el = getEl(id);
        if (el) el.onclick = fn;
    });

    window.onkeydown = (e) => {
        const key = e.key.toLowerCase();

        if (e.key === "?") {
            e.preventDefault();
            openShortcutsModal();
            return;
        }

        if (key === "escape") {
            closeShortcutsModal();
            return;
        }

        // Keep typing natural inside answer fields and other editable targets.
        const activeEl = document.activeElement;
        const isEditableTarget = activeEl
            && (
                activeEl.tagName === "INPUT"
                || activeEl.tagName === "TEXTAREA"
                || activeEl.tagName === "SELECT"
                || activeEl.isContentEditable
            );
        if (isEditableTarget && key !== "enter") return;

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
        if (key === "arrowright") { if (state.index < state.questions.length - 1) jumpToQuestion(state.index + 1); }
        if (key === "arrowleft") { if (state.index > 0) jumpToQuestion(state.index - 1); }
        if (key >= '1' && key <= '9') {
            const idx = parseInt(key) - 1;
            if (state.questions[idx]) jumpToQuestion(idx);
        }
        if (key === "enter") {
            const q = state.questions[state.index];
            if (!q || !q._answered) getEl("check")?.click();
            else getEl("next")?.click();
        }
        
        // --- NEW: R/X/H Keyboard Shortcuts ---
        if (key === "r") restartQuiz();           // R = Restart with confirm
        if (key === "x" && !isRestrictedAttemptMode()) revealAnswer();          // X = Give Up / Reveal
        if (key === "h" && !isRestrictedAttemptMode()) showHint();              // H = Show Hint
    };
}

function toggleTimer() {
    if (!state.timerHandle && state.timerSeconds <= 0) return;

    state.timerPaused = !state.timerPaused;
    const readout = getEl("timer-readout");
    if (readout) {
        readout.classList.toggle("opacity-30", !!state.timerPaused);
        readout.classList.toggle("animate-pulse", !!state.timerPaused);
    }

    if (state.timerPaused) {
        if (state.timerHandle) {
            clearInterval(state.timerHandle);
            state.timerHandle = null;
        }
        queueQuizProgressSave(200);
        return;
    }

    if (!state.timerHandle && state.timerSeconds > 0) {
        state.timerHandle = setInterval(timerTick, 1000);
    }
    queueQuizProgressSave(200);
}

function timerTick() {
    if (state.timerSeconds <= 0) {
        finishQuizDueToTimeout();
        return;
    }

    state.timerSeconds--;
    const mins = Math.floor(state.timerSeconds / 60);
    const secs = state.timerSeconds % 60;
    const readout = getEl("timer-readout");
    if (readout) readout.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    if (state.timerSeconds % TIMER_AUTOSAVE_INTERVAL_SECONDS === 0) {
        persistQuizProgress();
    }

    if (state.timerSeconds <= 0) {
        finishQuizDueToTimeout();
    }
}

function startSmartTimer() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    const count = state.questions.length;
    const configuredTimerSeconds = Number(state.generatedTimerSeconds || state.quizConfig?.timerSeconds || 0);
    const isEndocrineQuiz = Boolean(state.quizConfig) || quizId === CONCEPT_QUIZ_ID || state.questions.some(q => q?._mode === "concept");
    const isFinalExam = quizId === FINAL_EXAM_ID;
    state.timerSeconds = configuredTimerSeconds > 0
        ? configuredTimerSeconds
        : isEndocrineQuiz
        ? 600
        : (isFinalExam ? FINAL_EXAM_TIMER_SECONDS : (weekParam ? 600 : (count <= 20 ? 900 : (count <= 50 ? 2700 : 7200))));
    state.timerPaused = false;
    state.timerHandle = setInterval(timerTick, 1000);
}

function isBlankAnswerValue(value) {
    if (Array.isArray(value)) {
        return value.length === 0 || value.every(item => !String(item ?? "").trim());
    }

    return String(value ?? "").trim() === "";
}

function extractLooseNumericTokens(value) {
    if (value === undefined || value === null) return [];
    const matches = String(value).match(/-?\d+(?:\.\d+)?/g) || [];
    return matches
        .map((token) => Number(token))
        .filter((token) => Number.isFinite(token));
}

function evaluateAnswerForQuestion(q, val) {
    if (!q || val === "Revealed" || isBlankAnswerValue(val)) return false;

    const raw = getCorrectAnswerValue(q);
    const correctAnswer = Array.isArray(raw) ? raw[0] : raw;
    const normalizeWhitespace = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

    const normalizeLoose = s => normalizeWhitespace(s).replace(/[\s\-\/.,;]+/g, '');
    const userNorm = normalizeWhitespace(Array.isArray(val) ? val.join(", ") : val);
    const userLoose = normalizeLoose(Array.isArray(val) ? val.join(", ") : val);
    const canonNorm = normalizeWhitespace(correctAnswer);

    if (q.type === "mcq-multiple") {
        const expected = [...new Set((Array.isArray(raw) ? raw : [raw]).map(normalizeWhitespace).filter(Boolean))].sort();
        const selected = [...new Set((Array.isArray(val) ? val : [val]).map(normalizeWhitespace).filter(Boolean))].sort();
        return selected.length > 0
            && expected.length === selected.length
            && expected.every((answer, index) => answer === selected[index]);
    }

    const tolerance = Number(q?.tolerance);
    if (Number.isFinite(tolerance) && tolerance >= 0) {
        const expectedNumbers = Array.isArray(raw)
            ? raw.flatMap(extractLooseNumericTokens)
            : extractLooseNumericTokens(raw);
        const userNumbers = Array.isArray(val)
            ? val.flatMap(extractLooseNumericTokens)
            : extractLooseNumericTokens(val);

        if (expectedNumbers.length && userNumbers.length) {
            if (expectedNumbers.length === 1 && userNumbers.length === 1) {
                return Math.abs(userNumbers[0] - expectedNumbers[0]) <= tolerance;
            }

            if (expectedNumbers.length === userNumbers.length) {
                return expectedNumbers.every((answer, index) => Math.abs(userNumbers[index] - answer) <= tolerance);
            }
        }
    }

    const acceptedAnswers = new Set();
    const allowLooseBrandForms = q.prompt.includes("Brand");
    const addAcceptedForms = (answer, includeLooseForms = false) => {
        if (answer === undefined || answer === null) return;

        const rawAnswer = String(answer);
        const fullTrimmed = normalizeWhitespace(rawAnswer);
        if (fullTrimmed) {
            acceptedAnswers.add(fullTrimmed);

            if (includeLooseForms) {
                acceptedAnswers.add(normalizeLoose(rawAnswer));
            }

            for (const alias of getDrugAnswerAliasForms(rawAnswer)) {
                acceptedAnswers.add(alias);
                if (includeLooseForms) {
                    acceptedAnswers.add(normalizeLoose(alias));
                }
            }
        }

        for (const part of rawAnswer.split(/[;,]/)) {
            const trimmed = normalizeWhitespace(part);
            if (!trimmed) continue;

            acceptedAnswers.add(trimmed);
            if (includeLooseForms) {
                acceptedAnswers.add(normalizeLoose(part));
                if (allowLooseBrandForms) {
                    const withoutQualifier = stripBrandQualifier(part);
                    const trimmedWithoutQualifier = normalizeWhitespace(withoutQualifier);
                    if (trimmedWithoutQualifier && trimmedWithoutQualifier !== trimmed) {
                        acceptedAnswers.add(trimmedWithoutQualifier);
                        acceptedAnswers.add(normalizeLoose(withoutQualifier));
                    }
                }

                for (const alias of getDrugAnswerAliasForms(part)) {
                    acceptedAnswers.add(alias);
                    acceptedAnswers.add(normalizeLoose(alias));
                }
            }
        }
    };

    const rawAnswers = Array.isArray(raw) ? raw : [raw];
    rawAnswers.forEach(answer => addAcceptedForms(answer, true));

    if (Array.isArray(q._acceptedAnswers)) {
        q._acceptedAnswers.forEach(answer => addAcceptedForms(answer, true));
    }

    if (q.drugRef?.brand && allowLooseBrandForms) {
        const brandAnswers = getAcceptedBrandAnswersForDrug(q.drugRef, {
            restrictToVariant: q._restrictBrandVariantAnswers,
            brandVariant: q._brandVariant
        });

        brandAnswers.forEach(answer => addAcceptedForms(answer, true));
    }

    let isCorrect = false;

    if (q._mode === "concept" || q.conceptRef) {
        isCorrect = rawAnswers.some(answer => areConceptAnswersEquivalent(answer, val));
    }

    if (acceptedAnswers.has(userNorm) || acceptedAnswers.has(userLoose)) {
        isCorrect = true;
    }

    // --- MULTI-OPTION MATCHING (semicolon, comma = ANY one is correct) ---
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

    return !!isCorrect;
}

function getQuestionPointValue(question) {
    const points = Number(question?.points);
    return Number.isFinite(points) && points > 0 ? points : 1;
}

function getTotalQuestionPoints(questions) {
    if (!Array.isArray(questions)) return 0;
    return questions.reduce((sum, question) => sum + getQuestionPointValue(question), 0);
}

function usesWeightedPointScoring() {
    // Weighted points are enabled when a configured mode provides per-kind point values
    // or when questions carry explicit point values.
    if (state?.activeModeConfig?.pointsByQuestionKind) return true;
    return Array.isArray(state?.questions) && state.questions.some((question) => Number.isFinite(Number(question?.points)) && Number(question.points) > 0 && Number(question.points) !== 1);
}

function syncPointTotalsFromQuestions() {
    state.totalPoints = getTotalQuestionPoints(state.questions);
}

function applyAnswerToQuestion(q, val) {
    if (!q || q._answered) return false;

    if (val === "Revealed") {
        q._answered = true;
        q._user = val;
        q._correct = false;
        applyStreakOutcome(false);
        return false;
    }

    const storedValue = Array.isArray(val) ? [...val] : (val ?? "");
    const isCorrect = evaluateAnswerForQuestion(q, storedValue);
    q._answered = true;
    q._answeredAt = Date.now();
    q._user = storedValue;
    q._correct = !!isCorrect;
    if (isCorrect) {
        state.score++;
        state.pointScore += getQuestionPointValue(q);
    }
    applyStreakOutcome(!!isCorrect);
    return isCorrect;
}

function scoreCurrent(val) {
    const q = state.questions[state.index];
    if (!q) return;

    applyAnswerToQuestion(q, val);
    if (state.adaptiveSession && q._answered && state.index < state.questions.length - 1) {
        const order = ["easy", "medium", "hard"];
        const normalize = (v) => {
            const key = normalizeQuizValue(v);
            return order.includes(key) ? key : "medium";
        };
        const step = (current, correct) => {
            const idx = Math.max(0, order.indexOf(normalize(current)));
            const nextIdx = correct ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1);
            return order[nextIdx];
        };
        const currentDifficulty = normalize(state.adaptiveSession.difficulty || "medium");
        const desired = step(currentDifficulty, !!q._correct);
        state.adaptiveSession.difficulty = desired;

        // Simple adaptation: swap the next unanswered question with one later in the queue
        // that best matches the desired difficulty.
        const nextIndex = state.index + 1;
        let swapIndex = -1;
        for (let i = nextIndex; i < state.questions.length; i += 1) {
            const candidate = state.questions[i];
            if (!candidate || candidate._answered) continue;
            const diff = normalize(getConfiguredQuestionDifficulty(candidate));
            if (diff === desired) {
                swapIndex = i;
                break;
            }
        }
        if (swapIndex > nextIndex) {
            const tmp = state.questions[nextIndex];
            state.questions[nextIndex] = state.questions[swapIndex];
            state.questions[swapIndex] = tmp;
        }
    }
    render();
}

function buildFinalBreakdownMarkup(breakdown) {
    if (!breakdown) return "";

    const areaCards = breakdown.areas
        .filter((area) => area.total > 0)
        .map((area) => {
            const quickLinks = buildAreaQuicksheetLinks(area)
                .map((link) => `
                    <a href="${escapeHtml(link.href)}" class="rounded-full border border-[var(--ring)] px-3 py-1 text-[11px] font-semibold hover:border-[#8b1e3f]">
                        ${escapeHtml(link.label)}
                    </a>
                `)
                .join("");

            return `
            <div class="rounded-2xl border border-[var(--ring)] bg-[var(--card)] px-4 py-4">
                <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">${area.label}</div>
                <div class="mt-2 flex items-end justify-between gap-3">
                    <div class="text-2xl font-black">${area.correct}/${area.total}</div>
                    <div class="text-sm font-semibold ${area.accuracy >= 80 ? "text-green-600" : "text-[#8b1e3f]"}">${area.accuracy}%</div>
                </div>
                <div class="mt-3 h-2 rounded-full bg-[var(--ring)] overflow-hidden">
                    <div class="h-full rounded-full bg-[#8b1e3f]" style="width:${area.accuracy}%"></div>
                </div>
                <div class="mt-2 text-xs opacity-70">${area.missed} miss${area.missed === 1 ? "" : "es"}</div>
                ${quickLinks ? `<div class="mt-3 flex flex-wrap gap-2">
                    <span class="text-[10px] font-black uppercase tracking-[0.18em] opacity-50">Quicksheet</span>
                    ${quickLinks}
                </div>` : ""}
            </div>
        `;
        })
        .join("");

    const weakAreaText = breakdown.weakAreas.length
        ? breakdown.weakAreas
            .slice(0, 2)
            .map((area) => `${area.label} (${area.missed} miss${area.missed === 1 ? "" : "es"})`)
            .join(" • ")
        : "No weak areas detected on this run.";

    const retakeCount = buildWeakAreaRetakeQuestions(state.questions).length;
    const retakeButton = retakeCount > 0
        ? `<button onclick="launchWeakAreaRetake()" class="px-6 py-3 bg-[#8b1e3f] text-white rounded-xl font-bold">🎯 Retake Weak Areas (${retakeCount})</button>`
        : "";

    return `
        <section class="mt-6 text-left">
            <div class="rounded-3xl border border-[var(--ring)] bg-[var(--card)] px-5 py-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p class="text-sm font-semibold uppercase tracking-[0.18em] opacity-70">Post-Final Breakdown</p>
                        <h3 class="mt-2 text-2xl font-black">Where To Tighten Up Next</h3>
                        <p class="mt-2 text-sm opacity-75">Weakest areas on this run: ${weakAreaText}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${retakeButton}
                        <a href="stats.html#weak-area-playlists-section" class="px-5 py-3 rounded-xl border border-[var(--ring)] font-bold">🧠 Open Playlists</a>
                        <a href="top-drugs-trends.html" class="px-5 py-3 rounded-xl border border-[var(--ring)] font-bold">📈 View Trends</a>
                        <a href="top-drugs-quicksheet.html" class="px-5 py-3 rounded-xl border border-[var(--ring)] font-bold">🧾 Open Quicksheet</a>
                    </div>
                </div>
                <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    ${areaCards}
                </div>
            </div>
        </section>
    `;
}

function showResults() {
    if (state.timerHandle) {
        clearInterval(state.timerHandle);
        state.timerHandle = null;
    }
    state.timerPaused = true;
    state.progressCompleted = true;

    const shouldPersistResults = !state.reviewMode;
    const shouldRecordAttemptArtifacts = shouldPersistResults && !state.resultsRecorded;
    clearQuizProgress();

    if (state.reviewMode) {
        saveReviewRoundResultsToReviewQueue(state.questions);
    }

    if (shouldRecordAttemptArtifacts && isFullTopDrugsFinalAttempt(state.questions)) {
        saveFinalRunSnapshot(state.questions);
    }

    if (shouldPersistResults) {
        saveQuizHistory();
        saveMissedQuestionsToReviewQueue(state.questions);
    }

    if (shouldPersistResults && !state.signalsRecorded) {
        recordTopDrugsSignalsFromQuestions(state.questions);
        state.signalsRecorded = true;
    }

    // Save high score to localStorage (only if it's better than existing)
    const storageKey = getScoreStorageKey();
    
    if (shouldPersistResults && storageKey) {
        try {
            const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const compareByPoints = usesWeightedPointScoring();
            const existingScore = compareByPoints
                ? Number(existing.pointScore || 0)
                : Number(existing.score || 0);
            const candidateScore = compareByPoints ? state.pointScore : state.score;
            
            // Only update if new score is higher
            if (candidateScore >= existingScore) {
                localStorage.setItem(storageKey, JSON.stringify({
                    score: state.score,
                    total: state.questions.length,
                    pointScore: state.pointScore,
                    pointTotal: state.totalPoints,
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
    const bossQuestions = !state.reviewMode && !state.bossMode ? buildBossRoundQuestions(state.questions) : [];
    const bossBtn = state.bossMode
        ? `<button onclick="restartQuiz()" class="px-8 py-4 rounded-2xl font-bold text-white" style="background:linear-gradient(135deg, #0f172a 0%, #8b1e3f 100%)">⚡ Retry Boss Round</button>`
        : bossQuestions.length > 0
        ? `<button onclick="launchBossRound()" class="px-8 py-4 rounded-2xl font-bold text-white" style="background:linear-gradient(135deg, #111827 0%, #8b1e3f 100%)">⚡ Boss Round (${bossQuestions.length})</button>`
        : "";
    const letterGradeInfo = shouldPersistResults ? getLetterGradeInfoForQuiz(state.score, state.questions.length) : null;
    const finalBreakdown = shouldPersistResults ? buildFinalPerformanceBreakdown(state.questions) : null;
    state.finalBreakdown = finalBreakdown;
    const weightedSummary = usesWeightedPointScoring()
        ? `${state.pointScore} / ${state.totalPoints} points • ${state.score} / ${state.questions.length} correct`
        : `${state.score} / ${state.questions.length}`;
    const resultsHeading = state.bossMode
        ? (missed.length === 0 ? "Boss Cleared!" : "Boss Round Complete!")
        : state.reviewMode
        ? "Review Round Complete!"
        : "Quiz Complete!";
    const resultsSubheading = state.bossMode
        ? `Challenge score: ${weightedSummary}`
        : state.reviewMode
        ? `Cleared ${weightedSummary} in this review round`
        : `Final Score: ${weightedSummary}`;
    const reviewModeNote = state.reviewMode
        ? `<p class="text-sm opacity-70 mt-2">Review rounds do not overwrite saved history, high scores, or adaptive weak-area stats. They do update review-queue mastery progress.</p>`
        : "";
    const bossModeNote = state.bossMode
        ? `<p class="text-sm opacity-70 mt-2">Boss Round locked hints and answer reveals for this challenge.</p>`
        : "";
    const adaptiveFinalNote = (!state.reviewMode && quizId === FINAL_EXAM_ID && !state.bossMode)
        ? `<div class="mt-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-left text-sm text-slate-800">
            <div class="font-black uppercase tracking-[0.18em] text-sky-800">Adaptive Final Memory</div>
            <div class="mt-1">${escapeHtml(getAdaptiveSummaryBannerCopy(state.adaptiveSummary))}</div>
            <div class="mt-1 opacity-75">This completed run is now feeding the next final you launch on this browser.</div>
          </div>`
        : "";
    const timeoutNote = state.timedOut
        ? `<p class="text-sm font-semibold text-red-600 mt-2">Time expired, so any unanswered items were counted incorrect.</p>`
        : "";
    const streakNote = `<p class="text-sm opacity-70 mt-2">🔥 Best streak this run: <span class="font-semibold">${state.bestStreak}</span>${state.currentStreak > 0 ? ` • current combo ended at ${state.currentStreak}` : ""}</p>`;
    const letterGradeMarkup = letterGradeInfo
        ? `<div class="mt-4 rounded-2xl border border-[var(--ring)] bg-[var(--card)] px-5 py-4">
            <p class="text-sm font-semibold uppercase tracking-[0.2em] opacity-70">Letter Grade</p>
            <p class="mt-2 text-4xl font-black text-[#8b1e3f]">${letterGradeInfo.letter}</p>
            <p class="mt-2 text-sm opacity-75">Scale for this final: A ${letterGradeInfo.cutoffs[0].minCorrect}+ • B ${letterGradeInfo.cutoffs[1].minCorrect}+ • C ${letterGradeInfo.cutoffs[2].minCorrect}+ • D ${letterGradeInfo.cutoffs[3].minCorrect}+ • F below ${letterGradeInfo.cutoffs[3].minCorrect}</p>
          </div>`
        : "";
    const examModeMarkup = isTrueExamMode()
        ? `<p class="text-sm opacity-70 mt-2">True Exam Mode was active for this attempt.</p>`
        : "";
    const restartBtnMarkup = state.bossMode
        ? ""
        : `<button onclick="restartQuiz()" class="px-8 py-4 bg-maroon text-white rounded-2xl font-bold">🔁 Restart Quiz</button>`;
    const breakdownMarkup = buildFinalBreakdownMarkup(finalBreakdown);
    
    if (card) card.innerHTML = `<div class="text-center py-10">
        <h2 class="text-4xl font-black mb-4">${resultsHeading}</h2>
        <p class="text-2xl">${resultsSubheading}</p>
        ${reviewModeNote}
        ${bossModeNote}
        ${adaptiveFinalNote}
        ${timeoutNote}
        ${streakNote}
        ${letterGradeMarkup}
        ${examModeMarkup}
        ${hintsNote}
        <div class="flex flex-col gap-3 items-center mt-6">
            ${reviewBtn}
            ${bossBtn}
            ${restartBtnMarkup}
        </div>
        ${breakdownMarkup}
    </div>`;
}

function shuffled(a) { return [...a].sort(() => 0.5 - Math.random()); }

async function main() {
    try {
        applyStoredQuizTheme();
        state.quizConfig = null;
        state.bossMode = false;
        state.generatedTimerSeconds = 0;
        state.generatedQuestionLimit = 0;
        state.generatedAttemptIdentity = null;
        state.adaptiveSummary = null;
        let filteredPool = [];
        let fullPool = [];
        let storageKey = null;
        
        // ========== MODE 1: ?week=N (6 New + 4 Review) ==========
        if (weekParam) {
            fullPool = await smartFetch("master_pool.json");
            updateTopDrugsVersionBadge(fullPool);
            
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
                // Lab 2: Guarantee minimum 3 from current week, rest from cumulative to reach 6 total
                const targetTotal = 6;
                const currentWeekDrugs = newDrugs.filter(d => Number(d.metadata?.week) === weekParam);
                const currentWeekMin = Math.min(3, currentWeekDrugs.length);
                const cumulativeRemaining = Math.min(targetTotal - currentWeekMin, Math.max(0, newDrugs.length - currentWeekMin));
                
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
            updateTopDrugsVersionBadge(fullPool);
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
            updateTopDrugsVersionBadge(fullPool);
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
            storageKey = params.has("lab")
                ? `pharmlet.lab${labParam}.tag-${tagParam.toLowerCase()}.easy`
                : `pharmlet.tag-${tagParam.toLowerCase()}.easy`;
        }
        else if (quizId === FINAL_EXAM_ID) {
            fullPool = await smartFetch("master_pool.json");
            updateTopDrugsVersionBadge(fullPool);
            const selectedDrugs = selectFinalExamDrugs(fullPool);
            const { questions: finalQuestions, adaptiveSummary } = buildFinalExamQuestions(selectedDrugs, fullPool);

            state.title = isTrueExamMode()
                ? `${FINAL_EXAM_TITLE} (True Exam Mode)`
                : FINAL_EXAM_TITLE;
            state.adaptiveSummary = adaptiveSummary;
            state.questions = finalQuestions.map((question, i) => ({
                ...question,
                _id: i
            }));
            storageKey = `pharmlet.${quizId}.easy`;

            finishSetup(storageKey);
            return;
        }
        // ========== MODE 4: ?id=concept-quiz-id (Generated Concept Quiz) ==========
        else if (getConceptQuizConfig(quizId)) {
            const conceptConfig = getConceptQuizConfig(quizId);
            const { conceptPool, usingFallbackPool } = await loadConceptQuizPool(conceptConfig);

            if (conceptPool.length === 0) {
                throw new Error(`No endocrine concept entries found in ${conceptConfig.poolFile}.`);
            }

            state.quizConfig = conceptConfig;
            filteredPool = conceptPool;
            fullPool = conceptPool;
            state.title = conceptConfig.title + (usingFallbackPool && conceptConfig.fallbackTitleSuffix ? conceptConfig.fallbackTitleSuffix : "");
            storageKey = `pharmlet.${quizId}.easy`;
        }
        // ========== MODE 4: ?id=quiz-name (Legacy Static JSON) ==========
        else if (quizId) {
            const data = GENERATED_QUIZ_IDS.has(quizId)
                ? loadGeneratedQuizFromStorage(quizId)
                : await loadQuizDataForId(quizId);
            if (!data) {
                throw new Error(`Quiz "${quizId}" is not available. Try recreating it from the source page.`);
            }

            state.bossMode = Boolean(data?.metadata?.kind === "boss-round" || data?.metadata?.bossRound);
            state.activeModeConfig = getEffectiveQuizModeConfig(data);
            state.configuredModeKey = state.activeModeConfig?._modeKey || "";
            state.placeholderQuiz = data?.meta?.placeholder === true;
            state.modeNotice = "";
            state.generatedTimerSeconds = Math.max(0, Number(state.activeModeConfig?.timerSeconds ?? data?.metadata?.timerSeconds) || 0);
            state.generatedQuestionLimit = Math.max(0, Number(state.activeModeConfig?.questionLimit ?? data?.metadata?.questionLimit) || 0);
            state.generatedAttemptIdentity = GENERATED_QUIZ_IDS.has(quizId)
                ? buildGeneratedAttemptIdentity(data)
                : null;

            if (isTopDrugsPlaylistPayload(data)) {
                fullPool = await smartFetch("master_pool.json");
                updateTopDrugsVersionBadge(fullPool);
                state.title = data.title || "Weak Area Playlist";
                state.questions = buildTopDrugsPlaylistQuestions(data, fullPool).map((question, i) => ({
                    ...question,
                    _id: i
                }));
                storageKey = state.generatedAttemptIdentity?.scoreStorageKey || `pharmlet.${quizId}.${modeParam}`;

                if (!state.questions.length) {
                    throw new Error("This weak-area playlist did not have enough valid drug prompts to build a quiz yet.");
                }

                finishSetup(storageKey);
                return;
            }

            if (state.activeModeConfig && Array.isArray(data?.questions)) {
                const configuredBuild = buildConfiguredModeQuestions(data, state.activeModeConfig);
                state.title = getConfiguredModeTitle(data, state.activeModeConfig);
                state.modeNotice = buildConfiguredModeNotice(data, state.activeModeConfig, configuredBuild);
                state.adaptiveSession = configuredBuild.adaptiveSession || null;
                const builtQuestions = state.adaptiveSession ? configuredBuild.questions : shuffled(configuredBuild.questions);
                state.questions = builtQuestions.map((question, i) => ({
                    ...question,
                    _id: i
                }));
                storageKey = state.generatedAttemptIdentity?.scoreStorageKey || getScoreStorageKey() || `pharmlet.${quizId}.${modeParam}`;

                if (!state.questions.length) {
                    throw new Error(`Quiz "${quizId}" does not have enough placeholder items to build this mode yet.`);
                }

                finishSetup(storageKey);
                return;
            }

            const pool = buildQuestionPoolFromQuizData(data, modeParam);

            if (pool.length > 0 && pool.some(isConceptEntry)) {
                filteredPool = pool.filter(isConceptEntry);
                fullPool = filteredPool;
                state.title = data.title || "Endocrine Concept Practice";
                storageKey = state.generatedAttemptIdentity?.scoreStorageKey || `pharmlet.${quizId}.${modeParam}`;
            } else {
                state.title = data.title || "Quiz";
                state.questions = shuffled(applyQuestionLimit(pool)).map((q, i) => ({ ...q, _id: i }));
                storageKey = state.generatedAttemptIdentity?.scoreStorageKey || `pharmlet.${quizId}.${modeParam}`;

                // Skip to render for legacy quizzes
                finishSetup(storageKey);
                return;
            }
        }
        else {
            throw new Error("Missing URL parameter. Use ?week=N, ?weeks=1-5, ?tag=Topic, or ?id=quiz-name");
        }
        
        // Validate pool has items
        if (filteredPool.length === 0) {
            throw new Error(`No items found for this filter. Check your URL parameters.`);
        }

        const quizUsesConcepts = filteredPool.some(isConceptEntry);
        const conceptConfig = state.quizConfig || getConceptQuizConfig(quizId);
        const configuredConceptQuizSize = getConceptQuizSize(conceptConfig);
        if (quizUsesConcepts && !Array.isArray(conceptConfig?.blueprint) && filteredPool.length < configuredConceptQuizSize) {
            throw new Error(`Endocrine quiz needs at least ${configuredConceptQuizSize} concept entries, but only ${filteredPool.length} were loaded.`);
        }
        
        // Session-based anti-repetition shuffling
        let lastRoundKeys = [];
        const sessionKey = `pharmlet.session.lastRound.${storageKey}`;
        try {
            const stored = sessionStorage.getItem(sessionKey);
            if (stored) lastRoundKeys = JSON.parse(stored);
        } catch (e) { /* ignore parse errors */ }
        
        // For MODE 1 (?week=N), drugs are already pre-selected (6+4 split)
        // For other modes, apply standard selection logic
        let selectedItems;
        if (quizUsesConcepts && Array.isArray(conceptConfig?.blueprint) && conceptConfig.blueprint.length) {
            const builtQuiz = buildConceptBlueprintQuestions({
                config: conceptConfig,
                pool: filteredPool,
                fullPool,
                lastRoundKeys
            });

            if (!builtQuiz || !builtQuiz.questions?.length) {
                throw new Error(conceptConfig.insufficientPoolMessage || "Unable to build the requested concept quiz.");
            }

            sessionStorage.setItem(sessionKey, JSON.stringify(builtQuiz.selectedItems.map(getQuestionIdentity)));
            state.questions = builtQuiz.questions.map((question, i) => ({
                ...question,
                _id: i
            }));

            finishSetup(storageKey);
            return;
        }

        if (weekParam) {
            // MODE 1: filteredPool IS the pre-selected 6+4 split (always use ALL of it)
            // Anti-repetition: shuffle fresh drugs first, then pad with repeats if needed
            const freshPool = filteredPool.filter(item => !lastRoundKeys.includes(getQuestionIdentity(item)));
            const repeatPool = filteredPool.filter(item => lastRoundKeys.includes(getQuestionIdentity(item)));
            
            // Always return exactly filteredPool.length drugs (the 6+4 = 10 we pre-selected)
            // Prioritize fresh drugs, fill remainder with repeats
            const targetCount = filteredPool.length;
            const shuffledFresh = shuffled(freshPool);
            const shuffledRepeat = shuffled(repeatPool);
            selectedItems = [...shuffledFresh, ...shuffledRepeat].slice(0, targetCount);
        } else {
            // MODE 2/3: Standard selection from filtered pool
            const quizSize = quizUsesConcepts ? configuredConceptQuizSize : 10;
            const unseenItems = filteredPool.filter(item => !lastRoundKeys.includes(getQuestionIdentity(item)));
            const workingPool = unseenItems.length >= Math.min(quizSize, filteredPool.length) ? unseenItems : filteredPool;
            const selectedCount = Math.min(quizSize, workingPool.length);
            selectedItems = shuffled(workingPool).slice(0, selectedCount);
        }

        if (quizUsesConcepts && selectedItems.length !== configuredConceptQuizSize) {
            throw new Error(`Endocrine quiz could not build ${configuredConceptQuizSize} questions from the loaded pool.`);
        }
        
        // Save this round for anti-repetition
        sessionStorage.setItem(sessionKey, JSON.stringify(selectedItems.map(getQuestionIdentity)));
        
        // Generate questions using the full pool for distractor context
        state.questions = shuffled(selectedItems).map((item, i) => ({
            ...createQuestionFromItem(item, fullPool),  // Use full pool for density-safe distractors
            _id: i,
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
    state.progressKey = getQuizProgressKey();
    hideQuizSessionNote();

    if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
    if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
    state.index = 0;
    state.score = 0;
    state.pointScore = 0;
    state.totalPoints = getTotalQuestionPoints(state.questions);
    state.hintsUsed = 0;
    state.currentStreak = 0;
    state.bestStreak = 0;
    state.marked = new Set();
    state.seen = new Set();
    state.originalQuestions = [];
    state.reviewMode = false;
    state.timedOut = false;
    state.resultsRecorded = false;
    state.signalsRecorded = false;
    state.finalBreakdown = null;
    state.timerPaused = false;
    state.progressCompleted = false;
    state.saveStatusMessage = "";
    state.currentScale = 1.0;
    document.body.style.zoom = state.currentScale;
    document.documentElement.style.setProperty("--quiz-size", `${state.currentScale}rem`);
    
    // Initialize high score storage ONLY if it doesn't exist yet
    if (storageKey && !localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, JSON.stringify({
            score: 0,
            total: state.questions.length,
            pointScore: 0,
            pointTotal: state.totalPoints,
            date: Date.now()
        }));
    }

    const savedSnapshot = loadSavedQuizProgress();
    let restored = false;

    if (savedSnapshot && resumeRequestedParam) {
        restored = restoreSavedQuizProgress(savedSnapshot);
    } else if (savedSnapshot) {
        const ageLabel = formatSavedSessionAge(savedSnapshot.savedAt);
        const promptLabel = getSavedSessionPromptLabel(savedSnapshot);
        const resumeSaved = confirm(`Resume ${promptLabel} from ${ageLabel}?\n\nChoose OK to resume it, or Cancel to start a fresh run and clear the saved session.`);

        if (resumeSaved) {
            restored = restoreSavedQuizProgress(savedSnapshot);
        } else {
            clearQuizProgress();
            showQuizSessionNote(`Starting fresh. The older saved session from ${ageLabel} was cleared for this new run.`, "accent");
        }
    }

    if (restored) {
        startRestoredTimer();
    } else {
        startSmartTimer();
    }

    if (state.modeNotice) {
        const note = restored
            ? `Saved progress restored. ${state.modeNotice}`
            : state.modeNotice;
        showQuizSessionNote(note, state.placeholderQuiz ? "accent" : "good");
    }

    wireEvents();
    applyAttemptModeUI();

    if (!state.progressLifecycleBound) {
        const persistNow = () => persistQuizProgress(true);
        window.addEventListener("pagehide", persistNow);
        window.addEventListener("beforeunload", persistNow);
        state.progressLifecycleBound = true;
    }
    
    // Save last quiz for quick resume (include lab param for week-based modes)
    const labSuffix = (weekParam || weeksParam || (tagParam && params.has("lab"))) ? `&lab=${labParam}` : '';
    const activeModeLabel = getConfiguredModeStorageLabel() || modeParam;
    const omitModeSuffix = quizId === CEUTICS2_FINAL_ID && activeModeLabel === "trueExam";
    const modeSuffix = activeModeLabel && activeModeLabel !== "easy" && !omitModeSuffix
        ? `&mode=${encodeURIComponent(activeModeLabel)}`
        : "";
    const examSuffix = isTrueExamMode() && !omitModeSuffix ? "&exam=1" : "";
    const lastQuizParam = weekParam ? `?week=${weekParam}${labSuffix}` 
                        : weeksParam ? `?weeks=${weeksParam}${labSuffix}`
                        : tagParam ? `?tag=${tagParam}${labSuffix}`
                        : `?id=${quizId}${modeSuffix}${examSuffix}`;
    localStorage.setItem("pharmlet.last-quiz", lastQuizParam);
    
    render();
}

document.addEventListener('DOMContentLoaded', main);
