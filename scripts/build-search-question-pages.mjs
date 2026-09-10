import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryBrali } from '../for-ai/query/retrieval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const API_VERSION = 'v1';
const readJson = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const write = (relative, content) => {
  const file = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const writeJson = (relative, value) => write(relative, `${JSON.stringify(value, null, 2)}\n`);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));
const slugify = value => clean(value)
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-');

const growth = readJson('data/growth-surfaces.json');
const apiData = {
  topics: readJson(`api/${API_VERSION}/topics.json`),
  identity: readJson(`api/${API_VERSION}/identity.json`),
  flagships: readJson(`api/${API_VERSION}/flagships.json`),
  decisions: readJson(`api/${API_VERSION}/evidence-decisions.json`)
};

const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/questions/">Questions</a><a href="/problems/">Problems</a><a href="/research/">Research</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · practical knowledge for people and machines</small><div class="footer-links"><a href="/life-os/">Library</a><a href="/questions/">Questions</a><a href="/research/">Research</a><a href="/for-ai/">For AI</a></div></div></footer>`;
const head = ({ title, description, canonical, schema, robots = '' }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}">${robots ? `<meta name="robots" content="${esc(robots)}">` : ''}<link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${BASE}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`;

const pageRows = (growth.question_groups ?? []).flatMap(group => (group.questions ?? []).map(question => {
  const slug = slugify(question);
  if (!slug) throw new Error(`Could not create a stable slug for question: ${question}`);
  const packet = queryBrali(question, apiData, { limit: 4 });
  const indexable = packet.status === 'trusted-answer' || (packet.status === 'boundary-only' && (packet.evidence_boundaries ?? []).length > 0);
  return { group, question, slug, packet, indexable };
}));

const slugs = pageRows.map(row => row.slug);
if (new Set(slugs).size !== slugs.length) throw new Error('Search question page slugs must be unique.');

const desired = new Set(slugs);
const questionsDir = path.join(ROOT, 'questions');
for (const entry of fs.readdirSync(questionsDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || desired.has(entry.name)) continue;
  const oldPage = path.join(questionsDir, entry.name, 'index.html');
  if (fs.existsSync(oldPage) && fs.readFileSync(oldPage, 'utf8').includes('data-brali-search-question-page')) {
    fs.rmSync(path.join(questionsDir, entry.name), { recursive: true, force: true });
  }
}

