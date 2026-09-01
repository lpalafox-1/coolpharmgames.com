(function (global) {
  const FAVORITE_CATEGORY_LABELS = Object.freeze({
    chapter: "Chapter Reviews",
    practice: "Exam Practice",
    lab: "Lab Quizzes",
    cumulative: "Cumulative",
    final: "Final Review",
    fun: "Fun Modes",
    other: "Other"
  });
  const MODE_LABELS = Object.freeze({
    easy: "Easy",
    hard: "Hard",
    expert: "Expert",
    quickHard: "Quick Hard",
    quickQuiz: "Quick Hard",
    trueExam: "True Exam",
    exam: "True Exam",
    pkGenerator: "PK Math",
    pkQuiz: "PK Math",
    pkMath: "PK Math",
    adaptive: "Adaptive",
    masterPool: "Master Pool"
  });
  const CEUTICS2_FINAL_ID = "ceutics2-final";

  const P1_FALL_2025 = Object.freeze({
    professionalYear: "P1",
    academicYear: "2025-26",
    semester: "Fall 2025",
    curriculumId: "p1-fall-2025"
  });
  const P1_SPRING_2026 = Object.freeze({
    professionalYear: "P1",
    academicYear: "2025-26",
    semester: "Spring 2026",
    curriculumId: "p1-spring-2026"
  });
  const curriculum = (base, details = {}) => Object.freeze({ ...base, ...details });
  const CURRICULUM_CONTEXT_BY_QUIZ_ID = Object.freeze({
    "chapter1-review": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "chapter2-review": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "chapter3-review": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "chapter4-review": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "chapter5-review": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "practice-e1-exam1-prep-ch1-4": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "practice-e2a-exam2-prep-ch1-5": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "supplemental-exam1-2024": curriculum(P1_FALL_2025, { course: "Pharmaceutical Calculations" }),
    "ceutics-practice-1": curriculum(P1_FALL_2025, { course: "Pharmaceutics I" }),
    "ceutics-practice-2": curriculum(P1_FALL_2025, { course: "Pharmaceutics I" }),
    "lab-quiz1-antihypertensives": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "lab-quiz2-antihypertensives": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "lab-quiz3-antilipemics": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "lab-quiz4-anticoagulants": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "lab-quiz5-antiarrhythmics": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "cumulative-quiz1-2": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "cumulative-quiz1-3": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "cumulative-quiz1-4": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "cumulative-quiz1-5": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "top-drugs-final-mockA": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "top-drugs-final-mockB": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "top-drugs-final-mockC": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "top-drugs-final-mockD": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "top-drugs-final-mockE": curriculum(P1_FALL_2025, { lab: "Lab I" }),
    "popp-practice-exam1": curriculum(P1_FALL_2025, { course: "Principles of Pharmacy Practice I" }),
    "popp-practice-law": curriculum(P1_FALL_2025, { course: "Principles of Pharmacy Practice I" }),
    "popp-practice-mock-E1": curriculum(P1_FALL_2025, { course: "Principles of Pharmacy Practice I" }),
    "basis-practice-exam1": curriculum(P1_FALL_2025, { course: "Basis for Drug Therapy I" }),
    "basis-practice-mock-E1": curriculum(P1_FALL_2025, { course: "Basis for Drug Therapy I" }),
    "practice-q2": curriculum(P1_FALL_2025, { course: "Basis for Drug Therapy I" }),
    "latin-fun": curriculum(P1_FALL_2025),
    "sig-wildcards": curriculum(P1_FALL_2025),
    "ceutics2-final": curriculum(P1_SPRING_2026, { course: "Pharmaceutics II" }),
    "bdt-unit10-quiz8": curriculum(P1_SPRING_2026, { course: "Basis for Drug Therapy II" }),
    "basis2-quiz9": curriculum(P1_SPRING_2026, { course: "Basis for Drug Therapy II" }),
    "bdt-unit10-exam4": curriculum(P1_SPRING_2026, { course: "Basis for Drug Therapy II" }),
    "bdt-unit10-exam4-high-yield": curriculum(P1_SPRING_2026, { course: "Basis for Drug Therapy II" }),
    "log-lab-final-2": curriculum(P1_SPRING_2026, { lab: "Lab II" })
  });

  const QUIZ_CATALOG = Object.freeze([
    { id: "chapter1-review", title: "Chapter 1 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter1-review.json", customBuilder: true },
    { id: "chapter2-review", title: "Chapter 2 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter2-review.json", customBuilder: true },
    { id: "chapter3-review", title: "Chapter 3 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter3-review.json", customBuilder: true },
    { id: "chapter4-review", title: "Chapter 4 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter4-review.json", customBuilder: true },
    { id: "chapter5-review", title: "Chapter 5 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter5-review.json", customBuilder: true },
    { id: "practice-e1-exam1-prep-ch1-4", title: "Practice E1 - Exam 1 Prep (Chapters 1-4)", favoriteCategory: "practice", statsCategory: "Exam Practice", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/practice-e1-exam1-prep-ch1-4.json", customBuilder: true },
    { id: "practice-e2a-exam2-prep-ch1-5", title: "Practice E2A - Exam 2 Prep (Chapters 1-5)", favoriteCategory: "practice", statsCategory: "Exam Practice", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/practice-e2a-exam2-prep-ch1-5.json", customBuilder: true },
    { id: "practice-q2", title: "Practice Q2 - BDT-I (Handouts 1-6, v5)", favoriteCategory: "practice", statsCategory: "Exam Practice", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/practice-q2.json", customBuilder: true },
    { id: "supplemental-exam1-2024", title: "Supplemental Exam 1 (2024)", favoriteCategory: "practice", statsCategory: "Exam Practice", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/supplemental-exam1-2024.json", customBuilder: true },
    { id: "lab-quiz1-antihypertensives", title: "Lab Quiz 1 - Antihypertensives (v3)", favoriteCategory: "lab", statsCategory: "Lab Quizzes", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/lab-quiz1-antihypertensives.json", customBuilder: true },
    { id: "lab-quiz2-antihypertensives", title: "Lab Quiz 2 - Antihypertensives (v3)", favoriteCategory: "lab", statsCategory: "Lab Quizzes", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/lab-quiz2-antihypertensives.json", customBuilder: true },
    { id: "lab-quiz3-antilipemics", title: "Lab Quiz 3 - Antilipemics (v3)", favoriteCategory: "lab", statsCategory: "Lab Quizzes", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/lab-quiz3-antilipemics.json", customBuilder: true },
    { id: "lab-quiz4-anticoagulants", title: "Quiz 4 - Anticoagulants (v3)", favoriteCategory: "lab", statsCategory: "Lab Quizzes", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/lab-quiz4-anticoagulants.json", customBuilder: true },
    { id: "lab-quiz5-antiarrhythmics", title: "Lab Quiz 5 - Antiarrhythmics (v3)", favoriteCategory: "lab", statsCategory: "Lab Quizzes", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/lab-quiz5-antiarrhythmics.json", customBuilder: true },
    { id: "cumulative-quiz1-2", title: "Cumulative Lab Quiz 1-2 - Antihypertensives (v3)", favoriteCategory: "cumulative", statsCategory: "Cumulative", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/cumulative-quiz1-2.json", customBuilder: true },
    { id: "cumulative-quiz1-3", title: "Cumulative Lab Quiz 1-3 - Antihypertensives + Antilipemics (v3)", favoriteCategory: "cumulative", statsCategory: "Cumulative", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/cumulative-quiz1-3.json", customBuilder: true },
    { id: "cumulative-quiz1-4", title: "Quiz 4 - Anticoagulants (v3)", favoriteCategory: "cumulative", statsCategory: "Cumulative", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/cumulative-quiz1-4.json", customBuilder: true },
    { id: "cumulative-quiz1-5", title: "Cumulative Quiz 1-5 - (v3)", favoriteCategory: "cumulative", statsCategory: "Cumulative", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/cumulative-quiz1-5.json", customBuilder: true },
    { id: "popp-practice-exam1", title: "Pharmacy Principles Practice Exam 1 - v2", favoriteCategory: "practice", statsCategory: "POPP", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/popp-practice-exam1.json", customBuilder: true },
    { id: "popp-practice-law", title: "Pharmacy Law - Community Pharmacy Practice (Unit 1, Dr. O'Brien)", favoriteCategory: "practice", statsCategory: "POPP", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/popp-practice-law.json", customBuilder: true },
    { id: "popp-practice-mock-E1", title: "Pharmacy Principles Practice Mock E1 (Revised - v2)", favoriteCategory: "practice", statsCategory: "POPP", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/popp-practice-mock-E1.json", customBuilder: true },
    { id: "basis-practice-exam1", title: "Practice Exam 1 v2 - BDT-I (Handouts 1-7)", favoriteCategory: "practice", statsCategory: "Basis", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/basis-practice-exam1.json", customBuilder: true },
    { id: "basis-practice-mock-E1", title: "Practice Mock Exam 1 (BDT-I Handouts 1-7)", favoriteCategory: "practice", statsCategory: "Basis", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/basis-practice-mock-E1.json", customBuilder: true },
    { id: "ceutics-practice-1", title: "PSCI 71303 Pharmaceutics", favoriteCategory: "practice", statsCategory: "Pharmaceutics", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/ceutics-practice-1.json", customBuilder: true },
    { id: "ceutics-practice-2", title: "PSCI 71303 Pharmaceutics - Quiz 2 Practice (Classes 9-15, LO25-60)", favoriteCategory: "practice", statsCategory: "Pharmaceutics", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/ceutics-practice-2.json", customBuilder: true },
    { id: "ceutics2-final", title: "Pharmaceutics II Final Exam", favoriteCategory: "final", statsCategory: "Pharmaceutics", modes: ["quickHard", "trueExam", "pkMath", "adaptive"], sourceType: "quiz-json", sourcePath: "quizzes/ceutics2_final_master_pool_v2.json", customBuilder: false },
    { id: "sig-wildcards", title: "SIG Wildcards - Latin to English Practice", favoriteCategory: "fun", statsCategory: "Fun Modes", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/sig-wildcards.json", customBuilder: true },
    { id: "latin-fun", title: "Latin Fun - English to Latin Practice", favoriteCategory: "fun", statsCategory: "Fun Modes", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/latin-fun.json", customBuilder: true },
    { id: "top-drugs-final-mockA", title: "Top Drugs Final Mock A - 88 Questions", favoriteCategory: "final", statsCategory: "Final Review", modes: ["easy"], sourceType: "quiz-json", sourcePath: "quizzes/top-drugs-final-mockA.json", customBuilder: true },
    { id: "top-drugs-final-mockB", title: "Top Drugs Final Mock B - 88 Questions", favoriteCategory: "final", statsCategory: "Final Review", modes: ["easy"], sourceType: "quiz-json", sourcePath: "quizzes/top-drugs-final-mockB.json", customBuilder: true },
    { id: "top-drugs-final-mockC", title: "Top Drugs Final Mock C - 88 Questions", favoriteCategory: "final", statsCategory: "Final Review", modes: ["easy"], sourceType: "quiz-json", sourcePath: "quizzes/top-drugs-final-mockC.json", customBuilder: true },
    { id: "top-drugs-final-mockD", title: "Top Drugs Final Mock D - 88 Questions", favoriteCategory: "final", statsCategory: "Final Review", modes: ["easy"], sourceType: "quiz-json", sourcePath: "quizzes/top-drugs-final-mockD.json", customBuilder: true },
    { id: "top-drugs-final-mockE", title: "Top Drugs Final Mock E - 88 Questions", favoriteCategory: "final", statsCategory: "Final Review", modes: ["easy"], sourceType: "quiz-json", sourcePath: "quizzes/top-drugs-final-mockE.json", customBuilder: true },
    { id: "test-sample-3", title: "Sample 3-question quiz (hints & calc)", favoriteCategory: "other", statsCategory: "Other", modes: ["easy"], sourceType: "quiz-json", sourcePath: "quizzes/test-sample-3.json", customBuilder: false },
    { id: "log-lab-final-2", title: "Top Drugs Final Lab 2", favoriteCategory: "final", statsCategory: "Final Review", modes: ["easy"], sourceType: "virtual", customBuilder: false },
    { id: "bdt-unit10-quiz8", title: "Basis II Quiz 8 - Endocrine System", favoriteCategory: "practice", statsCategory: "Basis", modes: ["easy"], sourceType: "concept-route", customBuilder: false },
    { id: "basis2-quiz9", title: "Basis II Quiz 9: Unit 11 - Female Reproductive Physiology", favoriteCategory: "practice", statsCategory: "Basis", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "assets/data/bdt2_quiz9_masterpool.json", customBuilder: true },
    { id: "bdt-unit10-exam4", title: "Basis II Exam 4 - Endocrine Draft", favoriteCategory: "practice", statsCategory: "Basis", modes: ["easy"], sourceType: "concept-route", customBuilder: false },
    { id: "bdt-unit10-exam4-high-yield", title: "Basis II Exam 4 - High-Yield Draft", favoriteCategory: "practice", statsCategory: "Basis", modes: ["easy"], sourceType: "concept-route", customBuilder: false }
  ]);

  const QUIZ_MAP = new Map(QUIZ_CATALOG.map((entry) => {
    const context = CURRICULUM_CONTEXT_BY_QUIZ_ID[entry.id];
    if (context) entry.curriculum = context;
    return [entry.id, entry];
  }));

  function cloneCurriculum(value) {
    return value && typeof value === "object" ? { ...value } : undefined;
  }

  function cloneEntry(entry) {
    return entry ? {
      ...entry,
      modes: Array.isArray(entry.modes) ? [...entry.modes] : [],
      ...(entry.curriculum ? { curriculum: cloneCurriculum(entry.curriculum) } : {})
    } : null;
  }

  function getEntry(id) {
    return cloneEntry(QUIZ_MAP.get(String(id || "").trim()));
  }

  function getCurriculumContext(id) {
    const value = String(id || "").trim();
    if (!value) return null;

    const entry = QUIZ_MAP.get(value);
    if (entry) {
      const context = cloneCurriculum(entry.curriculum) || {};
      context.quizId = value;
      if (entry.sourceType === "quiz-json") context.origin = "static";
      if (entry.sourceType === "concept-route" || entry.sourceType === "virtual") context.origin = "generated";
      if (entry.sourcePath) context.curriculumSource = context.curriculumSource || entry.sourcePath;
      return context;
    }

    const dynamicMatch = value.match(/^lab-(1|2)-(?:week-(\d+)|weeks-\d+-\d+|tag-.+)$/);
    if (!dynamicMatch) return null;
    const isLabOne = dynamicMatch[1] === "1";
    return {
      ...(isLabOne ? P1_FALL_2025 : P1_SPRING_2026),
      lab: isLabOne ? "Lab I" : "Lab II",
      quizId: value,
      ...(dynamicMatch[2] ? { quizWeek: Number(dynamicMatch[2]) } : {}),
      origin: "generated",
      curriculumSource: "assets/data/master_pool.json"
    };
  }

  function listCustomBuilderEntries() {
    return QUIZ_CATALOG
      .filter((entry) => entry.customBuilder && entry.sourceType === "quiz-json")
      .map(cloneEntry)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function getFavoriteCategoryLabel(categoryKey) {
    return FAVORITE_CATEGORY_LABELS[categoryKey] || FAVORITE_CATEGORY_LABELS.other;
  }

  function buildQuizHref(quizId, mode) {
    const value = String(quizId || "").trim();
    let match = value.match(/^lab-(\d+)-week-(\d+)$/);
    if (match) {
      return `quiz.html?lab=${encodeURIComponent(match[1])}&week=${encodeURIComponent(match[2])}`;
    }

    match = value.match(/^lab-(\d+)-weeks-(\d+-\d+)$/);
    if (match) {
      return `quiz.html?lab=${encodeURIComponent(match[1])}&weeks=${encodeURIComponent(match[2])}`;
    }

    match = value.match(/^lab-(\d+)-tag-(.+)$/);
    if (match) {
      return `quiz.html?lab=${encodeURIComponent(match[1])}&tag=${encodeURIComponent(match[2])}`;
    }

    match = value.match(/^tag-(.+)$/);
    if (match) {
      return `quiz.html?tag=${encodeURIComponent(match[1])}`;
    }

    if (value === CEUTICS2_FINAL_ID) {
      const params = new URLSearchParams();
      params.set("id", value);
      const normalizedMode = String(mode || "").trim();
      if (!normalizedMode || normalizedMode === "trueExam" || normalizedMode === "exam") {
        return `quiz.html?${params.toString()}`;
      }
      params.set("mode", normalizedMode);
      return `quiz.html?${params.toString()}`;
    }

    const params = new URLSearchParams();
    params.set("id", value);
    params.set("mode", mode ? String(mode).trim() : "easy");
    return `quiz.html?${params.toString()}`;
  }

  function getModeLabel(modeKey) {
    const raw = String(modeKey || "").trim();
    if (!raw) return "";
    return MODE_LABELS[raw] || raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function buildDynamicQuizLabel(quizId) {
    const value = String(quizId || "").trim();
    if (!value) return "";

    let match = value.match(/^lab-(\d+)-week-(\d+)$/);
    if (match) {
      return `Lab ${match[1]} Week ${match[2]}`;
    }

    match = value.match(/^lab-(\d+)-weeks-(\d+-\d+)$/);
    if (match) {
      return `Lab ${match[1]} Weeks ${match[2]}`;
    }

    match = value.match(/^lab-(\d+)-tag-(.+)$/);
    if (match) {
      return `Lab ${match[1]} Tag - ${match[2]}`;
    }

    match = value.match(/^tag-(.+)$/);
    if (match) {
      return `Tag - ${match[1]}`;
    }

    if (value.startsWith("generated-")) {
      if (value.includes("weak-area-playlist")) return "Weak-Area Playlist";
      if (value.includes("boss-round")) return "Boss Round";
      return "Generated Quiz";
    }

    if (value === "review-quiz") return "Review Quiz";
    if (value === "custom-quiz") return "Custom Quiz";
    return value;
  }

  function resolveStatsCategory(quizId) {
    const value = String(quizId || "").trim();
    if (!value) return "Other";

    const entry = QUIZ_MAP.get(value);
    if (entry?.statsCategory) return entry.statsCategory;

    if (/^lab-\d+-week-\d+$/.test(value) || /^lab-\d+-weeks-\d+-\d+$/.test(value) || /^lab-\d+-tag-/.test(value) || /^tag-/.test(value)) {
      return "Top Drugs";
    }

    if (value === "review-quiz") return "Review Queue";
    if (value === "custom-quiz") return "Custom Quiz";

    if (value.startsWith("generated-")) {
      if (value.includes("weak-area-playlist")) return "Adaptive Playlists";
      if (value.includes("boss-round")) return "Boss Rounds";
      return "Generated Sets";
    }

    if (value.startsWith("bdt-")) return "Basis";
    if (value.startsWith("chapter")) return "Chapter Reviews";
    if (value.startsWith("practice-")) return "Exam Practice";
    if (value.startsWith("lab-quiz")) return "Lab Quizzes";
    if (value.startsWith("week") || value.startsWith("weeks")) return "Top Drugs";
    if (value.startsWith("cumulative")) return "Cumulative";
    if (value.startsWith("popp")) return "POPP";
    if (value.startsWith("basis")) return "Basis";
    if (value.startsWith("ceutics")) return "Pharmaceutics";
    if (value.includes("final") || value.includes("top-drugs")) return "Final Review";
    if (value.includes("latin") || value.includes("sig")) return "Fun Modes";
    return "Other";
  }

  function resolveFavoriteCategory(quizId) {
    const entry = QUIZ_MAP.get(String(quizId || "").trim());
    if (entry?.favoriteCategory) return entry.favoriteCategory;

    if (/^lab-\d+-week-\d+$/.test(quizId) || /^lab-\d+-weeks-\d+-\d+$/.test(quizId) || /^lab-\d+-tag-/.test(quizId) || /^tag-/.test(quizId)) {
      return "final";
    }

    return "other";
  }

  global.PharmletQuizCatalog = {
    entries: QUIZ_CATALOG.map(cloneEntry),
    getEntry,
    getCurriculumContext,
    listCustomBuilderEntries,
    getFavoriteCategoryLabel,
    resolveFavoriteCategory,
    buildQuizHref,
    getModeLabel,
    buildDynamicQuizLabel,
    resolveStatsCategory
  };
})(window);
