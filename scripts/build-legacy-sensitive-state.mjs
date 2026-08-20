import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const json = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const backlog = read('life-os/datasets/zone-coverage-backlog.json');
const legacySensitive = (backlog.zones ?? []).filter(row => row.disposition === 'legacy-sensitive');
const emptyLegacy = (backlog.zones ?? []).filter(row => row.disposition === 'empty-legacy');
const withheldEntries = legacySensitive.reduce((sum, row) => sum + Number(row.entry_count || 0), 0);

const scopeNote = "This status describes Brali's current corpus, source matching, and editorial review state. It is not a scientific verdict about the efficacy or evidence base of the underlying therapy, school, or professional tradition.";
const recommendationNote = 'Current entries from these legacy collections are archive-only in Brali and must not be presented by Brali clients or AI integrations as trusted recommendations.';
const collections = legacySensitive.map(row => ({
  zone_slug: row.zone_slug,
  zone_title: row.zone_title,
  entry_count: row.entry_count,
  trusted_protocols: 0,
  disposition: row.disposition,
  recommendation_status: 'archive-only',
  archive_url: `${BASE}/life-os/${row.zone_slug}/`,
  decision_reason: row.decision_reason,
  next_action: row.next_action,
  scope_note: scopeNote,
}));
const emptyCollections = emptyLegacy.map(row => ({
  zone_slug: row.zone_slug,
  zone_title: row.zone_title,
  entry_count: row.entry_count,
  trusted_protocols: 0,
  disposition: row.disposition,
  recommendation_status: 'empty-legacy',
  archive_url: `${BASE}/life-os/${row.zone_slug}/`,
  decision_reason: row.decision_reason,
  next_action: row.next_action,
  scope_note: scopeNote,
}));

const output = {
  schema_version: 1,
  title: 'Legacy Sensitive Collections',
  purpose: 'Machine-readable transparency record for legacy Brali collections intentionally withheld from trusted recommendation.',
  recommendation_policy: recommendationNote,
  scope_note: scopeNote,
  counts: {
    archive_only_sensitive_collections: collections.length,
    withheld_legacy_entries: withheldEntries,
    empty_legacy_collections: emptyCollections.length,
    trusted_protocols_in_archive_only_sensitive_collections: 0,
  },
  collections,
  empty_legacy_collections: emptyCollections,
  canonical_url: `${BASE}/state/legacy-sensitive/`,
  dataset_url: `${BASE}/life-os/datasets/legacy-sensitive-collections.json`,
};
json('life-os/datasets/legacy-sensitive-collections.json', output);
json('state/legacy-sensitive/index.json', output);

