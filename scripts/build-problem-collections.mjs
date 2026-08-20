import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, content) => { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
const writeJson = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const topicId = value => typeof value === 'string' ? value : clean(value?.id || value?.slug || value?.title);

const cfg = read('data/problem-collections.json');
const feed = read('life-os/datasets/protocols.json');
const flagship = read('life-os/datasets/flagship-100.json');
const ontology = read('data/knowledge-ontology.json');
const decisions = read('data/evidence-decisions.json');
const candidates = read('data/research-candidates.json');
const platform = read('data/platform.json');
const topics = new Map((ontology.topics ?? []).map(t => [t.id, t]));
const flagshipSlugs = new Set((flagship.entries ?? []).map(p => p.slug));
const candidateById = new Map((candidates.candidates ?? []).map(c => [c.id, c]));
const trusted = new Set(['reviewed', 'practical']);

for (const collection of cfg.collections ?? []) {
  for (const id of [...(collection.primary_topic_ids ?? []), ...(collection.related_topic_ids ?? [])]) {
    if (!topics.has(id)) throw new Error(`Problem collection ${collection.slug} references unknown Topic ${id}.`);
  }
}

const protocolTopics = protocol => (protocol.ontology?.topics ?? []).map(topicId).filter(Boolean);
const scoreProtocol = (protocol, primary, related) => {
  const ids = protocolTopics(protocol);
  const primaryHits = ids.filter(id => primary.has(id)).length;
  if (!primaryHits) return -1;
  const relatedHits = ids.filter(id => related.has(id)).length;
  return primaryHits * 100 + relatedHits * 25 + (flagshipSlugs.has(protocol.slug) ? 40 : 0) + (protocol.evidence?.status === 'reviewed' ? 20 : 0) + (protocol.evidence?.source_url ? 10 : 0);
};

const collections = [];
for (const item of cfg.collections ?? []) {
  const primary = new Set(item.primary_topic_ids ?? []);
  const related = new Set(item.related_topic_ids ?? []);
  const protocols = (feed.entries ?? [])
    .filter(p => trusted.has(p.evidence?.status))
    .map(p => ({ p, score: scoreProtocol(p, primary, related) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.p.title.localeCompare(b.p.title))
    .slice(0, 5)
    .map(({ p, score }) => ({
      canonical_id: p.canonical_id || `brali:protocol:${p.slug}`,
      slug: p.slug,
      url: p.url || `${BASE}/life-os/${p.slug}/`,
      title: p.title,
      description: p.description,
      action: p.action,
      check_in: p.check_in,
      evidence: p.evidence,
      topic_ids: protocolTopics(p),
      is_flagship_100: flagshipSlugs.has(p.slug),
      relevance_score: score
    }));
  if (protocols.length < 2) throw new Error(`Problem collection ${item.slug} has only ${protocols.length} trusted protocol(s); require at least 2.`);

  const evidenceDecisions = (decisions.entries ?? []).flatMap(decision => {
    const candidate = candidateById.get(decision.candidate_id);
    const ids = candidate?.topic_ids ?? [];
    if (!ids.some(id => primary.has(id) || related.has(id))) return [];
    return [{
      id: decision.id,
      decision: decision.decision,
      reviewed_at: decision.reviewed_at,
      source_title: decision.source_title,
      source_url: decision.source_url,
      supported_claim: decision.supported_claim,
      unsupported_or_overstated_claims: decision.unsupported_or_overstated_claims ?? [],
      limitations: decision.limitations ?? []
    }];
  }).slice(0, 3);

  collections.push({
    schema_version: 1,
    updated_at: cfg.updated_at,
    slug: item.slug,
    title: item.title,
    question: item.question,
    summary: item.summary,
    canonical_url: `${BASE}/problems/${item.slug}/`,
    json_url: `${BASE}/problems/${item.slug}/index.json`,
    query_url: `/for-ai/query/?q=${encodeURIComponent(item.query)}`,
    related_url: item.related_url,
    topics: [...primary].map(id => ({ id, title: topics.get(id).title, canonical_id: `brali:topic:${id}` })),
    related_topics: [...related].map(id => ({ id, title: topics.get(id).title, canonical_id: `brali:topic:${id}` })),
    decision_path: item.decision_path,
    stop_rule: item.stop_rule,
    protocols,
    evidence_decisions: evidenceDecisions,
    trust_note: 'Recommendations come only from Brali protocols already classified as reviewed or practical. Decision guidance is editorial synthesis, not a claim that one sequence is universally best.'
  });
}

const dataset = {
  schema_version: 1,
  updated_at: cfg.updated_at,
  name: 'Brali Problem Collections',
  description: 'Problem-first decision guides built only from Brali trusted protocols, with explicit decision paths and evidence boundaries.',
  policy: cfg.policy,
  count: collections.length,
  collections
};
writeJson('problems/index.json', dataset);
writeJson('life-os/datasets/problem-collections.json', dataset);
writeJson(`api/${platform.api_version}/problem-collections.json`, dataset);

const apiIndexPath = `api/${platform.api_version}/index.json`;
const apiIndex = read(apiIndexPath);
apiIndex.endpoints = [...new Set([...(apiIndex.endpoints ?? []), 'problem-collections.json'])];
writeJson(apiIndexPath, apiIndex);

const openApiPath = `api/${platform.api_version}/openapi.json`;
const openApi = read(openApiPath);
openApi.paths ||= {};
openApi.paths[`/api/${platform.api_version}/problem-collections.json`] = { get: { operationId: 'get_problem_collections', summary: 'Get Brali problem-first practical collections', responses: { '200': { description: 'Problem collection dataset', content: { 'application/json': { schema: { type: 'object' } } } } } } };
writeJson(openApiPath, openApi);

const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/questions/">Questions</a><a href="/problems/">Problems</a><a href="/topics/">Topics</a><a href="/research/">Research</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · practical knowledge for people and machines</small></div></footer>`;
const head = ({ title, description, canonical, schema }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`;

for (const collection of collections) {
  const protocolCards = collection.protocols.map(p => `<article class="card"><span class="card-label">${p.is_flagship_100 ? 'Flagship 100 · ' : ''}${esc(p.evidence.status)}</span><h3><a href="/life-os/${esc(p.slug)}/">${esc(p.title)}</a></h3><p>${esc(p.action || p.description)}</p>${p.check_in ? `<p><strong>Check-in:</strong> ${esc(p.check_in)}</p>` : ''}</article>`).join('');
  const decisionsHtml = collection.decision_path.map((step, index) => `<article class="card"><span class="card-label">Decision ${index + 1}</span><h3>${esc(step.if)}</h3><p>${esc(step.try)}</p></article>`).join('');
  const evidenceHtml = collection.evidence_decisions.length ? collection.evidence_decisions.map(d => `<article class="card"><span class="card-label">${esc(d.decision)} · reviewed boundary</span><h3>${esc(d.source_title)}</h3><p>${esc(d.supported_claim)}</p>${d.unsupported_or_overstated_claims.length ? `<p><strong>Does not establish:</strong> ${esc(d.unsupported_or_overstated_claims.slice(0, 2).join(' '))}</p>` : ''}<p><a href="${esc(d.source_url)}" rel="noopener">Reviewed source →</a></p></article>`).join('') : '<p>No reviewed Evidence Decision is attached to this problem yet. Protocol trust status still applies; absence of a research decision is not evidence of effectiveness.</p>';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.title,
    description: collection.summary,
    url: collection.canonical_url,
    about: collection.topics.map(t => ({ '@type': 'DefinedTerm', name: t.title, identifier: t.canonical_id })),
    mainEntity: { '@type': 'ItemList', itemListElement: collection.protocols.map((p, index) => ({ '@type': 'ListItem', position: index + 1, name: p.title, url: p.url })) }
  };
  write(`problems/${collection.slug}/index.json`, `${JSON.stringify(collection, null, 2)}\n`);
  write(`problems/${collection.slug}/index.html`, `${head({ title: `${collection.title} | Brali`, description: collection.summary, canonical: collection.canonical_url, schema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Problem collection · ${collection.protocols.length} trusted protocols</p><h1>${esc(collection.title)}</h1><p class="lead">${esc(collection.question)}</p><p>${esc(collection.summary)}</p><div class="callout"><strong>How to use this page:</strong> start with the decision path, then choose one protocol that fits the actual bottleneck. ${esc(collection.trust_note)}</div><section><h2>Choose the bottleneck first</h2><div class="grid three">${decisionsHtml}</div><div class="callout"><strong>Stop rule:</strong> ${esc(collection.stop_rule)}</div></section><section><h2>Trusted protocols that fit this problem</h2><div class="grid two">${protocolCards}</div></section><section class="prose"><h2>Evidence boundaries</h2><div class="grid two">${evidenceHtml}</div></section><section class="prose"><h2>Go narrower or broader</h2><p><a href="${esc(collection.query_url)}">Ask this in the Query Playground →</a> · <a href="${esc(collection.related_url)}">Explore the broader Brali topic →</a> · <a href="/problems/">All problem collections →</a></p><p><a href="/problems/${esc(collection.slug)}/index.json">Machine-readable version</a> · <a href="/api/${platform.api_version}/problem-collections.json">Problem Collections API</a></p></section></main>${footer}</body></html>\n`);
}

const cards = collections.map(c => `<article class="card"><span class="card-label">${c.protocols.length} trusted protocols</span><h2><a href="/problems/${esc(c.slug)}/">${esc(c.title)}</a></h2><p>${esc(c.summary)}</p></article>`).join('');
const indexSchema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Brali problem-first practical guides', description: 'A small set of decision-oriented practical collections built from trusted Brali protocols.', url: `${BASE}/problems/`, hasPart: collections.map(c => ({ '@type': 'CollectionPage', name: c.title, url: c.canonical_url })) };
write('problems/index.html', `${head({ title: 'Problem-first practical guides | Brali', description: 'Start with a concrete problem, identify the bottleneck, and choose from trusted Brali protocols instead of browsing hundreds of hacks.', canonical: `${BASE}/problems/`, schema: indexSchema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Problem-first guides</p><h1>Start with the situation, then choose a protocol.</h1><p class="lead">These pages are intentionally few. Each one adds a decision path on top of Brali's trusted library rather than creating a separate URL for every keyword variation.</p><div class="callout"><strong>Publishing rule:</strong> every recommendation must already be reviewed or practical in Brali. New collections need a materially different problem or decision path, not merely different wording.</div><section><div class="grid two">${cards}</div></section><section class="prose"><h2>Other ways into Brali</h2><p><a href="/questions/">Browse practical questions →</a> · <a href="/topics/">Explore Topic Hubs →</a> · <a href="/for-ai/query/">Ask the Query Playground →</a></p></section></main>${footer}</body></html>\n`);

const inject = (rel, marker, block) => {
  const file = path.join(ROOT, rel); if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8'); if (html.includes(marker)) return false;
  html = html.replace('</main>', `${block}</main>`); fs.writeFileSync(file, html); return true;
};
inject('questions/index.html', 'data-brali-problem-collections', '<aside class="callout" data-brali-problem-collections><h3>Need more than a question?</h3><p><a href="/problems/">Problem Collections</a> add a decision path and a small trusted protocol set for situations where choosing the right kind of intervention matters.</p></aside>');
inject('index.html', 'data-brali-problem-collections', '<aside class="callout" data-brali-problem-collections><h3>Problem-first guides</h3><p>Five compact guides turn common situations into a decision path plus trusted protocols.</p><a class="button" href="/problems/">Browse problem collections</a></aside>');

const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('/problems/')) llms += `\n- Problem-first guides: ${BASE}/problems/\n- Problem Collections JSON: ${BASE}/problems/index.json\n- Problem Collections API: ${BASE}/api/${platform.api_version}/problem-collections.json\n`;
  fs.writeFileSync(llmsPath, llms);
}

console.log(`Problem collections built: ${collections.length} collections using ${new Set(collections.flatMap(c => c.protocols.map(p => p.slug))).size} unique trusted protocols.`);
