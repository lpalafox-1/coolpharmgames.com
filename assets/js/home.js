// assets/js/home.js
document.addEventListener("DOMContentLoaded", () => {
  try {
    runHome();
  } catch (e) {
    console.error("home.js crashed:", e);
    // Never leave user with a blank page:
    forceShowMenu();
  }
});

function forceShowMenu() {
  const welcome = document.getElementById("welcome");
  const menu = document.getElementById("menu");
  if (welcome) welcome.style.display = "none";
  if (menu) menu.style.display = "";
}

function runHome() {
  // 1) Theme toggle (with guards)
  const THEME_KEY = "quiz-theme";
  const t = document.getElementById("theme-toggle");
  const tLabel = document.getElementById("theme-label");
  if (t && tLabel) {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      const start = saved || (prefersDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", start === "dark");
      tLabel.textContent = start === "dark" ? "Light" : "Dark";
      t.addEventListener("click", () => {
        const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
        document.documentElement.classList.toggle("dark", next === "dark");
        localStorage.setItem(THEME_KEY, next);
        tLabel.textContent = next === "dark" ? "Light" : "Dark";
      });
    } catch (e) {
      console.warn("Theme toggle failed:", e);
    }
  }

  // 2) Welcome logic (safe)
  const welcome = document.getElementById("welcome");
  const menu = document.getElementById("menu");
  const startBtn = document.getElementById("start-now");
  const skipBtn = document.getElementById("skip");

  // Show welcome only on first visit
  const SEEN_KEY = "pharmlet.welcome.seen";
  const showWelcome = !localStorage.getItem(SEEN_KEY);

  if (welcome && menu) {
    if (showWelcome) {
      welcome.style.display = "";
      menu.style.display = "none";
    } else {
      welcome.style.display = "none";
      menu.style.display = "";
    }
  }

  startBtn?.addEventListener("click", () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    if (welcome) welcome.style.display = "none";
    if (menu) menu.style.display = "";
  });
  skipBtn?.addEventListener("click", () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
    if (welcome) welcome.style.display = "none";
    if (menu) menu.style.display = "";
  });

  // 3) “Resume last quiz” button (guarded)
  const resumeWrap = document.getElementById("resume-wrap");
  const resumeLink = document.getElementById("resume-link");
  if (resumeWrap && resumeLink) {
    try {
      // look for last storage key pharmlet.<id>.<mode>
      let lastKey = null;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("pharmlet.") && k.split(".").length === 3) {
          lastKey = k; // naive: last encountered
        }
      }
      if (lastKey) {
        const [, quizId, mode] = lastKey.split(".");
        resumeLink.href = `quiz.html?id=${encodeURIComponent(quizId)}&mode=${encodeURIComponent(mode)}&limit=20`;
        resumeWrap.style.display = "";
      }
    } catch (e) {
      console.warn("Resume detection failed:", e);
    }
  }

  // 4) Class filter (guarded)
  const filter = document.getElementById("class-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      const q = filter.value.toLowerCase().trim();
      const cards = document.querySelectorAll("#classes .card");
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? "" : "none";
      });
    });
  }

  // 5) Auto-hide NEW banners after 7 days
  try {
    const newBanners = document.querySelectorAll('.pill-new[data-added]');
    const now = new Date();
    newBanners.forEach(banner => {
      const addedDate = new Date(banner.getAttribute('data-added'));
      const daysDiff = (now - addedDate) / (1000 * 60 * 60 * 24);
      if (daysDiff > 7) {
        banner.style.display = 'none';
      }
    });
  } catch (e) {
    console.warn('NEW banner expiration failed:', e);
  }

  // 6) Bookmark favorite quizzes
  const FAVORITES_KEY = "pharmlet.favorites";
  try {
    const favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
    
    // Add star buttons to quiz cards
    document.querySelectorAll(".quiz-link, a[href^='quiz.html']").forEach(link => {
      const url = new URL(link.href, window.location.origin);
      const quizId = url.searchParams.get("id");
      if (!quizId) return;
      
      const isFavorite = favorites.has(quizId);
      const star = document.createElement("span");
      star.className = "favorite-star";
      star.textContent = isFavorite ? "★" : "☆";
      star.style.cssText = "cursor:pointer;margin-left:0.5rem;color:var(--accent);font-size:1.2em;";
      star.title = isFavorite ? "Remove from favorites" : "Add to favorites";
      star.setAttribute("role", "button");
      star.setAttribute("aria-label", isFavorite ? "Remove from favorites" : "Add to favorites");
      
      star.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (favorites.has(quizId)) {
          favorites.delete(quizId);
          star.textContent = "☆";
          star.title = "Add to favorites";
        } else {
          favorites.add(quizId);
          star.textContent = "★";
          star.title = "Remove from favorites";
        }
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
      });
      
      link.appendChild(star);
    });
  } catch (e) {
    console.warn('Favorites feature failed:', e);
  }

  // Done: ensure menu is visible at end even if something above silently failed
  const isWelcomeOn = welcome && welcome.style.display !== "none";
  if (!isWelcomeOn && menu) menu.style.display = "";
}