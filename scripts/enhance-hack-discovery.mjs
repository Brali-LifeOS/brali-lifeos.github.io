import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const license = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const usageInfo = `${base}/terms/`;
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));

const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]);
const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function discoveryMetadata(entry) {
  const published = validDate(entry.publishedISO);
  const modified = validDate(entry.updatedISO);
  return [
    '<meta name="author" content="Brali">',
    '<meta property="og:site_name" content="Brali">',
    `<meta property="article:section" content="${escapeHtml(entry.zone?.title || "Growth Library")}">`,
    published ? `<meta property="article:published_time" content="${escapeHtml(published)}">` : "",
    modified ? `<meta property="article:modified_time" content="${escapeHtml(modified)}">` : "",
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${escapeHtml(clean(entry.title))}">`,
    `<meta name="twitter:description" content="${escapeHtml(clean(entry.description).slice(0, 200))}">`,
    `<meta name="twitter:image" content="${base}/assets/images/brali-logo.png">`,
    `<link rel="license" href="${license}">`,
  ].filter(Boolean).join("");
}

function enrichSchema(html, entry) {
  const pathname = `/life-os/${entry.slug}/`;
  const articleUrl = `${base}${pathname}`;
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (whole, raw) => {
    try {
      const schema = JSON.parse(raw);
      const graph = schema?.["@graph"];
      if (!Array.isArray(graph)) return whole;
      const article = graph.find((node) => node?.["@type"] === "Article");
      const webPage = graph.find((node) => node?.["@type"] === "WebPage");
      if (!article || !webPage) return whole;

      article.inLanguage = "en";
      article.genre = "Practical guide";
      article.articleSection = entry.zone?.title || "Growth Library";
      article.isAccessibleForFree = true;
      article.license = license;
      article.usageInfo = usageInfo;
      article.copyrightHolder = { "@id": `${base}/#organization` };
      article.encoding = {
        "@type": "MediaObject",
        encodingFormat: "application/json",
        contentUrl: `${articleUrl}index.json`,
      };
      const keywords = [...new Set((entry.keywords ?? []).map(clean).filter(Boolean))].slice(0, 12);
      if (keywords.length) article.keywords = keywords;

      webPage.mainEntity = { "@id": article["@id"] || `${articleUrl}#article` };
      webPage.inLanguage = "en";
      webPage.isAccessibleForFree = true;
      webPage.license = license;
      webPage.usageInfo = usageInfo;
      webPage.breadcrumb = { "@id": `${articleUrl}#breadcrumbs` };
      return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
    } catch {
      return whole;
    }
  });
}

function reuseBlock(entry) {
  const title = clean(entry.title);
  const labelId = `use-${entry.slug}-with-ai`;
  return `<aside class="agent-reuse" data-agent-reuse="true" data-agent-reuse-license="CC-BY-NC-SA-4.0" aria-labelledby="${escapeHtml(labelId)}"><div><span class="card-label">Open for non-commercial AI use</span><h2 id="${escapeHtml(labelId)}">Use this hack with AI agents and apps</h2><p>Brali data may be used in non-commercial AI agents and applications under <a href="${license}" rel="license">CC BY-NC-SA 4.0</a>. Keep Brali attribution, this page’s canonical link, and its evidence status; indicate changes and share adaptations under the same license. Commercial use requires separate permission.</p></div><nav class="agent-reuse-links" aria-label="AI reuse instructions for ${escapeHtml(title)}"><a class="button" href="/for-ai/integrations/">Integration instructions</a><a class="button quiet" href="/life-os/${escapeHtml(entry.slug)}/index.json">This hack as JSON</a><a href="/cite/">Citation &amp; attribution</a><a href="/terms/">License &amp; commercial terms</a></nav></aside>`;
}

let changed = 0;
for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  let html = await readFile(pagePath, "utf8");
  const before = html;

  html = html.replace(/<!-- brali-hack-discovery -->[\s\S]*?<!-- \/brali-hack-discovery -->/g, "");
  html = html.replace("</head>", `<!-- brali-hack-discovery -->${discoveryMetadata(entry)}<!-- /brali-hack-discovery --></head>`);
  html = enrichSchema(html, entry);
  html = html.replace(/<aside class="agent-reuse"[\s\S]*?<\/aside>/g, "");
  html = html.replace("</main>", `${reuseBlock(entry)}</main>`);

  if (html !== before) {
    await writeFile(pagePath, html);
    changed += 1;
  }
}

console.log(`Hack discovery enhanced: ${changed}/${index.length} pages expose social metadata, licensing schema, machine records, and AI reuse instructions.`);