const summaries = [];
for (const row of pageRows) {
  const { group, question, slug, packet, indexable } = row;
  const canonical = `${BASE}/questions/${slug}/`;
  const topics = (packet.route?.topics ?? []).map(topic => topic.title).filter(Boolean);
  const recommendations = packet.recommendations ?? [];
  const boundaries = packet.evidence_boundaries ?? [];
  const first = recommendations[0];
  const answerText = first
    ? `${first.action || first.title}${first.check_in ? ` Check-in: ${first.check_in}` : ''}`
    : packet.status === 'boundary-only'
      ? 'Brali returns a reviewed evidence boundary for this wording rather than turning the evidence into a normal practical recommendation.'
      : 'Brali does not currently have a sufficiently grounded normal recommendation for this wording.';
  const description = first
    ? `${question} Start with a Brali ${first.evidence_state} protocol, then compare trusted alternatives and evidence boundaries.`
    : packet.status === 'boundary-only'
      ? `${question} Brali shows the reviewed evidence boundary without inventing a practical prescription.`
      : `${question} Brali currently has no sufficiently grounded normal recommendation for this wording.`;

  const protocolCards = recommendations.length
    ? recommendations.map(item => {
        const source = item.provenance?.source_url ? ` · <a href="${esc(item.provenance.source_url)}" rel="noopener">Reviewed source</a>` : '';
        return `<article class="card"><span class="card-label">Evidence status: ${esc(item.evidence_state)}</span><h3><a href="${esc(item.provenance.record_url)}">${esc(item.title)}</a></h3>${item.action ? `<p>${esc(item.action)}</p>` : ''}${item.check_in ? `<p><strong>Check-in:</strong> ${esc(item.check_in)}</p>` : ''}<p><a href="/run/?protocol=${encodeURIComponent(item.canonical_id)}">Run protocol →</a>${source}</p></article>`;
      }).join('')
    : '<div class="callout"><strong>No normal protocol recommendation.</strong><p>This page does not manufacture an answer when Brali trusted retrieval does not support one.</p></div>';

  const boundaryCards = boundaries.length
    ? boundaries.map(boundary => `<article class="callout"><p class="eyebrow">Reviewed evidence boundary</p><h3>${esc(boundary.supported_claim || boundary.decision)}</h3>${(boundary.unsupported_or_overstated_claims ?? []).length ? `<p><strong>Do not claim:</strong> ${esc(boundary.unsupported_or_overstated_claims.join('; '))}</p>` : ''}${(boundary.limitations ?? []).length ? `<p><strong>Limitations:</strong> ${esc(boundary.limitations.join('; '))}</p>` : ''}${boundary.source_url ? `<p><a href="${esc(boundary.source_url)}" rel="noopener">Reviewed evidence source →</a></p>` : ''}</article>`).join('')
    : '<p class="muted">No reviewed Evidence Decision is attached to this query result. Protocol evidence status still applies.</p>';

  const topicLine = topics.length ? `<p><strong>Brali route:</strong> ${esc(topics.join(' · '))}</p>` : '';
  const secondary = group.secondary_url ? ` · <a href="${esc(group.secondary_url)}">Related research / topic</a>` : '';
  const queryUrl = `/for-ai/query/?q=${encodeURIComponent(question)}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: question,
    description,
    url: canonical,
    isPartOf: { '@type': 'CollectionPage', name: 'Brali practical questions', url: `${BASE}/questions/` },
    mainEntity: {
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answerText }
    }
  };

  const pageJson = {
    schema_version: 1,
    updated_at: growth.updated_at,
    canonical_url: canonical,
    slug,
    question,
    group: { slug: group.slug, title: group.title, summary: group.summary },
    search_status: packet.status,
    indexable,
    route: packet.route,
    recommendations,
    evidence_boundaries: boundaries,
    safety: packet.safety,
    broader_url: group.primary_url,
    secondary_url: group.secondary_url || null,
    query_url: queryUrl,
    trust_note: 'This page is generated only from an editorially selected question plus the same evidence-aware Brali retrieval contract used by the Query Playground. Unsupported results remain noindex.'
  };
  writeJson(`questions/${slug}/index.json`, pageJson);
  write(`questions/${slug}/index.html`, `${head({ title: `${question} | Brali`, description, canonical, schema, robots: indexable ? '' : 'noindex,follow' })}<body data-brali-search-question-page><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Practical question · ${esc(group.title)}${indexable ? '' : ' · not indexed'}</p><h1>${esc(question)}</h1><p class="lead">${esc(group.summary)}</p><div class="callout"><strong>Answer first:</strong><p>${esc(answerText)}</p>${topicLine}<p><strong>Trust boundary:</strong> Brali only returns reviewed/practical protocols as normal recommendations. A missing trusted answer stays missing.</p></div><section><h2>Practical routes from Brali</h2><div class="grid two">${protocolCards}</div></section><section class="prose"><h2>Evidence boundaries</h2><div class="grid two">${boundaryCards}</div></section><section class="prose"><h2>Explore the underlying knowledge</h2><p><a href="${esc(group.primary_url)}">Broader ${esc(group.title)} collection →</a>${secondary} · <a href="${esc(queryUrl)}">Run this exact question in the Query Playground →</a></p><p><a href="/questions/">All practical questions →</a> · <a href="/questions/${esc(slug)}/index.json">Machine-readable answer packet</a></p></section></main>${footer}</body></html>\n`);

  summaries.push({
    slug,
    question,
    group_slug: group.slug,
    canonical_url: canonical,
    json_url: `${canonical}index.json`,
    search_status: packet.status,
    indexable,
    recommendation_count: recommendations.length,
    evidence_boundary_count: boundaries.length,
    primary_url: group.primary_url,
    secondary_url: group.secondary_url || null
  });
}

const questionIndexPath = path.join(ROOT, 'questions/index.json');
const questionIndex = JSON.parse(fs.readFileSync(questionIndexPath, 'utf8'));
questionIndex.page_count = summaries.length;
questionIndex.indexable_page_count = summaries.filter(page => page.indexable).length;
questionIndex.pages = summaries;
fs.writeFileSync(questionIndexPath, `${JSON.stringify(questionIndex, null, 2)}\n`);

const indexHtmlPath = path.join(ROOT, 'questions/index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
for (const page of summaries) {
  const current = `<li>${esc(page.question)}</li>`;
  const replacement = `<li><a href="/questions/${esc(page.slug)}/">${esc(page.question)}</a>${page.indexable ? '' : ' <span class="muted">(coverage pending)</span>'}</li>`;
  if (!indexHtml.includes(current)) throw new Error(`Question index is missing expected source wording: ${page.question}`);
  indexHtml = indexHtml.replace(current, replacement);
}
indexHtml = indexHtml.replace(
  'Each one routes to a canonical Brali collection so the useful answer, evidence boundary, and related data stay in one place.',
  'Each question now has a stable answer page backed by the same trusted retrieval contract as the Query Playground. Unsupported questions stay noindex rather than becoming thin search pages.'
);
if (!indexHtml.includes('data-brali-search-question-pages')) {
  indexHtml = indexHtml.replace('<section><div class="grid two">', `<aside class="callout" data-brali-search-question-pages><strong>Search-ready question pages:</strong> ${summaries.filter(page => page.indexable).length} of ${summaries.length} editorial questions currently resolve to trusted recommendations or reviewed evidence boundaries. Each has a stable URL and machine-readable packet.</aside><section><div class="grid two">`);
}
fs.writeFileSync(indexHtmlPath, indexHtml);

const sitemapPath = path.join(ROOT, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
for (const page of summaries) {
  const loc = `<loc>${page.canonical_url}</loc>`;
  if (page.indexable && !sitemap.includes(loc)) {
    sitemap = sitemap.replace('</urlset>', `  <url>${loc}</url>\n</urlset>`);
  }
  if (!page.indexable && sitemap.includes(loc)) {
    const escaped = page.canonical_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sitemap = sitemap.replace(new RegExp(`\\s*<url>\\s*<loc>${escaped}<\\/loc>[\\s\\S]*?<\\/url>`, 'g'), '');
  }
}
fs.writeFileSync(sitemapPath, sitemap);

const llmsPath = path.join(ROOT, 'llms.txt');
let llms = fs.readFileSync(llmsPath, 'utf8');
if (!llms.includes('## Search-ready question pages')) {
  llms += `\n## Search-ready question pages\n- Human index: ${BASE}/questions/\n- Machine index: ${BASE}/questions/index.json\n- Stable answer page: ${BASE}/questions/<question-slug>/\n- Machine answer packet: ${BASE}/questions/<question-slug>/index.json\n- Pages are generated from editorially selected questions and Brali trusted retrieval. Unsupported queries are noindex rather than padded into search pages.\n`;
  fs.writeFileSync(llmsPath, llms);
}

console.log(`Search question pages built: ${summaries.length} total, ${summaries.filter(page => page.indexable).length} indexable, ${summaries.filter(page => !page.indexable).length} coverage-pending.`);
