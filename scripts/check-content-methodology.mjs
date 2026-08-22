import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const page = await readFile(path.join(root, "life-os/methodology/index.html"), "utf8");
const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const normalizations = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));
const claimDebt = JSON.parse(await readFile(path.join(root, "life-os/datasets/claim-debt.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");

for (const marker of ["Reviewed", "Practical", "Pending review", "Restricted", "Current claim debt", "Evidence Decisions", "/life-os/datasets/protocols.json", "/life-os/datasets/evidence.json", "/life-os/datasets/evidence-decisions.json", "/life-os/datasets/claim-debt.json", "/life-os/datasets/indexing.json", "/life-os/datasets/editorial-normalizations.json"]) {
  if (!page.includes(marker)) throw new Error(`Content methodology page is missing: ${marker}`);
}
if (!page.includes(`${indexing.indexable_count} meet the current discovery bar`)) throw new Error("Methodology page indexable count is stale.");
if (!page.includes(`${indexing.withheld_count} remain accessible`)) throw new Error("Methodology page withheld count is stale.");
if (!page.includes(`Reviewed · ${evidence.counts?.reviewed ?? 0}`)) throw new Error("Methodology reviewed count is stale.");
if (!page.includes(`inspected ${claimDebt.counts?.records_checked ?? 0} records`)) throw new Error("Methodology claim records checked count is stale.");
if (!page.includes(`review markers in ${claimDebt.counts?.records_with_markers ?? 0}`)) throw new Error("Methodology claim marker count is stale.");
if (!page.includes(`${claimDebt.counts?.debt_entries ?? 0} records currently carry unresolved claim debt`)) throw new Error("Methodology claim debt count is stale.");
if (!page.includes(`${claimDebt.counts?.indexable_debt_entries ?? 0} unresolved claim-debt records are indexable`)) throw new Error("Methodology indexable claim debt count is stale.");
if (!page.includes(`${claimDebt.counts?.decision_gated_entries ?? 0} records are currently withheld because decision-required wording`)) throw new Error("Methodology decision-gated count is stale.");
if (!page.includes(`${claimDebt.counts?.decision_linked_entries ?? 0} records are linked to at least one qualifying reviewed Evidence Decision`)) throw new Error("Methodology linked-decision count is stale.");
for (const category of claimDebt.category_definitions ?? []) {
  const count = claimDebt.counts?.by_category?.[category.id] ?? 0;
  const mode = category.enforced ? "enforced" : category.decision_required ? "decision-gated" : "monitor-only";
  if (!page.includes(`<strong>${category.id}</strong> · ${mode} · ${count} record`)) throw new Error(`Methodology claim category is stale: ${category.id}`);
}
if (!page.includes(`${normalizations.rules.length} reviewed normalization rule`)) throw new Error("Methodology normalization count is stale.");
if (!page.includes(`affecting ${normalizations.changed_entries} source entr`)) throw new Error("Methodology normalization application count is stale.");
if (!library.includes('/life-os/methodology/')) throw new Error("Growth Library does not link to content methodology.");
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/life-os/methodology/</loc>')) throw new Error("Sitemap lacks content methodology page.");

console.log(`Content methodology transparency page verified against evidence, Evidence Decisions, indexing, claim-debt, and editorial-normalization outputs: ${claimDebt.counts?.debt_entries ?? 0} claim-debt record(s), ${claimDebt.counts?.indexable_debt_entries ?? 0} indexable, ${claimDebt.counts?.decision_gated_entries ?? 0} decision-gated.`);
