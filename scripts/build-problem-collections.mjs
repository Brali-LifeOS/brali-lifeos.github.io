import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGoldReviewRegistry } from './lib/gold-review-registry.mjs';

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
const acquisition = read('data/acquisition-clusters.json');
const goldRegistry = await loadGoldReviewRegistry(ROOT);

const topics = new Map((ontology.topics ?? []).map(t => [t.id, t]));
const feedBySlug = new Map((feed.entries ?? []).map(p => [p.slug, p]));
const flagshipSlugs = new Set((flagship.entries ?? []).map(p => p.slug));
const candidateById = new Map((candidates.candidates ?? []).map(c => [c.id, c]));
const acquisitionIds = new Set((acquisition.clusters ?? []).map(item => item.id));
const trusted = new Set(['reviewed', 'practical']);

const protocolTopics = protocol => (protocol.ontology?.topics ?? []).map(topicId).filter(Boolean);

function validateSourceCollection(collection) {
  for (const id of [...(collection.primary_topic_ids ?? []), ...(collection.related_topic_ids ?? [])]) {
    if (!topics.has(id)) throw new Error(`Problem collection ${collection.slug} references unknown Topic ${id}.`);
  }
  if (collection.acquisition_cluster_id && !acquisitionIds.has(collection.acquisition_cluster_id)) {
    throw new Error(`Problem collection ${collection.slug} references unknown acquisition cluster ${collection.acquisition_cluster_id}.`);
  }
  if ((collection.aliases ?? []).length < 2) throw new Error(`Problem collection ${collection.slug} requires at least two discovery aliases.`);
  if ((collection.protocol_edges ?? []).length < 2) throw new Error(`Problem collection ${collection.slug} requires at least two explicit protocol edges.`);
  const best = (collection.protocol_edges ?? []).filter(edge => edge.fit === 'best-fit');
  if (best.length !== 1) throw new Error(`Problem collection ${collection.slug} requires exactly one best-fit protocol edge.`);
}

function resolveProtocolEdge(collection, edge) {
  const protocol = feedBySlug.get(edge.slug);
  if (!protocol) throw new Error(`Problem collection ${collection.slug} references protocol outside the trusted feed: ${edge.slug}`);
  if (!trusted.has(protocol.evidence?.status)) throw new Error(`Problem collection ${collection.slug} references non-trusted protocol ${edge.slug}.`);
  const gold = goldRegistry.entries?.[edge.slug];
  if (!gold || gold.review_status !== 'gold-ready') {
    throw new Error(`Problem collection ${collection.slug} references protocol without a Gold-ready manual review: ${edge.slug}`);
  }
  for (const field of ['when', 'why', 'caveat']) {
    if (!clean(edge[field])) throw new Error(`Problem collection ${collection.slug} edge ${edge.slug} lacks ${field}.`);
  }
  return {
    canonical_id: protocol.canonical_id || `brali:protocol:${protocol.slug}`,
    slug: protocol.slug,
    url: protocol.url || `${BASE}/life-os/${protocol.slug}/`,
    title: protocol.title,
    description: protocol.description,
    action: protocol.action,
    check_in: protocol.check_in,
    evidence: protocol.evidence,
    topic_ids: protocolTopics(protocol),
    is_flagship_100: flagshipSlugs.has(protocol.slug),
    fit: edge.fit,
    when: edge.when,
    why: edge.why,
    caveat: edge.caveat,
    gold_review: {
      reviewed_at: gold.reviewed_at,
      review_status: gold.review_status,
      first_action: gold.first_action,
      observable_signal: gold.observable_signal,
      eligibility: (gold.eligibility ?? []).slice(0, 3),
      when_not_to_use: (gold.when_not_to_use ?? []).slice(0, 3),
      evidence_boundary: gold.evidence_boundary ?? null
    }
  };
}

