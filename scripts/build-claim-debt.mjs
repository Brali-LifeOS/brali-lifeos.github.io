import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  claimCategoryOrder,
  claimRules,
  detectClaimMarkers,
  extractPublicText,
  resolveMarkerSupport
} from './lib/claim-integrity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const readJson = (rel, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch (error) { if (fallback !== null) return fallback; throw error; }
};
const writeText = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const writeJson = (rel, value) => writeText(rel, `${JSON.stringify(value, null, 2)}\n`);
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const escapeHtml = value => clean(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);
const digest = text => crypto.createHash('sha256').update(text).digest('hex');

const platform = readJson('data/platform.json');
const sourceIndex = readJson('data/life-os-content/index.json');
const evidence = readJson('life-os/datasets/evidence.json', { entries: [] });
const protocols = readJson('life-os/datasets/protocols.json', { entries: [] });
const decisions = readJson('data/evidence-decisions.json', { entries: [] });
const registry = readJson('data/claim-review-registry.json', { entries: [] });

const sourceBySlug = new Map(sourceIndex.map(item => [item.slug, item]));
const protocolBySlug = new Map((protocols.entries || []).map(item => [item.slug, item]));
const categoryOrder = claimCategoryOrder();
const categories = Object.fromEntries(categoryOrder.map(category => [category, {
  detected: 0,
  supported: 0,
  unsupported: 0,
  blocking_indexable: 0,
  withheld_review: 0
}]));
const evidenceStates = {};
const entries = [];
let pagesScanned = 0;

for (const record of evidence.entries || []) {
  const slug = record.slug;
  const htmlRel = `life-os/${slug}/index.html`;
  if (!exists(htmlRel)) continue;
  pagesScanned += 1;
  const html = fs.readFileSync(path.join(ROOT, htmlRel), 'utf8');
  const markers = detectClaimMarkers(extractPublicText(html));
  if (!markers.length) continue;

  const source = sourceBySlug.get(slug) || {};
  const protocol = protocolBySlug.get(slug) || null;
  const resolvedMarkers = markers.map(marker => {
    const support = resolveMarkerSupport({
      marker,
      slug,
      protocolId: protocol?.protocol_id,
      evidenceRecord: record,
      decisions: decisions.entries || [],
      registry
    });
    const blocking = Boolean(record.indexable) && !support.supported;
    const withheld = !record.indexable && !support.supported;
    const bucket = categories[marker.category];
    bucket.detected += 1;
    if (support.supported) bucket.supported += 1;
    else bucket.unsupported += 1;
    if (blocking) bucket.blocking_indexable += 1;
    if (withheld) bucket.withheld_review += 1;
    return {
      id: marker.id,
      category: marker.category,
      excerpt: marker.excerpt,
      supported: support.supported,
      support_route: support.route,
      approval_id: support.approval_id,
      evidence_decision_ids: support.evidence_decision_ids,
      blocking,
      withheld
    };
  });

  evidenceStates[record.status] = (evidenceStates[record.status] || 0) + resolvedMarkers.length;
  const topics = (record.ontology?.topics || []).map(item => ({ id: item.id, title: item.title || item.id }));
  entries.push({
    slug,
    title: clean(protocol?.title || source.title || slug),
    canonical_url: `${BASE}/life-os/${slug}/`,
    evidence_status: record.status,
    indexable: Boolean(record.indexable),
    sensitive: Boolean(record.sensitive),
    growth_zone: source.zone ? { slug: source.zone.slug, title: source.zone.title } : null,
    topics,
    marker_count: resolvedMarkers.length,
    supported_marker_count: resolvedMarkers.filter(item => item.supported).length,
    unsupported_marker_count: resolvedMarkers.filter(item => !item.supported).length,
    blocking_marker_count: resolvedMarkers.filter(item => item.blocking).length,
    withheld_marker_count: resolvedMarkers.filter(item => item.withheld).length,
    markers: resolvedMarkers
  });
}

entries.sort((a, b) =>
  b.blocking_marker_count - a.blocking_marker_count ||
  b.unsupported_marker_count - a.unsupported_marker_count ||
  a.slug.localeCompare(b.slug)
);

const totalMarkers = entries.reduce((sum, item) => sum + item.marker_count, 0);
const supportedMarkers = entries.reduce((sum, item) => sum + item.supported_marker_count, 0);
const unsupportedMarkers = entries.reduce((sum, item) => sum + item.unsupported_marker_count, 0);
const blockingMarkers = entries.reduce((sum, item) => sum + item.blocking_marker_count, 0);
const withheldMarkers = entries.reduce((sum, item) => sum + item.withheld_marker_count, 0);
const blockingPages = entries.filter(item => item.blocking_marker_count > 0).length;

