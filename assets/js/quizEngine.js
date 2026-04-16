// assets/js/quizEngine.js
const params = new URLSearchParams(location.search);
const weekParam = parseInt(params.get("week") || "", 10);  // Single week: ?week=1
const weeksParam = params.get("weeks");                      // Cumulative range: ?weeks=1-5
const tagParam = params.get("tag");                          // Topic mode: ?tag=Anticoagulants
const labParam = parseInt(params.get("lab") || "2", 10);     // Lab isolation: &lab=1 or &lab=2 (default: 2)
const quizId = params.get("id");
const modeParam = params.get("mode") || "easy";
const HISTORY_KEY = "pharmlet.history";

const state = { 
    questions: [], index: 0, score: 0, title: "",
    timerSeconds: 0, timerHandle: null, marked: new Set(),
    currentScale: 1.0,
    originalQuestions: [],  // For restart with original pool
    hintsUsed: 0,           // Track hints for stats
    resultsRecorded: false
};

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

const getEl = (id) => document.getElementById(id);

const CONCEPT_QUIZ_ID = "bdt-unit10-quiz8";
const CONCEPT_QUIZ_TITLE = "Endocrine Concept Practice";
const CONCEPT_QUIZ_SIZE = 10;
const CONCEPT_QUIZ_POOL_FILE = "bdt_unit10_quiz8_master_pool.json";

const FINAL_EXAM_ID = "log-lab-final-2";
const FINAL_EXAM_TITLE = "Top Drugs Final Lab 2 — 110 Questions";
const FINAL_EXAM_TOTAL = 110;

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
    const counts = { 1: 0, 2: 0 };
    const selected = [];
    const seenGenerics = new Set();
    const normalizeGeneric = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

    const addDrug = (drug) => {
        const lab = Number(drug?.metadata?.lab);
        const genericKey = normalizeGeneric(drug?.generic);

        if (![1, 2].includes(lab) || !genericKey) return false;
        if (counts[lab] >= targetCounts[lab] || seenGenerics.has(genericKey)) return false;

        seenGenerics.add(genericKey);
        selected.push(drug);
        counts[lab] += 1;
        return true;
    };

    const bucketPlan = [];

    for (let week = 1; week <= 10; week++) {
        bucketPlan.push({ bucket: byLabWeek.get(`1-${week}`) || [], lab: 1, limit: 4 });
        bucketPlan.push({ bucket: byLabWeek.get(`2-${week}`) || [], lab: 2, limit: 4 });
    }

    bucketPlan.push({ bucket: byLabWeek.get("1-11") || [], lab: 1, limit: 4 });
    bucketPlan.push({ bucket: byLabWeek.get("2-11") || [], lab: 2, limit: 3 });

    const fillBuckets = (respectBucketLimits) => {
        for (const { bucket, lab, limit } of bucketPlan) {
            let pickedInBucket = 0;

            for (const drug of bucket) {
                if (counts[lab] >= targetCounts[lab]) break;
                if (respectBucketLimits && pickedInBucket >= limit) break;
                if (addDrug(drug)) pickedInBucket += 1;
            }
        }
    };

    fillBuckets(true);

    if (counts[1] < targetCounts[1] || counts[2] < targetCounts[2]) {
        fillBuckets(false);
    }

    if (selected.length !== FINAL_EXAM_TOTAL || counts[1] !== targetCounts[1] || counts[2] !== targetCounts[2]) {
        throw new Error(`Final exam generator expected 44 Lab 1 and 66 Lab 2 unique drugs, got ${counts[1]} and ${counts[2]}.`);
    }

    return selected;
}

