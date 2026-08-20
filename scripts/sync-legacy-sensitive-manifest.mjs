import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetRel = 'life-os/datasets/legacy-sensitive-collections.json';
const manifestRel = 'life-os/datasets/manifest.json';
const platform = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/platform.json'), 'utf8'));
const text = fs.readFileSync(path.join(ROOT, datasetRel), 'utf8');
const doc = JSON.parse(text);
const manifestPath = path.join(ROOT, manifestRel);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

manifest.files = (manifest.files ?? []).filter(entry => (typeof entry === 'string' ? entry : entry.path) !== datasetRel && (typeof entry === 'string' ? entry : entry.path) !== 'legacy-sensitive-collections.json');
manifest.files.push({
  path: datasetRel,
  sha256: hash(text),
  bytes: Buffer.byteLength(text),
  count: Array.isArray(doc.collections) ? doc.collections.length : null
});
manifest.files.sort((a, b) => String(a.path || a).localeCompare(String(b.path || b)));
manifest.legacy_sensitive_collections = {
  archive_only_sensitive_collections: doc.counts?.archive_only_sensitive_collections ?? 0,
  withheld_legacy_entries: doc.counts?.withheld_legacy_entries ?? 0,
  empty_legacy_collections: doc.counts?.empty_legacy_collections ?? 0,
  scope: 'Brali corpus/review state only; not a scientific verdict on the underlying therapy or school.'
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(ROOT, `api/${platform.api_version}/manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Legacy sensitive manifest synced: ${doc.counts?.archive_only_sensitive_collections ?? 0} archive-only sensitive collection(s).`);
