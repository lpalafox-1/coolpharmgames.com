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

  /* ---------- Font size controls ---------- */
  let fontSize = parseInt(localStorage.getItem('pharmlet.fontSize')) || 16;
  document.documentElement.style.fontSize = fontSize + 'px';

  document.getElementById('font-increase')?.addEventListener('click', () => {
    if (fontSize < 24) {
      fontSize += 2;
      document.documentElement.style.fontSize = fontSize + 'px';
      localStorage.setItem('pharmlet.fontSize', fontSize);
    }
  });

  document.getElementById('font-decrease')?.addEventListener('click', () => {
    if (fontSize > 12) {
      fontSize -= 2;
      document.documentElement.style.fontSize = fontSize + 'px';
      localStorage.setItem('pharmlet.fontSize', fontSize);
    }
  });

  /* ---------- High contrast mode toggle ---------- */
  const contrastToggle = document.getElementById('contrast-toggle');
  const contrastLabel = document.getElementById('contrast-label');
  
  // Load saved preference
  const isHighContrast = localStorage.getItem('pharmlet.highContrast') === 'true';
  if (isHighContrast) {
    document.body.classList.add('high-contrast');
    if (contrastLabel) contrastLabel.textContent = 'Normal';
  }

  contrastToggle?.addEventListener('click', () => {
    const isNowHighContrast = document.body.classList.toggle('high-contrast');
    localStorage.setItem('pharmlet.highContrast', isNowHighContrast);
    if (contrastLabel) {
      contrastLabel.textContent = isNowHighContrast ? 'Normal' : 'Contrast';
    }
  });
})();