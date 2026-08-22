import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const page = await readFile(path.join(root, "life-os/methodology/index.html"), "utf8");
const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const normalizations = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));
const claimDebt = JSON.parse(await readFile(path.join(root, "life-os/datasets/claim-debt.json"), "utf8"));
const ontology = JSON.parse(await readFile(path.join(root, "data/knowledge-ontology.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");

if (claimDebt.schema_version !== 2) throw new Error(`Methodology expects claim-debt schema 2, found ${claimDebt.schema_version}.`);
for (const marker of ["Reviewed", "Practical", "Pending review", "Restricted", "Current claim debt", "Topic-level debt", "/life-os/datasets/protocols.json", "/life-os/datasets/evidence.json", "/life-os/datasets/claim-debt.json", "/life-os/datasets/indexing.json", "/life-os/datasets/editorial-normalizations.json"]) {
  if (!page.includes(marker)) throw new Error(`Content methodology page is missing: ${marker}`);
}
if (!page.includes(`${indexing.indexable_count} meet the current discovery bar`)) throw new Error("Methodology page indexable count is stale.");
if (!page.includes(`${indexing.withheld_count} remain accessible`)) throw new Error("Methodology page withheld count is stale.");
if (!page.includes(`Reviewed · ${evidence.counts?.reviewed ?? 0}`)) throw new Error("Methodology reviewed count is stale.");
if (!page.includes(`inspected ${claimDebt.counts?.records_checked ?? 0} records`)) throw new Error("Methodology claim records checked count is stale.");
if (!page.includes(`review markers in ${claimDebt.counts?.records_with_markers ?? 0}`)) throw new Error("Methodology claim marker count is stale.");
if (!page.includes(`${claimDebt.counts?.debt_entries ?? 0} records currently carry unresolved claim debt`)) throw new Error("Methodology claim debt count is stale.");
if (!page.includes(`${claimDebt.counts?.indexable_debt_entries ?? 0} unresolved claim-debt records are indexable`)) throw new Error("Methodology indexable claim debt count is stale.");
for (const category of claimDebt.category_definitions ?? []) {
  const count = claimDebt.counts?.by_category?.[category.id] ?? 0;
  const mode = category.enforced ? "enforced" : "monitor-only";
  if (!page.includes(`<strong>${category.id}</strong> · ${mode} · ${count} record`)) throw new Error(`Methodology claim category is stale: ${category.id}`);
}
const topicDebtGroupCount = Object.keys(claimDebt.counts?.debt_by_topic ?? {}).length;
if (!page.includes(`Claim debt currently spans ${topicDebtGroupCount} mapped Topic`)) throw new Error("Methodology Topic debt group count is stale.");
if (!page.includes(`${claimDebt.counts?.topic_pending_debt_entries ?? 0} debt record`)) throw new Error("Methodology topic-pending debt count is stale.");
const topicTitleById = new Map((ontology.topics ?? []).map(topic => [topic.id, topic.title]));
const expectedTopicRows = Object.entries(claimDebt.counts?.debt_by_topic ?? {})
  .sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))
  .slice(0, 12);
for (const [topicId, count] of expectedTopicRows) {
  const title = topicTitleById.get(topicId) ?? topicId;
  if (!page.includes(`<strong>${title}</strong> · <code>${topicId}</code> · ${count} debt record`)) {
    throw new Error(`Methodology Topic debt row is stale: ${topicId}`);
  }
}
if (!page.includes(`${normalizations.rules.length} reviewed normalization rule`)) throw new Error("Methodology normalization count is stale.");
if (!page.includes(`affecting ${normalizations.changed_entries} source entr`)) throw new Error("Methodology normalization application count is stale.");
if (!library.includes('/life-os/methodology/')) throw new Error("Growth Library does not link to content methodology.");
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/life-os/methodology/</loc>')) throw new Error("Sitemap lacks content methodology page.");

console.log(`Content methodology transparency page verified: ${claimDebt.counts?.debt_entries ?? 0} claim-debt record(s), ${claimDebt.counts?.indexable_debt_entries ?? 0} indexable, ${topicDebtGroupCount} Topic debt group(s).`);
