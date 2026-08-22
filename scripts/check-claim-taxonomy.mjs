import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectClaims } from './lib/claim-taxonomy.mjs';

const root = process.cwd();
const fixtures = JSON.parse(await readFile(path.join(root, 'data/claim-gate-fixtures.json'), 'utf8'));

if (fixtures.schema_version !== 1) {
  throw new Error(`Unexpected claim-gate fixture schema: ${fixtures.schema_version}`);
}
if (!Array.isArray(fixtures.cases) || fixtures.cases.length < 8) {
  throw new Error('Claim-gate fixture set is unexpectedly small.');
}

const normalize = values => [...new Set(values ?? [])].sort();
const same = (left, right) => JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
const failures = [];

for (const fixture of fixtures.cases) {
  const result = inspectClaims(fixture.text);
  if (!same(result.categories, fixture.expected_categories)) {
    failures.push(`${fixture.id}: categories=${JSON.stringify(normalize(result.categories))}, expected=${JSON.stringify(normalize(fixture.expected_categories))}`);
  }
  if (!same(result.enforcedCategories, fixture.expected_enforced_categories)) {
    failures.push(`${fixture.id}: enforced=${JSON.stringify(normalize(result.enforcedCategories))}, expected=${JSON.stringify(normalize(fixture.expected_enforced_categories))}`);
  }
}

if (failures.length) {
  throw new Error(`Claim taxonomy regression fixture failure:\n- ${failures.join('\n- ')}`);
}

console.log(`Claim taxonomy fixtures passed: ${fixtures.cases.length} case(s).`);
