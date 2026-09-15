import fs from "node:fs";
import path from "node:path";
import { loadReviewRegistry } from "./lib/review-registry.mjs";
import { buildSourceResearchTriage } from "./lib/research-triage.mjs";

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const source = readJson("data/research-candidates.json");
const actual = readJson("data/research-triage.json");
const { evidenceDecisions, researchCandidates } = loadReviewRegistry(root);
const reviewedCandidateIds = new Set(evidenceDecisions.entries.map((entry) => entry.candidate_id).filter(Boolean));
const expected = buildSourceResearchTriage({
  candidates: researchCandidates.candidates,
  reviewedCandidateIds,
  generatedAt: source.generated_at || null,
});
expected.source = "effective research candidate workflow + reviewed Evidence Decisions";
expected.reviewed_candidate_count = reviewedCandidateIds.size;

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonical(value[key]);
    return result;
  }, {});
};
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
if (!same(actual, expected)) throw new Error("data/research-triage.json is stale or was edited outside the deterministic Research Scout triage generator");

const ids = new Set();
for (const item of actual.items || []) {
  if (!item.candidate_id || ids.has(item.candidate_id)) throw new Error(`Research triage contains duplicate/invalid candidate id: ${item.candidate_id}`);
  ids.add(item.candidate_id);
  if (reviewedCandidateIds.has(item.candidate_id)) throw new Error(`${item.candidate_id}: reviewed candidate leaked into open Research Scout triage`);
  if (item.source_review_required !== true) throw new Error(`${item.candidate_id}: source_review_required must stay true`);
  if (!["source-integrity-alert", "challenge", "watch", "possible-support", "discovery"].includes(item.signal_kind)) throw new Error(`${item.candidate_id}: invalid triage signal ${item.signal_kind}`);
  if (!["critical-triage", "high", "medium", "normal"].includes(item.priority)) throw new Error(`${item.candidate_id}: invalid priority ${item.priority}`);
  if (!Number.isFinite(item.priority_score) || item.priority_score <= 0) throw new Error(`${item.candidate_id}: invalid operational priority score`);
  if (typeof item.suggested_action !== "string" || item.suggested_action.length < 80) throw new Error(`${item.candidate_id}: bounded source-review action is required`);
  for (const forbidden of ["status_after", "lifecycle_status", "evidence_status", "verdict", "trusted"]) {
    if (forbidden in item) throw new Error(`${item.candidate_id}: source triage may not carry ${forbidden}`);
  }
}

if (!String(actual.policy || "").includes("never publishable evidence") || !String(actual.policy || "").includes("never changes")) {
  throw new Error("Research triage policy must explicitly preserve the metadata/evidence/lifecycle boundary");
}

const summary = actual.summary || {};
const count = (predicate) => actual.items.filter(predicate).length;
if (summary.open_candidates !== actual.items.length) throw new Error("Research triage open candidate count drift");
if (summary.source_integrity_alerts !== count((item) => item.signal_kind === "source-integrity-alert")) throw new Error("Research triage integrity-alert count drift");
if (summary.strong_review_leads !== count((item) => item.review_class === "strong-review-lead")) throw new Error("Research triage strong-review count drift");
if (summary.critical_triage !== count((item) => item.priority === "critical-triage")) throw new Error("Research triage critical count drift");
if (summary.high_priority !== count((item) => item.priority === "high")) throw new Error("Research triage high-priority count drift");

console.log(`Research triage gate passed: open=${actual.items.length}, integrity=${summary.source_integrity_alerts}, strong_reviews=${summary.strong_review_leads}, critical=${summary.critical_triage}, high=${summary.high_priority}, reviewed_excluded=${reviewedCandidateIds.size}.`);
