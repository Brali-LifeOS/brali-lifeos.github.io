import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReviewRegistry } from "./lib/review-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { evidenceOverrides, ontologyOverrides, evidenceDecisions, researchCandidates, supplemental } = loadReviewRegistry(ROOT);

const write = (relative, value) => {
  const file = path.join(ROOT, relative);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

write("data/evidence-overrides.json", evidenceOverrides);
write("data/ontology-overrides.json", ontologyOverrides);
write("data/evidence-decisions.json", evidenceDecisions);
write("data/research-candidates.json", researchCandidates);

console.log(`Review registry applied: ${supplemental.length} supplemental file(s); ${Object.keys(evidenceOverrides.entries ?? {}).length} evidence overrides; ${Object.keys(ontologyOverrides.entries ?? {}).length} ontology overrides; ${(evidenceDecisions.entries ?? []).length} Evidence Decisions; ${(researchCandidates.candidates ?? []).length} research candidates.`);
