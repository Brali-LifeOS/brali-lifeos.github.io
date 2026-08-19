import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SOURCE = path.join(ROOT, 'api', 'v1');
const TARGET = path.join(HERE, 'dist-data', 'api', 'v1');
const REQUIRED = ['index.json','topics.json','protocols.json','hacks.json','evidence.json','search.json','identity.json'];

if (!fs.existsSync(SOURCE)) {
  throw new Error('Brali API v1 is missing. Run `npm run build` from the repository root before packing the MCP package.');
}
fs.rmSync(path.join(HERE, 'dist-data'), { recursive: true, force: true });
fs.mkdirSync(TARGET, { recursive: true });
for (const name of REQUIRED) {
  const source = path.join(SOURCE, name);
  if (!fs.existsSync(source)) throw new Error(`Missing required API file: ${name}`);
  fs.copyFileSync(source, path.join(TARGET, name));
}
const manifest = {
  schema_version: 1,
  generated_from: 'Brali API v1',
  files: REQUIRED,
  dataset_version: JSON.parse(fs.readFileSync(path.join(SOURCE, 'index.json'), 'utf8')).dataset_version || null
};
fs.writeFileSync(path.join(HERE, 'dist-data', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared self-contained MCP package data: ${REQUIRED.length} API files.`);
