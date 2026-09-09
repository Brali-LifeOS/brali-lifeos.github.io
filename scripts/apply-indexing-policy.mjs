import { existsSync } from "node:fs";
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
const withheld = [];
const trustedRecommendations = [];
const reviewRequired = [];
const trustedStates = new Set(["reviewed", "practical"]);

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const removeSitemapUrl = (xml, url) => xml.replace(
  new RegExp(`\\s*<url>\\s*<loc>${escapeRegExp(url)}</loc>(?:\\s*<lastmod>[^<]+</lastmod>)?\\s*</url>`, "g"),
  "",
);
const robotsMeta = (html, content) => {
  const cleaned = html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, "");
  return cleaned.replace("</head>", `<meta name="robots" content="${content}"></head>`);
};
const sitemapEntry = (url, record) => {
  const reviewedAt = String(record.reviewed_at ?? record.review?.reviewedAt ?? "").slice(0, 10);
  return reviewedAt
    ? `  <url><loc>${url}</loc><lastmod>${reviewedAt}</lastmod></url>`
    : `  <url><loc>${url}</loc></url>`;
};

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  const trusted = record.indexable === true && trustedStates.has(record.status);
  sitemap = removeSitemapUrl(sitemap, url);

  const pagePath = path.join(root, "life-os", record.slug, "index.html");
  const pageHtml = await readFile(pagePath, "utf8");
  await writeFile(pagePath, robotsMeta(pageHtml, trusted ? "index,follow,max-image-preview:large" : "noindex,follow"));

  const machinePath = path.join(root, "life-os", record.slug, "index.json");
  if (existsSync(machinePath)) {
    const machine = JSON.parse(await readFile(machinePath, "utf8"));
    machine.evidence = { ...(machine.evidence ?? {}), search_indexable: trusted };
    machine.discovery = { ...(machine.discovery ?? {}), search_indexable: trusted };
    await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  }

  if (trusted) {
    searchIndexable.push(record.slug);
    trustedRecommendations.push(record.slug);
    sitemap = sitemap.replace("</urlset>", `${sitemapEntry(url, record)}\n</urlset>`);
  } else {
    withheld.push(record.slug);
    reviewRequired.push(record.slug);
  }
}

await writeFile(sitemapPath, sitemap);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.indexing_policy = {
  web_rule: "Only canonical Growth Library entries with evidence status reviewed or practical and an eligible evidence decision are included in the sitemap and marked index,follow. Review-gated entries remain directly accessible but are noindex,follow.",
  recommendation_rule: "Only the same reviewed and practical entries enter normal trusted recommendations and the Trusted Protocol Feed.",
  machine_rule: "Per-entry HTML robots metadata, sitemap membership and machine discovery.search_indexable must agree with the same trust decision.",
  search_indexable_entries: searchIndexable.length,
  withheld_entries: withheld.length,
  trusted_recommendation_entries: trustedRecommendations.length,
  review_required_entries: reviewRequired.length,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

await writeFile(path.join(root, "life-os/datasets/indexing.json"), JSON.stringify({
  schema_version: 3,
  rule: manifest.indexing_policy.web_rule,
  trusted_recommendation_rule: manifest.indexing_policy.recommendation_rule,
  machine_rule: manifest.indexing_policy.machine_rule,
  indexable_count: searchIndexable.length,
  withheld_count: withheld.length,
  trusted_recommendation_count: trustedRecommendations.length,
  review_required_count: reviewRequired.length,
  indexable: searchIndexable,
  withheld,
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

console.log(`Indexing policy applied: ${searchIndexable.length} trusted entries indexable; ${withheld.length} review-gated entries withheld from search; ${trustedRecommendations.length} eligible for trusted recommendation.`);
