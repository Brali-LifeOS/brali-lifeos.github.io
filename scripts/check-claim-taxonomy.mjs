import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectClaims, claimCategoryDefinitions } from './lib/claim-taxonomy.mjs';

const root = process.cwd();
const fixtures = JSON.parse(await readFile(path.join(root, 'data/claim-taxonomy-fixtures.json'), 'utf8'));
const fail = message => { throw new Error(`Claim taxonomy check failed: ${message}`); };
const sorted = values => [...values].sort((a, b) => a.localeCompare(b));
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

if (fixtures.schema_version !== 2) fail(`unexpected fixture schema_version ${fixtures.schema_version}`);
if (!(fixtures.cases?.length >= 10)) fail('at least ten regression cases are required');

const known = new Set(claimCategoryDefinitions.map(item => item.id));
const ids = new Set();
for (const definition of claimCategoryDefinitions) {
  if (!definition.id || typeof definition.enforced !== 'boolean' || typeof definition.decision_required !== 'boolean' || !definition.description) {
    fail('malformed category definition');
  }
}

for (const testCase of fixtures.cases) {
  if (!testCase.id || ids.has(testCase.id)) fail(`missing or duplicate fixture id ${testCase.id}`);
  ids.add(testCase.id);
  for (const category of [
    ...(testCase.expected_categories ?? []),
    ...(testCase.expected_enforced_categories ?? []),
    ...(testCase.expected_decision_required_categories ?? []),
  ]) {
    if (!known.has(category)) fail(`${testCase.id}: unknown expected category ${category}`);
  }

  const result = inspectClaims(testCase.text, { exampleLimitPerCategory: 2 });
  if (!same(result.categories, testCase.expected_categories ?? [])) {
    fail(`${testCase.id}: categories ${JSON.stringify(result.categories)} != ${JSON.stringify(testCase.expected_categories ?? [])}`);
  }
  if (!same(result.enforcedCategories, testCase.expected_enforced_categories ?? [])) {
    fail(`${testCase.id}: enforced categories ${JSON.stringify(result.enforcedCategories)} != ${JSON.stringify(testCase.expected_enforced_categories ?? [])}`);
  }
  if (!same(result.decisionRequiredCategories, testCase.expected_decision_required_categories ?? [])) {
    fail(`${testCase.id}: decision-required categories ${JSON.stringify(result.decisionRequiredCategories)} != ${JSON.stringify(testCase.expected_decision_required_categories ?? [])}`);
  }
  for (const marker of result.markers) {
    if (!marker.examples?.length) fail(`${testCase.id}: marker ${marker.category} has no example`);
  }
}

const definitions = new Map(claimCategoryDefinitions.map(definition => [definition.id, definition]));
for (const id of ['quantitative', 'first-party-result', 'guarantee', 'clinical-outcome', 'causal-effect', 'mechanism']) {
  if (!definitions.get(id)?.decision_required) fail(`${id}: must remain decision-gated`);
}
if (definitions.get('research-language')?.decision_required) fail('research-language must remain monitor-only');
if (definitions.get('causal-effect')?.enforced) fail('causal-effect must not become a broad regex blocker');
if (definitions.get('mechanism')?.enforced) fail('mechanism must not become a broad regex blocker');

console.log(`Claim taxonomy verified: ${claimCategoryDefinitions.length} categories across ${fixtures.cases.length} regression cases, including decision-gate and false-positive controls.`);
