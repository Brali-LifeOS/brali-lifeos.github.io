(() => {
  const root = document.querySelector('[data-library-search="true"]');
  if (!root) return;

  const input = root.querySelector('input[type="search"]');
  const results = root.querySelector('[data-search-results]');
  const status = root.querySelector('[data-search-status]');
  let entries = null;
  let loadPromise = null;

  const normalize = (value = "") => String(value).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

  async function loadEntries() {
    if (entries) return entries;
    if (!loadPromise) {
      loadPromise = Promise.all([
        fetch('/life-os-index.json').then((response) => {
          if (!response.ok) throw new Error('Could not load Growth Library index.');
          return response.json();
        }),
        fetch('/life-os/datasets/evidence.json').then((response) => {
          if (!response.ok) throw new Error('Could not load evidence index.');
          return response.json();
        }),
      ]).then(([index, evidence]) => {
        const indexable = new Set((evidence.entries || []).filter((record) => record.indexable).map((record) => record.slug));
        entries = index.filter((entry) => indexable.has(entry.slug)).map((entry) => ({
          ...entry,
          searchTitle: normalize(entry.displayTitle || entry.title),
          searchDescription: normalize(entry.description),
          searchZone: normalize(`${entry.zone?.title || ''} ${entry.zone?.slug || ''}`),
          searchKeywords: normalize((entry.keywords || []).join(' ')),
        }));
        return entries;
      });
    }
    return loadPromise;
  }

  function score(entry, query, tokens) {
    let value = 0;
    if (entry.searchTitle === query) value += 120;
    if (entry.searchTitle.startsWith(query)) value += 80;
    if (entry.searchTitle.includes(query)) value += 55;
    if (entry.searchKeywords.includes(query)) value += 30;
    if (entry.searchZone.includes(query)) value += 24;
    if (entry.searchDescription.includes(query)) value += 18;
    for (const token of tokens) {
      if (entry.searchTitle.includes(token)) value += 15;
      if (entry.searchKeywords.includes(token)) value += 8;
      if (entry.searchZone.includes(token)) value += 6;
      if (entry.searchDescription.includes(token)) value += 4;
    }
    return value;
  }

  function render(matches, query) {
    if (!query) {
      results.innerHTML = '';
      status.textContent = 'Search reviewed and low-risk practical entries by topic, goal, or method.';
      return;
    }
    if (!matches.length) {
      results.innerHTML = '<p class="search-empty">No matching protocols. Try a broader word or browse a Life Area.</p>';
      status.textContent = 'No matching protocols.';
      return;
    }

    results.innerHTML = matches.map(({ entry }) => {
      const title = entry.displayTitle || entry.title;
      const description = entry.description ? `<span>${escapeHtml(entry.description.slice(0, 170))}</span>` : '';
      return `<li><a href="/life-os/${encodeURIComponent(entry.slug)}/"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(entry.zone?.title || 'Growth Library')}</small>${description}</a></li>`;
    }).join('');
    status.textContent = `${matches.length} protocol${matches.length === 1 ? '' : 's'} shown for “${query}”.`;
  }

  async function runSearch() {
    const query = normalize(input.value);
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', input.value.trim());
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    if (query.length < 2) {
      render([], '');
      return;
    }

    status.textContent = 'Searching…';
    try {
      const data = await loadEntries();
      const tokens = query.split(' ').filter(Boolean);
      const matches = data
        .map((entry) => ({ entry, score: score(entry, query, tokens) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || (a.entry.displayTitle || a.entry.title).localeCompare(b.entry.displayTitle || b.entry.title))
        .slice(0, 12);
      render(matches, input.value.trim());
    } catch (error) {
      results.innerHTML = '<p class="search-empty">Search data could not be loaded. The Life Area and Growth Zone navigation still works.</p>';
      status.textContent = error.message;
    }
  }

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 120);
  });
  input.addEventListener('focus', () => loadEntries().catch(() => {}), { once: true });

  const initial = new URL(window.location.href).searchParams.get('q');
  if (initial) {
    input.value = initial;
    runSearch();
  }
})();
