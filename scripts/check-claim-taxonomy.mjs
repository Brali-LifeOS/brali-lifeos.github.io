import assert from "node:assert/strict";
import { claimCategoryDefinitions, inspectClaims } from "./lib/claim-taxonomy.mjs";

const categories = (text) => new Set(inspectClaims(text).categories);
const required = (text) => new Set(inspectClaims(text).decisionRequiredCategories);

const fixtures = [
  {
    name: "percentage",
    text: "The reported improvement was 24% in the measured outcome.",
    category: "quantitative",
    decisionRequired: true,
  },
  {
    name: "effect estimate",
    text: "The meta-analysis reported Hedges' g = 0.42 for the outcome.",
    category: "quantitative",
    decisionRequired: true,
  },
  {
    name: "sample size",
    text: "The cohort included 105 participants.",
    category: "quantitative",
    decisionRequired: true,
  },
  {
    name: "first party",
    text: "In our pilot we observed a change after the protocol.",
    category: "first-party-result",
    decisionRequired: true,
  },
  {
    name: "causal",
    text: "This leads to improved memory after the learning session.",
    category: "causal-effect",
    decisionRequired: true,
  },
  {
    name: "mechanism",
    text: "The explanation relies on dopamine and neuroplasticity.",
    category: "mechanism",
    decisionRequired: true,
  },
  {
    name: "clinical",
    text: "This technique treats anxiety symptoms.",
    category: "clinical-outcome",
    decisionRequired: true,
  },
  {
    name: "research language",
    text: "A systematic review examined several versions of the practice.",
    category: "research-language",
    decisionRequired: false,
  },
];

for (const fixture of fixtures) {
  assert(categories(fixture.text).has(fixture.category), `${fixture.name}: expected ${fixture.category}`);
  assert.equal(required(fixture.text).has(fixture.category), fixture.decisionRequired, `${fixture.name}: decision requirement drift`);
}

for (const text of [
  "Choose one small action and review what happened.",
  "Use two notes to compare the options before deciding.",
  "The project includes a research page and a protocol library.",
]) {
  const result = inspectClaims(text);
  assert.equal(result.enforcedCategories.length, 0, `false positive enforced marker: ${text}`);
  assert.equal(result.decisionRequiredCategories.length, 0, `false positive decision-required marker: ${text}`);
}

const byId = new Map(claimCategoryDefinitions.map((definition) => [definition.id, definition]));
for (const id of ["quantitative", "first-party-result", "guarantee", "clinical-outcome", "causal-effect", "mechanism"]) {
  assert.equal(byId.get(id)?.decision_required, true, `${id}: must remain decision-gated`);
}
assert.equal(byId.get("research-language")?.decision_required, false, "research-language should remain monitor-only");
assert.equal(byId.get("causal-effect")?.enforced, false, "causal-effect should not become a broad regex blocker");
assert.equal(byId.get("mechanism")?.enforced, false, "mechanism should not become a broad regex blocker");

console.log(`Claim taxonomy regression fixtures passed: ${fixtures.length} positive cases plus false-positive controls.`);
