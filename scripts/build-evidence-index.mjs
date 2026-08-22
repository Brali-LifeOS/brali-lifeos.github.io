import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence } from "./lib/content-trust.mjs";
import { claimCategoryDefinitions } from "./lib/claim-taxonomy.mjs";
import { loadKnowledgeOntology } from "./lib/knowledge-ontology.mjs";

await import("./check-claim-taxonomy.mjs");

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const outputRoot = path.join(root, "life-os/datasets");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const evidenceDecisions = JSON.parse(await readFile(path.join(root, "data/evidence-decisions.json"), "utf8"));
const { classifyRecord } = await loadKnowledgeOntology(root);
const knownSlugs = new Set(index.map((entry) => entry.slug));
const allowedStatuses = new Set(["reviewed", "practical", "pending-review", "restricted"]);

for (const [slug, override] of Object.entries(overrides.entries ?? {})) {
  if (!knownSlugs.has(slug)) throw new Error(`Evidence override references unknown entry: ${slug}`);
  if (!allowedStatuses.has(override.status)) throw new Error(`Evidence override has invalid status for ${slug}: ${override.status}`);
  if (!override.reviewed_at || !override.reviewed_by) {
    throw new Error(`Evidence override for ${slug} must record reviewed_at and reviewed_by.`);
  }
}

const records = [];
for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const trustRecord = classifyEvidence(article, entry, overrides);
  const record = { ...trustRecord, ontology: classifyRecord(article, entry.zone.slug) };
  const manual = overrides.entries?.[entry.slug];
  if (manual?.status === "practical" && (record.claims.evidenceLanguage || (record.claims.enforcedCategories ?? []).length > 0)) {
    throw new Error(`Cannot mark ${entry.slug} practical while evidence-like or enforced claim markers remain in the source record.`);
  }
  if (manual?.status === "reviewed" && ((record.claims.categories ?? []).length > 0 || record.sensitive) && !record.source.recorded) {
    throw new Error(`Cannot mark ${entry.slug} reviewed without a usable source while claim or sensitive-content review is required.`);
  }
  records.push(record);
}
records.sort((a, b) => a.slug.localeCompare(b.slug));

const counts = records.reduce((acc, record) => {
  acc[record.status] = (acc[record.status] ?? 0) + 1;
  return acc;
}, {});
const ontologyCoverage = {
  domain_mapped: records.filter((record) => record.ontology?.domains?.length).length,
  topic_mapped: records.filter((record) => record.ontology?.topics?.length).length,
  topic_pending: records.filter((record) => record.ontology?.classification_status === "topic-pending").length,
  method_tagged: records.filter((record) => record.ontology?.methods?.length).length,
  lens_tagged: records.filter((record) => record.ontology?.lenses?.length).length,
};

function withEditorialPriority(record) {
  let score = record.status === "restricted" ? 200 : 50;
  const factors = [record.status];

  if (record.sensitive) {
    score += 40;
    factors.push("sensitive-topic");
  }
  if (record.claims.quantitative) {
    score += 30;
    factors.push("quantitative-claims");
  }
  if ((record.claims.enforcedCategories ?? []).length > 0) {
    score += 25;
    factors.push(...record.claims.enforcedCategories.map(category => `enforced-claim:${category}`));
  }
  if (record.claims.evidenceLanguage) {
    score += 20;
    factors.push("evidence-language");
  }
  if (!record.source.recorded) {
    score += 15;
    factors.push("no-usable-source");
  } else if (record.status === "pending-review") {
    score += 5;
    factors.push("source-recorded-not-reviewed");
  }
  if (record.ontology?.classification_status === "topic-pending") {
    factors.push("topic-classification-pending");
  }

  return { ...record, editorial_priority: { score, factors: [...new Set(factors)] } };
}

const unreviewedReasonByCategory = {
  quantitative: "quantitative-claim-not-reviewed",
  "first-party-result": "first-party-result-not-reviewed",
  "clinical-outcome": "clinical-outcome-not-reviewed",
  "causal-effect": "causal-effect-not-reviewed",
};

function claimDebtReasons(record) {
  const reasons = [];
  const categories = record.claims.categories ?? [];
  const enforced = record.claims.enforcedCategories ?? [];

  for (const category of enforced) {
    if (category === "guarantee") {
      reasons.push(record.status === "reviewed" ? "guarantee-language-requires-rewrite-review" : "guarantee-language-not-reviewed");
    } else if (record.status !== "reviewed") {
      reasons.push(unreviewedReasonByCategory[category] ?? `${category}-not-reviewed`);
    }
  }
  if (record.indexable && enforced.length > 0 && record.status !== "reviewed") reasons.push("indexable-enforced-claim-not-reviewed");
  if (record.status === "reviewed" && categories.length > 0 && !record.source.recorded) reasons.push("reviewed-claim-without-usable-source");
  if (record.status === "reviewed" && categories.length > 0 && (!record.review.reviewedAt || !record.review.reviewedBy)) reasons.push("reviewed-claim-without-review-metadata");

  return [...new Set(reasons)];
}

const queue = records
  .filter((record) => record.status === "restricted" || record.status === "pending-review")
  .map(withEditorialPriority)
  .sort((a, b) => (b.editorial_priority.score - a.editorial_priority.score) || a.slug.localeCompare(b.slug));

