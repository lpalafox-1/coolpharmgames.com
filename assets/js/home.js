// Theme
const THEME_KEY = "quiz-theme";
const saved = localStorage.getItem(THEME_KEY);
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(saved || (prefersDark ? 'dark' : 'light'));
document.getElementById("theme-toggle")?.addEventListener("click",()=>{
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(next); localStorage.setItem(THEME_KEY,next);
});
function applyTheme(mode){
  document.documentElement.classList.toggle("dark", mode==="dark");
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = mode==="dark" ? "☀️ Light" : "🌙 Dark";
}

// Welcome/menu toggling
const KEY = 'pharmlet.welcomeDone';
const welcome = document.getElementById('welcome');
const menu = document.getElementById('menu');
function show(el, on=true){ if (el) el.style.display = on ? '' : 'none'; }
const done = localStorage.getItem(KEY) === '1';
show(welcome, !done); show(menu, done);
document.getElementById('start-now')?.addEventListener('click', () => { localStorage.setItem(KEY, '1'); show(welcome,false); show(menu,true); });
document.getElementById('skip')?.addEventListener('click',   () => { localStorage.setItem(KEY, '1'); show(welcome,false); show(menu,true); });
