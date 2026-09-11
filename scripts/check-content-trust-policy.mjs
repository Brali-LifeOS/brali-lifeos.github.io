import assert from "node:assert/strict";
import { classifyEvidence } from "./lib/content-trust.mjs";

const entry = (slug, zone = "productivity") => ({ slug, zone: { slug: zone } });
const article = ({ title = "Simple practice", description = "Try a small bounded action and review how it went.", sourceUrl = null } = {}) => ({
  title,
  description,
  lifeOsSource: {
    whatYouDo: "Try the action once in a low-risk context.",
    checkIn: "Did it help with the immediate task?",
    ...(sourceUrl ? { sourceUrl } : {}),
  },
});

const sourcedPractical = classifyEvidence(
  article({ sourceUrl: "https://example.org/original-technique" }),
  entry("sourced-practical"),
);
assert.equal(sourcedPractical.status, "practical", "A provenance URL alone must not force low-risk guidance into pending review.");
assert.equal(sourcedPractical.source.recorded, true);
assert.equal(sourcedPractical.reason, "low-risk-practical-guidance-with-provenance");

const unsourcedPractical = classifyEvidence(article(), entry("unsourced-practical"));
assert.equal(unsourcedPractical.status, "practical");

const researchClaim = classifyEvidence(
  article({
    description: "Research shows this practice improves performance.",
    sourceUrl: "https://example.org/study",
  }),
  entry("research-claim"),
);
assert.equal(researchClaim.status, "pending-review", "Evidence-like claims must still require review even when a source URL exists.");

const quantitativeClaim = classifyEvidence(
  article({
    description: "A trial reported a 25% improvement.",
    sourceUrl: "https://example.org/trial",
  }),
  entry("quantitative-claim"),
);
assert.equal(quantitativeClaim.status, "pending-review");

const cleanedCbtPractice = classifyEvidence(article(), entry("cleaned-planning-practice", "cbt"));
assert.equal(cleanedCbtPractice.status, "practical", "A historical sensitive-zone label alone must not block a claim-cleaned everyday practice.");
assert.equal(cleanedCbtPractice.sensitiveZoneOrigin, true);
assert.equal(cleanedCbtPractice.sensitive, false);

const sensitiveWithoutSource = classifyEvidence(
  article({ description: "Use this during a panic attack to treat anxiety symptoms." }),
  entry("panic-support", "cbt"),
);
assert.equal(sensitiveWithoutSource.status, "restricted", "Direct mental-health guidance without a usable source must remain restricted.");

const sensitiveWithSource = classifyEvidence(
  article({ description: "Use this during a panic attack to treat anxiety symptoms.", sourceUrl: "https://example.org/clinical-source" }),
  entry("panic-support-sourced", "cbt"),
);
assert.equal(sensitiveWithSource.status, "pending-review", "Direct sensitive guidance must still require review before trusted use.");

const cardioAlwaysSensitive = classifyEvidence(article(), entry("simple-cardio-note", "cardio-doc"));
assert.equal(cardioAlwaysSensitive.status, "restricted", "Cardio guidance keeps a zone-level hard gate even when wording is claim-clean.");

const reclassifiedWorkArticle = article();
reclassifiedWorkArticle.zone = { slug: "work", title: "Work" };
reclassifiedWorkArticle.lifeOsSource.zoneSlug = "work";
reclassifiedWorkArticle.trustverseCuration = {
  mode: "claim-cleanup",
  retained_high_risk_gate: false,
  taxonomy_reclassification: {
    from: "cardio-doc",
    to: "work",
    reason: "The inherited medical-zone placement was caused by analogy text; the retained protocol is ordinary workplace guidance.",
    reviewed_at: "2026-09-11",
  },
};
const reclassifiedWork = classifyEvidence(reclassifiedWorkArticle, entry("reclassified-work", "work"));
assert.equal(reclassifiedWork.status, "practical", "An explicit, provenance-bearing taxonomy correction must be evaluated in its corrected zone.");
assert.equal(reclassifiedWork.zone, "work");
assert.equal(reclassifiedWork.sourceZone, "cardio-doc");
assert.equal(reclassifiedWork.taxonomyReclassified, true);
assert.equal(reclassifiedWork.sensitiveZoneOrigin, true);
assert.equal(reclassifiedWork.sensitive, false);

const manualReviewed = classifyEvidence(
  article({ description: "Research shows a bounded effect.", sourceUrl: "https://example.org/reviewed-source" }),
  entry("manual-reviewed"),
  { entries: { "manual-reviewed": { status: "reviewed", reviewed_at: "2026-09-11", reviewed_by: "Brali editorial review" } } },
);
assert.equal(manualReviewed.status, "reviewed", "Explicit review decisions must remain authoritative.");

console.log("Content trust policy verified: provenance alone does not block low-risk guidance; cleaned everyday practices and explicit taxonomy corrections are judged by actual risk surface; direct sensitive and evidence-bearing material remains review-gated.");
