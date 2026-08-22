import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectClaims } from './lib/claim-taxonomy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/claim-taxonomy.json'), 'utf8'));
if (fixtures.schema_version !== 1 || (fixtures.cases ?? []).length < 12) {
  throw new Error('Claim taxonomy fixtures are missing or incomplete.');
}
for (const item of fixtures.cases) {
  const actual = [...inspectClaims(item.text).categories].sort();
  const expected = [...(item.expected_categories ?? [])].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Claim taxonomy fixture ${item.id} failed: expected [${expected}], got [${actual}]`);
  }
}
console.log(`Claim taxonomy fixtures passed: ${fixtures.cases.length} cases.`);
