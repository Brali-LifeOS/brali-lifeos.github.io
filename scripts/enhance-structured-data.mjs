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
  name: "Brali",
  alternateName: "Brali LifeOS",
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
            isPartOf: { "@type": "CollectionPage", "@id": canonical("/life-os/"), name: "Brali Growth Library" },
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

const datasetsPath = path.join(root, "life-os/datasets/index.html");
let datasetsHtml = await readFile(datasetsPath, "utf8");
const datasetCatalog = {
  "@context": "https://schema.org",
  "@type": "DataCatalog",
  "@id": `${canonical("/life-os/datasets/")}#catalog`,
  name: "Brali Growth Library Data Catalog",
  description: "Machine-readable practical protocols, taxonomy, evidence metadata, and discovery outputs from the Brali Growth Library.",
  url: canonical("/life-os/datasets/"),
  creator: { "@id": publisher["@id"] },
  dataset: [
    {
      "@type": "Dataset",
      name: "Brali Trusted Protocol Feed",
      description: "Compact discovery-ready practical protocols that meet the current Brali content quality and indexing bar.",
      url: `${base}/life-os/datasets/protocols.json`,
      identifier: "brali-trusted-protocol-feed",
      inLanguage: "en",
      license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      distribution: {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${base}/life-os/datasets/protocols.json`,
      },
    },
    {
      "@type": "Dataset",
      name: "Brali Growth Library corpus",
      description: "The broader public Growth Library corpus retained for discovery, provenance, research, and editorial work.",
      url: `${base}/life-os/datasets/hacks.json`,
      identifier: "brali-growth-library-corpus",
      inLanguage: "en",
      license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      distribution: {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${base}/life-os/datasets/hacks.json`,
      },
    },
  ],
};
if (!datasetsHtml.includes("brali-trusted-protocol-feed")) {
  datasetsHtml = datasetsHtml.replace(
    "</head>",
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [publisher, datasetCatalog] }).replace(/</g, "\\u003c")}</script></head>`,
  );
}
if (!datasetsHtml.includes('href="/for-ai/"')) {
  datasetsHtml = datasetsHtml.replace(
    "</main>",
    '<section class="prose"><h2>Use the data</h2><p>For agent retrieval, integration guidance, evidence handling, and the current machine-readable entry points, see <a href="/for-ai/">For AI & developers</a>. Commercial use requires a separate agreement; see <a href="/partners/">Partnerships</a>.</p></section></main>',
  );
}
await writeFile(datasetsPath, datasetsHtml);

let sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
function ensureSitemapUrl(pathname) {
  const url = canonical(pathname);
  if (sitemap.includes(`<loc>${url}</loc>`)) return;
  sitemap = sitemap.replace("</urlset>", `  <url><loc>${url}</loc></url>\n</urlset>`);
}
for (const pathname of ["/for-ai/", "/faq/", "/partners/", "/terms/"]) ensureSitemapUrl(pathname);

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
console.log(`Structured data enhanced for ${enhanced} Growth Library entries; ${reviewedCitations} reviewed citations exposed; dataset catalog metadata and reliable sitemap values added.`);