const claimEntries = records
  .filter(record => (record.claims.categories ?? []).length > 0)
  .map(record => ({
    slug: record.slug,
    zone: record.zone,
    status: record.status,
    indexable: record.indexable,
    sensitive: record.sensitive,
    categories: record.claims.categories ?? [],
    enforced_categories: record.claims.enforcedCategories ?? [],
    debt_reasons: claimDebtReasons(record),
    source: record.source,
    review: record.review,
    markers: record.claims.markers ?? [],
  }));
const claimDebtEntries = claimEntries.filter(entry => entry.debt_reasons.length > 0);
const claimCountsByCategory = {};
const claimDebtByStatus = {};
for (const entry of claimEntries) {
  for (const category of entry.categories) claimCountsByCategory[category] = (claimCountsByCategory[category] ?? 0) + 1;
}
for (const entry of claimDebtEntries) claimDebtByStatus[entry.status] = (claimDebtByStatus[entry.status] ?? 0) + 1;
const claimDebtCounts = {
  records_checked: records.length,
  records_with_markers: claimEntries.length,
  debt_entries: claimDebtEntries.length,
  indexable_debt_entries: claimDebtEntries.filter(entry => entry.indexable).length,
  by_category: Object.fromEntries(Object.entries(claimCountsByCategory).sort(([a], [b]) => a.localeCompare(b))),
  by_status: Object.fromEntries(Object.entries(claimDebtByStatus).sort(([a], [b]) => a.localeCompare(b))),
};

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "evidence.json"), JSON.stringify({
  schema_version: 2,
  name: "Brali Growth Library evidence index",
  statuses: ["reviewed", "practical", "pending-review", "restricted"],
  counts,
  ontology_coverage: ontologyCoverage,
  entries: records,
}, null, 2));
await writeFile(path.join(outputRoot, "review-queue.json"), JSON.stringify({
  schema_version: 3,
  name: "Brali Growth Library evidence review queue",
  priority: "Restricted entries always rank ahead of pending-review entries. Within those groups, sensitive topic, quantitative claims, enforced claim markers, evidence-like language, and missing usable sources raise editorial priority. Ontology classification gaps are exposed as factors but do not alter evidence priority by themselves.",
  priority_model: {
    version: 3,
    purpose: "Editorial triage only; the score is not a clinical-risk or evidence-strength measure.",
    weights: {
      restricted: 200,
      pending_review: 50,
      sensitive_topic: 40,
      quantitative_claims: 30,
      enforced_claim_markers: 25,
      evidence_language: 20,
      no_usable_source: 15,
      source_recorded_not_reviewed: 5,
      topic_classification_pending: 0
    }
  },
  ontology_coverage: ontologyCoverage,
  entries: queue,
}, null, 2));
await writeFile(path.join(outputRoot, "evidence-decisions.json"), JSON.stringify({
  schema_version: 1,
  name: "Brali Evidence Decisions",
  description: evidenceDecisions.description,
  count: (evidenceDecisions.entries ?? []).length,
  entries: evidenceDecisions.entries ?? [],
}, null, 2));
await writeFile(path.join(outputRoot, "claim-debt.json"), JSON.stringify({
  schema_version: 1,
  name: "Brali public claim debt report",
  policy: "The report separates high-confidence enforced claim categories from monitor-only research and mechanism language. An entry can remain visible in this report even when it is correctly noindexed; debt is not proof that a claim is false, but it is a requirement for explicit review, rewrite, restriction, or rejection before normal trusted discovery.",
  category_definitions: claimCategoryDefinitions,
  counts: claimDebtCounts,
  entries: claimEntries,
}, null, 2));

const manifestPath = path.join(outputRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "evidence.json", "review-queue.json", "evidence-decisions.json", "claim-debt.json"])];
manifest.evidence_status_counts = counts;
manifest.evidence_ontology_coverage = ontologyCoverage;
manifest.evidence_decision_count = (evidenceDecisions.entries ?? []).length;
manifest.review_queue_schema_version = 3;
manifest.claim_debt_schema_version = 1;
manifest.claim_debt_counts = claimDebtCounts;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPage = path.join(root, "life-os/datasets/index.html");
let html = await readFile(datasetsPage, "utf8");
if (!html.includes("/life-os/datasets/evidence.json")) {
  html = html.replace("</ul>", '<li><a href="/life-os/datasets/evidence.json">Evidence status index (JSON)</a></li><li><a href="/life-os/datasets/review-queue.json">Evidence review queue (JSON)</a></li></ul>');
}
if (!html.includes("/life-os/datasets/evidence-decisions.json")) {
  html = html.replace("</ul>", '<li><a href="/life-os/datasets/evidence-decisions.json">Evidence decisions (JSON)</a></li></ul>');
}
if (!html.includes("/life-os/datasets/claim-debt.json")) {
  html = html.replace("</ul>", '<li><a href="/life-os/datasets/claim-debt.json">Public claim debt and review signals (JSON)</a></li></ul>');
}
await writeFile(datasetsPage, html);

console.log(`Evidence index generated: ${records.length} entries; ${queue.length} queued; ${ontologyCoverage.topic_mapped} topic-mapped, ${ontologyCoverage.topic_pending} topic-pending; ${(evidenceDecisions.entries ?? []).length} evidence decision(s); ${claimDebtEntries.length} claim-debt item(s), ${claimDebtCounts.indexable_debt_entries} indexable.`);