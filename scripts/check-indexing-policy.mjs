import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
let missingFromSitemap = 0;
let pagesWithNoindex = 0;

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  const inSitemap = sitemap.includes(`<loc>${url}</loc>`);
  const html = await readFile(path.join(root, "life-os", record.slug, "index.html"), "utf8");
  const noindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);

  if (!inSitemap) missingFromSitemap += 1;
  if (noindex) pagesWithNoindex += 1;
}

const expectedSearchIndexable = (evidence.entries ?? []).length;
const expectedTrusted = (evidence.entries ?? []).filter((record) => record.indexable).length;
const expectedReviewRequired = expectedSearchIndexable - expectedTrusted;
if (indexing.schema_version !== 2 || indexing.indexable_count !== expectedSearchIndexable || indexing.withheld_count !== 0) {
  throw new Error("Machine-readable web-indexing counts do not cover the complete public library.");
}
if (indexing.trusted_recommendation_count !== expectedTrusted || indexing.review_required_count !== expectedReviewRequired) {
  throw new Error("Machine-readable trust-gating counts do not match the evidence index.");
}
if (missingFromSitemap || pagesWithNoindex) {
  throw new Error(`Indexing policy validation failed: missing from sitemap=${missingFromSitemap}, pages with noindex=${pagesWithNoindex}.`);
}

console.log(`Indexing policy verified: all ${expectedSearchIndexable} public entries are indexable; ${expectedTrusted} remain eligible for trusted recommendation; ${expectedReviewRequired} remain review-gated.`);
