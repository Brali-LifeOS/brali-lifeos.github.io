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
if (!canonical.includes('canonical URL')) fail('router must preserve canonical identity');
console.log(`Router skill distribution verified: ${copies.length} external packages exactly match the canonical brali-life-os skill.`);
