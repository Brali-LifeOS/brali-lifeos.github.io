import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidencePath = path.join(root, "life-os/datasets/evidence.json");
const sitemapPath = path.join(root, "sitemap.xml");
const manifestPath = path.join(root, "life-os/datasets/manifest.json");
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
let sitemap = await readFile(sitemapPath, "utf8");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const withheld = [];
const indexable = [];

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  if (record.indexable) {
    indexable.push(record.slug);
    continue;
  }
  withheld.push(record.slug);
  const urlPattern = escapeRegex(url);
  const entryPattern = new RegExp(`\\s*<url><loc>${urlPattern}</loc>(?:<lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>)?</url>`, "g");
  sitemap = sitemap.replace(entryPattern, "");
}

await writeFile(sitemapPath, sitemap);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.indexing_policy = {
  rule: "Only reviewed and practical Growth Library entries are included in the sitemap. Pending-review and restricted entries remain accessible but use noindex,follow.",
  indexable_entries: indexable.length,
  withheld_entries: withheld.length,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

await writeFile(path.join(root, "life-os/datasets/indexing.json"), JSON.stringify({
  schema_version: 1,
  rule: manifest.indexing_policy.rule,
  indexable_count: indexable.length,
  withheld_count: withheld.length,
  indexable,
  withheld,
}, null, 2));

console.log(`Indexing policy applied: ${indexable.length} entries in sitemap; ${withheld.length} entries withheld pending quality review.`);