const report = {
  schema_version: 1,
  detector_version: 1,
  dataset_version: platform.dataset_version,
  canonical_url: `${BASE}/life-os/datasets/claim-debt.json`,
  public_summary_url: `${BASE}/state/claims/`,
  policy: {
    enforced_categories: categoryOrder,
    rules: claimRules(),
    support_paths: [
      'Exact excerpt approval in data/claim-review-registry.json linked to reviewed Evidence Decisions.',
      'For research-appeal, causal, and mechanism markers only: a reviewed record mapped to at least one source-reviewed Evidence Decision with a bounded supported claim.'
    ],
    blocking_rule: 'An unsupported enforced marker on an indexable page is a build-blocking trust defect.',
    withheld_rule: 'An unsupported marker on a non-indexable page remains visible as editorial debt but does not leak into normal discovery.'
  },
  summary: {
    pages_scanned: pagesScanned,
    pages_with_markers: entries.length,
    pages_without_markers: Math.max(0, pagesScanned - entries.length),
    total_markers: totalMarkers,
    supported_markers: supportedMarkers,
    unsupported_markers: unsupportedMarkers,
    blocking_indexable_unsupported_markers: blockingMarkers,
    blocking_indexable_pages: blockingPages,
    withheld_review_markers: withheldMarkers,
    registry_approvals: (registry.entries || []).length,
    evidence_states: evidenceStates,
    categories
  },
  entries,
  limitations: [
    'This deterministic detector catches a maintained set of high-confidence claim markers; a clean report is not proof that every sentence is evidence-supported.',
    'A source URL alone never resolves claim debt. Support requires a source-reviewed Evidence Decision and bounded public wording, or an explicit excerpt-level approval linked to such decisions.',
    'Durations, step counts, dates, identifiers, and ordinary practical language are intentionally not treated as quantitative evidence claims by default.',
    'Human source review remains required for meaning, population, intervention, outcomes, limitations, safety, and whether public wording stays inside the reviewed boundary.'
  ]
};

writeJson('life-os/datasets/claim-debt.json', report);
writeJson('state/claims/index.json', report);
writeJson(`api/${platform.api_version}/claim-debt.json`, report);

const categoryCards = categoryOrder.map(category => {
  const row = categories[category];
  return `<article class="card"><span class="card-label">${escapeHtml(category)}</span><h2>${row.detected}</h2><p>${row.supported} supported · ${row.blocking_indexable} blocking · ${row.withheld_review} withheld.</p></article>`;
}).join('');
const blockingList = entries.filter(item => item.blocking_marker_count > 0);
const withheldList = entries.filter(item => item.withheld_marker_count > 0);
const renderEntry = item => `<li><a href="/life-os/${escapeHtml(item.slug)}/">${escapeHtml(item.title)}</a><span>${escapeHtml(item.evidence_status)} · ${item.blocking_marker_count || item.withheld_marker_count} unresolved marker(s)</span><small>${escapeHtml(item.markers.filter(marker => !marker.supported).map(marker => marker.category).join(' · '))}</small></li>`;
const blockingSection = blockingList.length
  ? `<ul class="article-list">${blockingList.slice(0, 50).map(renderEntry).join('')}</ul>`
  : '<p>No unsupported enforced marker is currently exposed on an indexable page.</p>';
const withheldSection = withheldList.length
  ? `<ul class="article-list">${withheldList.slice(0, 50).map(renderEntry).join('')}</ul>`
  : '<p>No additional enforced marker is waiting behind a review boundary.</p>';
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Claim integrity state — Brali</title><meta name="description" content="Deterministic Brali claim-debt report for quantitative, first-party, causal, mechanism, clinical, research-appeal, and guarantee markers."><link rel="canonical" href="${BASE}/state/claims/"><meta property="og:type" content="website"><meta property="og:title" content="Brali claim integrity state"><meta property="og:description" content="See which enforced claim markers are supported, blocked from indexing, or still waiting for editorial review."><meta property="og:url" content="${BASE}/state/claims/"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><link rel="alternate" type="application/json" href="/state/claims/index.json"></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/state/">State</a><a href="/state/quality/">Page quality</a><a href="/life-os/methodology/">Methodology</a><a href="/life-os/datasets/">Data</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Trust reset · machine checked</p><h1>Claim integrity state</h1><p class="lead">Brali treats unsupported precision as debt, not decoration. This report scans the public corpus for maintained high-confidence claim markers, checks evidence state and traceable review, and blocks unsupported markers from indexable pages.</p><div class="grid three"><article class="card"><span class="card-label">Pages scanned</span><h2>${pagesScanned}</h2><p>${entries.length} pages contain at least one enforced marker.</p></article><article class="card"><span class="card-label">Indexable blockers</span><h2>${blockingMarkers}</h2><p>${blockingPages} page(s) would fail the trust gate.</p></article><article class="card"><span class="card-label">Withheld debt</span><h2>${withheldMarkers}</h2><p>Markers retained only behind pending-review or restricted boundaries.</p></article></div><section class="prose"><h2>By claim type</h2><div class="grid three">${categoryCards}</div></section><section class="prose"><h2>Indexable blockers</h2>${blockingSection}</section><section class="prose"><h2>Withheld review debt</h2>${withheldSection}</section><section class="prose"><h2>Interpretation boundary</h2><p>A zero here does not mean every sentence has been scientifically proven. It means no maintained high-confidence marker is both unsupported and indexable. Actual-source review still decides whether wording matches the studied population, intervention, outcomes, limitations, and safety boundary.</p><p><a href="/life-os/datasets/claim-debt.json">Download the full claim-debt report →</a> · <a href="/docs/CLAIM_INTEGRITY.md">Read the claim-integrity contract →</a></p></section></main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Evidence-aware protocols with explicit trust boundaries.</small></div><div class="footer-links"><a href="/state/">State</a><a href="/life-os/datasets/">Datasets</a><a href="/cite/">Cite</a><a href="/for-ai/">For AI</a></div></div></footer></body></html>`;
writeText('state/claims/index.html', page);

