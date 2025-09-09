// home.js — runs only on index.html
document.addEventListener("DOMContentLoaded", () => {
  /* ---------- Theme toggle ---------- */
  const THEME_KEY = "quiz-theme";
  const themeBtn = document.getElementById("theme-toggle");
  const startTheme =
    localStorage.getItem(THEME_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.classList.toggle("dark", startTheme === "dark");
  if (themeBtn) {
    themeBtn.textContent = startTheme === "dark" ? "☀️ Light" : "🌙 Dark";
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      themeBtn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  }

  /* ---------- Welcome screen show/hide ---------- */
  const WELCOME_KEY = "pharmlet.welcome.seen";
  const welcome = document.getElementById("welcome");
  const menu = document.getElementById("menu");
  const seen = localStorage.getItem(WELCOME_KEY) === "1";
  if (welcome && menu) {
    if (seen) { welcome.style.display = "none"; menu.style.display = ""; }
    else { welcome.style.display = ""; menu.style.display = "none"; }
    document.getElementById("start-now")?.addEventListener("click", dismissWelcome);
    document.getElementById("skip")?.addEventListener("click", dismissWelcome);
  }
  function dismissWelcome(){
    localStorage.setItem(WELCOME_KEY, "1");
    if (welcome) welcome.style.display = "none";
    if (menu) menu.style.display = "";
  }

  /* ---------- Resume last quiz (if stored by quizEngine) ---------- */
  try {
    const keys = Object.keys(localStorage);
    const last = keys.find(k => k.startsWith("pharmlet.") && k.endsWith(".easy") || k.endsWith(".hard"));
    if (last) {
      const parts = last.split(".");
      const qid = parts[1];
      const mode = parts[2];
      const link = document.getElementById("resume-link");
      const wrap = document.getElementById("resume-wrap");
      if (link && wrap) {
        link.href = `quiz.html?id=${qid}&mode=${mode}`;
        wrap.style.display = "";
      }
    }
  } catch {}

  /* ---------- Quick filter (client-side) ---------- */
  const filter = document.getElementById("class-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      const q = filter.value.toLowerCase().trim();
      for (const card of document.querySelectorAll("#classes .card")) {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? "" : "none";
      }
    });
  }

  /* ---------- Badges: NEW / FEATURED / TBD ---------- */
  // Edit these lists as you add/remove content
  const FEATURED_IDS = [
    "cumulative-quiz1-4",
    "lab-quiz5-antiarrhythmics",
    "popp-practice-exam1"
  ];
  const NEW_IDS = [
    // mark as 'new' for freshness; see freshnessDays below
    "lab-quiz4-anticoagulants",
    "lab-quiz5-antiarrhythmics",
    "cumulative-quiz1-4",
    "calc-units-quick-easy",
    "calc-units-quick-hard",
    "calc-exam1-prep-ch1-4-easy",
    "calc-exam1-prep-ch1-4-hard"
  ];
  const TBD_IDS = [
    "calc-practice-exam1",        // if you're still drafting
    "calc-cumulative-quiz1-2",    // if still WIP
    // add more as needed
  ];

  // Optional: auto-expire NEW after N days (per quiz, persisted)
  const freshnessDays = 7;
  const NEW_KEY = "pharmlet.new.addedAt"; // stores { quizId: ISODate }
  let addedAt = {};
  try { addedAt = JSON.parse(localStorage.getItem(NEW_KEY) || "{}"); } catch {}

  const now = Date.now();
  for (const id of NEW_IDS) {
    const was = addedAt[id] ? Date.parse(addedAt[id]) : null;
    if (!was || (now - was) > freshnessDays*24*60*60*1000) {
      // set/refresh the timestamp so 'New' shows for the next N days
      addedAt[id] = new Date().toISOString();
    }
  }
  localStorage.setItem(NEW_KEY, JSON.stringify(addedAt));

  // Helper: find the best place to attach a single badge per quiz
  const seen = new Set();
  const links = Array.from(document.querySelectorAll("a[href*='quiz.html']"));

  links.forEach(link => {
    const id = getQuizIdFromLink(link);
    if (!id || seen.has(id)) return;

    // Prefer a dedicated slot inside the same card if present
    const card = link.closest(".quiz-card, .card");
    const slot = card?.querySelector(".badge-slot");

    // Build badges for this id
    const elements = [];

    if (FEATURED_IDS.includes(id)) {
      elements.push(makeBadge("Featured", "badge-featured"));
    }

    // only show NEW if within freshness window
    if (NEW_IDS.includes(id)) {
      const ts = addedAt[id] ? Date.parse(addedAt[id]) : 0;
      if (now - ts <= freshnessDays*24*60*60*1000) {
        elements.push(makeBadge("New", "badge-new"));
      }
    }

    if (TBD_IDS.includes(id)) {
      elements.push(makeBadge("TBD", "badge-tbd"));
    }

    if (elements.length) {
      const target = slot || link; // attach once per quiz
      elements.forEach(b => target.appendChild(b));
      seen.add(id);
    }
  });

  function getQuizIdFromLink(el){
    // If data-quiz-id exists, use it
    const d = el.getAttribute("data-quiz-id");
    if (d) return d;
    try {
      const u = new URL(el.href);
      return u.searchParams.get("id") || null;
    } catch { return null; }
  }

  function makeBadge(text, cls){
    const span = document.createElement("span");
    span.className = `badge ${cls}`;
    const dot = document.createElement("span");
    dot.className = "badge-dot";
    span.appendChild(dot);
    span.appendChild(document.createTextNode(text));
    return span;
    // (You can add title tooltips later if you want)
  }
});