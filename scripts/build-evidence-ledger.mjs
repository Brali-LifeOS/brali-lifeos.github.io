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
const list = values => (values ?? []).map(value => `<li>${esc(value)}</li>`).join('');

const data = read('data/evidence-decisions.json');
const decisions = [...(data.entries ?? [])].sort((a, b) => String(b.reviewed_at).localeCompare(String(a.reviewed_at)) || a.id.localeCompare(b.id));
if (!decisions.length) throw new Error('Evidence Ledger requires reviewed Evidence Decisions.');

const labels = {
  'challenge-existing': { label: 'Challenge existing claim', summary: 'Existing guidance needs a narrower boundary or a clearer distinction.' },
  'propose-protocol': { label: 'Protocol candidate', summary: 'The reviewed source can support a conservative practical protocol.' },
  'watch': { label: 'Watch, do not prescribe', summary: 'The signal is worth tracking, but the source does not justify a practical prescription.' },
  'support-existing': { label: 'Supports existing guidance', summary: 'The reviewed source is consistent with an existing Brali boundary.' },
  'retire-claim': { label: 'Retire claim', summary: 'The reviewed source makes an existing claim unsuitable for continued publication.' }
};
const decisionMeta = decision => labels[decision] ?? { label: clean(decision).replaceAll('-', ' '), summary: 'Reviewed evidence decision.' };

const records = decisions.map(decision => ({
  schema_version: 1,
  id: decision.id,
  canonical_url: `${BASE}/evidence/${decision.id}/`,
  json_url: `${BASE}/evidence/${decision.id}/index.json`,
  decision: decision.decision,
  decision_label: decisionMeta(decision.decision).label,
  reviewed_at: decision.reviewed_at,
  reviewed_by: decision.reviewed_by,
  source: {
    title: decision.source_title,
    url: decision.source_url,
    type: decision.source_type,
    doi: decision.doi ?? null,
    citation_text: decision.citation_text ?? null,
    study_design: decision.study_design ?? null,
    population: decision.population ?? null,
    intervention_or_exposure: decision.intervention_or_exposure ?? null,
    outcomes: decision.outcomes ?? []
  },
  supported_claim: decision.supported_claim,
  unsupported_or_overstated_claims: decision.unsupported_or_overstated_claims ?? [],
  limitations: decision.limitations ?? [],
  target_hack_ids: decision.target_hack_ids ?? [],
  target_protocol_ids: decision.target_protocol_ids ?? [],
  risk_flags: decision.risk_flags ?? [],
  notes: decision.notes ?? null
}));

const counts = records.reduce((acc, record) => { acc[record.decision] = (acc[record.decision] ?? 0) + 1; return acc; }, {});
const unsupportedCount = records.reduce((sum, record) => sum + record.unsupported_or_overstated_claims.length, 0);
const ledger = {
  schema_version: 1,
  updated_at: records.map(r => r.reviewed_at).sort().at(-1),
  name: 'Brali Evidence Ledger',
  description: 'Reviewed source-by-source decisions showing what evidence supports, what it does not establish, its limitations, and how Brali changes guidance in response.',
  methodology_url: `${BASE}/methodology/`,
  evidence_dataset_url: `${BASE}/life-os/datasets/evidence-decisions.json`,
  count: records.length,
  decision_counts: counts,
  unsupported_or_overstated_claim_count: unsupportedCount,
  entries: records
};
writeJson('evidence/index.json', ledger);

