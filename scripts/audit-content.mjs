import { readFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence } from "./lib/content-trust.mjs";
import { inspectClaims } from "./lib/claim-taxonomy.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const evidenceIndex = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const claimDebt = JSON.parse(await readFile(path.join(root, "life-os/datasets/claim-debt.json"), "utf8"));
const strict = process.argv.includes("--strict");

const counts = { reviewed: 0, practical: 0, "pending-review": 0, restricted: 0 };
let legacySourceEntries = 0;
let legacyGeneratedPages = 0;
let restrictedStillIndexable = 0;
let missingProtocolSummaries = 0;
let evidenceStatusMismatches = 0;
let quantitativeQueue = 0;
let unsupportedGeneratedClaimPages = 0;
const examples = [];
const generatedClaimExamples = [];

if (claimDebt.schema_version !== 2) throw new Error(`Unexpected claim-debt schema version: ${claimDebt.schema_version}`);
if (claimDebt.name !== "Brali public claim debt report") throw new Error("Claim-debt report identity drift.");
if (claimDebt.counts?.records_checked !== index.length) {
  throw new Error(`Claim-debt coverage drift: ${claimDebt.counts?.records_checked}/${index.length}`);
}
if ((claimDebt.category_definitions ?? []).length < 7) throw new Error("Claim-debt taxonomy is unexpectedly small.");
if ((claimDebt.counts?.records_with_markers ?? 0) !== (claimDebt.entries ?? []).length) {
  throw new Error("Claim-debt marker count does not match report entries.");
}
const calculatedDebtEntries = (claimDebt.entries ?? []).filter(entry => (entry.debt_reasons ?? []).length > 0);
const calculatedIndexableDebt = calculatedDebtEntries.filter(entry => entry.indexable).length;
if (calculatedDebtEntries.length !== claimDebt.counts?.debt_entries) throw new Error("Claim-debt total count drift.");
if (calculatedIndexableDebt !== claimDebt.counts?.indexable_debt_entries) throw new Error("Claim-debt indexable count drift.");

const sortedCounts = values => Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
const countByTopic = entries => {
  const result = {};
  for (const entry of entries) {
    if (!Array.isArray(entry.topic_ids)) throw new Error(`${entry.slug}: claim-debt entry lacks topic_ids.`);
    for (const topicId of entry.topic_ids) result[topicId] = (result[topicId] ?? 0) + 1;
  }
  return sortedCounts(result);
};
const markerTopicCounts = countByTopic(claimDebt.entries ?? []);
const debtTopicCounts = countByTopic(calculatedDebtEntries);
const topicPendingMarkers = (claimDebt.entries ?? []).filter(entry => entry.topic_ids.length === 0).length;
const topicPendingDebt = calculatedDebtEntries.filter(entry => entry.topic_ids.length === 0).length;
if (JSON.stringify(markerTopicCounts) !== JSON.stringify(claimDebt.counts?.by_topic ?? {})) throw new Error("Claim-debt Topic marker counts drift.");
if (JSON.stringify(debtTopicCounts) !== JSON.stringify(claimDebt.counts?.debt_by_topic ?? {})) throw new Error("Claim-debt Topic debt counts drift.");
if (topicPendingMarkers !== claimDebt.counts?.topic_pending_marker_records) throw new Error("Claim-debt topic-pending marker count drift.");
if (topicPendingDebt !== claimDebt.counts?.topic_pending_debt_entries) throw new Error("Claim-debt topic-pending debt count drift.");

const evidenceBySlug = new Map((evidenceIndex.entries ?? []).map((record) => [record.slug, record]));
const claimDebtBySlug = new Map((claimDebt.entries ?? []).map((record) => [record.slug, record]));

