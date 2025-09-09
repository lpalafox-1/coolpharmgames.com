// assets/js/home.js
(() => {
  const THEME_KEY = "quiz-theme";
  const WELCOME_KEY = "pharmlet.welcomeSeen";
  const RESUME_PREFIX = "pharmlet."; // used by quizEngine.js
  const FRESH_DAYS = 7;              // "New" window

  /* ---------- Theme toggle ---------- */
  (function initTheme(){
    const btn = document.getElementById('theme-toggle');
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const start = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', start === 'dark');
    if (btn) btn.textContent = start === "dark" ? "☀️ Light" : "🌙 Dark";

    btn?.addEventListener('click', () => {
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem(THEME_KEY, next);
      if (btn) btn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  })();

  /* ---------- Welcome gate ---------- */
  (function welcomeGate(){
    const seen = localStorage.getItem(WELCOME_KEY) === '1';
    const welcome = document.getElementById('welcome');
    const menu = document.getElementById('menu');
    if (!welcome || !menu) return;

    if (seen) {
      welcome.style.display = 'none';
      menu.style.display = '';
    } else {
      welcome.style.display = '';
      menu.style.display = 'none';
    }
    document.getElementById('start-now')?.addEventListener('click', () => {
      localStorage.setItem(WELCOME_KEY, '1');
      welcome.style.display = 'none';
      menu.style.display = '';
    });
    document.getElementById('skip')?.addEventListener('click', () => {
      localStorage.setItem(WELCOME_KEY, '1');
      welcome.style.display = 'none';
      menu.style.display = '';
    });
  })();

  /* ---------- Resume last quiz ---------- */
  (function resumeLast(){
    try{
      const keys = Object.keys(localStorage).filter(k => k.startsWith(RESUME_PREFIX));
      if (!keys.length) return;
      // pick the most recently modified key (not perfect but works)
      keys.sort((a, b) => {
        try {
          const A = JSON.parse(localStorage.getItem(a) || 'null');
          const B = JSON.parse(localStorage.getItem(b) || 'null');
          // Score as “freshness”: use internal score or index, fall back to length
          const aVal = A?.index ?? 0;
          const bVal = B?.index ?? 0;
          return bVal - aVal;
        } catch { return 0; }
      });
      const [first] = keys;
      // key shape: pharmlet.<quizId>.<mode>
      const parts = first.split('.');
      if (parts.length < 3) return;
      const quizId = parts[1];
      const mode = parts[2];
      const resumeWrap = document.getElementById('resume-wrap');
      const resumeLink = document.getElementById('resume-link');
      if (resumeWrap && resumeLink) {
        resumeWrap.style.display = '';
        const u = new URL(location.origin + location.pathname.replace(/index\.html?$/, 'quiz.html'));
        u.searchParams.set('id', quizId);
        u.searchParams.set('mode', mode);
        resumeLink.setAttribute('href', u.toString());
      }
    } catch {}
  })();

  /* ---------- Class filter ---------- */
  (function filterInit(){
    const input = document.getElementById('class-filter');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      // Hide/show entire cards based on content match
      document.querySelectorAll('#classes .card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });
  })();

  /* ---------- Badges: auto “New” pills ----------- */
  (function newPills(){
    const isFresh = (isoDate, days) => {
      if (!isoDate) return false;
      const added = new Date(isoDate + 'T00:00:00');
      const now = new Date();
      const ms = (now - added);
      return ms >= 0 && ms <= days * 24 * 60 * 60 * 1000;
    };

    // For each actions row or link group with data-added, add a “New” pill if fresh
    document.querySelectorAll('[data-added]').forEach(el => {
      const dateStr = el.getAttribute('data-added');
      if (!isFresh(dateStr, FRESH_DAYS)) return;

      // Find a logical place to append the pill (row with buttons/links)
      const row = el.classList.contains('actions-row') ? el : el.closest('.actions-row') || el.parentElement;
      if (!row) return;

      // Avoid duplicates
      if (row.querySelector('.pill-new')) return;

      const pill = document.createElement('span');
      pill.className = 'pill pill-new';
      pill.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 10a7 7 0 1114 0 7 7 0 01-14 0zm4.5-.5l2 2 3-3 1 1-4 4-3-3 1-1z"/></svg> New';
      row.appendChild(pill);
    });
  })();

  /* ---------- Optional: ensure rows have consistent layout ---------- */
  (function wireActionRows(){
    document.querySelectorAll('.mt-2.flex').forEach(row => {
      // Add actions-row to get consistent spacing with pills
      row.classList.add('actions-row');
    });
  })();

})();