const collections = [];
for (const item of cfg.collections ?? []) {
  validateSourceCollection(item);
  const primary = new Set(item.primary_topic_ids ?? []);
  const related = new Set(item.related_topic_ids ?? []);
  const protocols = item.protocol_edges.map(edge => resolveProtocolEdge(item, edge));
  if (new Set(protocols.map(p => p.slug)).size !== protocols.length) throw new Error(`Problem collection ${item.slug} repeats a protocol edge.`);
  const bestFit = protocols.find(protocol => protocol.fit === 'best-fit');

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

  const canonicalUrl = `${BASE}/problems/${item.slug}/`;
  const answerPacket = {
    schema_version: 1,
    canonical_id: `brali:problem:${item.slug}`,
    problem: item.question,
    canonical_url: canonicalUrl,
    best_fit: {
      canonical_id: bestFit.canonical_id,
      slug: bestFit.slug,
      title: bestFit.title,
      when: bestFit.when,
      why: bestFit.why,
      caveat: bestFit.caveat,
      first_action: bestFit.gold_review.first_action,
      evidence_state: bestFit.evidence?.status || 'unknown'
    },
    alternatives: protocols.filter(protocol => protocol.fit !== 'best-fit').map(protocol => ({
      canonical_id: protocol.canonical_id,
      slug: protocol.slug,
      title: protocol.title,
      when: protocol.when,
      why: protocol.why,
      caveat: protocol.caveat,
      first_action: protocol.gold_review.first_action,
      evidence_state: protocol.evidence?.status || 'unknown'
    })),
    stop_rule: item.stop_rule
  };

  collections.push({
    schema_version: 1,
    updated_at: cfg.updated_at,
    canonical_id: `brali:problem:${item.slug}`,
    slug: item.slug,
    acquisition_cluster_id: item.acquisition_cluster_id || null,
    title: item.title,
    question: item.question,
    aliases: item.aliases,
    summary: item.summary,
    canonical_url: canonicalUrl,
    json_url: `${canonicalUrl}index.json`,
    query_url: `/for-ai/query/?q=${encodeURIComponent(item.query)}`,
    related_url: item.related_url,
    topics: [...primary].map(id => ({ id, title: topics.get(id).title, canonical_id: `brali:topic:${id}` })),
    related_topics: [...related].map(id => ({ id, title: topics.get(id).title, canonical_id: `brali:topic:${id}` })),
    decision_path: item.decision_path,
    stop_rule: item.stop_rule,
    protocols,
    answer_packet: answerPacket,
    evidence_decisions: evidenceDecisions,
    trust_note: 'Recommendations come only from protocols that are both trusted in the Brali Protocol Feed and manually Gold-ready. The problem-to-protocol fit is editorial decision logic; it is not a claim that one sequence is universally best.'
  });
}