for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const sourceText = JSON.stringify(article);
  const evidence = classifyEvidence(article, entry, overrides);
  counts[evidence.status] = (counts[evidence.status] ?? 0) + 1;
  if (evidence.claims.quantitative && evidence.status !== "reviewed") quantitativeQueue += 1;
  if (/metalhatscats/i.test(sourceText)) legacySourceEntries += 1;

  const generatedPath = path.join(root, "life-os", entry.slug, "index.html");
  const generated = await readFile(generatedPath, "utf8");
  if (/metalhatscats/i.test(generated)) legacyGeneratedPages += 1;
  if (!generated.includes('data-protocol-summary="true"')) missingProtocolSummaries += 1;
  if (!generated.includes(`data-evidence-status="${evidence.status}"`)) evidenceStatusMismatches += 1;
  if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(generated)) restrictedStillIndexable += 1;

  const generatedClaims = inspectClaims(generated);
  const disallowedGeneratedCategories = generatedClaims.enforcedCategories.filter(category => {
    if (category === "guarantee") return true;
    return evidence.status !== "reviewed" || !evidence.source.recorded;
  });
  if (evidence.indexable && disallowedGeneratedCategories.length > 0) {
    unsupportedGeneratedClaimPages += 1;
    if (generatedClaimExamples.length < 12) {
      generatedClaimExamples.push(`${entry.slug}:${disallowedGeneratedCategories.join("+")}`);
    }
  }

  const indexed = evidenceBySlug.get(entry.slug);
  if (!indexed || indexed.status !== evidence.status || indexed.reason !== evidence.reason) {
    evidenceStatusMismatches += 1;
  }
  const reportedClaims = claimDebtBySlug.get(entry.slug);
  if ((evidence.claims.categories ?? []).length > 0) {
    if (!reportedClaims) throw new Error(`${entry.slug}: claim markers missing from claim-debt report.`);
    if (JSON.stringify(reportedClaims.categories) !== JSON.stringify(evidence.claims.categories)) {
      throw new Error(`${entry.slug}: claim category drift between evidence and claim-debt outputs.`);
    }
    const expectedTopics = (indexed?.ontology?.topics ?? []).map(topic => topic.id);
    if (JSON.stringify(reportedClaims.topic_ids) !== JSON.stringify(expectedTopics)) {
      throw new Error(`${entry.slug}: Topic drift between evidence and claim-debt outputs.`);
    }
  } else if (reportedClaims) {
    throw new Error(`${entry.slug}: claim-debt report contains an entry without current source markers.`);
  }

  if ((evidence.status === "restricted" || evidence.status === "pending-review") && examples.length < 12) {
    examples.push(`${entry.slug}:${evidence.status}`);
  }
}

console.log("Brali Growth Library content audit");
console.log(`- Entries: ${index.length}`);
console.log(`- Reviewed: ${counts.reviewed}`);
console.log(`- Practical: ${counts.practical}`);
console.log(`- Pending review: ${counts["pending-review"]}`);
console.log(`- Restricted: ${counts.restricted}`);
console.log(`- Quantitative claims not reviewed: ${quantitativeQueue}`);
console.log(`- Claim marker records: ${claimDebt.counts.records_with_markers}`);
console.log(`- Claim debt entries: ${claimDebt.counts.debt_entries}`);
console.log(`- Indexable claim debt entries: ${claimDebt.counts.indexable_debt_entries}`);
console.log(`- Topic claim groups: ${Object.keys(claimDebt.counts.by_topic ?? {}).length}`);
console.log(`- Topic debt groups: ${Object.keys(claimDebt.counts.debt_by_topic ?? {}).length}`);
console.log(`- Topic-pending claim/debt records: ${claimDebt.counts.topic_pending_marker_records}/${claimDebt.counts.topic_pending_debt_entries}`);
console.log(`- Source records containing legacy MetalHatsCats branding: ${legacySourceEntries}`);
console.log(`- Generated pages containing legacy branding: ${legacyGeneratedPages}`);
console.log(`- Indexable pages with disallowed generated claim markers: ${unsupportedGeneratedClaimPages}`);
console.log(`- Generated pages missing protocol summaries: ${missingProtocolSummaries}`);
console.log(`- Public hack pages still carrying noindex: ${restrictedStillIndexable}`);
console.log(`- Evidence status/index mismatches: ${evidenceStatusMismatches}`);
if (generatedClaimExamples.length) console.log(`- Generated claim marker examples: ${generatedClaimExamples.join(", ")}`);
if (examples.length) console.log(`- Review queue examples: ${examples.join(", ")}`);

const blockingProblems = legacyGeneratedPages
  + unsupportedGeneratedClaimPages
  + claimDebt.counts.indexable_debt_entries
  + restrictedStillIndexable
  + missingProtocolSummaries
  + evidenceStatusMismatches;
if (strict && blockingProblems > 0) {
  console.error(`Content trust audit failed with ${blockingProblems} blocking problem(s).`);
  process.exit(1);
}

if (counts["pending-review"] + counts.restricted > 0) {
  console.warn("Evidence review queue remains. Use data/evidence-overrides.json to record editorial decisions after reviewing sources and wording.");
}
