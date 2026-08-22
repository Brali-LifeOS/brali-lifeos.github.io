import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { detectClaimMarkers } from './lib/claim-integrity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(`Claim-integrity validation failed: ${message}`); };

const required = [
  'data/claim-review-registry.json',
  'contracts/claim-review.schema.json',
  'scripts/fixtures/claim-integrity.json',
  'docs/CLAIM_INTEGRITY.md',
  'life-os/datasets/claim-debt.json',
  'state/claims/index.html',
  'state/claims/index.json'
];
for (const rel of required) if (!exists(rel)) fail(`missing ${rel}`);

const platform = read('data/platform.json');
const registry = read('data/claim-review-registry.json');
const schema = read('contracts/claim-review.schema.json');
const fixtures = read('scripts/fixtures/claim-integrity.json');
const report = read('life-os/datasets/claim-debt.json');
const apiReport = read(`api/${platform.api_version}/claim-debt.json`);

if (schema.$id !== 'https://brali-lifeos.github.io/contracts/claim-review.schema.json') fail('claim-review schema $id drift');
if (schema.title !== 'Brali Claim Review Registry') fail('claim-review schema title drift');
if (registry.schema_version !== 1 || !Array.isArray(registry.entries)) fail('claim-review registry shape drift');
const approvalIds = new Set();
for (const item of registry.entries) {
  if (!item.id || approvalIds.has(item.id)) fail(`invalid or duplicate approval id ${item.id}`);
  approvalIds.add(item.id);
  if (!item.slug || !(item.categories?.length > 0) || !(item.evidence_decision_ids?.length > 0)) fail(`${item.id}: incomplete approval`);
  if (!item.approved_excerpt || item.approved_excerpt.length < 12) fail(`${item.id}: approved_excerpt is too vague`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.reviewed_at || '')) fail(`${item.id}: invalid reviewed_at`);
  if (!item.reviewed_by) fail(`${item.id}: missing reviewed_by`);
}

if (fixtures.schema_version !== 1 || !(fixtures.cases?.length >= 12)) fail('claim fixtures are missing or too small');
for (const fixture of fixtures.cases) {
  const actual = [...new Set(detectClaimMarkers(fixture.text).map(marker => marker.id))].sort();
  const expected = [...(fixture.expected_marker_ids || [])].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`fixture ${fixture.id}: expected [${expected}], got [${actual}]`);
}

if (report.schema_version !== 1 || report.detector_version !== 1) fail('unexpected report version');
if (report.dataset_version !== platform.dataset_version) fail('dataset version drift');
if (JSON.stringify(report) !== JSON.stringify(apiReport)) fail('API claim-debt report differs from canonical report');
if (report.summary.pages_scanned !== read('data/life-os-content/index.json').length) fail('page scan coverage drift');
if (report.summary.pages_with_markers !== report.entries.length) fail('pages_with_markers drift');

const flattened = report.entries.flatMap(entry => entry.markers.map(marker => ({ entry, marker })));
const total = flattened.length;
const supported = flattened.filter(({ marker }) => marker.supported).length;
const unsupported = flattened.filter(({ marker }) => !marker.supported).length;
const blocking = flattened.filter(({ marker }) => marker.blocking).length;
const withheld = flattened.filter(({ marker }) => marker.withheld).length;
if (report.summary.total_markers !== total) fail('total marker count drift');
if (report.summary.supported_markers !== supported) fail('supported marker count drift');
if (report.summary.unsupported_markers !== unsupported) fail('unsupported marker count drift');
if (report.summary.blocking_indexable_unsupported_markers !== blocking) fail('blocking marker count drift');
if (report.summary.withheld_review_markers !== withheld) fail('withheld marker count drift');
if (report.summary.blocking_indexable_pages !== report.entries.filter(entry => entry.blocking_marker_count > 0).length) fail('blocking page count drift');
if (blocking !== 0) {
  const examples = flattened.filter(({ marker }) => marker.blocking).slice(0, 12).map(({ entry, marker }) => `${entry.slug}:${marker.category}:${marker.id}`);
  fail(`${blocking} unsupported marker(s) remain indexable: ${examples.join(', ')}`);
}

for (const { entry, marker } of flattened) {
  if (marker.supported && !(marker.evidence_decision_ids?.length > 0)) fail(`${entry.slug}:${marker.id} is supported without a reviewed decision`);
  if (marker.blocking && (!entry.indexable || marker.supported)) fail(`${entry.slug}:${marker.id} blocking semantics drift`);
  if (marker.withheld && (entry.indexable || marker.supported)) fail(`${entry.slug}:${marker.id} withheld semantics drift`);
}

const manifest = read('life-os/datasets/manifest.json');
const manifestItem = (manifest.files || []).find(item => item.path === 'life-os/datasets/claim-debt.json');
if (!manifestItem) fail('claim-debt report missing from dataset manifest');
const reportText = fs.readFileSync(path.join(ROOT, manifestItem.path), 'utf8');
if (manifestItem.sha256 !== hash(reportText) || manifestItem.bytes !== Buffer.byteLength(reportText)) fail('claim-debt manifest checksum drift');
if (JSON.stringify(read(`api/${platform.api_version}/manifest.json`)) !== JSON.stringify(manifest)) fail('API manifest differs from canonical manifest');

const apiIndex = read(`api/${platform.api_version}/index.json`);
if (!(apiIndex.endpoints || []).includes('claim-debt.json')) fail('API index does not expose claim-debt.json');
const openapi = read(`api/${platform.api_version}/openapi.json`);
if (!openapi.paths?.[`/api/${platform.api_version}/claim-debt.json`]) fail('OpenAPI does not expose claim debt');

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/state/claims/</loc>')) fail('claim-integrity state missing from sitemap');
const stateHtml = fs.readFileSync(path.join(ROOT, 'state/claims/index.html'), 'utf8');
if (!stateHtml.includes('Claim integrity state') || !stateHtml.includes('/life-os/datasets/claim-debt.json')) fail('claim-integrity public summary incomplete');
const datasetHtml = fs.readFileSync(path.join(ROOT, 'life-os/datasets/index.html'), 'utf8');
if (!datasetHtml.includes('/life-os/datasets/claim-debt.json')) fail('dataset catalog does not expose claim debt');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!llms.includes('Claim Integrity State:') || !llms.includes('Claim Debt JSON:')) fail('llms.txt does not expose claim integrity');

if (!(report.limitations || []).some(item => /not proof/i.test(item))) fail('report must state that a clean detector is not proof of evidence support');
console.log(`Claim integrity verified: ${report.summary.pages_scanned} pages, ${total} markers, ${supported} supported, ${withheld} withheld, zero indexable blockers, ${fixtures.cases.length} regression fixtures.`);
