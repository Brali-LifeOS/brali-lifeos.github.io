import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidencePath = path.join(root, "life-os/datasets/evidence.json");
const sitemapPath = path.join(root, "sitemap.xml");
const manifestPath = path.join(root, "life-os/datasets/manifest.json");
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
let sitemap = await readFile(sitemapPath, "utf8");

const searchIndexable = [];
const trustedRecommendations = [];
const reviewRequired = [];

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  searchIndexable.push(record.slug);
  if (record.indexable) trustedRecommendations.push(record.slug);
  else reviewRequired.push(record.slug);
  if (!sitemap.includes(`<loc>${url}</loc>`)) {
    sitemap = sitemap.replace("</urlset>", `  <url><loc>${url}</loc></url>\n</urlset>`);
  }
}

await writeFile(sitemapPath, sitemap);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "indexing.json"])];
manifest.indexing_policy = {
  web_rule: "All public Growth Library entry pages are crawlable and included in the sitemap. Evidence state remains visible on every page.",
  recommendation_rule: "Only reviewed and practical entries enter normal trusted recommendations and the Trusted Protocol Feed.",
  search_indexable_entries: searchIndexable.length,
  trusted_recommendation_entries: trustedRecommendations.length,
  review_required_entries: reviewRequired.length,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

await writeFile(path.join(root, "life-os/datasets/indexing.json"), JSON.stringify({
  schema_version: 2,
  rule: manifest.indexing_policy.web_rule,
  trusted_recommendation_rule: manifest.indexing_policy.recommendation_rule,
  indexable_count: searchIndexable.length,
  withheld_count: 0,
  trusted_recommendation_count: trustedRecommendations.length,
  review_required_count: reviewRequired.length,
  indexable: searchIndexable,
  withheld: [],
  trusted_recommendations: trustedRecommendations,
  review_required: reviewRequired,
}, null, 2));

const datasetsPath = path.join(root, "life-os/datasets/index.html");
let datasetsHtml = await readFile(datasetsPath, "utf8");
if (!datasetsHtml.includes("/life-os/datasets/indexing.json")) {
  datasetsHtml = datasetsHtml.replace(
    "</ul>",
    '<li><a href="/life-os/datasets/indexing.json">Search indexing policy (JSON)</a></li></ul>',
  );
  await writeFile(datasetsPath, datasetsHtml);
}

console.log(`Indexing policy applied: ${searchIndexable.length} public entries in sitemap; ${trustedRecommendations.length} eligible for trusted recommendation; ${reviewRequired.length} remain review-gated.`);
