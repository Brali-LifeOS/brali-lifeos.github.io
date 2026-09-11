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

const sensitiveWithoutSource = classifyEvidence(article(), entry("sensitive-no-source", "cbt"));
assert.equal(sensitiveWithoutSource.status, "restricted", "Sensitive guidance without a usable source must remain restricted.");

const sensitiveWithSource = classifyEvidence(
  article({ sourceUrl: "https://example.org/clinical-source" }),
  entry("sensitive-with-source", "cbt"),
);
assert.equal(sensitiveWithSource.status, "pending-review", "Sensitive guidance must still require review before trusted use.");

const manualReviewed = classifyEvidence(
  article({ description: "Research shows a bounded effect.", sourceUrl: "https://example.org/reviewed-source" }),
  entry("manual-reviewed"),
  { entries: { "manual-reviewed": { status: "reviewed", reviewed_at: "2026-09-11", reviewed_by: "Brali editorial review" } } },
);
assert.equal(manualReviewed.status, "reviewed", "Explicit review decisions must remain authoritative.");

console.log("Content trust policy verified: provenance alone does not block low-risk practical guidance; evidence-like and sensitive material remains review-gated.");
