// assets/js/home.js

// ---- THEME ----
const THEME_KEY = "quiz-theme";
const saved = localStorage.getItem(THEME_KEY);
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(saved || (prefersDark ? "dark" : "light"));

// button may not exist until DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const t = document.getElementById("theme-toggle");
  if (t) {
    t.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
    t.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
      t.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  }

  // ---- WELCOME/MENU TOGGLE ----
  const KEY = "pharmlet.welcomeDone";
  const welcome = document.getElementById("welcome");
  const menu = document.getElementById("menu");

  function show(el, on = true) { if (el) el.style.display = on ? "" : "none"; }

  const done = localStorage.getItem(KEY) === "1";
  show(welcome, !done);
  show(menu, done);

  const start = document.getElementById("start-now");
  const skip = document.getElementById("skip");

  function finishWelcome() {
    localStorage.setItem(KEY, "1");
    show(welcome, false);
    show(menu, true);
  }

  start?.addEventListener("click", finishWelcome);
  skip?.addEventListener("click", finishWelcome);

  // Fallback: never leave the page blank
  setTimeout(() => {
    if (menu && getComputedStyle(menu).display === "none" && localStorage.getItem(KEY) === "1") {
      show(welcome, false); show(menu, true);
    }
  }, 0);
});

function applyTheme(mode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}
