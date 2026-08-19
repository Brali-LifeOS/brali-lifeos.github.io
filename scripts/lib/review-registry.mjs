import fs from "node:fs";
import path from "node:path";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

function assertUnique(existing, key, label) {
  if (existing.has(key)) throw new Error(`Duplicate ${label} in review registries: ${key}`);
  existing.add(key);
}

export function loadReviewRegistry(root) {
  const dataRoot = path.join(root, "data");
  const evidenceOverrides = clone(read(path.join(dataRoot, "evidence-overrides.json")));
  const ontologyOverrides = clone(read(path.join(dataRoot, "ontology-overrides.json")));
  const evidenceDecisions = clone(read(path.join(dataRoot, "evidence-decisions.json")));
  const researchCandidates = clone(read(path.join(dataRoot, "research-candidates.json")));

  const evidenceKeys = new Set(Object.keys(evidenceOverrides.entries ?? {}));
  const ontologyKeys = new Set(Object.keys(ontologyOverrides.entries ?? {}));
  const decisionIds = new Set((evidenceDecisions.entries ?? []).map((entry) => entry.id));
  const candidateIds = new Set((researchCandidates.candidates ?? []).map((entry) => entry.id));

  const supplemental = fs.readdirSync(dataRoot)
    .filter((name) => /^review-registry-.*\.json$/.test(name))
    .sort();

  const loaded = [];
  for (const name of supplemental) {
    const document = read(path.join(dataRoot, name));
    if (document.schema_version !== 1) throw new Error(`${name}: review registry schema_version must be 1`);
    loaded.push(name);

    for (const [slug, entry] of Object.entries(document.evidence_overrides ?? {})) {
      assertUnique(evidenceKeys, slug, "evidence override");
      evidenceOverrides.entries[slug] = entry;
    }
    for (const [slug, entry] of Object.entries(document.ontology_overrides ?? {})) {
      assertUnique(ontologyKeys, slug, "ontology override");
      ontologyOverrides.entries[slug] = entry;
    }
    for (const entry of document.evidence_decisions ?? []) {
      assertUnique(decisionIds, entry.id, "Evidence Decision id");
      evidenceDecisions.entries.push(entry);
    }
    for (const entry of document.research_candidates ?? []) {
      assertUnique(candidateIds, entry.id, "research candidate id");
      researchCandidates.candidates.push(entry);
    }
  }

  evidenceDecisions.entries.sort((a, b) => a.id.localeCompare(b.id));
  researchCandidates.candidates.sort((a, b) => a.id.localeCompare(b.id));
  return { evidenceOverrides, ontologyOverrides, evidenceDecisions, researchCandidates, supplemental: loaded };
}
