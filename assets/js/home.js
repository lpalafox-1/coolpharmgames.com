// assets/js/home.js
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ---------- Theme ---------- */
  const THEME_KEY = "quiz-theme";
  const themeBtn = $("#theme-toggle");
  const startMode = localStorage.getItem(THEME_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.classList.toggle("dark", startMode === "dark");
  if (themeBtn) themeBtn.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
  themeBtn?.addEventListener("click", () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(THEME_KEY, next);
    themeBtn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
  });

  /* ---------- Welcome vs Menu ---------- */
  const WELCOME_KEY = "pharmlet.welcome.seen";
  const welcome = $("#welcome");
  const menu = $("#menu");
  if (!localStorage.getItem(WELCOME_KEY)) {
    if (welcome) welcome.style.display = "";
    if (menu) menu.style.display = "none";
  } else {
   