import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const sitemapPath = path.join(root, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
let restored = 0;

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  if (sitemap.includes(`<loc>${url}</loc>`)) continue;
  sitemap = sitemap.replace("</urlset>", `  <url><loc>${url}</loc></url>\n</urlset>`);
  restored += 1;
}

await writeFile(sitemapPath, sitemap);
console.log(`Structural quality-loop staging: ${restored} review-gated archive URL(s) temporarily restored for the all-pages audit. Final trust indexing is reapplied immediately after the structural loop.`);
