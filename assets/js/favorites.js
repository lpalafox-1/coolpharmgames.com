// assets/js/favorites.js
// Favorites/Bookmarks page

const THEME_KEY = "pharmlet.theme";
const FAVORITES_KEY = "pharmlet.favorites";
const quizCatalog = window.PharmletQuizCatalog;

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
    title: quizCatalog?.getEntry?.(id)?.title || quizCatalog?.buildDynamicQuizLabel?.(id) || id,
    category: quizCatalog?.resolveFavoriteCategory?.(id) || "other",
    modes: quizCatalog?.getEntry?.(id)?.modes || ["easy", "hard"]
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
    const modeButtons = quiz.modes.map(mode => {
      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
      const href = quizCatalog?.buildQuizHref?.(quiz.id, mode)
        || `quiz.html?id=${encodeURIComponent(quiz.id)}&mode=${encodeURIComponent(mode)}`;
      return `<a href="${href}" class="btn btn-blue flex-1 text-center">${label}</a>`;
    }).join("");

    div.innerHTML = `
      <div class="flex items-start justify-between mb-3">
        <div>
          <h3 class="font-semibold text-lg">${sanitize(quiz.title)}</h3>
          <span class="text-sm" style="color:var(--muted)">${getCategoryLabel(quiz.category)}</span>
        </div>
        <button class="remove-favorite text-2xl" data-id="${quiz.id}" title="Remove from favorites" style="color:var(--accent)">★</button>
      </div>
      <div class="flex gap-2">
        ${modeButtons}
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
  return quizCatalog?.getFavoriteCategoryLabel?.(category) || "Other";
}

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
