// assets/js/home.js
document.addEventListener("DOMContentLoaded", () => {
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // --- safeShow helpers ---
  function show(el){ if (el) el.style.display = ""; }
  function hide(el){ if (el) el.style.display = "none"; }

  // If anything fails, we still want *something* visible
  function showFallback() {
    try {
      const welcome = $("#welcome");
      const menu = $("#menu");
      if (welcome) hide(welcome);
      if (menu) show(menu);
    } catch {}
  }

  /* ========== THEME ========== */
  try {
    const THEME_KEY = "quiz-theme";
    const btn = $("#theme-toggle");
    const prefersDark = (() => {
      try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
      catch { return false; }
    })();
    const start = localStorage.getItem(THEME_KEY) || (prefersDark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", start === "dark");
    if (btn) btn.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
    btn?.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      if (btn) btn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  } catch (e) { console.error("Theme init:", e); }

  /* ========== WELCOME vs MENU ========== */
  try {
    const welcome = $("#welcome");
    const menu = $("#menu");
    if (!welcome || !menu) { showFallback(); return; }

    const WELCOME_KEY = "pharmlet.welcome.seen";
    const seen = (() => { try { return localStorage.getItem(WELCOME_KEY); } catch { return null; } })();

    if (seen) { hide(welcome); show(menu); }
    else      { show(welcome); hide(menu); }

    $("#start-now")?.addEventListener("click", () => {
      try { localStorage.setItem(WELCOME_KEY, "1"); } catch {}
      hide(welcome); show(menu);
    });
    $("#skip")?.addEventListener("click", () => {
      try { localStorage.setItem(WELCOME_KEY, "1"); } catch {}
      hide(welcome); show(menu);
    });
  } catch (e) { console.error("Welcome/Menu:", e); showFallback(); }

  /* ========== RESUME LAST QUIZ ========== */
  try {
    const wrap = $("#resume-wrap"), link = $("#resume-link");
    if (wrap && link) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("pharmlet."));
      if (keys.length) {
        const lastKey = keys[keys.length - 1]; // crude but fine
        const parts = lastKey.split(".");
        if (parts.length >= 3) {
          const id = parts[1], mode = parts[2];
          if (id && mode) {
            link.href = `quiz.html?id=${encodeURIComponent(id)}&mode=${encodeURIComponent(mode)}`;
            show(wrap);
          }
        }
      }
    }
  } catch (e) { console.error("Resume:", e); }

  /* ========== CLASS FILTER ========== */
  try {
    const filter = $("#class-filter");
    filter?.addEventListener("input", () => {
      const q = (filter.value || "").toLowerCase().trim();
      $$("#classes .card").forEach(card => {
        const txt = (card.textContent || "").toLowerCase();
        card.style.display = !q || txt.includes(q) ? "" : "none";
      });
    });
  } catch (e) { console.error("Filter:", e); }

  /* ========== BADGES (New/Featured) ========== */
  try {
    const todayStr = new Date().toISOString().slice(0,10); // yyyy-mm-dd
    const today = Date.parse(`${todayStr}T00:00:00Z`);

    function isNew(a){
      // explicit "new"
      if (a.hasAttribute("data-new")) return true;
      // until date
      const until = a.getAttribute("data-new-until");
      if (until && !Number.isNaN(Date.parse(`${until}T23:59:59Z`))) {
        return today <= Date.parse(`${until}T23:59:59Z`);
      }
      // days freshness
      const days = parseInt(a.getAttribute("data-new-days") || "", 10);
      const added = a.getAttribute("data-added");
      if (Number.isFinite(days) && added) {
        const start = Date.parse(`${added}T00:00:00Z`);
        if (!Number.isNaN(start)) {
          const diff = Math.floor((today - start) / 86400000);
          return diff <= days;
        }
      }
      return false;
    }
    function isFeatured(a){
      if (a.hasAttribute("data-featured")) return true;
      const until = a.getAttribute("data-featured-until");
      return !!(until && today <= Date.parse(`${until}T23:59:59Z`));
    }

    const recent = [];
    document.querySelectorAll("#menu a[href*='quiz.html']").forEach(a => {
      // Clear existing pills near this link
      a.parentElement?.querySelectorAll(".pill").forEach(p => p.remove());

      if (isFeatured(a)) {
        const pill = document.createElement("span");
        pill.className = "pill pill-featured";
        pill.textContent = "Featured";
        a.insertAdjacentElement("afterend", pill);
      }
      if (isNew(a)) {
        const pill = document.createElement("span");
        pill.className = "pill pill-new";
        pill.textContent = "New";
        a.insertAdjacentElement("afterend", pill);
        recent.push(a);
      }
    });

    // Recently added strip (non-breaking if none)
    const hero = document.querySelector(".hero .max-w-5xl");
    if (hero) {
      let strip = hero.querySelector("#recent-strip");
      if (!strip) { strip = document.createElement("div"); strip.id = "recent-strip"; hero.appendChild(strip); }
      strip.innerHTML = recent.length
        ? `<div class="text-sm" style="color:var(--muted)">
             Recently added: ${recent.slice(0,4).map(a => {
               const href = a.getAttribute("href") || "#";
               const text = (a.textContent || "").trim();
               return `<a class="quiz-link" href="${href}">${text}</a>`;
             }).join(" • ")}
           </div>`
        : "";
    }
  } catch (e) { console.error("Badges:", e); }
});