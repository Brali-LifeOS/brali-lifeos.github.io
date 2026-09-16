import { readFile } from "node:fs/promises";
import path from "node:path";

// The legacy /life-os/datasets/hacks.json export keeps the retired LifeOS
// record format (numeric hackId, zoneID, giphy references) for compatibility
// with inherited consumers. It is a frozen view, not a parallel source of
// truth, but silent drift in either direction must stay visible:
//
//   - every entry that carries a slug must still exist in the canonical corpus
//     (a removed reference is an error);
//   - corpus records absent from the legacy export must match the documented
//     allowlist exactly, so adding a hack forces a conscious decision about
//     the legacy export instead of silently growing the gap.
//
// New corpus records have no legacy-format data (numeric id, zone id, media
// references); inventing them would fabricate retired-format fields.

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const legacyPath = path.join(root, "data/life-os/hacks.json");

const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const legacy = JSON.parse(await readFile(legacyPath, "utf8"));
const entries = Array.isArray(legacy) ? legacy : legacy.hacks ?? [];

const corpusSlugs = new Set(index.map((entry) => entry.slug));
const legacySlugs = new Set(entries.map((entry) => entry.slug).filter(Boolean));

const failures = [];

for (const slug of legacySlugs) {
  if (!corpusSlugs.has(slug)) failures.push(`legacy hacks.json references slug missing from canonical corpus: ${slug}`);
}

// Records that joined the canonical corpus after the legacy export was frozen.
// Decision recorded with PR #280: these records exist only in the canonical
// model and have no retired-format export data; the modern evidence.json and
// per-record JSON are their public machine surfaces.
const KNOWN_LEGACY_EXPORT_GAP = [
  "ai-code-scaffold-test-loop",
  "ai-conversation-rehearsal",
  "ai-customer-reply-coach",
  "ai-decision-alternatives",
  "ai-idea-divergence-pass",
  "ai-learning-attempt-feedback-retest",
  "ai-meeting-notes-to-actions",
  "ai-professional-writing-draft",
  "ai-rubric-critique",
  "ai-sop-from-examples",
  "ai-source-summary-verification",
  "ai-structured-extraction-check",
  "ai-task-frontier-test",
  "ai-test-case-generator",
  "batch-non-urgent-notifications",
  "consider-the-opposite",
  "deliberate-email-checking-windows",
  "genuine-micro-conversation",
  "grayscale-phone-friction",
  "post-meal-walk",
  "prequestions-before-learning",
  "ready-to-resume-plan",
  "savor-positive-moment",
  "self-explain-what-you-learn",
  "temptation-bundling",
  "visible-progress-monitoring",
];

const missing = [...corpusSlugs].filter((slug) => !legacySlugs.has(slug)).sort();
const unexpected = missing.filter((slug) => !KNOWN_LEGACY_EXPORT_GAP.includes(slug));
const allowlistedButPresent = KNOWN_LEGACY_EXPORT_GAP.filter((slug) => legacySlugs.has(slug));
const allowlistedButAbsent = KNOWN_LEGACY_EXPORT_GAP.filter((slug) => !corpusSlugs.has(slug));

if (unexpected.length) {
  failures.push(`corpus record(s) missing from legacy hacks.json outside the documented gap: ${unexpected.join(", ")}`);
}
if (allowlistedButPresent.length) {
  failures.push(`legacy export gap allowlist is stale (record now exported): ${allowlistedButPresent.join(", ")}`);
}
if (allowlistedButAbsent.length) {
  failures.push(`legacy export gap allowlist references slug(s) missing from the canonical corpus: ${allowlistedButAbsent.join(", ")}`);
}

if (failures.length) {
  console.error(`Legacy dataset parity failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Legacy dataset parity verified: ${legacySlugs.size} legacy slug(s) all present in the canonical corpus; ${KNOWN_LEGACY_EXPORT_GAP.length} post-freeze canonical record(s) documented as legacy-export gap.`);
