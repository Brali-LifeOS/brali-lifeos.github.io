export const openResearchWorkflowStates = new Set(["new", "screening", "watch", "support-existing", "challenge-existing"]);

const statusWeight = {
  "challenge-existing": 100,
  watch: 75,
  screening: 50,
  new: 45,
  "support-existing": 35,
};

const integrityPattern = /\b(retract(?:ed|ion)?|withdrawn|withdrawal|expression of concern|erratum|correction)\b/i;
const strongReviewPattern = /\b(systematic review|meta[- ]analysis|umbrella review)\b/i;
const broadReviewPattern = /\b(scoping review|narrative review|rapid review)\b/i;

const text = (value = "") => String(value).replace(/\s+/g, " ").trim();

export function researchSignalKind(candidate) {
  const title = text(candidate?.title);
  if (integrityPattern.test(title)) return "source-integrity-alert";
  if (candidate?.status === "challenge-existing") return "challenge";
  if (candidate?.status === "watch") return "watch";
  if (candidate?.status === "support-existing") return "possible-support";
  return "discovery";
}

export function researchReviewClass(candidate) {
  const title = text(candidate?.title);
  if (strongReviewPattern.test(title)) return "strong-review-lead";
  if (broadReviewPattern.test(title)) return "review-lead";
  return null;
}

export function researchPriority(candidate, { bestMatchScore = 0 } = {}) {
  const kind = researchSignalKind(candidate);
  const reviewClass = researchReviewClass(candidate);
  let score = kind === "source-integrity-alert" ? 130 : (statusWeight[candidate?.status] || 30);
  if (reviewClass === "strong-review-lead") score += 15;
  else if (reviewClass === "review-lead") score += 7;
  score += Math.min(15, (candidate?.risk_flags || []).length * 5);
  score += Math.min(15, Math.floor((bestMatchScore || 0) / 20));
  const label = score >= 115 ? "critical-triage" : score >= 90 ? "high" : score >= 60 ? "medium" : "normal";
  return { score, label };
}

export function suggestedResearchAction(candidate) {
  const kind = researchSignalKind(candidate);
  const reviewClass = researchReviewClass(candidate);
  if (kind === "source-integrity-alert") {
    return "Verify the correction, retraction, withdrawal, erratum, or expression-of-concern record against the publisher or primary source immediately. If a Brali source or claim is affected, create a reviewed Evidence Decision and an explicit lifecycle event when warranted.";
  }
  if (candidate?.status === "challenge-existing") {
    return "Read and review the actual source. If the challenge is material to a current Brali claim, record an Evidence Decision and then append a challenged or evidence-changed lifecycle event; metadata alone must not change status.";
  }
  if (reviewClass === "strong-review-lead") {
    return "Prioritize full-text source review because the metadata describes a systematic review, meta-analysis, or umbrella review. Use it only after checking scope, methods, populations, outcomes, limitations, and relevance to the exact Brali claim.";
  }
  if (candidate?.status === "watch") {
    return "Review the actual source during maintenance of the related topic. Narrow wording or add a lifecycle watch/review trigger only after the source is read and an Evidence Decision is recorded when appropriate.";
  }
  if (candidate?.status === "support-existing") {
    return "Review the actual source before treating it as support. If it adds useful provenance, record an Evidence Decision before considering any evidence-added lifecycle event.";
  }
  return "Screen the actual source for relevance and quality. Discovery metadata may schedule review but cannot validate, refute, downgrade, restore, or otherwise change a Brali evidence or lifecycle state.";
}

export function buildSourceResearchTriage({ candidates, reviewedCandidateIds, generatedAt }) {
  const items = [];
  for (const candidate of candidates || []) {
    if (!openResearchWorkflowStates.has(candidate.status)) continue;
    if (reviewedCandidateIds.has(candidate.id)) continue;
    const priority = researchPriority(candidate);
    const reviewClass = researchReviewClass(candidate);
    items.push({
      candidate_id: candidate.id,
      workflow_status: candidate.status,
      signal_kind: researchSignalKind(candidate),
      review_class: reviewClass,
      priority: priority.label,
      priority_score: priority.score,
      source_review_required: true,
      title: candidate.title,
      publication_date: candidate.publication_date || null,
      reference_url: candidate.reference_url || null,
      doi: candidate.doi || null,
      pmid: candidate.pmid || null,
      source_provider: candidate.source || null,
      discovery_sources: candidate.discovery_sources || (candidate.source ? [candidate.source] : []),
      query_ids: candidate.query_ids || [],
      domain_ids: candidate.domain_ids || [],
      topic_ids: candidate.topic_ids || [],
      method_ids: candidate.method_ids || [],
      risk_flags: candidate.risk_flags || [],
      suggested_action: suggestedResearchAction(candidate),
    });
  }
  items.sort((a, b) => b.priority_score - a.priority_score || (b.publication_date || "").localeCompare(a.publication_date || "") || a.candidate_id.localeCompare(b.candidate_id));
  return {
    schema_version: 1,
    generated_at: generatedAt || null,
    policy: "Operational research triage only. Metadata may schedule source review but is never publishable evidence and never changes hack evidence or lifecycle status automatically.",
    summary: {
      open_candidates: items.length,
      source_integrity_alerts: items.filter((item) => item.signal_kind === "source-integrity-alert").length,
      strong_review_leads: items.filter((item) => item.review_class === "strong-review-lead").length,
      critical_triage: items.filter((item) => item.priority === "critical-triage").length,
      high_priority: items.filter((item) => item.priority === "high").length,
    },
    items,
  };
}
