// assets/js/home.js
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ---------- Theme ---------- */
  try {
    const THEME_KEY = "quiz-theme";
    const btn = $("#theme-toggle");
    const start = localStorage.getItem(THEME_KEY) ||
      (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light");
    document.documentElement.classList.toggle("dark", start === "dark");
    if (btn) btn.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
    btn?.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      if (btn) btn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  } catch (e) { console.error("Theme init failed:", e); }

  /* ---------- Welcome vs Menu ---------- */
  try {
    const WELCOME_KEY = "pharmlet.welcome.seen";
    const welcome = $("#welcome");
    const menu = $("#menu");
    const seen = localStorage.getItem(WELCOME_KEY);
    if (welcome && menu) {
      if (seen) { welcome.style.display = "none"; menu.style.display = ""; }
      else { welcome.style.display = ""; menu.style.display = "none"; }
    }
    $("#start-now")?.addEventListener("click", () => { localStorage.setItem(WELCOME_KEY, "1"); if (welcome) welcome.style.display="none"; if (menu) menu.style.display=""; });
    $("#skip")?.addEventListener("click", () => { localStorage.setItem(WELCOME_KEY, "1"); if (welcome) welcome.style.display="none"; if (menu) menu.style.display=""; });
  } catch (e) { console.error("Welcome/menu failed:", e); }

  /* ---------- Resume last quiz (best-effort) ---------- */
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("pharmlet."));
    if (keys.length) {
      const lastKey = keys[keys.length - 1];
      const parts = lastKey.split(".");
      if (parts.length >= 3) {
        const id = parts[1];
        const mode = parts[2];
        const wrap = $("#resume-wrap");
        const link = $("#resume-link");
        if (wrap && link && id && mode) {
          link.href = `quiz.html?id=${encodeURIComponent(id)}&mode=${encodeURIComponent(mode)}`;
          wrap.style.display = "";
        }
      }
    }
  } catch (e) { console.error("Resume failed:", e); }

  /* ---------- Class filter ---------- */
  try {
    const filter = $("#class-filter");
    filter?.addEventListener("input", () => {
      const q = (filter.value || "").toLowerCase().trim();
      $$("#classes .card").forEach(card => {
        const txt = (card.textContent || "").toLowerCase();
        card.style.display = !q || txt.includes(q) ? "" : "none";
      });
    });
  } catch (e) { console.error("Filter failed:", e); }

  /* ---------- Badges: New / Featured with multiple ways to expire ---------- */
  try {
    const todayStr = new Date().toISOString().slice(0,10); // yyyy-mm-dd
    const today = new Date(todayStr + "T00:00:00Z").getTime();

    function shouldShowNew(a) {
      // 1) explicit on/off
      if (a.hasAttribute("data-new")) return true;

      // 2) until date: data-new-until="2025-10-20"
      const until = a.getAttribute("data-new-until");
      if (until) {
        const t = Date.parse(until + "T23:59:59Z");
        if (!Number.isNaN(t)) return today <= t;
      }

      // 3) days-based freshness: data-new-days="21" + data-added="2025-09-05"
      const days = parseInt(a.getAttribute("data-new-days") || "", 10);
      const added = a.getAttribute("data-added");
      if (Number.isFinite(days) && added) {
        const start = Date.parse(added + "T00:00:00Z");
        if (!Number.isNaN(start)) {
          const diffDays = Math.floor((today - start) / 86400000);
          return diffDays <= days;
        }
      }
      return false;
    }

    function shouldShowFeatured(a) {
      if (a.hasAttribute("data-featured")) return true;
      const until = a.getAttribute("data-featured-until");
      if (until) {
        const t = Date.parse(until + "T23:59:59Z");
        if (!Number.isNaN(t)) return today <= t;
      }
      return false;
    }

    // Add pill tags next to qualifying links
    const recent = [];
    $$("#menu a[href*='quiz.html']").forEach(a => {
      // cleanup old pills
      a.parentElement?.querySelectorAll(".pill").forEach(p => p.remove());

      if (shouldShowFeatured(a)) {
        const pill = document.createElement("span");
        pill.className = "pill pill-featured";
        pill.textContent = "Featured";
        a.insertAdjacentElement("afterend", pill);
      }
      if (shouldShowNew(a)) {
        const pill = document.createElement("span");
        pill.className = "pill pill-new";
        pill.textContent = "New";
        a.insertAdjacentElement("afterend", pill);
        recent.push(a);
      }
    });

    // Simple “Recently added” strip in hero if anything new
    const heroContainer = document.querySelector(".hero .max-w-5xl");
    if (heroContainer) {
      let strip = heroContainer.querySelector("#recent-strip");
      if (!strip) {
        strip = document.createElement("div");
        strip.id = "recent-strip";
        strip.style.marginTop = "0.5rem";
        heroContainer.appendChild(strip);
      }
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
  } catch (e) { console.error("Badges failed:", e); }
})();