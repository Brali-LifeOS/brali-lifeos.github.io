import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const copyPayload = (sourceRel, outDir, files, role) => {
  const source = path.join(ROOT, sourceRel);
  if (!fs.existsSync(source)) throw new Error(`Missing release payload: ${sourceRel}`);
  const destination = path.join(outDir, sourceRel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  const bytes = fs.readFileSync(source);
  files.push({ path: sourceRel, role, sha256: digest(bytes), bytes: bytes.length });
};

const config = readJson('data/platform.json');
const arg = process.argv.indexOf('--version');
const version = arg >= 0 ? process.argv[arg + 1] : config.dataset_version;
if (!version || !/^[0-9A-Za-z._-]+$/.test(version)) throw new Error('Invalid --version');
if (version !== config.dataset_version) throw new Error(`Release version ${version} does not match data/platform.json dataset_version ${config.dataset_version}`);

const manifest = readJson('life-os/datasets/manifest.json');
if (manifest.dataset_version !== version) throw new Error(`Manifest dataset_version ${manifest.dataset_version} does not match release version ${version}`);
if (manifest.api_version !== config.api_version) throw new Error(`Manifest api_version ${manifest.api_version} does not match ${config.api_version}`);

const tag = `${config.release_prefix || 'data-v'}${version}`;
const out = path.join(ROOT, 'releases', tag);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = [];
const seen = new Set();
const add = (rel, role) => {
  if (seen.has(rel)) return;
  seen.add(rel);
  copyPayload(rel, out, files, role);
};

add('life-os/datasets/manifest.json', 'dataset-manifest');
for (const item of manifest.files || []) add(item.path, 'dataset');

const apiDir = `api/${config.api_version}`;
const apiIndex = readJson(`${apiDir}/index.json`);
for (const rel of [`${apiDir}/index.json`, `${apiDir}/openapi.json`, `${apiDir}/manifest.json`, ...(apiIndex.endpoints || []).map(name => `${apiDir}/${name}`)]) add(rel, 'api');

const releaseNotes = `docs/releases/${version}.md`;
for (const rel of ['data/platform.json', 'CITATION.cff', 'LICENSE', 'LICENSING.md', 'SOURCE_POLICY.md', 'CONTENT_QUALITY.md', 'docs/DATA_VERSIONING.md', releaseNotes]) add(rel, 'metadata');

files.sort((a, b) => a.path.localeCompare(b.path));
const release = {
  schema_version: 1,
  dataset_version: version,
  source_dataset_version: manifest.dataset_version,
  knowledge_schema_version: config.schema_version,
  api_version: config.api_version,
  immutable_tag: tag,
  canonical_site: 'https://brali-lifeos.github.io',
  source_manifest_sha256: digest(fs.readFileSync(path.join(ROOT, 'life-os/datasets/manifest.json'))),
  trusted_evidence_states: ['reviewed', 'practical'],
  non_trusted_evidence_states: ['pending-review', 'restricted'],
  citation_file: 'CITATION.cff',
  license_file: 'LICENSE',
  release_notes_file: releaseNotes,
  files
};
fs.writeFileSync(path.join(out, 'release-manifest.json'), `${JSON.stringify(release, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'SHA256SUMS'), `${files.map(item => `${item.sha256}  ${item.path}`).join('\n')}\n`);
console.log(`packaged ${files.length} files in releases/${tag}`);
