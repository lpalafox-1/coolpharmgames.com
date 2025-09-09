// assets/js/quizPage.js
(function () {
  /* ---------- Segmented "Questions" control ---------- */
  const group = document.getElementById('qcount-group');
  if (group) {
    const url = new URL(location.href);
    const current = url.searchParams.get('limit') || ''; // '' means All

    // mark active
    group.querySelectorAll('.seg-link').forEach(link => {
      const val = link.getAttribute('data-limit') ?? '';
      link.classList.toggle('active', val === current);

      link.addEventListener('click', (e) => {
        e.preventDefault();
        const u = new URL(location.href);
        const next = link.getAttribute('data-limit') ?? '';
        if (next) u.searchParams.set('limit', next);
        else u.searchParams.delete('limit');  // All
        // keep id/mode/seed as-is
        location.href = u.toString();
      });
    });
  }

  /* ---------- Share button ---------- */
  document.getElementById('share')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      alert('Link copied!');
    } catch {
      alert('Copy failed. You can manually copy the URL.');
    }
  });

  /* ---------- Theme toggle (persist + label) ---------- */
  const THEME_KEY = "quiz-theme";
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const start = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', start === 'dark');
    btn.textContent = start === 'dark' ? '☀️ Light' : '🌙 Dark';

    btn.addEventListener('click', () => {
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem(THEME_KEY, next);
      btn.textContent = next === 'dark' ? '☀️ Light' : '🌙 Dark';
    });
  }
})();