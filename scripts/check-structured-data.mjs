import { readFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence } from "./lib/content-trust.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
let invalid = 0;
let missingIndexableLastmod = 0;
let prematureCitations = 0;
let indexableChecked = 0;

for (const entry of index) {
  const page = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  const articleData = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const evidence = classifyEvidence(articleData, entry, overrides);
  const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) {
    invalid += 1;
    continue;
  }
  try {
    const schema = JSON.parse(match[1]);
    const graph = schema?.["@graph"] ?? [];
    const article = graph.find((node) => node?.["@type"] === "Article");
    const breadcrumbs = graph.find((node) => node?.["@type"] === "BreadcrumbList");
    const organization = graph.find((node) => node?.["@type"] === "Organization");
    if (!article?.headline || !article?.publisher || !article?.mainEntityOfPage || !breadcrumbs || !organization) invalid += 1;
    if (article?.citation && evidence.status !== "reviewed") prematureCitations += 1;
  } catch {
    invalid += 1;
  }

  if (evidence.indexable) {
    indexableChecked += 1;
    const url = `${base}/life-os/${entry.slug}/`;
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`<url><loc>${escaped}</loc><lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod></url>`);
    if (!pattern.test(sitemap)) missingIndexableLastmod += 1;
  }
}

if (invalid || missingIndexableLastmod || prematureCitations) {
  throw new Error(`Structured data validation failed: invalid pages=${invalid}, indexable entries missing lastmod=${missingIndexableLastmod}, premature citations=${prematureCitations}.`);
}
console.log(`Structured data verified for ${index.length} Growth Library entries; ${indexableChecked} indexable entries have sitemap lastmod and citations remain review-gated.`);
