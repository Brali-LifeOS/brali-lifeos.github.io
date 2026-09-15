import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGoldReviewRegistry } from './lib/gold-review-registry.mjs';
import { matchProblems } from '../for-ai/query/retrieval.mjs';
import { validateSearchMeasurementContract } from './build-search-console-measurement.mjs';
import { validateProductIdentity } from './check-product-identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const cfg = read('data/problem-collections.json');
const dataset = read('problems/index.json');
const feed = read('life-os/datasets/protocols.json');
const platform = read('data/platform.json');
const acquisition = read('data/acquisition-clusters.json');
const benchmark = read('data/problem-discovery-benchmark.json');
const goldRegistry = await loadGoldReviewRegistry(ROOT);
const trusted = new Set(['reviewed', 'practical']);
const feedBySlug = new Map((feed.entries ?? []).map(p => [p.slug, p]));
const acquisitionIds = new Set((acquisition.clusters ?? []).map(item => item.id));
const normalize = value => String(value ?? '').toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

const searchMeasurement = validateSearchMeasurementContract();
const productIdentity = validateProductIdentity();
if ((cfg.collections ?? []).length < 10) throw new Error('Canonical Problem Discovery Graph requires at least 10 distinct problem guides.');
if (dataset.count !== (dataset.collections ?? []).length || dataset.count !== cfg.collections.length) throw new Error('Problem collection dataset count mismatch.');
const slugs = dataset.collections.map(c => c.slug);
if (new Set(slugs).size !== slugs.length) throw new Error('Problem collection slugs must be unique.');

const aliasOwner = new Map();
for (const source of cfg.collections ?? []) {
  if ((source.aliases ?? []).length < 2) throw new Error(`${source.slug} lacks discovery aliases.`);
  if (source.acquisition_cluster_id && !acquisitionIds.has(source.acquisition_cluster_id)) throw new Error(`${source.slug} references unknown acquisition cluster ${source.acquisition_cluster_id}.`);
  for (const alias of source.aliases ?? []) {
    const key = normalize(alias);
    if (!key) throw new Error(`${source.slug} contains an empty discovery alias.`);
    const previous = aliasOwner.get(key);
    if (previous && previous !== source.slug) throw new Error(`Duplicate discovery alias "${alias}" belongs to both ${previous} and ${source.slug}.`);
    aliasOwner.set(key, source.slug);
  }
  const edges = source.protocol_edges ?? [];
  if (edges.length < 2) throw new Error(`${source.slug} has fewer than two explicit protocol edges.`);
  if (new Set(edges.map(edge => edge.slug)).size !== edges.length) throw new Error(`${source.slug} repeats a protocol edge.`);
  const best = edges.filter(edge => edge.fit === 'best-fit');
  if (best.length !== 1) throw new Error(`${source.slug} must declare exactly one best-fit edge.`);
  for (const edge of edges) {
    for (const field of ['when', 'why', 'caveat']) if (!String(edge[field] ?? '').trim()) throw new Error(`${source.slug}/${edge.slug} lacks ${field}.`);
    const protocol = feedBySlug.get(edge.slug);
    if (!protocol) throw new Error(`${source.slug} references protocol outside the trusted feed: ${edge.slug}`);
    if (!trusted.has(protocol.evidence?.status)) throw new Error(`${source.slug} references non-trusted protocol: ${edge.slug}`);
    if (goldRegistry.entries?.[edge.slug]?.review_status !== 'gold-ready') throw new Error(`${source.slug} references protocol without Gold-ready review: ${edge.slug}`);
  }
}

