import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetRel = 'life-os/datasets/zone-coverage-backlog.json';
const manifestRel = 'life-os/datasets/manifest.json';
const datasetPath = path.join(ROOT, datasetRel);
const manifestPath = path.join(ROOT, manifestRel);
const platform = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/platform.json'), 'utf8'));
const text = fs.readFileSync(datasetPath, 'utf8');
const doc = JSON.parse(text);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

manifest.files = (manifest.files ?? []).filter(entry => (typeof entry === 'string' ? entry : entry.path) !== datasetRel && (typeof entry === 'string' ? entry : entry.path) !== 'zone-coverage-backlog.json');
manifest.files.push({
  path: datasetRel,
  sha256: hash(text),
  bytes: Buffer.byteLength(text),
  count: Array.isArray(doc.zones) ? doc.zones.length : null
});
manifest.files.sort((a, b) => String(a.path || a).localeCompare(String(b.path || b)));
manifest.zone_coverage_backlog = {
  zero_trust_zones: doc.zero_trust_zone_count,
  purpose: 'Editorial triage only; candidate ranking never changes evidence status automatically.'
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const apiManifestPath = path.join(ROOT, `api/${platform.api_version}/manifest.json`);
fs.writeFileSync(apiManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Zone coverage backlog manifest synced: ${datasetRel}; ${doc.zero_trust_zone_count} zero-trust zones.`);