const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/questions/">Questions</a><a href="/state/">State</a><a href="/research/">Research</a><a href="/updates/">Updates</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · practical knowledge for people and machines</small><div class="footer-links"><a href="/state/">State</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a></div></div></footer>`;
const schema = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Brali Legacy Sensitive Collections',
  description: output.purpose,
  url: output.canonical_url,
  distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: output.dataset_url }],
  measurementTechnique: 'Deterministic derivation from Brali zero-trust zone dispositions and trusted protocol feed',
};
const cards = collections.map(item => `<article class="card"><span class="card-label">Archive-only · ${esc(item.entry_count)} entries</span><h2>${esc(item.zone_title)}</h2><p>${esc(item.decision_reason)}</p><p><strong>Reconsideration path:</strong> ${esc(item.next_action)}</p><p><a href="/life-os/${esc(item.zone_slug)}/">Open preserved archive</a></p></article>`).join('');
const emptyCards = emptyCollections.map(item => `<article class="card"><span class="card-label">Empty legacy collection</span><h2>${esc(item.zone_title)}</h2><p>${esc(item.decision_reason)}</p><p>${esc(item.next_action)}</p></article>`).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legacy Sensitive Collections | Brali</title><meta name="description" content="Transparent record of legacy Brali collections intentionally kept archive-only until their current entries have a directly matching source and bounded public protocol."><link rel="canonical" href="${output.canonical_url}"><meta property="og:type" content="website"><meta property="og:title" content="Legacy Sensitive Collections | Brali"><meta property="og:description" content="Why some preserved Brali collections are intentionally excluded from trusted recommendation."><meta property="og:url" content="${output.canonical_url}"><meta property="og:image" content="${BASE}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Trust state · legacy corpus</p><h1>Legacy sensitive collections are preserved, not recommended.</h1><p class="lead">Brali keeps stable legacy URLs for compatibility and auditability, but the current entries in the collections below have not passed the source-to-protocol review required for normal trusted recommendation.</p><div class="grid two"><article class="card"><span class="card-label">Archive-only sensitive collections</span><h2>${collections.length}</h2><p>${withheldEntries} current legacy entries remain outside the trusted protocol feed.</p></article><article class="card"><span class="card-label">Empty legacy collections</span><h2>${emptyCollections.length}</h2><p>Empty compatibility collections are not filled merely to improve coverage statistics.</p></article></div><section class="prose"><h2>What this status means</h2><p>${esc(recommendationNote)}</p><h2>What it does not mean</h2><p>${esc(scopeNote)}</p></section><section><h2>Archive-only sensitive collections</h2><div class="grid two">${cards}</div></section>${emptyCards ? `<section><h2>Empty legacy collections</h2><div class="grid two">${emptyCards}</div></section>` : ''}<section class="prose"><h2>Machine-readable trust boundary</h2><p><a href="/state/legacy-sensitive/index.json">State JSON</a> · <a href="/life-os/datasets/legacy-sensitive-collections.json">Dataset JSON</a> · <a href="/life-os/datasets/zone-coverage-backlog.json">Zero-trust backlog JSON</a> · <a href="/state/">State of Practical Knowledge</a> · <a href="/life-os/methodology/">Content methodology</a></p></section></main>${footer}</body></html>\n`;
write('state/legacy-sensitive/index.html', html);

const statePath = path.join(ROOT, 'state/index.html');
if (fs.existsSync(statePath)) {
  let stateHtml = fs.readFileSync(statePath, 'utf8');
  if (!stateHtml.includes('/state/legacy-sensitive/')) {
    const callout = `<p><a href="/state/legacy-sensitive/">Legacy Sensitive Collections →</a> See which preserved archives are intentionally excluded from trusted recommendation and why.</p>`;
    stateHtml = stateHtml.replace('<h2>Machine-readable snapshot</h2>', `<h2>Intentional trust boundaries</h2>${callout}<h2>Machine-readable snapshot</h2>`);
    fs.writeFileSync(statePath, stateHtml);
  }
}

const dataIndexPath = path.join(ROOT, 'life-os/datasets/index.html');
if (fs.existsSync(dataIndexPath)) {
  let dataHtml = fs.readFileSync(dataIndexPath, 'utf8');
  if (!dataHtml.includes('/life-os/datasets/legacy-sensitive-collections.json')) {
    dataHtml = dataHtml.replace('</ul>', '<li><a href="/life-os/datasets/legacy-sensitive-collections.json">Legacy sensitive collections trust state (JSON)</a></li></ul>');
    fs.writeFileSync(dataIndexPath, dataHtml);
  }
}

const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('/state/legacy-sensitive/')) {
    llms += `\n## Intentional archive-only boundaries\n\nLegacy sensitive collections: ${BASE}/state/legacy-sensitive/\nMachine-readable trust state: ${BASE}/life-os/datasets/legacy-sensitive-collections.json\nThese statuses describe Brali's current corpus/review state and must not be interpreted as scientific verdicts on the underlying therapy or school.\n`;
    fs.writeFileSync(llmsPath, llms);
  }
}

console.log(`Legacy sensitive state built: ${collections.length} archive-only sensitive collections, ${withheldEntries} withheld entries, ${emptyCollections.length} empty legacy collection(s).`);
