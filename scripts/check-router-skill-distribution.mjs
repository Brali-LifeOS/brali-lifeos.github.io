import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = message => { throw new Error(`router skill distribution check failed: ${message}`); };
const canonical = fs.readFileSync(path.join(ROOT, 'agent-skills/skills/brali-life-os/SKILL.md'), 'utf8');
const copies = [
  'distribution/github-skill/skills/brali-life-os/SKILL.md',
  'distribution/clawhub/brali-life-os/SKILL.md'
];
for (const rel of copies) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) fail(`missing ${rel}`);
  if (fs.readFileSync(file, 'utf8') !== canonical) fail(`${rel} drifted from the canonical router`);
}
if (!canonical.includes('If no trusted protocol clearly fits')) fail('router must preserve deliberate no-answer behavior');
if (!canonical.includes('reviewed') || !canonical.includes('practical')) fail('router must preserve trusted evidence states');
if (!canonical.includes('canonical URL') || !canonical.includes('stable Brali protocol ID')) fail('router must preserve canonical identity');
if (!canonical.includes('provenance') || !canonical.includes('stop/change rules')) fail('router must preserve provenance and safety/stop metadata');
if (!canonical.includes('Do not assume a public hosted Remote MCP endpoint exists')) fail('router must not invent hosted MCP availability');
if (!canonical.includes('api/v1/integrations.json')) fail('router must use machine-readable integration availability');
if (!canonical.includes('/ru/manifest.json') || !canonical.includes('/de/manifest.json')) fail('router must inspect locale release manifests');
if (!canonical.includes('/ru/llms.txt') || !canonical.includes('/de/llms.txt')) fail('router must expose locale-aware machine guides');
if (!canonical.includes('No silent fallback')) fail('router must preserve explicit locale fallback semantics');
if (!canonical.includes('public static API/catalog') || !canonical.includes('Use local MCP only when')) fail('router must choose an actually available interface');
console.log(`Router skill distribution verified: ${copies.length} external packages exactly match the canonical brali-life-os skill; interface, trust, provenance, locale and no-answer boundaries are explicit.`);
