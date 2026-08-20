import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const fail = message => { throw new Error(`legacy sensitive state check failed: ${message}`); };

const backlog = read('life-os/datasets/zone-coverage-backlog.json');
const state = read('state/legacy-sensitive/index.json');
const dataset = read('life-os/datasets/legacy-sensitive-collections.json');
const manifest = read('life-os/datasets/manifest.json');
const expectedSensitive = (backlog.zones ?? []).filter(row => row.disposition === 'legacy-sensitive');
const expectedEmpty = (backlog.zones ?? []).filter(row => row.disposition === 'empty-legacy');
const expectedEntryCount = expectedSensitive.reduce((sum, row) => sum + Number(row.entry_count || 0), 0);

if (JSON.stringify(state) !== JSON.stringify(dataset)) fail('state JSON differs from canonical legacy-sensitive dataset');
if (state.counts?.archive_only_sensitive_collections !== expectedSensitive.length) fail('archive-only sensitive collection count drift');
if (state.counts?.withheld_legacy_entries !== expectedEntryCount) fail('withheld legacy entry count drift');
if (state.counts?.empty_legacy_collections !== expectedEmpty.length) fail('empty legacy collection count drift');
if (state.counts?.trusted_protocols_in_archive_only_sensitive_collections !== 0) fail('trusted protocol count must remain zero for archive-only sensitive collections');

const expectedSensitiveSlugs = expectedSensitive.map(row => row.zone_slug).sort();
const actualSensitiveSlugs = (state.collections ?? []).map(row => row.zone_slug).sort();
if (JSON.stringify(expectedSensitiveSlugs) !== JSON.stringify(actualSensitiveSlugs)) fail('legacy-sensitive collection membership drift');
const expectedEmptySlugs = expectedEmpty.map(row => row.zone_slug).sort();
const actualEmptySlugs = (state.empty_legacy_collections ?? []).map(row => row.zone_slug).sort();
if (JSON.stringify(expectedEmptySlugs) !== JSON.stringify(actualEmptySlugs)) fail('empty legacy membership drift');

for (const collection of state.collections ?? []) {
  if (collection.disposition !== 'legacy-sensitive') fail(`${collection.zone_slug} is not legacy-sensitive`);
  if (collection.recommendation_status !== 'archive-only') fail(`${collection.zone_slug} must be archive-only`);
  if (Number(collection.entry_count || 0) <= 0) fail(`${collection.zone_slug} must contain legacy entries`);
  if (Number(collection.trusted_protocols || 0) !== 0) fail(`${collection.zone_slug} unexpectedly has trusted protocols`);
  if (!collection.decision_reason || !collection.next_action || !collection.scope_note) fail(`${collection.zone_slug} missing trust-boundary metadata`);
  const pagePath = path.join(ROOT, 'life-os', collection.zone_slug, 'index.html');
  if (!fs.existsSync(pagePath)) fail(`missing archive page for ${collection.zone_slug}`);
  const pageHtml = fs.readFileSync(pagePath, 'utf8');
  if (!/<meta\s+name=["']robots["'][^>]*noindex/i.test(pageHtml)) fail(`${collection.zone_slug} archive page must remain noindex`);
}
for (const collection of state.empty_legacy_collections ?? []) {
  if (collection.disposition !== 'empty-legacy' || Number(collection.entry_count || 0) !== 0) fail(`${collection.zone_slug} empty legacy state is invalid`);
}

const htmlPath = path.join(ROOT, 'state/legacy-sensitive/index.html');
if (!fs.existsSync(htmlPath)) fail('missing legacy-sensitive state HTML');
const html = fs.readFileSync(htmlPath, 'utf8');
for (const phrase of ['Legacy sensitive collections are preserved, not recommended.', 'not a scientific verdict', 'Machine-readable trust boundary']) if (!html.includes(phrase)) fail(`state HTML missing boundary phrase: ${phrase}`);

const stateHub = fs.readFileSync(path.join(ROOT, 'state/index.html'), 'utf8');
if (!stateHub.includes('/state/legacy-sensitive/')) fail('State hub does not link legacy-sensitive transparency page');
const dataHub = fs.readFileSync(path.join(ROOT, 'life-os/datasets/index.html'), 'utf8');
if (!dataHub.includes('/life-os/datasets/legacy-sensitive-collections.json')) fail('dataset hub does not link legacy-sensitive dataset');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!llms.includes('/state/legacy-sensitive/') || !llms.includes('scientific verdict')) fail('llms.txt does not expose the archive-only boundary');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/state/legacy-sensitive/</loc>')) fail('sitemap missing legacy-sensitive state route');

const manifestEntry = (manifest.files ?? []).find(entry => (typeof entry === 'string' ? entry : entry.path) === 'life-os/datasets/legacy-sensitive-collections.json');
if (!manifestEntry) fail('canonical manifest does not include legacy-sensitive dataset');
if (manifest.legacy_sensitive_collections?.archive_only_sensitive_collections !== expectedSensitive.length) fail('manifest legacy-sensitive summary drift');

console.log(`Legacy sensitive state verified: ${expectedSensitive.length} archive-only sensitive collections, ${expectedEntryCount} withheld legacy entries, ${expectedEmpty.length} empty legacy collection(s), all archive pages noindex.`);