const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/problems/">Problems</a><a href="/topics/">Topics</a><a href="/evidence/">Evidence</a><a href="/research/">Research</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · practical knowledge with visible evidence boundaries</small><div class="footer-links"><a href="/methodology/">Methodology</a><a href="/life-os/datasets/">Data</a><a href="/cite/">Cite Brali</a></div></div></footer>`;
const head = ({ title, description, canonical, schema }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${BASE}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`;

for (const record of records) {
  writeJson(`evidence/${record.id}/index.json`, record);
  const meta = decisionMeta(record.decision);
  const sourceDetails = [
    record.source.type ? `<li><strong>Source type:</strong> ${esc(record.source.type)}</li>` : '',
    record.source.study_design ? `<li><strong>Design:</strong> ${esc(record.source.study_design)}</li>` : '',
    record.source.population ? `<li><strong>Population:</strong> ${esc(record.source.population)}</li>` : '',
    record.source.intervention_or_exposure ? `<li><strong>Exposure / intervention:</strong> ${esc(record.source.intervention_or_exposure)}</li>` : '',
    record.source.outcomes.length ? `<li><strong>Outcomes:</strong> ${esc(record.source.outcomes.join('; '))}</li>` : ''
  ].join('');
  const affected = record.target_hack_ids.length
    ? `<div class="grid two">${record.target_hack_ids.map(slug => `<article class="card"><span class="card-label">Affected Brali protocol</span><h3><a href="/life-os/${esc(slug)}/">${esc(slug.replaceAll('-', ' '))}</a></h3><p>This evidence decision is attached to the maintained Brali entry above. The public protocol may be narrowed, reviewed, or kept practical according to the decision.</p></article>`).join('')}</div>`
    : '<p>No maintained protocol is directly changed by this decision yet. The evidence remains a research boundary or watch signal.</p>';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Evidence review: ${record.source.title}`,
    description: record.supported_claim,
    url: record.canonical_url,
    datePublished: record.reviewed_at,
    dateModified: record.reviewed_at,
    publisher: { '@type': 'Organization', name: 'Brali', url: BASE },
    citation: record.source.url,
    about: record.source.outcomes.map(outcome => ({ '@type': 'Thing', name: outcome }))
  };
  write(`evidence/${record.id}/index.html`, `${head({ title: `Evidence review: ${record.source.title} | Brali`, description: record.supported_claim, canonical: record.canonical_url, schema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Evidence Ledger · ${esc(meta.label)} · reviewed ${esc(record.reviewed_at)}</p><h1>${esc(record.source.title)}</h1><p class="lead">${esc(meta.summary)}</p><div class="callout"><strong>Brali decision:</strong> ${esc(meta.label)}. This page summarizes a reviewed evidence boundary; it does not reproduce the source and it does not turn one paper into a universal prescription.</div><section class="prose"><h2>What the source supports</h2><p>${esc(record.supported_claim)}</p><h2>What it does not establish</h2><ul>${list(record.unsupported_or_overstated_claims)}</ul><h2>Important limitations</h2><ul>${list(record.limitations)}</ul></section><section><h2>Source context</h2><div class="card"><h3><a href="${esc(record.source.url)}" rel="noopener">${esc(record.source.title)}</a></h3><ul>${sourceDetails}</ul>${record.source.citation_text ? `<p><strong>Citation:</strong> ${esc(record.source.citation_text)}</p>` : ''}${record.source.doi ? `<p><strong>DOI:</strong> ${esc(record.source.doi)}</p>` : ''}</div></section><section><h2>What this changes in Brali</h2>${affected}${record.notes ? `<div class="callout"><strong>Editorial note:</strong> ${esc(record.notes)}</div>` : ''}</section><section class="prose"><h2>Use the boundary, not just the headline</h2><p>When an AI agent or a person retrieves this decision, preserve both the supported claim and the unsupported or overstated claims. Dropping the boundary would turn a reviewed source into a stronger claim than Brali actually maintains.</p><p><a href="/evidence/">All Evidence Decisions →</a> · <a href="/research/">Research & trends →</a> · <a href="/evidence/${esc(record.id)}/index.json">Machine-readable review →</a></p></section></main>${footer}</body></html>\n`);
}

