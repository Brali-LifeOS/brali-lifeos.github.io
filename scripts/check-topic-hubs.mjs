import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(`Topic hub validation failed: ${message}`); };
const config = read('data/topic-hubs.json');
const platform = read('data/platform.json');
const dataset = read('life-os/datasets/topic-hubs.json');
const api = read(`api/${platform.api_version}/hubs.json`);
const apiIndex = read(`api/${platform.api_version}/index.json`);
const openapi = read(`api/${platform.api_version}/openapi.json`);
const manifest = read('life-os/datasets/manifest.json');
const apiManifest = read(`api/${platform.api_version}/manifest.json`);
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
const expected = new Set(['sleep','focus','memory','stress','habits','learning','movement']);
const trusted = new Set(['reviewed','practical']);

if (config.schema_version !== 1 || dataset.schema_version !== 1) fail('unexpected schema version');
if ((config.hubs || []).length !== 7 || dataset.count !== 7 || (dataset.hubs || []).length !== 7) fail('expected exactly seven initial hubs');
const slugs = (dataset.hubs || []).map(hub => hub.slug);
if (new Set(slugs).size !== slugs.length || slugs.some(slug => !expected.has(slug))) fail('unexpected or duplicate hub slug');
if (JSON.stringify(api) !== JSON.stringify(dataset)) fail('API hubs endpoint differs from canonical dataset');
if (JSON.stringify(apiManifest) !== JSON.stringify(manifest)) fail('API manifest drift');
if (!(apiIndex.endpoints || []).includes('hubs.json')) fail('API index does not expose hubs.json');
if (!openapi.paths?.[`/api/${platform.api_version}/hubs.json`]) fail('OpenAPI does not describe hubs endpoint');

let protocolPlacements = 0;
let flagshipPlacements = 0;
let decisionPlacements = 0;
const linkedProtocols = new Set();
for (const hub of dataset.hubs || []) {
  if (!hub.title || !hub.summary || !hub.question || !(hub.topics || []).length) fail(`${hub.slug}: incomplete hub metadata`);
  if (!(hub.protocols || []).length) fail(`${hub.slug}: no trusted protocol recommendation`);
  const protocolSlugs = new Set();
  for (const protocol of hub.protocols || []) {
    protocolPlacements += 1;
    linkedProtocols.add(protocol.slug);
    if (protocolSlugs.has(protocol.slug)) fail(`${hub.slug}: duplicate protocol ${protocol.slug}`);
    protocolSlugs.add(protocol.slug);
    if (!trusted.has(protocol.evidence?.status)) fail(`${hub.slug}/${protocol.slug}: untrusted protocol state ${protocol.evidence?.status}`);
    if (!protocol.action) fail(`${hub.slug}/${protocol.slug}: missing action`);
    if (protocol.is_flagship_100) flagshipPlacements += 1;
    const protocolPage = path.join(ROOT, 'life-os', protocol.slug, 'index.html');
    if (!fs.existsSync(protocolPage)) fail(`${hub.slug}/${protocol.slug}: protocol page missing`);
    const protocolHtml = fs.readFileSync(protocolPage, 'utf8');
    if (!protocolHtml.includes(`/topics/${hub.slug}/`)) fail(`${hub.slug}/${protocol.slug}: reverse topic-hub link missing`);
  }
  for (const decision of hub.evidence_decisions || []) {
    decisionPlacements += 1;
    if (!decision.source_url || !decision.supported_claim || !decision.reviewed_at) fail(`${hub.slug}/${decision.id}: incomplete Evidence Decision`);
  }
  for (const item of hub.research_watch || []) if (item.evidence_state !== 'discovery-only') fail(`${hub.slug}/${item.id}: research discovery presented as evidence`);
  const individual = read(`topics/${hub.slug}/index.json`);
  if (JSON.stringify(individual) !== JSON.stringify(hub)) fail(`${hub.slug}: individual JSON differs from canonical hub dataset`);
  const pagePath = path.join(ROOT, 'topics', hub.slug, 'index.html');
  if (!fs.existsSync(pagePath)) fail(`${hub.slug}: page missing`);
  const html = fs.readFileSync(pagePath, 'utf8');
  if (!html.includes(`<link rel="canonical" href="https://brali-lifeos.github.io/topics/${hub.slug}/">`)) fail(`${hub.slug}: canonical URL missing`);
  if (!html.includes('application/ld+json') || !html.includes('CollectionPage')) fail(`${hub.slug}: structured data missing`);
  if (!html.includes(`/topics/${hub.slug}/index.json`) || !html.includes(`/api/${platform.api_version}/hubs.json`)) fail(`${hub.slug}: machine-readable links missing`);
  if (!sitemap.includes(`<loc>https://brali-lifeos.github.io/topics/${hub.slug}/</loc>`)) fail(`${hub.slug}: sitemap entry missing`);
}

const indexPage = fs.readFileSync(path.join(ROOT, 'topics/index.html'), 'utf8');
for (const slug of expected) if (!indexPage.includes(`/topics/${slug}/`)) fail(`topic index does not link ${slug}`);
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/topics/</loc>')) fail('topic index missing from sitemap');
for (const rel of ['index.html','life-os/index.html','research/index.html','ontology/index.html','for-ai/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('/topics/')) fail(`${rel}: topic-hub entry point missing`);
}
if (!llms.includes('## Topic Knowledge Hubs') || !llms.includes('/api/v1/hubs.json')) fail('llms.txt lacks Topic Hub orientation');

const published = ['data/topic-hubs.json','life-os/datasets/topic-hubs.json', ...slugs.map(slug => `topics/${slug}/index.json`)];
for (const rel of published) {
  const item = (manifest.files || []).find(entry => (typeof entry === 'string' ? entry : entry.path) === rel);
  if (!item || typeof item === 'string') fail(`manifest lacks hashed entry for ${rel}`);
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (item.sha256 !== digest(text)) fail(`manifest checksum mismatch for ${rel}`);
}
if (manifest.counts?.topic_hubs !== 7) fail('manifest topic_hubs count mismatch');
if (flagshipPlacements === 0) fail('no Flagship 100 protocol appears in Topic Hubs');

console.log(`Topic hubs verified: 7 hubs, ${linkedProtocols.size} unique trusted protocols across ${protocolPlacements} placements, ${flagshipPlacements} Flagship 100 placements, ${decisionPlacements} reviewed Evidence Decision placements.`);
