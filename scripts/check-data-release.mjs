import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = message => { throw new Error(`data release check failed: ${message}`); };
const config = readJson('data/platform.json');
const arg = process.argv.indexOf('--version');
const version = arg >= 0 ? process.argv[arg + 1] : config.dataset_version;
if (!version || version !== config.dataset_version) fail(`version ${version || '<missing>'} does not match dataset_version ${config.dataset_version}`);

const tag = `${config.release_prefix || 'data-v'}${version}`;
const out = path.join(ROOT, 'releases', tag);
if (!fs.existsSync(out)) fail(`missing releases/${tag}; run npm run release:data first`);
const release = JSON.parse(fs.readFileSync(path.join(out, 'release-manifest.json'), 'utf8'));
if (release.dataset_version !== version || release.source_dataset_version !== version) fail('release manifest version mismatch');
if (release.knowledge_schema_version !== config.schema_version) fail('knowledge schema version mismatch');
if (release.api_version !== config.api_version) fail('API version mismatch');
if (release.immutable_tag !== tag) fail('immutable tag mismatch');
if (JSON.stringify(release.trusted_evidence_states) !== JSON.stringify(['reviewed', 'practical'])) fail('trusted evidence-state contract mismatch');
if (JSON.stringify(release.non_trusted_evidence_states) !== JSON.stringify(['pending-review', 'restricted'])) fail('non-trusted evidence-state contract mismatch');
const sourceManifestPath = path.join(ROOT, 'life-os/datasets/manifest.json');
if (release.source_manifest_sha256 !== hashFile(sourceManifestPath)) fail('source manifest checksum mismatch');

const required = [
  'data/platform.json', 'CITATION.cff', 'LICENSE', 'LICENSING.md', 'SOURCE_POLICY.md', 'CONTENT_QUALITY.md',
  'docs/DATA_VERSIONING.md', `docs/releases/${version}.md`, 'life-os/datasets/manifest.json',
  `api/${config.api_version}/index.json`, `api/${config.api_version}/openapi.json`, `api/${config.api_version}/manifest.json`
];
const byPath = new Map();
for (const item of release.files || []) {
  if (!item.path || byPath.has(item.path)) fail(`duplicate or missing release path ${item.path}`);
  byPath.set(item.path, item);
  const file = path.join(out, item.path);
  if (!fs.existsSync(file)) fail(`release manifest references missing ${item.path}`);
  if (hashFile(file) !== item.sha256) fail(`checksum mismatch for ${item.path}`);
  if (fs.statSync(file).size !== item.bytes) fail(`byte count mismatch for ${item.path}`);
}
for (const rel of required) if (!byPath.has(rel)) fail(`required payload missing from manifest: ${rel}`);

const apiIndex = JSON.parse(fs.readFileSync(path.join(out, `api/${config.api_version}/index.json`), 'utf8'));
for (const endpoint of apiIndex.endpoints || []) if (!byPath.has(`api/${config.api_version}/${endpoint}`)) fail(`API endpoint not packaged: ${endpoint}`);

const sums = fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
const expected = (release.files || []).map(item => `${item.sha256}  ${item.path}`);
if (JSON.stringify(sums) !== JSON.stringify(expected)) fail('SHA256SUMS differs from release manifest');

const notes = fs.readFileSync(path.join(out, `docs/releases/${version}.md`), 'utf8');
if (!notes.includes(`Brali data ${version}`)) fail('release notes do not identify the release version');
if (!/## Known limitations/i.test(notes)) fail('release notes must contain Known limitations');
if (!/## Trust model/i.test(notes)) fail('release notes must contain Trust model');

console.log(`data release check passed: ${release.files.length} payload files for ${tag}`);
