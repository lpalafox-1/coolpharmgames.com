(function () {
  const sel = document.getElementById('qcount');
  if (sel) {
    const url = new URL(location.href);
    const current = url.searchParams.get('limit') || '';
    sel.value = current;
    sel.addEventListener('change', () => {
      const next = sel.value;
      const u = new URL(location.href);
      if (next) u.searchParams.set('limit', next);
      else u.searchParams.delete('limit');
      location.href = u.toString();
    });
  }
  document.getElementById('share')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); alert('Link copied!'); }
    catch { alert('Copy failed. You can manually copy the URL.'); }
  });
})();
