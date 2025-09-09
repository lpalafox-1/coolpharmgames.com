// assets/js/quizPage.js
(function () {
  // --- Segmented "Questions" control ---
  const group = document.getElementById('qcount-group');
  if (group) {
    const url = new URL(location.href);
    const current = url.searchParams.get('limit') || ''; // '' means All

    // Activate the current button
    for (const btn of group.querySelectorAll('button')) {
      const val = btn.getAttribute('data-limit') ?? '';
      if (val === current) btn.classList.add('active');
      btn.addEventListener('click', () => {
        const u = new URL(location.href);
        const next = btn.getAttribute('data-limit') ?? '';
        if (next) u.searchParams.set('limit', next);
        else u.searchParams.delete('limit'); // All -> remove the param
        // keep id, mode, seed as-is
        location.href = u.toString();
      });
    }
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