// --- SMART HINT SYSTEM ---
function showHint() {
    const q = state.questions[state.index];
    if (!q || q._answered) return;

    if (q._mode === "concept" || q.conceptRef) {
        const conceptHint = buildConceptHintText(q);
        if (!conceptHint) {
            alert("💡 No hint available for this question.");
            return;
        }

        q._hintUsed = true;
        state.hintsUsed++;
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

function getHistoryQuizId() {
    if (quizId) return quizId;
    if (weekParam) return `week-${weekParam}`;
    if (weeksParam) return `weeks-${weeksParam}`;
    if (tagParam) return `tag-${tagParam.toLowerCase()}`;
    return "quiz";
}

function saveQuizHistory() {
    if (state.resultsRecorded) return;

    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const history = raw ? JSON.parse(raw) : [];

        history.push({
            quizId: getHistoryQuizId(),
            mode: modeParam,
            title: state.title || FINAL_EXAM_TITLE,
            score: state.score,
            total: state.questions.length,
            bestStreak: 0,
            timestamp: Date.now()
        });

        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-200)));
        state.resultsRecorded = true;
    } catch (e) {
        console.warn("Failed to save quiz history:", e);
    }
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
    
    // CRITICAL FIX: Restore question card structure (showResults replaced it)
    const card = getEl("question-card");
    if (card) {
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

function normalizeQuizValue(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function flattenPoolData(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.questions)) return data.questions;
    if (data?.pools && typeof data.pools === "object") return Object.values(data.pools).flat();
    return [];
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
    return (question?._mode === "concept" || question?.conceptRef)
        ? "Endocrine Concept Practice"
        : "Drug Practice";
}