const cards = records.map(record => {
  const meta = decisionMeta(record.decision);
  return `<article class="card"><span class="card-label">${esc(meta.label)} · ${esc(record.reviewed_at)}</span><h2><a href="/evidence/${esc(record.id)}/">${esc(record.source.title)}</a></h2><p>${esc(record.supported_claim)}</p><p><strong>Boundaries recorded:</strong> ${record.unsupported_or_overstated_claims.length} · <strong>Limitations:</strong> ${record.limitations.length}</p></article>`;
}).join('');
const claimExamples = records.flatMap(record => record.unsupported_or_overstated_claims.slice(0, 2).map(claim => ({ claim, id: record.id }))).slice(0, 10).map(item => `<li>${esc(item.claim)} <a href="/evidence/${esc(item.id)}/">See review →</a></li>`).join('');
const countCards = Object.entries(counts).map(([decision, count]) => `<article class="card"><span class="metric">${count}</span><h3>${esc(decisionMeta(decision).label)}</h3><p>${esc(decisionMeta(decision).summary)}</p></article>`).join('');
const indexSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Brali Evidence Ledger',
  description: ledger.description,
  url: `${BASE}/evidence/`,
  hasPart: records.map(record => ({ '@type': 'Article', name: `Evidence review: ${record.source.title}`, url: record.canonical_url }))
};
write('evidence/index.html', `${head({ title: 'Evidence Ledger: what research supports and what it does not | Brali', description: ledger.description, canonical: `${BASE}/evidence/`, schema: indexSchema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Brali Evidence Ledger</p><h1>What the evidence supports, and where Brali draws the line.</h1><p class="lead">A source-by-source ledger of reviewed claims, limitations, overstatements, and changes to Brali guidance. The useful part of evidence is often the sentence after “but”.</p><div class="grid three">${countCards}</div><div class="callout"><strong>${records.length} reviewed decisions · ${unsupportedCount} explicit boundaries.</strong> Discovery candidates do not appear here until a source has been reviewed and an Evidence Decision has been recorded.</div><section><h2>Reviewed Evidence Decisions</h2><div class="grid two">${cards}</div></section><section class="prose"><h2>Claims Brali deliberately does not make</h2><p>These are examples of claims that a reviewed source did not justify strongly enough for Brali to publish as established guidance.</p><ul>${claimExamples}</ul></section><section class="prose"><h2>For researchers and AI systems</h2><p>Use <a href="/evidence/index.json">the machine-readable ledger</a> or the canonical <a href="/life-os/datasets/evidence-decisions.json">Evidence Decisions dataset</a>. Preserve supported claims, unsupported claims, limitations, source URLs, and the Brali decision together.</p><p><a href="/methodology/">How Brali reviews content →</a> · <a href="/trends/evidence/">Evidence Trends →</a> · <a href="/cite/">Citation guidance →</a></p></section></main>${footer}</body></html>\n`);

const inject = (rel, marker, block) => {
  const file = path.join(ROOT, rel); if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8'); if (html.includes(marker)) return false;
  html = html.replace('</main>', `${block}</main>`); fs.writeFileSync(file, html); return true;
};
inject('research/index.html', 'data-brali-evidence-ledger', `<aside class="callout" data-brali-evidence-ledger><h3>Read the decisions, not just the research feed.</h3><p>The <a href="/evidence/">Brali Evidence Ledger</a> shows what each reviewed source supports, what it does not establish, and what changed in the library.</p></aside>`);
inject('trends/evidence/index.html', 'data-brali-evidence-ledger', `<aside class="callout" data-brali-evidence-ledger><h3>Open the underlying evidence decisions</h3><p><a href="/evidence/">Evidence Ledger</a> exposes the source-by-source claims and boundaries behind these monthly trends.</p></aside>`);

const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('/evidence/')) llms += `\n- Evidence Ledger: ${BASE}/evidence/\n- Evidence Ledger JSON: ${BASE}/evidence/index.json\n- Reviewed Evidence Decisions: ${BASE}/life-os/datasets/evidence-decisions.json\n`;
  fs.writeFileSync(llmsPath, llms);
}

console.log(`Evidence Ledger built: ${records.length} reviewed decisions, ${unsupportedCount} unsupported/overstated claim boundaries.`);