function upsertApiDiscovery() {
  const apiIndexRel = `api/${platform.api_version}/index.json`;
  const apiIndex = readJson(apiIndexRel);
  apiIndex.endpoints = [...new Set([...(apiIndex.endpoints || []), 'claim-debt.json'])].sort();
  writeJson(apiIndexRel, apiIndex);

  const openapiRel = `api/${platform.api_version}/openapi.json`;
  const openapi = readJson(openapiRel);
  openapi.paths ||= {};
  openapi.paths[`/api/${platform.api_version}/claim-debt.json`] = {
    get: {
      operationId: 'get_claim_debt',
      summary: 'Get the current deterministic claim-integrity report',
      responses: {
        '200': {
          description: 'Claim-integrity report',
          content: { 'application/json': { schema: { type: 'object' } } }
        }
      }
    }
  };
  writeJson(openapiRel, openapi);
}

function upsertManifestFile() {
  const rel = 'life-os/datasets/claim-debt.json';
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const manifest = readJson('life-os/datasets/manifest.json');
  const item = {
    path: rel,
    sha256: digest(text),
    bytes: Buffer.byteLength(text),
    count: report.entries.length
  };
  manifest.files = [...(manifest.files || []).filter(entry => entry.path !== rel), item]
    .sort((a, b) => a.path.localeCompare(b.path));
  manifest.counts ||= {};
  manifest.counts.files = manifest.files.length;
  manifest.counts.claim_debt_pages = report.entries.length;
  manifest.counts.claim_debt_markers = report.summary.total_markers;
  writeJson('life-os/datasets/manifest.json', manifest);
  writeJson(`api/${platform.api_version}/manifest.json`, manifest);
}

function exposePublicLinks() {
  const datasetsRel = 'life-os/datasets/index.html';
  if (exists(datasetsRel)) {
    let html = fs.readFileSync(path.join(ROOT, datasetsRel), 'utf8');
    if (!html.includes('/life-os/datasets/claim-debt.json')) {
      html = html.replace('</ul>', '<li><a href="/life-os/datasets/claim-debt.json">Claim-integrity debt report (JSON)</a></li></ul>');
      writeText(datasetsRel, html);
    }
  }

  const stateRel = 'state/index.html';
  if (exists(stateRel)) {
    let html = fs.readFileSync(path.join(ROOT, stateRel), 'utf8');
    if (!html.includes('/state/claims/')) {
      html = html.replace('</main>', '<aside class="callout" data-claim-integrity-state><h2>Claim integrity</h2><p>Inspect quantitative, first-party, causal, mechanism, clinical, research-appeal, and guarantee markers across the public corpus.</p><a class="button" href="/state/claims/">Open claim-integrity state →</a></aside></main>');
      writeText(stateRel, html);
    }
  }

  const llmsRel = 'llms.txt';
  if (exists(llmsRel)) {
    let text = fs.readFileSync(path.join(ROOT, llmsRel), 'utf8');
    if (!text.includes('Claim Integrity State:')) {
      text = `${text.trimEnd()}\nClaim Integrity State: ${BASE}/state/claims/\nClaim Debt JSON: ${BASE}/life-os/datasets/claim-debt.json\n`;
      writeText(llmsRel, text);
    }
  }
}

upsertApiDiscovery();
upsertManifestFile();
exposePublicLinks();
console.log(`Claim integrity built: ${pagesScanned} pages, ${totalMarkers} markers, ${blockingMarkers} indexable blocker(s), ${withheldMarkers} withheld marker(s).`);
