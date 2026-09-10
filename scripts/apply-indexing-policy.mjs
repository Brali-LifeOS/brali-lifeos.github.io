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
const trustedRecommendations = [];
const referenceIndexable = [];
const withheld = [];
const reviewRequired = [];
const trustedStates = new Set(["reviewed", "practical"]);

const isTrustedGuidance = (record) => record.indexable === true && trustedStates.has(record.status);
const isReferenceIndexable = (record) => record.status === "pending-review" && record.sensitive !== true;
const isSearchIndexable = (record) => isTrustedGuidance(record) || isReferenceIndexable(record);
const searchRole = (record) => isTrustedGuidance(record)
  ? "trusted-current-guidance"
  : isReferenceIndexable(record)
    ? "pending-review-reference"
    : "withheld-restricted";

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sitemapLastmod = (xml, url) => xml.match(
  new RegExp(`<url>\\s*<loc>${escapeRegExp(url)}</loc>(?:\\s*<lastmod>([^<]+)</lastmod>)?\\s*</url>`),
)?.[1] ?? null;
const removeSitemapUrl = (xml, url) => xml.replace(
  new RegExp(`\\s*<url>\\s*<loc>${escapeRegExp(url)}</loc>(?:\\s*<lastmod>[^<]+</lastmod>)?\\s*</url>`, "g"),
  "",
);
const robotsMeta = (html, content) => {
  const cleaned = html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, "");
  return cleaned.replace("</head>", `<meta name="robots" content="${content}"></head>`);
};
const sitemapEntry = (url, record, preservedLastmod = null) => {
  const reviewedAt = preservedLastmod || String(record.reviewed_at ?? record.review?.reviewedAt ?? "").slice(0, 10);
  return reviewedAt
    ? `  <url><loc>${url}</loc><lastmod>${reviewedAt}</lastmod></url>`
    : `  <url><loc>${url}</loc></url>`;
};

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  const trusted = isTrustedGuidance(record);
  const reference = isReferenceIndexable(record);
  const searchEligible = trusted || reference;
  const preservedLastmod = sitemapLastmod(sitemap, url);
  sitemap = removeSitemapUrl(sitemap, url);

  const pagePath = path.join(root, "life-os", record.slug, "index.html");
  const pageHtml = await readFile(pagePath, "utf8");
  await writeFile(pagePath, robotsMeta(pageHtml, searchEligible ? "index,follow,max-image-preview:large" : "noindex,follow"));

  const machinePath = path.join(root, "life-os", record.slug, "index.json");
  if (existsSync(machinePath)) {
    const machine = JSON.parse(await readFile(machinePath, "utf8"));
    machine.evidence = {
      ...(machine.evidence ?? {}),
      status: record.status,
      indexable: record.indexable === true,
      search_indexable: searchEligible,
    };
    machine.content = {
      ...(machine.content ?? {}),
      ...(record.content ?? {}),
      current_guidance: trusted,
      display_state: trusted ? "current-guidance-visible" : "historical-source-only",
      search_role: searchRole(record),
      historical_source_url: record.content?.historical_source_url ?? `/data/life-os-content/${encodeURIComponent(record.slug)}.json`,
      historical_source_role: "provenance-only-not-current-guidance",
    };
    machine.discovery = {
      ...(machine.discovery ?? {}),
      search_indexable: searchEligible,
      search_role: searchRole(record),
      trusted_protocol_feed: trusted,
      recommendation_eligible: trusted,
      agent_skill_eligible: trusted,
    };
    await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  }

  if (searchEligible) {
    searchIndexable.push(record.slug);
    sitemap = sitemap.replace("</urlset>", `${sitemapEntry(url, record, preservedLastmod)}\n</urlset>`);
  } else {
    withheld.push(record.slug);
  }
  if (trusted) trustedRecommendations.push(record.slug);
  if (reference) referenceIndexable.push(record.slug);
  if (!trusted) reviewRequired.push(record.slug);
}

await writeFile(sitemapPath, sitemap);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.indexing_policy = {
  web_rule: "Canonical reviewed/practical Growth Library entries are indexable as current guidance. Non-sensitive pending-review entries are also indexable only after inherited guidance is contained and the page is rendered as a neutral review/reference record. Restricted entries remain noindex and outside the sitemap.",
  recommendation_rule: "Only reviewed and practical entries with an eligible evidence decision enter normal trusted recommendations, the Trusted Protocol Feed, and Agent Skills. Search visibility of a pending-review reference record never makes its inherited guidance recommendation-eligible.",
  machine_rule: "Per-entry HTML robots metadata, sitemap membership, machine discovery.search_indexable, content.current_guidance and discovery.recommendation_eligible are separate explicit states. Pending-review reference records may be search-indexable while current_guidance and recommendation_eligible remain false.",
  search_indexable_entries: searchIndexable.length,
  reference_indexable_entries: referenceIndexable.length,
  withheld_entries: withheld.length,
  trusted_recommendation_entries: trustedRecommendations.length,
  review_required_entries: reviewRequired.length,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

await writeFile(path.join(root, "life-os/datasets/indexing.json"), JSON.stringify({
  schema_version: 5,
  rule: manifest.indexing_policy.web_rule,
  trusted_recommendation_rule: manifest.indexing_policy.recommendation_rule,
  machine_rule: manifest.indexing_policy.machine_rule,
  content_display_rule: "Reviewed/practical records expose current guidance. Non-sensitive pending-review records expose neutral review/reference pages that may be indexed but never become current guidance. Restricted records remain historical-source-only and search-withheld.",
  indexable_count: searchIndexable.length,
  reference_indexable_count: referenceIndexable.length,
  withheld_count: withheld.length,
  trusted_recommendation_count: trustedRecommendations.length,
  review_required_count: reviewRequired.length,
  indexable: searchIndexable,
  reference_indexable: referenceIndexable,
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

console.log(`Indexing policy applied: ${searchIndexable.length} entry pages indexable (${trustedRecommendations.length} trusted guidance + ${referenceIndexable.length} pending-review reference records); ${withheld.length} restricted entries withheld; ${trustedRecommendations.length} eligible for trusted recommendation.`);