for (const collection of dataset.collections) {
  if (collection.canonical_id !== `brali:problem:${collection.slug}`) throw new Error(`${collection.slug} canonical problem ID mismatch.`);
  if ((collection.decision_path ?? []).length < 3) throw new Error(`${collection.slug} lacks a three-step decision path.`);
  if (!collection.stop_rule) throw new Error(`${collection.slug} lacks a stop rule.`);
  if ((collection.protocols ?? []).length < 2) throw new Error(`${collection.slug} has fewer than two Gold-ready protocol edges.`);
  if (!collection.answer_packet?.best_fit?.slug) throw new Error(`${collection.slug} lacks a concise answer packet.`);
  const declaredBest = collection.protocols.find(protocol => protocol.fit === 'best-fit');
  if (!declaredBest || collection.answer_packet.best_fit.slug !== declaredBest.slug) throw new Error(`${collection.slug} answer packet best-fit drifted from the canonical edge.`);
  if (!fs.existsSync(path.join(ROOT, 'problems', collection.slug, 'index.html'))) throw new Error(`${collection.slug} HTML page is missing.`);
  if (!fs.existsSync(path.join(ROOT, 'problems', collection.slug, 'index.json'))) throw new Error(`${collection.slug} JSON page is missing.`);
  const html = fs.readFileSync(path.join(ROOT, 'problems', collection.slug, 'index.html'), 'utf8');
  if (!html.includes('<script type="application/ld+json">')) throw new Error(`${collection.slug} lacks structured data.`);
  if (!html.includes('Gold-ready') || !html.includes('Caveat:')) throw new Error(`${collection.slug} lacks visible trust/fit boundaries.`);
  if (/name=["']robots["'][^>]+noindex/i.test(html) || /noindex[^>]+name=["']robots["']/i.test(html)) throw new Error(`${collection.slug} is a curated problem guide but is marked noindex.`);
  for (const protocol of collection.protocols) {
    const source = feedBySlug.get(protocol.slug);
    if (!source) throw new Error(`${collection.slug} recommends protocol outside the trusted feed: ${protocol.slug}`);
    if (!trusted.has(source.evidence?.status)) throw new Error(`${collection.slug} recommends non-trusted protocol: ${protocol.slug}`);
    if (goldRegistry.entries?.[protocol.slug]?.review_status !== 'gold-ready') throw new Error(`${collection.slug} recommends protocol without Gold-ready review: ${protocol.slug}`);
    if (!protocol.gold_review?.first_action || !protocol.when || !protocol.why || !protocol.caveat) throw new Error(`${collection.slug}/${protocol.slug} lost enriched fit or Gold review data.`);
  }
}

const threshold = Number(benchmark.match_threshold || 12);
const discoveryFailures = [];
for (const test of benchmark.cases ?? []) {
  const matches = matchProblems(test.query, cfg.collections, 3);
  const winner = matches[0] && matches[0].score >= threshold ? matches[0] : null;
  const pass = test.expect_no_match ? !winner : winner?.problem?.slug === test.expected_problem_slug;
  if (!pass) discoveryFailures.push({ id: test.id, expected: test.expect_no_match ? 'no-match' : test.expected_problem_slug, observed: winner?.problem?.slug || 'no-match', score: winner?.score || 0 });
}
if (discoveryFailures.length) {
  const details = discoveryFailures.map(item => `${item.id}: expected=${item.expected} observed=${item.observed} score=${item.score}`).join('; ');
  throw new Error(`Problem discovery benchmark failed ${discoveryFailures.length}/${benchmark.cases.length}: ${details}`);
}

const api = read(`api/${platform.api_version}/problem-collections.json`);
if (api.count !== dataset.count) throw new Error('Problem Discovery API does not match public dataset.');
const apiIndex = read(`api/${platform.api_version}/index.json`);
if (!(apiIndex.endpoints ?? []).includes('problem-collections.json')) throw new Error('API index does not expose problem-collections.json.');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const route of ['/problems/', ...slugs.map(slug => `/problems/${slug}/`)]) {
  if (!sitemap.includes(`https://brali-lifeos.github.io${route}`)) throw new Error(`Sitemap lacks curated problem route ${route}`);
}
const questions = fs.readFileSync(path.join(ROOT, 'questions/index.html'), 'utf8');
if (!questions.includes('data-brali-problem-collections')) throw new Error('Questions page does not link to Problem Discovery Graph.');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!llms.includes('/problems/')) throw new Error('llms.txt does not expose Problem Discovery Graph.');

console.log(`Problem discovery graph verified: ${dataset.count} problems, ${aliasOwner.size} unique aliases, ${benchmark.cases.length}/${benchmark.cases.length} natural-language discovery cases, all protocol edges Gold-ready and trusted; product publisher=${productIdentity.publisher}; Search Console contract=${searchMeasurement.segment_count} stable segments.`);
