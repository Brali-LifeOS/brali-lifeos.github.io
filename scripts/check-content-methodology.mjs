import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const page = await readFile(path.join(root, "life-os/methodology/index.html"), "utf8");
const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const normalizations = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");

for (const marker of ["Reviewed", "Practical", "Pending review", "Restricted", "/life-os/datasets/protocols.json", "/life-os/datasets/evidence.json", "/life-os/datasets/indexing.json", "/life-os/datasets/editorial-normalizations.json"]) {
  if (!page.includes(marker)) throw new Error(`Content methodology page is missing: ${marker}`);
}
if (!page.includes(`${indexing.indexable_count} meet the current discovery bar`)) throw new Error("Methodology page indexable count is stale.");
if (!page.includes(`${indexing.withheld_count} remain accessible`)) throw new Error("Methodology page withheld count is stale.");
if (!page.includes(`Reviewed · ${evidence.counts?.reviewed ?? 0}`)) throw new Error("Methodology reviewed count is stale.");
if (!page.includes(`${normalizations.rules.length} reviewed normalization rule`)) throw new Error("Methodology normalization count is stale.");
if (!page.includes(`affecting ${normalizations.changed_entries} source entr`)) throw new Error("Methodology normalization application count is stale.");
if (!library.includes('/life-os/methodology/')) throw new Error("Growth Library does not link to content methodology.");
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/life-os/methodology/</loc>')) throw new Error("Sitemap lacks content methodology page.");

console.log('Content methodology transparency page verified against evidence, indexing, and editorial-normalization outputs.');