function getQuestionIdentity(item) {
    if (isConceptEntry(item)) {
        return normalizeQuizValue(item.id || [item.concept_type, item.source, item.target, item.relationship].filter(Boolean).join("|"));
    }

    return normalizeQuizValue(item?.generic || item?.id || item?.brand || item?.class || item?.category || item?.moa);
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

function collectConceptValues(all, item, key, answer) {
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
    const values = [];

    for (const pool of pools) {
        for (const entry of shuffled(pool)) {
            const value = entry?.[key];
            const normalized = normalizeQuizValue(value);
            if (!value || excluded.has(normalized) || seen.has(normalized)) continue;
            seen.add(normalized);
            values.push(value);
            if (values.length >= 3) return values;
        }
    }

    return values;
}

function buildConceptMcqQuestion({ item, all, prompt, answer, answerText, key, conceptPromptKind }) {
    const distractors = collectConceptValues(all, item, key, answer);
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

function buildConceptShortQuestion({ item, prompt, answer, answerText, conceptPromptKind }) {
    if (!answer) return null;

    return {
        type: "short",
        prompt,
        answer,
        answerText: answerText || (conceptPromptKind === "relationship" ? getRelationshipVariants(answer) : undefined),
        conceptRef: item,
        conceptPromptKind,
        _mode: "concept"
    };
}

function buildConceptHintText(question) {
    const concept = question?.conceptRef;
    if (!concept) return null;

    const lines = [];
    const scope = getConceptScopeLabel(concept);
    if (scope) lines.push(`📘 ${scope}`);
    if (concept.concept_type) lines.push(`🧠 Type: ${concept.concept_type}`);

    const source = concept.source || "N/A";
    const target = concept.target || "N/A";
    const relationship = concept.relationship || "N/A";

    switch (question?.conceptPromptKind) {
        case "relationship":
            lines.push(`🔗 Source: ${source}`);
            lines.push(`🎯 Target: ${target}`);
            break;
        case "sequence-forward":
            lines.push(`➡️ Starts with: ${source}`);
            lines.push(`➡️ Continues to: ${target}`);
            break;
        case "sequence-backward":
            lines.push(`⬅️ Previous step: ${source}`);
            lines.push(`⬅️ Followed by: ${target}`);
            break;
        case "source":
            lines.push(`🎯 Target: ${target}`);
            lines.push(`🔗 Relationship: ${relationship}`);
            break;
        case "fact":
            lines.push(`🧩 Source: ${source}`);
            lines.push(`🧩 Target: ${target}`);
            break;
        default:
            lines.push(`🔗 Source: ${source}`);
            lines.push(`🎯 Target: ${target}`);
            if (relationship && relationship !== "N/A") lines.push(`↔ Relationship: ${relationship}`);
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

    const addSpec = (prompt, answer, key, conceptPromptKind, answerText, preferredType = "mcq") => {
        if (!prompt || answer === undefined || answer === null || String(prompt).trim() === "") return;
        specs.push({ prompt, answer, key, conceptPromptKind, answerText, preferredType });
    };

    const relationQuestion = source && target && relationship
        ? `What relationship best describes <b>${sourceTerm}</b> and <b>${targetTerm}</b>?`
        : null;

    switch (conceptType) {
        case "regulation_pair": {
            if (source && target && relationship) {
                if (/^stimulates$/i.test(relationshipTerm)) {
                    addSpec(`Which hormone stimulates ${targetTerm} release?`, source, "source", "relationship");
                    addSpec(`Which hormone stimulates ${targetTerm} secretion?`, source, "source", "relationship");
                } else if (/^inhibits$/i.test(relationshipTerm)) {
                    addSpec(`Which hormone inhibits ${targetTerm} secretion?`, source, "source", "relationship");
                    addSpec(`Which hormone inhibits ${targetTerm} release?`, source, "source", "relationship");
                } else if (/^stimulates\s+/i.test(relationshipTerm) || /^inhibits\s+/i.test(relationshipTerm)) {
                    addSpec(`Which hormone ${relationshipTerm}?`, source, "source", "relationship");
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
                if (/anterior pituitary/i.test(item?.topic || "")) {
                    addSpec(`Which anterior pituitary cell secretes ${targetTerm}?`, source, "source", "source");
                } else if (/endocrine pancreas|islet/i.test(item?.topic || "")) {
                    addSpec(`Which pancreatic islet cell secretes ${targetTerm}?`, source, "source", "source");
                } else {
                    addSpec(`Which cell secretes ${targetTerm}?`, source, "source", "source");
                }

                addSpec(`Which hormone is secreted by the ${sourceTerm}?`, target, "target", "target");
            }
            break;
        }
        case "gland_to_hormone": {
            if (source && target) {
                const glandPrompt = /medulla/i.test(source) || /medulla/i.test(item?.topic || "")
                    ? `Which hormone is released by the ${sourceTerm}?`
                    : `Which hormone is secreted by the ${sourceTerm}?`;
                addSpec(glandPrompt, target, "target", "target");
                addSpec(`Which gland secretes ${targetTerm}?`, source, "source", "source");
            }
            break;
        }
        case "zone_to_hormone": {
            if (source && target) {
                addSpec(`Which hormone is produced by the ${sourceTerm}?`, target, "target", "target");
                addSpec(`Which adrenal zone produces ${targetTerm}?`, source, "source", "source");
            }
            break;
        }
        case "function_pair": {
            if (source && target) {
                if (/(\band\b|,)/i.test(source)) {
                    addSpec(`What are ${sourceTerm} responsible for${stateClause}?`, target, "target", "fact", undefined, "short");
                } else {
                    addSpec(`What does ${sourceTerm} promote${stateClause}?`, target, "target", "target", undefined, "short");
                }
            }
            break;
        }
        case "fact_statement": {
            if (source && target) {
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
                    addSpec(`What happens after glucose metabolism in beta cells?`, target, "target", "sequence-forward", undefined, "short");
                } else if (/increased atp/i.test(source)) {
                    addSpec(`What happens after increased ATP?`, target, "target", "sequence-forward", undefined, "short");
                } else if (/cholesterol/i.test(source) && /pregnenolone/i.test(target)) {
                    addSpec(`What is the first step in steroid hormone synthesis?`, target, "target", "sequence-forward", undefined, "short");
                } else {
                    addSpec(`What comes next after ${sourceTerm}${scopeLabel ? ` in ${scopeLabel}` : ""}?`, target, "target", "sequence-forward");
                }

                addSpec(`Which step comes before ${targetTerm}?`, source, "source", "sequence-backward");
            }
            break;
        }
        case "consequence_pair": {
            if (source && target) {
                addSpec(`What can ${sourceTerm} cause?`, target, "target", "fact", undefined, "short");
                addSpec(`Which consequence is associated with ${sourceTerm}?`, target, "target", "fact", undefined, "short");
            }
            break;
        }
        case "axis_sequence": {
            if (source && target) {
                addSpec(`Which sequence correctly describes the ${getConceptAxisLabel(item)}?`, target, "target", "sequence-forward", undefined, "short");
                addSpec(`What comes after ${sourceTerm} in the ${getConceptAxisLabel(item)}?`, target, "target", "sequence-forward", undefined, "short");
            }
            break;
        }
        default: {
            if (source && target) {
                if (/^stimulates$/i.test(relationshipTerm)) {
                    addSpec(`Which hormone stimulates ${targetTerm} release?`, source, "source", "relationship");
                } else if (/^inhibits$/i.test(relationshipTerm)) {
                    addSpec(`Which hormone inhibits ${targetTerm} secretion?`, source, "source", "relationship");
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

function createConceptQuestion(item, all) {
    const difficulty = normalizeQuizValue(item?.difficulty);
    const preferShort = /hard|advanced|challenging/.test(difficulty);
    const promptSpecs = getConceptPromptSpecs(item);
    const builders = [];

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

        if (spec.preferredType === "short" || preferShort) {
            builders.push(shortBuilder, mcqBuilder);
        } else {
            builders.push(mcqBuilder, shortBuilder);
        }
    }

    for (const build of shuffled(builders)) {
        const question = build();
        if (question) return question;
    }

    const source = String(item?.source ?? "").trim();
    const target = String(item?.target ?? "").trim();
    const relationship = String(item?.relationship ?? "").trim();
    const fallbackAnswer = relationship || target || source || item?.id || "Unknown";
    return {
        type: "short",
        prompt: source && target
            ? `What relationship best describes <b>${formatConceptTerm(source)}</b> and <b>${formatConceptTerm(target)}</b>?`
            : source
                ? `Which statement about <b>${formatConceptTerm(source)}</b> is correct?`
                : `Endocrine concept practice`,
        answer: fallbackAnswer,
        answerText: relationship ? getRelationshipVariants(relationship) : undefined,
        conceptRef: item,
        conceptPromptKind: relationship ? "relationship" : "target",
        _mode: "concept"
    };
}

function createQuestionFromItem(item, all) {
    return isConceptEntry(item)
        ? createConceptQuestion(item, all)
        : createQuestion(item, all);
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
                d.class === targetDrug.class
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
                d.category === targetDrug.category
            ),
            key,
            excluded
        );
        if (sameCategory.length >= 3) {
            return sameCategory.slice(0, 3);
        }
        
        // Fall back to random drugs (exclude target drug and target value)
        const random = uniqueChoiceValues(
            all.filter(d => d !== targetDrug && d[key]),
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
        
        // Wrong answers: Each drug paired with a WRONG class (not their own, not target's)
        // This creates distinct options so students can identify the correctly paired one
        const wrongAnswers = selectedOthers.map((d, idx) => {
            // Get a random wrong class from other drugs (exclude this drug's class and target's class)
            const wrongClassPool = all
                .filter(other => other.class && other.class !== d.class && other.class !== drug.class)
                .map(other => other.class);
            
            // Use different wrong classes for variety (rotate through pool)
            const wrongClass = wrongClassPool[idx % wrongClassPool.length] || wrongClassPool[0] || 'Inhibitor';
            return `${d.generic}: ${wrongClass}`;
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

    if (getEl("drug-context")) getEl("drug-context").textContent = getQuestionContextLabel(q);
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
    const normalizeLoose = s => normalizeWhitespace(s).replace(/[\s\-\/.,;]+/g, '');
    const userNorm = normalizeWhitespace(val);
    const userLoose = normalizeLoose(val);
    const canonNorm = normalizeWhitespace(correctAnswer);

    const acceptedAnswers = new Set();
    const allowLooseBrandForms = q.prompt.includes("Brand");
    const addAcceptedForms = (answer, includeLooseForms = false) => {
        if (answer === undefined || answer === null) return;

        for (const part of String(answer).split(/[;,]/)) {
            const trimmed = normalizeWhitespace(part);
            if (!trimmed) continue;

            acceptedAnswers.add(trimmed);
            if (includeLooseForms) {
                acceptedAnswers.add(normalizeLoose(part));
            }
        }
    };

    const rawAnswers = Array.isArray(raw) ? raw : [raw];
    rawAnswers.forEach(answer => addAcceptedForms(answer, allowLooseBrandForms));

    if (q.drugRef?.brand && allowLooseBrandForms) {
        q.drugRef.brand.split(/[,/;]/).forEach(answer => addAcceptedForms(answer, true));
    }

    let isCorrect = false;

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

    q._answered = true;
    q._user = val;
    q._correct = !!isCorrect;
    if (isCorrect) state.score++;
    render();
}

function showResults() {
    saveQuizHistory();

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
        else if (quizId === FINAL_EXAM_ID) {
            fullPool = await smartFetch("master_pool.json");
            const selectedDrugs = selectFinalExamDrugs(fullPool);

            state.title = FINAL_EXAM_TITLE;
            state.questions = shuffled(selectedDrugs).map((d, i) => ({
                ...createQuestionFromItem(d, fullPool),
                _id: i
            }));
            storageKey = `pharmlet.${quizId}.easy`;

            finishSetup(storageKey);
            return;
        }
        // ========== MODE 4: ?id=bdt-unit10-quiz8 (Generated Concept Quiz) ==========
        else if (quizId === CONCEPT_QUIZ_ID) {
            const rawPool = await smartFetch(CONCEPT_QUIZ_POOL_FILE);
            const conceptPool = flattenPoolData(rawPool).filter(isConceptEntry);

            if (conceptPool.length === 0) {
                throw new Error("No endocrine concept entries found in the master pool.");
            }

            filteredPool = conceptPool;
            fullPool = conceptPool;
            state.title = CONCEPT_QUIZ_TITLE;
            storageKey = `pharmlet.${quizId}.easy`;
        }
        // ========== MODE 4: ?id=quiz-name (Legacy Static JSON) ==========
        else if (quizId) {
            const data = await smartFetch(`${quizId}.json`);
            const pool = flattenPoolData(data);

            if (pool.length > 0 && pool.some(isConceptEntry)) {
                filteredPool = pool.filter(isConceptEntry);
                fullPool = filteredPool;
                state.title = data.title || "Endocrine Concept Practice";
                storageKey = `pharmlet.${quizId}.easy`;
            } else {
                state.title = data.title || "Quiz";
                state.questions = shuffled(pool).map((q, i) => ({ ...q, _id: i }));
                storageKey = `pharmlet.${quizId}.easy`;

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
        if (quizUsesConcepts && filteredPool.length < CONCEPT_QUIZ_SIZE) {
            throw new Error(`Endocrine quiz needs at least ${CONCEPT_QUIZ_SIZE} concept entries, but only ${filteredPool.length} were loaded.`);
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
            const quizSize = quizUsesConcepts ? CONCEPT_QUIZ_SIZE : 10;
            const unseenItems = filteredPool.filter(item => !lastRoundKeys.includes(getQuestionIdentity(item)));
            const workingPool = unseenItems.length >= Math.min(quizSize, filteredPool.length) ? unseenItems : filteredPool;
            const selectedCount = Math.min(quizSize, workingPool.length);
            selectedItems = shuffled(workingPool).slice(0, selectedCount);
        }

        if (quizUsesConcepts && selectedItems.length !== CONCEPT_QUIZ_SIZE) {
            throw new Error(`Endocrine quiz could not build ${CONCEPT_QUIZ_SIZE} questions from the loaded pool.`);
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
    if (getEl("quiz-title")) getEl("quiz-title").textContent = state.title;
    if (getEl("qtotal")) getEl("qtotal").textContent = state.questions.length;
    state.resultsRecorded = false;
    
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
