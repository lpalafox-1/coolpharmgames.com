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

function safeReadStorageJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Ignoring malformed storage value for ${key}:`, error);
    return null;
  }
}

function getWeekMasteryStats(weekNumber) {
  const candidateKeys = [
    `pharmlet.lab2.week${weekNumber}.easy`,
    `pharmlet.week${weekNumber}.easy`
  ];

  for (const key of candidateKeys) {
    const parsed = safeReadStorageJson(key);
    const score = Number(parsed?.score);
    const total = Number(parsed?.total);
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) continue;
    return { score, total };
  }

  return null;
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
    const stats = getWeekMasteryStats(w);
    if (stats) {
      const percent = Math.max(0, Math.min(100, Math.round((stats.score / stats.total) * 100)));
      
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
  const resumeWrap = document.getElementById("resume-wrap");
  const lastQuiz = localStorage.getItem("pharmlet.last-quiz");
  if (resumeLink && resumeWrap) {
    if (lastQuiz) {
      resumeLink.href = buildResumeQuizHref(lastQuiz);
      resumeWrap.style.display = "";
    } else {
      resumeWrap.style.display = "none";
    }
  }

  // 5) Auto-hide NEW banners after 7 days
  document.querySelectorAll('.pill-new[data-added]').forEach(banner => {
    const addedDate = new Date(banner.getAttribute('data-added'));
    if ((new Date() - addedDate) / 86400000 > 7) banner.style.display = 'none';
  });

  if (menu && menu.style.display === "none" && !showWelcome) menu.style.display = "";
}

function buildResumeQuizHref(lastQuiz) {
  try {
    const target = new URL(`quiz.html${lastQuiz}`, window.location.origin);
    target.searchParams.set("resume", "1");
    return `${target.pathname}${target.search}`;
  } catch (error) {
    console.warn("Unable to build resume URL:", error);
    return `quiz.html${lastQuiz}`;
  }
}
