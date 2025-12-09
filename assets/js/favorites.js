// assets/js/favorites.js
// Favorites/Bookmarks page

const THEME_KEY = "quiz-theme";
const FAVORITES_KEY = "pharmlet.favorites";

// Quiz metadata mapping (id -> {title, category})
const QUIZ_METADATA = {
  "chapter1-review": { title: "Chapter 1 Review", category: "chapter" },
  "chapter2-review": { title: "Chapter 2 Review", category: "chapter" },
  "chapter3-review": { title: "Chapter 3 Review", category: "chapter" },
  "chapter4-review": { title: "Chapter 4 Review", category: "chapter" },
  "chapter5-review": { title: "Chapter 5 Review", category: "chapter" },
  "practice-e1-exam1-prep-ch1-4": { title: "Practice E1 — Exam 1 Prep (Ch 1-4)", category: "practice" },
  "practice-e2a-exam2-prep-ch1-5": { title: "Practice E2A — Exam 2 Prep (Ch 1-5)", category: "practice" },
  "practice-e2b-exam2-prep-expanded": { title: "Practice E2B — Expanded Review", category: "practice" },
  "lab-quiz1-antihypertensives": { title: "Lab Quiz 1 — Antihypertensives", category: "lab" },
  "lab-quiz2-antihypertensives": { title: "Lab Quiz 2 — Antihypertensives", category: "lab" },
  "lab-quiz3-antilipemics": { title: "Lab Quiz 3 — Antilipemics", category: "lab" },
  "lab-quiz4-anticoagulants": { title: "Lab Quiz 4 — Anticoagulants", category: "lab" },
  "lab-quiz5-antiarrhythmics": { title: "Lab Quiz 5 — Antiarrhythmics", category: "lab" },
  "cumulative-quiz1-2": { title: "Cumulative Quiz 1–2", category: "cumulative" },
  "cumulative-quiz1-3": { title: "Cumulative Quiz 1–3", category: "cumulative" },
  "cumulative-quiz1-4": { title: "Cumulative Quiz 1–4", category: "cumulative" },
  "cumulative-quiz1-5": { title: "Cumulative Quiz 1–5", category: "cumulative" },
  "top-drugs-final-mockA": { title: "Top Drugs Final Mock A", category: "final" },
  "top-drugs-final-mockB": { title: "Top Drugs Final Mock B", category: "final" },
  "top-drugs-final-mockC": { title: "Top Drugs Final Mock C", category: "final" },
  "top-drugs-final-mockD": { title: "Top Drugs Final Mock D", category: "final" },
  "top-drugs-final-mockE": { title: "Top Drugs Final Mock E", category: "final" },
  "popp-practice-exam1": { title: "POPP Practice Exam 1", category: "practice" },
  "popp-practice-law": { title: "POPP Practice Law", category: "practice" },
  "popp-practice-mock-E1": { title: "POPP Practice Mock E1", category: "practice" },
  "basis-practice-exam1": { title: "Basis Practice Exam 1", category: "practice" },
  "basis-practice-mock-E1": { title: "Basis Practice Mock E1", category: "practice" },
  "ceutics-practice-1": { title: "Pharmaceutics Practice Q1", category: "practice" },
  "ceutics-practice-2": { title: "Pharmaceutics Practice Q2", category: "practice" },
  "sig-wildcards": { title: "SIG Wildcards", category: "fun" },
  "latin-fun": { title: "Latin Fun", category: "fun" }
};

document.addEventListener("DOMContentLoaded", () => {
  // Theme toggle
  const themeToggle = document.getElementById("theme-toggle");
  const themeLabel = document.getElementById("theme-label");
  
  if (themeToggle && themeLabel) {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const start = saved || (prefersDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", start === "dark");
    themeLabel.textContent = start === "dark" ? "Light" : "Dark";
    
    themeToggle.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      themeLabel.textContent = next === "dark" ? "Light" : "Dark";
    });
  }

  loadFavorites();
  
  document.getElementById("sort-by")?.addEventListener("change", loadFavorites);
  document.getElementById("filter-category")?.addEventListener("change", loadFavorites);
  document.getElementById("clear-all")?.addEventListener("click", clearAllFavorites);
});

function loadFavorites() {
  const favorites = getFavorites();
  const sortBy = document.getElementById("sort-by")?.value || "recent";
  const filterCategory = document.getElementById("filter-category")?.value || "";
  const container = document.getElementById("favorites-list");
  
  if (favorites.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 text-center py-12" style="color:var(--muted)">
        <p class="text-lg">No favorites yet!</p>
        <p class="mt-2">Click the star (☆) next to any quiz on the library page to add it here.</p>
        <a href="index.html" class="btn btn-blue mt-4 inline-block">Browse Quizzes</a>
      </div>
    `;
    return;
  }

  // Build quiz list with metadata
  let quizzes = favorites.map(id => ({
    id,
    title: QUIZ_METADATA[id]?.title || id,
    category: QUIZ_METADATA[id]?.category || "other"
  }));

  // Filter by category
  if (filterCategory) {
    quizzes = quizzes.filter(q => q.category === filterCategory);
  }

  // Sort
  if (sortBy === "name") {
    quizzes.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === "category") {
    quizzes.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }
  // "recent" keeps original order (last added first)

  if (quizzes.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 text-center py-12" style="color:var(--muted)">
        <p class="text-lg">No quizzes match this filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  quizzes.forEach(quiz => {
    const div = document.createElement("div");
    div.className = "favorite-item";
    div.innerHTML = `
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="font-semibold text-lg">${sanitize(quiz.title)}</h3>
          <span class="text-sm" style="color:var(--muted)">${getCategoryLabel(quiz.category)}</span>
        </div>
        <button class="remove-favorite text-2xl" data-id="${quiz.id}" title="Remove from favorites" style="color:var(--accent)">★</button>
      </div>
      <div class="flex gap-2">
        <a href="quiz.html?id=${quiz.id}&mode=easy&limit=20" class="btn btn-blue flex-1 text-center">Easy</a>
        <a href="quiz.html?id=${quiz.id}&mode=hard&limit=20" class="btn btn-blue flex-1 text-center">Hard</a>
      </div>
    `;
    
    div.querySelector(".remove-favorite").addEventListener("click", (e) => {
      removeFavorite(quiz.id);
      loadFavorites();
    });
    
    container.appendChild(div);
  });
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

function removeFavorite(id) {
  try {
    const favorites = new Set(getFavorites());
    favorites.delete(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {}
}

function clearAllFavorites() {
  if (confirm("Are you sure you want to remove all favorites? This cannot be undone.")) {
    localStorage.setItem(FAVORITES_KEY, "[]");
    loadFavorites();
  }
}

function getCategoryLabel(category) {
  const labels = {
    chapter: "Chapter Review",
    practice: "Exam Practice",
    lab: "Lab Quiz",
    cumulative: "Cumulative",
    final: "Final Review",
    fun: "Fun Mode",
    other: "Other"
  };
  return labels[category] || "Other";
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
