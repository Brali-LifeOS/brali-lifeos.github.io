import fs from "node:fs";
import path from "node:path";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mergeKeyed(target, additions, label) {
  target.entries ||= {};
  for (const [key, value] of Object.entries(additions ?? {})) {
    if (target.entries[key]) {
      if (!same(target.entries[key], value)) throw new Error(`Conflicting ${label} in review registries: ${key}`);
      continue;
    }
    target.entries[key] = value;
  }
}

function mergeList(target, key, additions, label) {
  target[key] ||= [];
  const byId = new Map(target[key].map((entry) => [entry.id, entry]));
  for (const entry of additions ?? []) {
    const existing = byId.get(entry.id);
    if (existing) {
      if (!same(existing, entry)) throw new Error(`Conflicting ${label} in review registries: ${entry.id}`);
      continue;
    }
    target[key].push(entry);
    byId.set(entry.id, entry);
  }
}

export function loadReviewRegistry(root) {
  const dataRoot = path.join(root, "data");
  const evidenceOverrides = clone(read(path.join(dataRoot, "evidence-overrides.json")));
  const ontologyOverrides = clone(read(path.join(dataRoot, "ontology-overrides.json")));
  const evidenceDecisions = clone(read(path.join(dataRoot, "evidence-decisions.json")));
  const researchCandidates = clone(read(path.join(dataRoot, "research-candidates.json")));

  const supplemental = fs.readdirSync(dataRoot)
    .filter((name) => /^review-registry-.*\.json$/.test(name))
    .sort();

  const loaded = [];
  for (const name of supplemental) {
    const document = read(path.join(dataRoot, name));
    if (document.schema_version !== 1) throw new Error(`${name}: review registry schema_version must be 1`);
    loaded.push(name);
    mergeKeyed(evidenceOverrides, document.evidence_overrides, "evidence override");
    mergeKeyed(ontologyOverrides, document.ontology_overrides, "ontology override");
    mergeList(evidenceDecisions, "entries", document.evidence_decisions, "Evidence Decision id");
    mergeList(researchCandidates, "candidates", document.research_candidates, "research candidate id");
  }

  evidenceDecisions.entries.sort((a, b) => a.id.localeCompare(b.id));
  researchCandidates.candidates.sort((a, b) => a.id.localeCompare(b.id));
  return { evidenceOverrides, ontologyOverrides, evidenceDecisions, researchCandidates, supplemental: loaded };
}
