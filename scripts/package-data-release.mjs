import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/platform.json'), 'utf8'));
const arg = process.argv.indexOf('--version'); const version = arg >= 0 ? process.argv[arg + 1] : config.dataset_version;
if (!version || !/^[0-9A-Za-z._-]+$/.test(version)) throw new Error('Invalid --version');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'life-os/datasets/manifest.json'), 'utf8'));
const out = path.join(ROOT, 'releases', `${config.release_prefix || 'data-v'}${version}`); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const files = [];
for (const item of manifest.files || []) { const src = path.join(ROOT, item.path); if (!fs.existsSync(src)) continue; const dest = path.join(out, item.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); files.push({ path: item.path, sha256: crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex'), bytes: fs.statSync(src).size }); }
for (const rel of [`api/${config.api_version}/index.json`, `api/${config.api_version}/openapi.json`, `api/${config.api_version}/manifest.json`]) { const src = path.join(ROOT, rel); if (!fs.existsSync(src)) continue; const dest = path.join(out, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); files.push({ path: rel, sha256: crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex'), bytes: fs.statSync(src).size }); }
const release = { schema_version: 1, dataset_version: version, source_dataset_version: manifest.dataset_version, immutable_tag: `${config.release_prefix || 'data-v'}${version}`, files };
fs.writeFileSync(path.join(out, 'release-manifest.json'), `${JSON.stringify(release, null, 2)}\n`); fs.writeFileSync(path.join(out, 'SHA256SUMS'), `${files.map(x => `${x.sha256}  ${x.path}`).join('\n')}\n`);
console.log(`packaged ${files.length} files in releases/${config.release_prefix || 'data-v'}${version}`);
