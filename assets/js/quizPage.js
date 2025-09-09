// assets/js/quizPage.js
(function () {
  const group = document.getElementById('qcount-group');
  if (group) {
    const u0 = new URL(location.href);
    const current = u0.searchParams.get('limit') || '';

    function hrefFor(limit) {
      const u = new URL(location.href);
      if (limit) u.searchParams.set('limit', String(limit));
      else u.searchParams.delete('limit');
      return u.toString();
    }

    group.innerHTML = [
      {label:'5',  val:'5'},
      {label:'10', val:'10'},
      {label:'20', val:'20'},
      {label:'All',val:''}
    ].map(opt => {
      const active = (opt.val === current) ? 'active' : '';
      return `<a class="seg-link ${active}" href="${hrefFor(opt.val)}" data-limit="${opt.val}">${opt.label}</a>`;
    }).join('');
  }

  document.getElementById('share')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); alert('Link copied!'); }
    catch { alert('Copy failed. You can manually copy the URL.'); }
  });
})();
