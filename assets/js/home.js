// assets/js/home.js

// ---- THEME ----
const THEME_KEY = "quiz-theme";
const savedTheme = localStorage.getItem(THEME_KEY);
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(savedTheme || (prefersDark ? "dark" : "light"));

document.addEventListener("DOMContentLoaded", () => {
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
      themeBtn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
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

  // Fallback: never leave the page blank if KEY is set
  setTimeout(() => {
    if (menu && getComputedStyle(menu).display === "none" && localStorage.getItem(KEY) === "1") {
      show(welcome, false); show(menu, true);
    }
  }, 0);

  // ---- QUICK FILTER (classes list) ----
  const filter = document.getElementById('class-filter');
  if (filter) {
    const items = Array.from(document.querySelectorAll('#classes li'));
    filter.addEventListener('input', () => {
      const term = filter.value.trim().toLowerCase();
      items.forEach(li => {
        const text = li.textContent.toLowerCase();
        li.style.display = (term === '' || text.includes(term)) ? '' : 'none';
      });
    });
  }

  // ---- RESUME LAST QUIZ (if any) ----
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('pharmlet.'));
    if (keys.length) {
      const last = keys[keys.length - 1]; // naive "most recent"
      const parts = last.split('.');
      const quizId = parts[1], mode = parts[2] || 'easy';
      const state = JSON.parse(localStorage.getItem(last) || 'null');
      if (quizId && (state?.questions?.length)) {
        const resumeUrl = `quiz.html?id=${encodeURIComponent(quizId)}&mode=${encodeURIComponent(mode)}&limit=${state.questions.length}`;
        const wrap = document.getElementById('resume-wrap');
        const link = document.getElementById('resume-link');
        if (wrap && link) { link.href = resumeUrl; wrap.style.display = ''; }
      }
    }
  } catch {}
});

function applyTheme(mode){
  document.documentElement.classList.toggle("dark", mode === "dark");
}
