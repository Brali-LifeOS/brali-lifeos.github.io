import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const writeText = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const escapeHtml = value => clean(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const itemId = value => typeof value === 'string' ? value : clean(value?.id || value?.slug || value?.title);
const intersects = (a, b) => a.some(value => b.has(value));

const config = read('data/topic-hubs.json');
const platform = read('data/platform.json');
const ontology = read('data/knowledge-ontology.json');
const protocolFeed = read('life-os/datasets/protocols.json');
const flagship = read('life-os/datasets/flagship-100.json');
const decisions = read('data/evidence-decisions.json');
const candidates = read('data/research-candidates.json');
const topicById = new Map((ontology.topics || []).map(topic => [topic.id, topic]));
const methodById = new Map((ontology.methods || []).map(method => [method.id, method]));
const candidateById = new Map((candidates.candidates || []).map(candidate => [candidate.id, candidate]));
const flagshipSlugs = new Set((flagship.entries || []).map(entry => entry.slug));
const trustedStates = new Set(['reviewed', 'practical']);
const maxProtocols = Number(config.max_protocols_per_hub || 8);

for (const hub of config.hubs || []) {
  for (const id of [...(hub.primary_topic_ids || []), ...(hub.related_topic_ids || [])]) {
    if (!topicById.has(id)) throw new Error(`Topic hub ${hub.slug} references unknown Topic ${id}`);
  }
}

const protocolTopics = entry => (entry.ontology?.topics || []).map(itemId).filter(Boolean);
const protocolMethods = entry => (entry.ontology?.methods || []).map(itemId).filter(Boolean);

function protocolScore(entry, primary) {
  const ids = protocolTopics(entry);
  const matches = ids.filter(id => primary.has(id)).length;
  if (!matches) return -1;
  return (flagshipSlugs.has(entry.slug) ? 1000 : 0)
    + matches * 50
    + (entry.evidence?.status === 'reviewed' ? 100 : 0)
    + (entry.evidence?.source_url ? 30 : 0)
    + (entry.check_in ? 10 : 0)
    + Math.min(clean(entry.action).length, 240) / 100;
}

const hubs = [];
const protocolHubMap = new Map();
for (const hubConfig of config.hubs || []) {
  const primary = new Set(hubConfig.primary_topic_ids || []);
  const related = new Set(hubConfig.related_topic_ids || []);
  const topicRecords = [...primary].map(id => topicById.get(id));
  const recommendations = (protocolFeed.entries || [])
    .filter(entry => trustedStates.has(entry.evidence?.status))
    .map(entry => ({ entry, score: protocolScore(entry, primary) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, maxProtocols)
    .map(({ entry, score }) => ({
      canonical_id: entry.canonical_id || `brali:protocol:${entry.slug}`,
      protocol_id: entry.protocol_id,
      slug: entry.slug,
      url: entry.url,
      title: entry.title,
      description: entry.description,
      action: entry.action,
      check_in: entry.check_in,
      evidence: entry.evidence,
      is_flagship_100: flagshipSlugs.has(entry.slug),
      topic_ids: protocolTopics(entry),
      method_ids: protocolMethods(entry),
      hub_score: Number(score.toFixed(2)),
    }));
  if (!recommendations.length) throw new Error(`Topic hub ${hubConfig.slug} has no trusted protocol coverage.`);

  const reviewedDecisions = (decisions.entries || []).flatMap(decision => {
    const candidate = candidateById.get(decision.candidate_id);
    const topicIds = candidate?.topic_ids || [];
    if (!intersects(topicIds, primary)) return [];
    return [{
      id: decision.id,
      decision: decision.decision,
      reviewed_at: decision.reviewed_at,
      source_title: decision.source_title,
      source_url: decision.source_url,
      source_type: decision.source_type,
      citation_text: decision.citation_text,
      supported_claim: decision.supported_claim,
      unsupported_or_overstated_claims: decision.unsupported_or_overstated_claims || [],
      limitations: decision.limitations || [],
      topic_ids: topicIds,
    }];
  });

  const discovery = (candidates.candidates || [])
    .filter(candidate => intersects(candidate.topic_ids || [], primary))
    .sort((a, b) => String(b.publication_date || '').localeCompare(String(a.publication_date || '')) || a.title.localeCompare(b.title))
    .slice(0, 4)
    .map(candidate => ({
      id: candidate.id,
      title: candidate.title,
      status: candidate.status,
      publication_date: candidate.publication_date,
      reference_url: candidate.reference_url,
      topic_ids: candidate.topic_ids || [],
      evidence_state: 'discovery-only',
      note: 'Discovery metadata is not reviewed evidence. Read the Evidence Decision when one exists.',
    }));

  const coTopics = new Set([...related]);
  const methods = new Set();
  for (const protocol of recommendations) {
    for (const id of protocol.topic_ids) if (!primary.has(id)) coTopics.add(id);
    for (const id of protocol.method_ids) methods.add(id);
    if (!protocolHubMap.has(protocol.slug)) protocolHubMap.set(protocol.slug, []);
    protocolHubMap.get(protocol.slug).push({ slug: hubConfig.slug, title: hubConfig.title });
  }

  const hub = {
    schema_version: 1,
    dataset_version: platform.dataset_version,
    slug: hubConfig.slug,
    title: hubConfig.title,
    question: hubConfig.question,
    summary: hubConfig.summary,
    canonical_url: `${BASE}/topics/${hubConfig.slug}/`,
    json_url: `${BASE}/topics/${hubConfig.slug}/index.json`,
    api_url: `${BASE}/api/${platform.api_version}/hubs.json`,
    topics: topicRecords.map(topic => ({ id: topic.id, title: topic.title, description: topic.description, canonical_id: `brali:topic:${topic.id}` })),
    protocols: recommendations,
    evidence_decisions: reviewedDecisions,
    research_watch: discovery,
    related_topics: [...coTopics].filter(id => topicById.has(id)).map(id => ({ id, title: topicById.get(id).title, canonical_id: `brali:topic:${id}` })),
    related_methods: [...methods].filter(id => methodById.has(id)).map(id => ({ id, title: methodById.get(id).title, canonical_id: `brali:method:${id}` })),
    trust_note: 'Protocol recommendations come only from the reviewed/practical trusted feed. Research-watch items are discovery metadata, not evidence. Reviewed Evidence Decisions define the research claims and boundaries shown here.',
  };
  hubs.push(hub);
  writeJson(`topics/${hub.slug}/index.json`, hub);
}

const dataset = {
  schema_version: 1,
  dataset_version: platform.dataset_version,
  name: 'Brali Topic Knowledge Hubs',
  description: 'Compact topic entry points for humans and AI systems, generated from the Brali ontology, trusted Protocol Feed, Flagship 100, Evidence Decisions, and research discovery queue.',
  canonical_url: `${BASE}/life-os/datasets/topic-hubs.json`,
  count: hubs.length,
  hubs,
};
writeJson('life-os/datasets/topic-hubs.json', dataset);
writeJson(`api/${platform.api_version}/hubs.json`, dataset);

const apiIndex = read(`api/${platform.api_version}/index.json`);
apiIndex.endpoints = [...new Set([...(apiIndex.endpoints || []), 'hubs.json'])];
writeJson(`api/${platform.api_version}/index.json`, apiIndex);
const openapi = read(`api/${platform.api_version}/openapi.json`);
openapi.paths ||= {};
openapi.paths[`/api/${platform.api_version}/hubs.json`] = { get: { operationId: 'get_topic_hubs', summary: 'Get Brali high-value Topic Knowledge Hubs', responses: { '200': { description: 'Topic hub collection', content: { 'application/json': { schema: { type: 'object' } } } } } } };
writeJson(`api/${platform.api_version}/openapi.json`, openapi);

for (const hub of hubs) {
  const evidenceHtml = hub.evidence_decisions.length
    ? hub.evidence_decisions.map(decision => `<article class="card"><span class="card-label">${escapeHtml(decision.decision)} · reviewed evidence boundary</span><h3>${escapeHtml(decision.source_title)}</h3><p>${escapeHtml(decision.supported_claim)}</p>${decision.unsupported_or_overstated_claims.length ? `<p><strong>Does not establish:</strong> ${escapeHtml(decision.unsupported_or_overstated_claims.slice(0, 2).join(' '))}</p>` : ''}<p><a href="${escapeHtml(decision.source_url)}" rel="noopener">Reviewed source</a></p></article>`).join('')
    : '<p>No reviewed Evidence Decision is currently attached to this hub. Protocol trust states still apply; absence of a decision is not evidence of effectiveness.</p>';
  const researchHtml = hub.research_watch.length
    ? hub.research_watch.map(item => `<li><a href="${escapeHtml(item.reference_url)}" rel="noopener">${escapeHtml(item.title)}</a> <small>${escapeHtml(item.status)} · discovery only</small></li>`).join('')
    : '<li>No active discovery lead is currently attached to this Topic.</li>';
  const protocolHtml = hub.protocols.map(protocol => `<article class="card"><span class="card-label">${protocol.is_flagship_100 ? 'Flagship 100 · ' : ''}${escapeHtml(protocol.evidence.status)}</span><h3><a href="/life-os/${escapeHtml(protocol.slug)}/">${escapeHtml(protocol.title)}</a></h3><p>${escapeHtml(protocol.action)}</p>${protocol.check_in ? `<p><strong>Check-in:</strong> ${escapeHtml(protocol.check_in)}</p>` : ''}</article>`).join('');
  const relatedHtml = [...hub.related_topics.map(item => `<span>${escapeHtml(item.title)}</span>`), ...hub.related_methods.map(item => `<span>${escapeHtml(item.title)} <small>method</small></span>`)].join(' · ') || 'No additional related entities are currently attached.';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${hub.title} practical knowledge hub`,
    description: hub.summary,
    url: hub.canonical_url,
    about: hub.topics.map(topic => ({ '@type': 'DefinedTerm', name: topic.title, identifier: topic.canonical_id })),
    hasPart: hub.protocols.map(protocol => ({ '@type': 'Article', name: protocol.title, url: protocol.url })),
    citation: hub.evidence_decisions.map(decision => decision.source_url),
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(hub.title)} practical protocols, evidence & research | Brali</title><meta name="description" content="${escapeHtml(hub.summary)}"><link rel="canonical" href="${hub.canonical_url}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(hub.title)} practical knowledge | Brali"><meta property="og:description" content="${escapeHtml(hub.summary)}"><meta property="og:url" content="${hub.canonical_url}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/topics/">Topics</a><a href="/life-os/flagships/100/">Flagship 100</a><a href="/research/">Research</a><a href="/for-ai/">For AI</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Topic Knowledge Hub</p><h1>${escapeHtml(hub.title)}</h1><p class="lead">${escapeHtml(hub.question)}</p><p>${escapeHtml(hub.summary)}</p><div class="callout"><strong>Trust boundary:</strong> ${escapeHtml(hub.trust_note)}</div><section><h2>What this topic covers</h2>${hub.topics.map(topic => `<article class="prose"><h3>${escapeHtml(topic.title)}</h3><p>${escapeHtml(topic.description)}</p></article>`).join('')}</section><section><h2>Protocols to try</h2><div class="grid two">${protocolHtml}</div></section><section class="prose"><h2>Evidence boundaries</h2><div class="grid two">${evidenceHtml}</div></section><section class="prose"><h2>Research watch</h2><p>These are discovery leads, not reviewed evidence.</p><ul>${researchHtml}</ul></section><section class="prose"><h2>Related knowledge</h2><p>${relatedHtml}</p></section><section class="prose"><h2>For agents and reproducible use</h2><p><a href="/topics/${hub.slug}/index.json">This hub as JSON</a> · <a href="/api/${platform.api_version}/hubs.json">Topic Hubs API</a> · <a href="/life-os/datasets/topic-hubs.json">Canonical hub dataset</a> · <a href="/for-ai/">Brali integration rules</a></p><p>Keep protocol evidence states and Evidence Decision limitations with any downstream recommendation.</p></section></main><footer class="footer"><div class="wrap footer-row"><small>Brali · ${escapeHtml(hub.title)} knowledge hub</small></div></footer></body></html>`;
  writeText(`topics/${hub.slug}/index.html`, html);
}

const cards = hubs.map(hub => `<article class="card"><span class="card-label">${hub.protocols.length} trusted protocols · ${hub.evidence_decisions.length} evidence decision${hub.evidence_decisions.length === 1 ? '' : 's'}</span><h3><a href="/topics/${hub.slug}/">${escapeHtml(hub.title)}</a></h3><p>${escapeHtml(hub.summary)}</p></article>`).join('');
const indexSchema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Brali Topic Knowledge Hubs', url: `${BASE}/topics/`, hasPart: hubs.map(hub => ({ '@type': 'CollectionPage', name: hub.title, url: hub.canonical_url })) };
writeText('topics/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Practical knowledge topics | Brali</title><meta name="description" content="Seven evidence-aware Brali topic hubs for sleep, focus, memory, stress, habits, learning, and movement."><link rel="canonical" href="${BASE}/topics/"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(indexSchema).replace(/</g, '\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/ontology/">Ontology</a><a href="/research/">Research</a><a href="/for-ai/">For AI</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Knowledge entry points</p><h1>Start with the problem, not the taxonomy.</h1><p class="lead">These seven hubs combine Brali Topics, trusted protocols, reviewed evidence boundaries, and clearly labeled research discovery into compact entry points for people and AI systems.</p><div class="grid two">${cards}</div></main><footer class="footer"><div class="wrap footer-row"><small>Brali · Topic Knowledge Hubs</small></div></footer></body></html>`);

for (const [slug, linkedHubs] of protocolHubMap.entries()) {
  const file = path.join(ROOT, 'life-os', slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('data-brali-topic-hubs')) continue;
  const links = linkedHubs.map(hub => `<a href="/topics/${hub.slug}/">${escapeHtml(hub.title)}</a>`).join(' · ');
  html = html.replace('</main>', `<aside class="callout" data-brali-topic-hubs><strong>Explore the topic:</strong> ${links}</aside></main>`);
  fs.writeFileSync(file, html);
}

const surfaceFiles = ['index.html', 'life-os/index.html', 'research/index.html', 'ontology/index.html', 'for-ai/index.html'];
for (const rel of surfaceFiles) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('data-brali-topic-hub-index')) continue;
  html = html.replace('</main>', '<aside class="callout" data-brali-topic-hub-index><h3>Topic Knowledge Hubs</h3><p>Start with Sleep, Focus, Memory, Stress, Habits, Learning, or Movement, with trusted protocols and evidence boundaries in one place.</p><a class="button" href="/topics/">Browse topic hubs</a></aside></main>');
  fs.writeFileSync(file, html);
}

const datasetsPath = path.join(ROOT, 'life-os/datasets/index.html');
if (fs.existsSync(datasetsPath)) {
  let html = fs.readFileSync(datasetsPath, 'utf8');
  if (!html.includes('/life-os/datasets/topic-hubs.json')) html = html.replace('</ul>', '<li><a href="/life-os/datasets/topic-hubs.json">Topic Knowledge Hubs (JSON)</a></li></ul>');
  fs.writeFileSync(datasetsPath, html);
}

const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let text = fs.readFileSync(llmsPath, 'utf8');
  if (!text.includes('/topics/')) text += `\n## Topic Knowledge Hubs\n${hubs.map(hub => `- ${hub.title}: ${hub.canonical_url}`).join('\n')}\n- Machine-readable collection: ${BASE}/api/${platform.api_version}/hubs.json\n`;
  fs.writeFileSync(llmsPath, text);
}

const manifest = read('life-os/datasets/manifest.json');
const published = ['data/topic-hubs.json', 'life-os/datasets/topic-hubs.json', ...hubs.map(hub => `topics/${hub.slug}/index.json`)];
manifest.files = (manifest.files || []).filter(item => !published.includes(typeof item === 'string' ? item : item.path));
for (const rel of published) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const doc = JSON.parse(text);
  const count = Array.isArray(doc) ? doc.length : Array.isArray(doc.hubs) ? doc.hubs.length : Array.isArray(doc.protocols) ? doc.protocols.length : null;
  manifest.files.push({ path: rel, sha256: digest(text), bytes: Buffer.byteLength(text), count });
}
manifest.files.sort((a, b) => String(a.path || a).localeCompare(String(b.path || b)));
manifest.counts ||= {};
manifest.counts.topic_hubs = hubs.length;
writeJson('life-os/datasets/manifest.json', manifest);
writeJson(`api/${platform.api_version}/manifest.json`, manifest);

const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const urls = [`${BASE}/topics/`, ...hubs.map(hub => hub.canonical_url)];
  const missing = urls.filter(url => !sitemap.includes(`<loc>${url}</loc>`));
  if (missing.length) sitemap = sitemap.replace('</urlset>', `${missing.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>`);
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log(`Topic hubs generated: ${hubs.length} hubs, ${new Set(hubs.flatMap(hub => hub.protocols.map(protocol => protocol.slug))).size} linked trusted protocols, ${hubs.reduce((n, hub) => n + hub.evidence_decisions.length, 0)} reviewed Evidence Decision placements.`);
