import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const report = JSON.parse(await readFile(path.join(root, "life-os/datasets/ontology-coverage.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const ontology = JSON.parse(await readFile(path.join(root, "data/knowledge-ontology.json"), "utf8"));
const page = await readFile(path.join(root, "ontology/coverage/index.html"), "utf8");
const manifest = JSON.parse(await readFile(path.join(root, "life-os/datasets/manifest.json"), "utf8"));

let invalid = 0;
const records = evidence.entries ?? [];
const topicMapped = records.filter((record) => record.ontology?.topics?.length).length;
const topicPending = records.filter((record) => record.ontology?.classification_status === "topic-pending").length;
const domainMapped = records.filter((record) => record.ontology?.domains?.length).length;
const trustedPending = (protocols.entries ?? []).filter((record) => record.ontology?.classification_status === "topic-pending");

if (report.schema_version !== 2) invalid += 1;
if (report.summary?.library_entries !== records.length) invalid += 1;
if (report.summary?.trusted_protocols !== protocols.count) invalid += 1;
if (report.summary?.domain_mapped !== domainMapped || domainMapped !== records.length) invalid += 1;
if (report.summary?.topic_mapped !== topicMapped) invalid += 1;
if (report.summary?.topic_pending !== topicPending) invalid += 1;
if (report.summary?.trusted_topic_pending !== trustedPending.length) invalid += 1;
if ((report.trusted_topic_pending ?? []).length !== trustedPending.length) invalid += 1;
if (topicMapped + topicPending !== records.length) invalid += 1;
if (!page.includes("Measure the migration instead of pretending it is finished.")) invalid += 1;
if (!page.includes("Trusted records needing Topic classification")) invalid += 1;
if (!page.includes("ontology-coverage.json")) invalid += 1;
if (!(manifest.files ?? []).includes("ontology-coverage.json")) invalid += 1;

const methodIds = new Set(ontology.methods.map((item) => item.id));
const lensIds = new Set(ontology.lenses.map((item) => item.id));
const pendingSlugs = new Set(trustedPending.map((item) => item.slug));
for (const item of report.trusted_topic_pending ?? []) {
  if (!pendingSlugs.has(item.slug) || !item.title || !item.action) invalid += 1;
}
for (const item of report.unresolved_legacy_collections ?? []) {
  if (!["method", "lens"].includes(item.kind)) invalid += 1;
  if (item.kind === "method" && !methodIds.has(item.target_id)) invalid += 1;
  if (item.kind === "lens" && !lensIds.has(item.target_id)) invalid += 1;
  if (!(item.entries > 0)) invalid += 1;
}
for (const item of report.growth_gap_topics ?? []) {
  if (item.status !== "growth-gap") invalid += 1;
}

if (invalid) throw new Error(`Ontology coverage validation failed with ${invalid} problem(s).`);
console.log(`Ontology coverage verified: ${topicMapped}/${records.length} Topic-mapped, ${topicPending} Topic-pending, ${trustedPending.length} trusted Topic-pending, ${report.growth_gap_topics.length} growth gaps.`);
