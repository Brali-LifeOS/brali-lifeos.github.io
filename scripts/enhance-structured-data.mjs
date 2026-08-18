import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence, sourceDetails } from "./lib/content-trust.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const lifeAreas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const canonical = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const isoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const maxDate = (values) => values.filter(Boolean).sort().at(-1) ?? null;

const publisher = {
  "@type": "Organization",
  "@id": `${base}/#organization`,
  name: "Brali LifeOS",
  url: `${base}/`,
  logo: { "@type": "ImageObject", url: `${base}/assets/images/brali-logo.png` },
};

let enhanced = 0;
let reviewedCitations = 0;
for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  const articleData = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const source = sourceDetails(articleData);
  const evidence = classifyEvidence(articleData, entry, overrides);
  let html = await readFile(pagePath, "utf8");
  const articleUrl = canonical(`/life-os/${entry.slug}/`);
  const zoneUrl = canonical(`/life-os/${entry.zone.slug}/`);

  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (whole, raw) => {
    try {
      const existing = JSON.parse(raw);
      const existingArticle = existing?.["@type"] === "Article"
        ? existing
        : existing?.["@graph"]?.find((node) => node?.["@type"] === "Article");
      if (!existingArticle) return whole;
      const { "@context": _context, ...article } = existingArticle;
      article["@id"] = `${articleUrl}#article`;
      article.url = articleUrl;
      article.mainEntityOfPage = { "@id": articleUrl };
      article.author = { "@id": publisher["@id"] };
      article.publisher = { "@id": publisher["@id"] };
      delete article.citation;
      if (evidence.status === "reviewed" && source.sourceUrl) {
        article.citation = [source.sourceUrl];
        reviewedCitations += 1;
      }

      const graph = {
        "@context": "https://schema.org",
        "@graph": [
          publisher,
          {
            "@type": "WebPage",
            "@id": articleUrl,
            url: articleUrl,
            name: article.headline,
            isPartOf: { "@type": "CollectionPage", "@id": canonical("/life-os/"), name: "Brali LifeOS Growth Library" },
          },
          article,
          {
            "@type": "BreadcrumbList",
            "@id": `${articleUrl}#breadcrumbs`,
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
              { "@type": "ListItem", position: 2, name: "Growth Library", item: canonical("/life-os/") },
              { "@type": "ListItem", position: 3, name: entry.zone.title, item: zoneUrl },
              { "@type": "ListItem", position: 4, name: article.headline, item: articleUrl },
            ],
          },
        ],
      };
      return `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`;
    } catch {
      return whole;
    }
  });

  await writeFile(pagePath, html);
  enhanced += 1;
}

let sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
function addLastmod(pathname, date) {
  if (!date) return;
  const url = canonical(pathname);
  const plain = `<url><loc>${url}</loc></url>`;
  const enriched = `<url><loc>${url}</loc><lastmod>${date}</lastmod></url>`;
  sitemap = sitemap.replace(plain, enriched);
}

const datesByZone = new Map();
for (const entry of index) {
  const date = isoDate(entry.updatedISO || entry.publishedISO);
  addLastmod(`/life-os/${entry.slug}/`, date);
  const dates = datesByZone.get(entry.zone.slug) ?? [];
  if (date) dates.push(date);
  datesByZone.set(entry.zone.slug, dates);
}
for (const [zone, dates] of datesByZone) addLastmod(`/life-os/${zone}/`, maxDate(dates));
const libraryDate = maxDate(index.map((entry) => isoDate(entry.updatedISO || entry.publishedISO)));
addLastmod("/life-os/", libraryDate);

for (const area of lifeAreas) {
  const dates = area.zones.flatMap((zone) => datesByZone.get(zone) ?? []);
  addLastmod(`/life-os/areas/${area.slug}/`, maxDate(dates));
}
addLastmod("/life-os/areas/", libraryDate);

await writeFile(path.join(root, "sitemap.xml"), sitemap);
console.log(`Structured data enhanced for ${enhanced} Growth Library entries; ${reviewedCitations} reviewed citations exposed; reliable sitemap lastmod values added.`);
