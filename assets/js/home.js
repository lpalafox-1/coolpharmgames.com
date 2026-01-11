// assets/js/home.js
document.addEventListener("DOMContentLoaded", () => {
  try {
    runHome();
  } catch (e) {
    console.error("home.js crashed:", e);
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
  // 1) Theme toggle
  const THEME_KEY = "pharmlet.theme";
  const t = document.getElementById("theme-toggle");
  const tLabel = document.getElementById("theme-label");
  if (t && tLabel) {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const start = saved || (prefersDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", start === "dark");
    tLabel.textContent = start === "dark" ? "Light" : "Dark";
    t.onclick = () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      tLabel.textContent = next === "dark" ? "Light" : "Dark";
    };
  }

  // 2) Welcome logic
  const welcome = document.getElementById("welcome");
  const menu = document.getElementById("menu");
  const SEEN_KEY = "pharmlet.welcome.seen";
  const showWelcome = !localStorage.getItem(SEEN_KEY);

  if (welcome && menu) {
    welcome.style.display = showWelcome ? "" : "none";
    menu.style.display = showWelcome ? "none" : "";
  }

  const handleStart = () => {
    localStorage.setItem(SEEN_KEY, "1");
    if (welcome) welcome.style.display = "none";
    if (menu) menu.style.display = "";
  };
  document.getElementById("start-now")?.addEventListener("click", handleStart);
  document.getElementById("skip")?.addEventListener("click", handleStart);

// 3) Progress Tracking: Lab II Mastery
  for (let w = 1; w <= 11; w++) {
    const scoreKey = `pharmlet.week${w}.easy`; 
    const savedData = localStorage.getItem(scoreKey);
    
    if (savedData) {
      const stats = JSON.parse(savedData);
      const percent = Math.round((stats.score / stats.total) * 100);
      
      const bar = document.getElementById(`prog-week-${w}`);
      if (bar) bar.style.width = `${percent}%`;

      // BADASS MASTERY LOGIC: Only show checkmark if score is 90% or higher
      if (percent >= 90) {
        const btns = document.querySelectorAll(`a[href="quiz.html?week=${w}"]`);
        btns.forEach(btn => {
          if (!btn.innerHTML.includes("✓")) {
            btn.classList.add("border-green-500/50");
            btn.innerHTML += ` <span class="text-green-500">✓</span>`;
          }
        });
      }
    }
  }

  // 4) SMART RESUME
  const resumeLink = document.getElementById("resume-link");
  if (resumeLink) {
    let lastKey = null;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("pharmlet.") && k.split(".").length === 3) { lastKey = k; break; }
    }
    if (lastKey) {
      const parts = lastKey.split(".");
      resumeLink.href = parts[1].startsWith("week") 
        ? `quiz.html?week=${parts[1].replace("week","")}` 
        : `quiz.html?id=${parts[1]}&mode=${parts[2]||'easy'}&limit=20`;
      document.getElementById("resume-wrap").style.display = "";
    }
  }

  // 5) Filter & Sort
  const filter = document.getElementById("class-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      const q = filter.value.toLowerCase().trim();
      document.querySelectorAll(".card").forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  // 6) Auto-hide NEW banners after 7 days
  document.querySelectorAll('.pill-new[data-added]').forEach(banner => {
    const addedDate = new Date(banner.getAttribute('data-added'));
    if ((new Date() - addedDate) / 86400000 > 7) banner.style.display = 'none';
  });

  if (menu && menu.style.display === "none" && !showWelcome) menu.style.display = "";
}
