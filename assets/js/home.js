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
  const THEME_KEY = "quiz-theme";
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

  // 3) New: Track Progress for Lab II COP (Weeks 1-11)
  // This looks for saved results and updates the UI
  for (let w = 1; w <= 11; w++) {
    const scoreKey = `pharmlet.week${w}.easy`; // Key based on quizEngine.js
    const savedData = localStorage.getItem(scoreKey);
    
    if (savedData) {
      try {
        const stats = JSON.parse(savedData);
        const percent = Math.round((stats.score / stats.total) * 100);
        
        // Update the Progress Mini bars in the Featured Section
        const bar = document.getElementById(`prog-week-${w}`);
        if (bar) {
          bar.style.width = `${percent}%`;
          if (percent === 100) bar.style.background = "#10b981"; // Green for perfect score
        }

        // Add a visual "Completed" ring to the Grid Buttons
        const gridBtn = document.querySelector(`a[href="quiz.html?week=${w}"]`);
        if (gridBtn) {
          gridBtn.classList.add("border-green-500", "bg-green-50/10");
          gridBtn.innerHTML += ` <span class="text-[10px] text-green-500 ml-1">✓</span>`;
        }
      } catch (e) {
        console.warn(`Failed to parse stats for week ${w}`, e);
      }
    }
  }

  // 4) Resume last quiz logic (Updated to detect Lab II weeks)
  const resumeWrap = document.getElementById("resume-wrap");
  const resumeLink = document.getElementById("resume-link");
  if (resumeWrap && resumeLink) {
    let lastKey = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("pharmlet.")) lastKey = k;
    }
    if (lastKey) {
      const parts = lastKey.split(".");
      if (parts[1].startsWith("week")) {
        resumeLink.href = `quiz.html?week=${parts[1].replace("week", "")}`;
      } else {
        resumeLink.href = `quiz.html?id=${parts[1]}&mode=${parts[2] || 'easy'}&limit=20`;
      }
      resumeWrap.style.display = "";
    }
  }

  // 5) Filter & Sort (Existing logic preserved)
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

  // Final check to show menu
  if (menu && menu.style.display === "none" && !showWelcome) menu.style.display = "";
}
