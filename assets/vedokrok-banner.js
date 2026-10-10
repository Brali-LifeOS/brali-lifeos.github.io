(() => {
  const banner = document.currentScript?.closest('[data-vedokrok-banner]');
  if (!banner) return;
  const key = 'brali-vedokrok-announcement-hidden-v1';
  try {
    banner.hidden = localStorage.getItem(key) === '1';
  } catch (_) {
    // Closing still works when browser storage is unavailable.
  }
  banner.querySelector('[data-vedokrok-dismiss]')?.addEventListener('click', (event) => {
    banner.hidden = true;
    try { localStorage.setItem(key, '1'); } catch (_) {}
    if (event.detail === 0) document.querySelector('.site-header .brand')?.focus({ preventScroll: true });
  });
})();
