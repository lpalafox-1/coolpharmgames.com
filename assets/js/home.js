// assets/js/home.js
// Home page behavior: theme toggle, welcome flow, filter, resume last quiz,
// recently added strip, random quiz, last visited hint, build timestamp.

(function () {
  const THEME_KEY = "quiz-theme";
  const WELCOME_KEY = "pharmlet.welcome.dismissed";

  /* ---------- Theme ---------- */
  const t = document.getElementById("theme-toggle");
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const startMode = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', startMode === 'dark');
  if (t) t.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";
  t?.addEventListener("click", () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(THEME_KEY, next);
    if (t) t.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
  });

  /* ---------- Welcome vs Menu ---------- */
  const welcome = document.getElementById("welcome");
  const menu    = document.getElementById("menu");
  const dismissed = localStorage.getItem(WELCOME_KEY) === "1";
  if (welcome && menu) {
    if (dismissed) { welcome.style.display = "none"; menu.style.display = ""; }
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

  /* ---------- Resume last quiz button ---------- */
  const resumeWrap = document.getElementById('resume-wrap');
  const resumeLink = document.getElementById('resume-link');
  if (resumeWrap && resumeLink) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('pharmlet.'));
    if (keys.length) {
      // pick most recently modified key by checking storage order fallback
      // (not guaranteed, but sufficient for single-user)
      try {
        const raw = JSON.parse(localStorage.getItem(keys[0]) || 'null');
        if (raw && raw.title) {
          // reconstruct URL if present in saved state
          const id = (keys[0].split('.')[1] || '').trim();
          const mode = (keys[0].split('.')[2] || '').trim();
          const url = new URL(location.origin + location.pathname.replace(/index\.html$/,'') + 'quiz.html');
          if (id) url.searchParams.set('id', id);
          if (mode) url.searchParams.set('mode', mode);
          resumeLink.href = url.toString();
          resumeLink.textContent = `Resume: ${raw.title} (${(raw.index||0)+1}/${(raw.questions||[]).length})`;
          resumeWrap.style.display = '';
        }
      } catch {}
    }
  }

  /* ---------- Last visited hint (gentle) ---------- */
  const lastEl = document.getElementById('last-visited');
  if (lastEl) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('pharmlet.'));
    if (keys.length) {
      try {
        const raw = JSON.parse(localStorage.getItem(keys[0]) || 'null');
        if (raw && raw.title) {
          lastEl.textContent = `Last opened: ${raw.title} — ${(raw.index||0)+1}/${(raw.questions||[]).length}`;
          lastEl.style.display = '';
        }
      } catch {}
    }
  }

  /* ---------- Filter ---------- */
  const filter = document.getElementById('class-filter');
  if (filter) {
    const cards = [...document.querySelectorAll('#classes .card')];
    const lists = cards.map(card => ({
      card,
      items: [...card.querySelectorAll('a.quiz-link')]
    }));
    const apply = () => {
      const q = filter.value.trim().toLowerCase();
      if (!q) {
        cards.forEach(c => c.style.display = '');
        lists.forEach(({items}) => items.forEach(a => a.closest('li')?.classList.remove('hidden')));
        return;
      }
      const terms = q.split(/\s+/).filter(Boolean);
      lists.forEach(({card, items}) => {
        let anyVisibleInCard = false;
        items.forEach(a => {
          const txt = a.textContent.toLowerCase();
          const visible = terms.every(t => txt.includes(t));
          a.closest('li').classList.toggle('hidden', !visible);
          if (visible) anyVisibleInCard = true;
        });
        card.style.display = anyVisibleInCard ? '' : 'none';
      });
    };
    filter.addEventListener('input', apply);
  }

  /* ---------- Recently added strip (data-new="1") ---------- */
  (function showRecent(){
    const cont = document.getElementById('recent');
    const row  = document.getElementById('recent-row');
    if (!cont || !row) return;
    const fresh = [...document.querySelectorAll('#classes a.quiz-link[data-new="1"], #classes .btn.btn-blue[data-new="1"]')];
    if (!fresh.length) return;
    cont.style.display = '';
    fresh.slice(0, 12).forEach(a => {
      const tag = document.createElement('a');
      tag.href = a.href;
      tag.className = 'btn btn-ghost';
      tag.textContent = a.textContent.trim();
      row.appendChild(tag);
    });
  })();

  /* ---------- Random quiz from visible links ---------- */
  (function bindRandom(){
    const btn = document.getElementById('random-quiz');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const visibleLinks = [...document.querySelectorAll('#classes a.quiz-link')]
        .filter(a => a.offsetParent !== null);
      if (!visibleLinks.length) return alert('No quizzes are visible to pick from.');
      const pick = visibleLinks[Math.floor(Math.random()*visibleLinks.length)];
      location.href = pick.href;
    });
  })();

  /* ---------- Build timestamp ---------- */
  (function buildStamp(){
    const el = document.getElementById('build-ts');
    if (!el) return;
    el.textContent = 'Last updated: Sep 9, 2025';
  })();
})();