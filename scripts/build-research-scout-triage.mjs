import fs from "node:fs";
import path from "node:path";
import { loadReviewRegistry } from "./lib/review-registry.mjs";
import { buildSourceResearchTriage } from "./lib/research-triage.mjs";

const root = process.cwd();
const sourcePath = path.join(root, "data", "research-candidates.json");
const outputPath = path.join(root, "data", "research-triage.json");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const { evidenceDecisions, researchCandidates } = loadReviewRegistry(root);

if (!Array.isArray(researchCandidates.candidates)) throw new Error("Effective research candidates must contain candidates[]");
if (!Array.isArray(evidenceDecisions.entries)) throw new Error("Effective Evidence Decisions must contain entries[]");

const reviewedCandidateIds = new Set(evidenceDecisions.entries.map((entry) => entry.candidate_id).filter(Boolean));
const triage = buildSourceResearchTriage({
  candidates: researchCandidates.candidates,
  reviewedCandidateIds,
  generatedAt: source.generated_at || null,
});
triage.source = "effective research candidate workflow + reviewed Evidence Decisions";
triage.reviewed_candidate_count = reviewedCandidateIds.size;

fs.writeFileSync(outputPath, `${JSON.stringify(triage, null, 2)}\n`);
console.log(`research_scout_triage open=${triage.summary.open_candidates} integrity=${triage.summary.source_integrity_alerts} strong_reviews=${triage.summary.strong_review_leads} critical=${triage.summary.critical_triage} high=${triage.summary.high_priority} reviewed_candidates=${reviewedCandidateIds.size}`);
