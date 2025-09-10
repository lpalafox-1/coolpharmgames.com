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
  if (t) {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      const start = saved || (prefersDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", start === "dark");
  t.textContent = start === "dark" ? "Light" : "Dark";
      t.addEventListener("click", () => {
        const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
        document.documentElement.classList.toggle("dark", next === "dark");
        localStorage.setItem(THEME_KEY, next);
  t.textContent = next === "dark" ? "Light" : "Dark";
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

  // Done: ensure menu is visible at end even if something above silently failed
  const isWelcomeOn = welcome && welcome.style.display !== "none";
  if (!isWelcomeOn && menu) menu.style.display = "";
}