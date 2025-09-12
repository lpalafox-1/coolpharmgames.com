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

  /* ---------- Theme toggle is handled by quizEngine.js ---------- */
  // Theme toggle functionality moved to quizEngine.js to avoid conflicts
})();