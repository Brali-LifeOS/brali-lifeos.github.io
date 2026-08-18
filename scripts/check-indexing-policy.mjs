import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
let indexableMissing = 0;
let withheldInSitemap = 0;
let withheldWithoutNoindex = 0;
let indexableWithNoindex = 0;

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  const inSitemap = sitemap.includes(`<loc>${url}</loc>`);
  const html = await readFile(path.join(root, "life-os", record.slug, "index.html"), "utf8");
  const noindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);

  if (record.indexable && !inSitemap) indexableMissing += 1;
  if (!record.indexable && inSitemap) withheldInSitemap += 1;
  if (!record.indexable && !noindex) withheldWithoutNoindex += 1;
  if (record.indexable && noindex) indexableWithNoindex += 1;
}

const expectedIndexable = (evidence.entries ?? []).filter((record) => record.indexable).length;
const expectedWithheld = (evidence.entries ?? []).length - expectedIndexable;
if (indexing.indexable_count !== expectedIndexable || indexing.withheld_count !== expectedWithheld) {
  throw new Error("Machine-readable indexing counts do not match the evidence index.");
}

if (indexableMissing || withheldInSitemap || withheldWithoutNoindex || indexableWithNoindex) {
  throw new Error(`Indexing policy validation failed: indexable missing=${indexableMissing}, withheld in sitemap=${withheldInSitemap}, withheld without noindex=${withheldWithoutNoindex}, indexable with noindex=${indexableWithNoindex}.`);
}

console.log(`Indexing policy verified: ${expectedIndexable} indexable entries; ${expectedWithheld} withheld pending quality review.`);
