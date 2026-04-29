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
    quickHard: "Quick Quiz",
    quickQuiz: "Quick Quiz",
    trueExam: "True Exam",
    exam: "True Exam",
    pkGenerator: "PK Quiz",
    pkQuiz: "PK Quiz",
    masterPool: "Master Pool"
  });
  const CEUTICS2_FINAL_ID = "ceutics2-final";

  const QUIZ_CATALOG = Object.freeze([
    { id: "chapter1-review", title: "Chapter 1 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter1-review.json", customBuilder: true },
    { id: "chapter2-review", title: "Chapter 2 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter2-review.json", customBuilder: true },
    { id: "chapter3-review", title: "Chapter 3 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter3-review.json", customBuilder: true },
    { id: "chapter4-review", title: "Chapter 4 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter4-review.json", customBuilder: true },
    { id: "chapter5-review", title: "Chapter 5 Review", favoriteCategory: "chapter", statsCategory: "Chapter Reviews", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/chapter5-review.json", customBuilder: true },
    { id: "practice-e1-exam1-prep-ch1-4", title: "Practice E1 - Exam 1 Prep (Chapters 1-4)", favoriteCategory: "practice", statsCategory: "Exam Practice", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/practice-e1-exam1-prep-ch1-4.json", customBuilder: true },
    { id: "practice-e2a-exam2-prep-ch1-5", title: "Practice E2A - Exam 2 Prep (Chapters 1-5)", favoriteCategory: "practice", statsCategory: "Exam Practice", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/practice-e2a-exam2-prep-ch1-5.json", customBuilder: true },
    { id: "practice-e2b-exam2-prep-expanded", title: "Practice E2B - Exam 2 Prep (Expanded)", favoriteCategory: "practice", statsCategory: "Exam Practice", modes: ["easy", "hard"], sourceType: "quiz-json", sourcePath: "quizzes/practice-e2b-exam2-prep-expanded.json", customBuilder: true },
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
    { id: "ceutics2-final", title: "Pharmaceutics II Final Exam", favoriteCategory: "final", statsCategory: "Pharmaceutics", modes: ["quickQuiz", "trueExam", "pkQuiz"], sourceType: "quiz-json", sourcePath: "quizzes/ceutics2_final_master_pool_v2.json", customBuilder: false },
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

  const QUIZ_MAP = new Map(QUIZ_CATALOG.map((entry) => [entry.id, entry]));

  function cloneEntry(entry) {
    return entry ? {
      ...entry,
      modes: Array.isArray(entry.modes) ? [...entry.modes] : []
    } : null;
  }

  function getEntry(id) {
    return cloneEntry(QUIZ_MAP.get(String(id || "").trim()));
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
    listCustomBuilderEntries,
    getFavoriteCategoryLabel,
    resolveFavoriteCategory,
    buildQuizHref,
    getModeLabel,
    buildDynamicQuizLabel,
    resolveStatsCategory
  };
})(window);
