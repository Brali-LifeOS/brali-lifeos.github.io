const status = document.querySelector('#gold-status');
const list = document.querySelector('#gold-list');

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function topicLabels(protocol) {
  return (protocol.ontology?.topics ?? []).map(topic => topic.title || topic.id).filter(Boolean);
}

function alternativeLinks(entry, protocolBySlug) {
  return entry.alternatives.map(slug => {
    const protocol = protocolBySlug.get(slug);
    const label = protocol?.title || slug.replace(/-/g, ' ');
    const url = protocol?.url || `/life-os/${slug}/`;
    return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
  }).join(' · ');
}

function renderCard(entry, protocol, protocolBySlug) {
  const topics = topicLabels(protocol);
  const lifeArea = protocol.life_area || 'Brali';
  return `<article class="card" id="gold-${escapeHtml(entry.slug)}" data-gold-slug="${escapeHtml(entry.slug)}">
    <span class="card-label">${String(entry.rank).padStart(2, '0')} · ${escapeHtml(protocol.evidence_state)} · ${escapeHtml(lifeArea)}</span>
    <h2><a href="${escapeHtml(protocol.url)}">${escapeHtml(protocol.title)}</a></h2>
    <p><strong>Problem:</strong> ${escapeHtml(entry.problem)}</p>
    <p><strong>Use when:</strong> ${escapeHtml(entry.eligibility)}</p>
    <p><strong>First action:</strong> ${escapeHtml(entry.first_action)}</p>
    <p><strong>Observe:</strong> ${escapeHtml(entry.observable_signal)}</p>
    <p><strong>Stop when:</strong> ${escapeHtml(entry.stop_rule)}</p>
    <p><strong>Limitations:</strong></p>
    <ul>${entry.limitations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <p><strong>Alternatives:</strong> ${alternativeLinks(entry, protocolBySlug)}</p>
    ${topics.length ? `<p><strong>Topics:</strong> ${escapeHtml(topics.join(' · '))}</p>` : ''}
    <p class="result-meta">${escapeHtml(protocol.canonical_id)} · Gold contract reviewed ${escapeHtml(entry.gold_reviewed_at)}</p>
  </article>`;
}

async function boot() {
  try {
    const [gold, protocolFeed] = await Promise.all([
      getJson('/data/gold-20.json'),
      getJson('/api/v1/protocols.json'),
    ]);
    const protocols = protocolFeed.items ?? protocolFeed.entries ?? [];
    const protocolBySlug = new Map(protocols.map(protocol => [protocol.slug, protocol]));
    const missing = gold.entries.filter(entry => !protocolBySlug.has(entry.slug));
    if (missing.length) throw new Error(`Missing trusted Protocols: ${missing.map(entry => entry.slug).join(', ')}`);
    list.innerHTML = gold.entries.map(entry => renderCard(entry, protocolBySlug.get(entry.slug), protocolBySlug)).join('');
    status.textContent = `Loaded ${gold.entries.length} Gold Protocols from the current trusted feed.`;
  } catch (error) {
    console.error(error);
    status.textContent = 'The Gold collection could not be joined with the current Protocol Feed. Use the JSON contract while the deployment completes.';
    list.innerHTML = '<article class="boundary-card"><h2>Gold contract unavailable</h2><p><a href="/data/gold-20.json">Open the machine-readable contract →</a></p></article>';
  }
}

boot();
