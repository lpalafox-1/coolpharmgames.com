// assets/js/home.js
(function () {
  const THEME_KEY = "quiz-theme";

  // ----- Theme toggle -----
  const t = document.getElementById("theme-toggle");
  if (t) {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const start = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', start === 'dark');
    t.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
    t.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      t.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  }

  // ----- Welcome screen (first visit only) -----
  const WELCOME_KEY = "pharmlet.welcomeSeen";
  const welcome = document.getElementById("welcome");
  const menu = document.getElementById("menu");
  if (welcome && menu) {
    const seen = localStorage.getItem(WELCOME_KEY);
    if (seen) { welcome.style.display = "none"; menu.style.display = ""; }
    else { welcome.style.display = ""; menu.style.display = "none"; }

    document.getElementById("start-now")?.addEventListener("click", () => {
      localStorage.setItem(WELCOME_KEY, "1");
      welcome.style.display = "none"; menu.style.display = "";
    });
    document.getElementById("skip")?.addEventListener("click", () => {
      localStorage.setItem(WELCOME_KEY, "1");
      welcome.style.display = "none"; menu.style.display = "";
    });
  }

  // ----- Resume last quiz -----
  const resumeWrap = document.getElementById("resume-wrap");
  const resumeLink = document.getElementById("resume-link");
  if (resumeWrap && resumeLink) {
    // We stored quiz state in keys like pharmlet.<id>.<mode>
    const keys = Object.keys(localStorage).filter(k => k.startsWith("pharmlet."));
    let newest;
    for (const k of keys) {
      try {
        const v = JSON.parse(localStorage.getItem(k) || "null");
        if (!v || !v.questions) continue;
        const when = v._savedAt || 0;
        if (!newest || when > newest.when) newest = { k, when, v };
      } catch {}
    }
    if (newest) {
      const parts = newest.k.split(".");
      const id = parts[1], mode = parts[2];
      resumeLink.href = `quiz.html?id=${encodeURIComponent(id)}&mode=${encodeURIComponent(mode)}`;
      resumeWrap.style.display = "";
    }
  }

  // Enhance saving timestamps from quizEngine (back-compat safety)
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith("pharmlet.")) return;
    try {
      const obj = JSON.parse(e.newValue || "null");
      if (obj && typeof obj === "object") {
        obj._savedAt = Date.now();
        localStorage.setItem(e.key, JSON.stringify(obj));
      }
    } catch {}
  });

  // ----- Filter -----
  const filter = document.getElementById("class-filter");
  if (filter) {
    const items = Array.from(document.querySelectorAll("#classes a.quiz-link, #classes .quiz-card"));
    const matches = (el, term) => (el.textContent || "").toLowerCase().includes(term);
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      items.forEach(el => {
        const show = !q || matches(el, q) || matches(el.parentElement, q);
        const li = el.closest("li,.quiz-card,.card");
        if (li) li.style.display = show ? "" : "none";
      });
    });
  }

  // ----- Auto “New” badges for N days after added -----
  const today = new Date();
  const addedLinks = document.querySelectorAll("[data-new-days][data-added]");
  const recent = [];
  addedLinks.forEach(a => {
    const days = parseInt(a.getAttribute("data-new-days") || "0", 10);
    const when = new Date(a.getAttribute("data-added") || "");
    if (!Number.isFinite(days) || isNaN(when)) return;
    const diff = (today - when) / (1000 * 60 * 60 * 24);
    if (diff <= days + 0.001) {
      // if a sibling pill isn't already there, add one
      const hasPill = a.parentElement?.querySelector(".pill-new");
      if (!hasPill) {
        const span = document.createElement("span");
        span.className = "pill pill-new";
        span.textContent = "New";
        a.parentElement?.appendChild(span);
      }
      recent.push(a);
    }
  });

  // Show a small "Recently added" strip (max 5 links)
  const strip = document.getElementById("recent-strip");
  if (strip && recent.length) {
    const pick = recent.slice(0,5).map(a => {
      const clone = a.cloneNode(true); clone.classList.remove("btn","btn-blue"); clone.classList.add("quiz-link");
      clone.textContent = a.textContent || "Start";
      return clone;
    });
    strip.innerHTML = 'Recently added: ' + pick.map(el => el.outerHTML).join(' · ');
  }
})();