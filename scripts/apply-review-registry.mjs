import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReviewRegistry } from "./lib/review-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { evidenceOverrides, ontologyOverrides, evidenceDecisions, researchCandidates, supplemental } = loadReviewRegistry(ROOT);

const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const write = (relative, value) => {
  const file = path.join(ROOT, relative);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const correctionsPath = path.join(ROOT, "data/evidence-decision-corrections.json");
let appliedDecisionCorrections = 0;
if (fs.existsSync(correctionsPath)) {
  const corrections = read("data/evidence-decision-corrections.json");
  if (corrections.schema_version !== 1 || !corrections.entries || Array.isArray(corrections.entries)) {
    throw new Error("Evidence Decision corrections must use schema_version 1 and an entries object.");
  }
  const byId = new Map((evidenceDecisions.entries ?? []).map((entry) => [entry.id, entry]));
  for (const [id, patch] of Object.entries(corrections.entries)) {
    const decision = byId.get(id);
    if (!decision) throw new Error(`Evidence Decision correction references unknown decision: ${id}`);
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error(`Evidence Decision correction must be an object: ${id}`);
    if ("id" in patch || "candidate_id" in patch || "source_url" in patch || "source_title" in patch || "decision" in patch) {
      throw new Error(`Evidence Decision correction may not rewrite identity/source/decision fields: ${id}`);
    }
    Object.assign(decision, patch);
    appliedDecisionCorrections += 1;
  }
}

const incomplete = [];
for (const decision of evidenceDecisions.entries ?? []) {
  const missing = [];
  if (decision.source_reviewed !== true) missing.push("source_reviewed");
  if (!decision.source_url) missing.push("source_url");
  if (!decision.source_title) missing.push("source_title");
  if (!decision.supported_claim) missing.push("supported_claim");
  if (!(decision.unsupported_or_overstated_claims ?? []).length) missing.push("unsupported_or_overstated_claims");
  if (!(decision.limitations ?? []).length) missing.push("limitations");
  if (missing.length) incomplete.push(`${decision.id}: ${missing.join(", ")}`);
}
if (incomplete.length) {
  throw new Error(`Incomplete Evidence Decisions after corrections (${incomplete.length}):\n- ${incomplete.join("\n- ")}`);
}

write("data/evidence-overrides.json", evidenceOverrides);
write("data/ontology-overrides.json", ontologyOverrides);
write("data/evidence-decisions.json", evidenceDecisions);
write("data/research-candidates.json", researchCandidates);

await import("./apply-research-gap-resolutions.mjs");

console.log(`Review registry applied: ${supplemental.length} supplemental file(s); ${Object.keys(evidenceOverrides.entries ?? {}).length} evidence overrides; ${Object.keys(ontologyOverrides.entries ?? {}).length} ontology overrides; ${(evidenceDecisions.entries ?? []).length} Evidence Decisions; ${appliedDecisionCorrections} decision correction(s); ${(researchCandidates.candidates ?? []).length} research candidates.`);