const dataset = {
  schema_version: 1,
  updated_at: cfg.updated_at,
  name: 'Brali Problem Discovery Graph',
  description: 'Canonical problem-first discovery graph connecting natural-language intent to Gold-ready Brali protocols, explicit fit logic, evidence boundaries, and concise answer packets.',
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
openApi.paths[`/api/${platform.api_version}/problem-collections.json`] = { get: { operationId: 'get_problem_collections', summary: 'Get the canonical Brali problem discovery graph', responses: { '200': { description: 'Problem discovery graph', content: { 'application/json': { schema: { type: 'object' } } } } } } };
writeJson(openApiPath, openApi);

const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/questions/">Questions</a><a href="/problems/">Problems</a><a href="/topics/">Topics</a><a href="/research/">Research</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · evidence-informed decisions and practical protocols · maintained by MetalHatsCats</small></div></footer>`;
const head = ({ title, description, canonical, schema }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`;

for (const collection of collections) {
  const protocolCards = collection.protocols.map(p => `<article class="card"><span class="card-label">${p.fit === 'best-fit' ? 'Best fit · ' : 'Alternative · '}${esc(p.evidence.status)}</span><h3><a href="/life-os/${esc(p.slug)}/">${esc(p.title)}</a></h3><p><strong>When:</strong> ${esc(p.when)}</p><p><strong>Why:</strong> ${esc(p.why)}</p><p><strong>First action:</strong> ${esc(p.gold_review.first_action)}</p><p><strong>Caveat:</strong> ${esc(p.caveat)}</p></article>`).join('');
  const decisionsHtml = collection.decision_path.map((step, index) => `<article class="card"><span class="card-label">Decision ${index + 1}</span><h3>${esc(step.if)}</h3><p>${esc(step.try)}</p></article>`).join('');
  const evidenceHtml = collection.evidence_decisions.length ? collection.evidence_decisions.map(d => `<article class="card"><span class="card-label">${esc(d.decision)} · reviewed boundary</span><h3>${esc(d.source_title)}</h3><p>${esc(d.supported_claim)}</p>${d.unsupported_or_overstated_claims.length ? `<p><strong>Does not establish:</strong> ${esc(d.unsupported_or_overstated_claims.slice(0, 2).join(' '))}</p>` : ''}<p><a href="${esc(d.source_url)}" rel="noopener">Reviewed source →</a></p></article>`).join('') : '<p>No separate Evidence Decision is attached to this problem yet. Gold review and Protocol Feed trust state still apply; absence of a research decision is not evidence of effectiveness.</p>';
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
  write(`problems/${collection.slug}/index.html`, `${head({ title: `${collection.title} | Brali`, description: collection.summary, canonical: collection.canonical_url, schema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Problem guide · ${collection.protocols.length} Gold-ready options</p><h1>${esc(collection.title)}</h1><p class="lead">${esc(collection.question)}</p><p>${esc(collection.summary)}</p><div class="callout"><strong>How Brali decides:</strong> start with the bottleneck, then use the best-fit edge only when its conditions match. ${esc(collection.trust_note)}</div><section><h2>Choose the bottleneck first</h2><div class="grid three">${decisionsHtml}</div><div class="callout"><strong>Stop rule:</strong> ${esc(collection.stop_rule)}</div></section><section><h2>Recommendation path</h2><div class="grid two">${protocolCards}</div></section><section class="prose"><h2>Evidence boundaries</h2><div class="grid two">${evidenceHtml}</div></section><section class="prose"><h2>Use the same graph elsewhere</h2><p><a href="${esc(collection.query_url)}">Ask this in the Query Playground →</a> · <a href="${esc(collection.related_url)}">Explore the broader Brali topic →</a> · <a href="/problems/">All problem guides →</a></p><p><a href="/problems/${esc(collection.slug)}/index.json">Machine-readable answer packet</a> · <a href="/api/${platform.api_version}/problem-collections.json">Problem Discovery API</a></p></section></main>${footer}</body></html>\n`);
}

const cards = collections.map(c => `<article class="card"><span class="card-label">${c.protocols.length} Gold-ready options</span><h2><a href="/problems/${esc(c.slug)}/">${esc(c.title)}</a></h2><p>${esc(c.summary)}</p></article>`).join('');
const indexSchema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Brali problem discovery graph', description: 'A deliberately small set of problem-first decision guides backed by Gold-ready Brali protocols.', url: `${BASE}/problems/`, hasPart: collections.map(c => ({ '@type': 'CollectionPage', name: c.title, url: c.canonical_url })) };
write('problems/index.html', `${head({ title: 'Problem-first decision guides | Brali', description: 'Start with a concrete problem, identify the bottleneck, and choose from Gold-ready Brali protocols with fit logic and evidence limits kept visible.', canonical: `${BASE}/problems/`, schema: indexSchema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Canonical discovery graph</p><h1>Start with the situation, then choose a bounded protocol.</h1><p class="lead">These pages are intentionally few. Each one connects natural-language intent to the same trusted graph used by Brali's Query Playground and machine-readable API.</p><div class="callout"><strong>Publishing rule:</strong> every recommendation edge must point to a Gold-ready protocol, explain fit and caveats, and survive automated discovery tests. New pages require a materially different problem—not another keyword variation.</div><section><div class="grid two">${cards}</div></section><section class="prose"><h2>Other ways into Brali</h2><p><a href="/questions/">Browse practical questions →</a> · <a href="/topics/">Explore Topic Hubs →</a> · <a href="/for-ai/query/">Ask the Query Playground →</a></p></section></main>${footer}</body></html>\n`);

function upsertAside(rel, marker, block) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  const pattern = new RegExp(`<aside class="callout" ${marker}>[\\s\\S]*?<\\/aside>`);
  if (pattern.test(html)) html = html.replace(pattern, block);
  else html = html.replace('</main>', `${block}</main>`);
  fs.writeFileSync(file, html);
  return true;
}
upsertAside('questions/index.html', 'data-brali-problem-collections', '<aside class="callout" data-brali-problem-collections><h3>Need a decision path?</h3><p><a href="/problems/">Problem guides</a> map natural-language situations to Gold-ready protocols with explicit fit, caveats, and a concise answer packet.</p></aside>');
upsertAside('index.html', 'data-brali-problem-collections', `<aside class="callout" data-brali-problem-collections><h3>Start from a real problem</h3><p>${collections.length} compact guides connect common situations to the same Gold-ready graph used by Brali Query.</p><a class="button" href="/problems/">Browse problem guides</a></aside>`);

const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('/problems/')) llms += `\n- Canonical problem discovery graph: ${BASE}/problems/\n- Problem Discovery JSON: ${BASE}/problems/index.json\n- Problem Discovery API: ${BASE}/api/${platform.api_version}/problem-collections.json\n`;
  fs.writeFileSync(llmsPath, llms);
}

console.log(`Problem discovery graph built: ${collections.length} problems, ${new Set(collections.flatMap(c => c.protocols.map(p => p.slug))).size} unique Gold-ready protocols, ${collections.reduce((sum, c) => sum + c.aliases.length, 0)} discovery aliases.`);
