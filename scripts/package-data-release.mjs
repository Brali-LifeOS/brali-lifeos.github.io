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
const addGenerated = (outDir, rel, text, files, role) => {
  const destination = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, text);
  const bytes = Buffer.from(text);
  files.push({ path: rel, role, sha256: digest(bytes), bytes: bytes.length });
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

const datasetCard = `---\npretty_name: Brali Practical Knowledge Library\nlicense: cc-by-nc-sa-4.0\nlanguage:\n- en\n- ru\ntags:\n- practical-knowledge\n- ai-agents\n- evidence\n- retrieval\n- agent-skills\n---\n\n# Brali Practical Knowledge Library — ${tag}\n\nThis directory is the Hugging Face-ready mirror package for the immutable Brali release \`${tag}\`. Publish or mirror this exact release rather than a moving snapshot of \`main\`.\n\nSource release: https://github.com/Brali-LifeOS/brali-lifeos.github.io/releases/tag/${tag}\nCanonical project: https://brali-lifeos.github.io/\nCitation: \`CITATION.cff\`\nLicense: CC BY-NC-SA 4.0; commercial use requires separate permission under the repository licensing policy.\n\n## Contents\n\nThe release contains Brali's canonical machine-readable datasets, Knowledge API v1 surface, evidence states, provenance metadata, Agent Skills metadata, and Brali Bench evaluation artifacts. The authoritative inventory and checksums are in \`release-manifest.json\` and \`SHA256SUMS\`.\n\n## Trust model\n\nNormal trusted retrieval is limited to records marked \`reviewed\` or \`practical\`. \`pending-review\` and \`restricted\` records must not be silently promoted into recommendations. Research discovery candidates are leads, not evidence. Preserve canonical IDs, evidence state, source boundaries, and deliberate no-answer behavior downstream.\n\n## Evaluation\n\nBrali Bench is included as a deterministic retrieval/grounding evaluation artifact. It tests relevance, provenance, evidence boundaries, safety/no-answer behavior and a usefulness proxy. It is not a benchmark of an unpinned language model.\n\n## Reproducibility\n\nUse the immutable tag, verify \`SHA256SUMS\`, and cite the exact \`data-v*\` release. Do not describe a Hugging Face mirror, DOI, downloads, or citations as live until the relevant external provider exposes a verifiable public artifact.\n`;
addGenerated(out, 'README.md', datasetCard, files, 'dataset-card');

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
  distribution: {
    huggingface: { ready_to_mirror: true, dataset_card: 'README.md', source_tag: tag, public_mirror_url: null },
    zenodo: { ready_to_archive: true, metadata_source: 'CITATION.cff', source_tag: tag, doi: null }
  },
  files
};
fs.writeFileSync(path.join(out, 'release-manifest.json'), `${JSON.stringify(release, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'SHA256SUMS'), `${files.map(item => `${item.sha256}  ${item.path}`).join('\n')}\n`);
console.log(`packaged ${files.length} files in releases/${tag}; Hugging Face card ready; Zenodo metadata source=CITATION.cff`);
