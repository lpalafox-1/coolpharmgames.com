// assets/js/quizPage.js
(function () {
  // --- Build hard links for the segmented control (5 / 10 / 20 / All) ---
  const group = document.getElementById('qcount-group');
  if (group) {
    const current = new URL(location.href).searchParams.get('limit') || '';

    const hrefFor = (limit) => {
      const u = new URL(location.href);
      if (limit) u.searchParams.set('limit', String(limit));
      else u.searchParams.delete('limit'); // All
      return u.toString();
    };

    group.innerHTML = [
      { label: '5',  val: '5'  },
      { label: '10', val: '10' },
      { label: '20', val: '20' },
      { label: 'All',val: ''   }
    ].map(opt => {
      const active = (opt.val === current) ? 'active' : '';
      return `<a class="seg-link ${active}" href="${hrefFor(opt.val)}" data-limit="${opt.val}">${opt.label}</a>`;
    }).join('');
  }

  // --- Share link ---
  document.getElementById('share')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); alert('Link copied!'); }
    catch { alert('Copy failed. You can manually copy the URL.'); }
  });

  // --- Theme button (persist + label) ---
  const THEME_KEY = "quiz-theme";
  const t = document.getElementById("theme-toggle");
  if (t) {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const startMode = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', startMode === 'dark');
    t.textContent = document.documentElement.classList.contains("dark") ? "☀️ Light" : "🌙 Dark";

    t.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      t.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  }
})();
