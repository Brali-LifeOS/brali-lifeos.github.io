import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const license = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const usageInfo = `${base}/terms/`;
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((record) => [record.slug, record]));

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

function pageImage(html) {
  return html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
}

function representativeImage(url) {
  return Boolean(url) && !/\/brali-logo\.png(?:[?#]|$)/i.test(url);
}

function discoveryMetadata(entry, imageUrl) {
  const published = validDate(entry.publishedISO);
  const modified = validDate(entry.updatedISO);
  return [
    '<meta name="author" content="Brali">',
    '<meta property="og:site_name" content="Brali">',
    `<meta property="article:section" content="${escapeHtml(entry.zone?.title || "Growth Library")}">`,
    published ? `<meta property="article:published_time" content="${escapeHtml(published)}">` : "",
    modified ? `<meta property="article:modified_time" content="${escapeHtml(modified)}">` : "",
    representativeImage(imageUrl) ? '<meta name="twitter:card" content="summary_large_image">' : '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${escapeHtml(clean(entry.title))}">`,
    `<meta name="twitter:description" content="${escapeHtml(clean(entry.description).slice(0, 200))}">`,
    `<meta name="twitter:image" content="${escapeHtml(representativeImage(imageUrl) ? imageUrl : `${base}/assets/images/brali-logo.png`)}">`,
    `<link rel="license" href="${license}">`,
  ].filter(Boolean).join("");
}

function enrichSchema(html, entry, imageUrl, trusted) {
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
      if (trusted) {
        article.potentialAction = {
          "@type": "ViewAction",
          name: "Open free Brali Skill Pack",
          target: `${base}/skill-packs/?hack=${encodeURIComponent(entry.slug)}`,
        };
      } else {
        delete article.potentialAction;
      }
      if (representativeImage(imageUrl)) {
        article.image = { "@type": "ImageObject", url: imageUrl };
        webPage.primaryImageOfPage = { "@type": "ImageObject", url: imageUrl };
      }
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

function reuseBlock(entry, evidenceRecord) {
  const title = clean(entry.title);
  const labelId = `use-${entry.slug}-with-ai`;
  const trusted = evidenceRecord?.indexable === true && ["reviewed", "practical"].includes(evidenceRecord?.status);
  if (!trusted) {
    return `<aside class="agent-reuse" data-agent-reuse="true" data-agent-reuse-license="CC-BY-NC-SA-4.0" data-agent-skill="review-gated" aria-labelledby="${escapeHtml(labelId)}"><div><span class="card-label">Review-gated record</span><h2 id="${escapeHtml(labelId)}">Not packaged as a Brali Skill yet</h2><p>This record remains available for provenance, but Brali does not turn pending-review or restricted guidance into a reusable AI skill. Inspect the evidence state and wait for the quality gate rather than copying an unreviewed routine into an agent.</p></div><nav class="agent-reuse-links" aria-label="Review status for ${escapeHtml(title)}"><a class="button" href="/life-os/methodology/">How the evidence gate works</a><a class="button quiet" href="/life-os/${escapeHtml(entry.slug)}/index.json">Inspect this record as JSON</a><a href="/cite/">Citation &amp; attribution</a></nav></aside>`;
  }
  return `<aside class="agent-reuse" data-agent-reuse="true" data-agent-reuse-license="CC-BY-NC-SA-4.0" data-agent-skill="available" aria-labelledby="${escapeHtml(labelId)}"><div><span class="card-label">Free Brali Skill Pack</span><h2 id="${escapeHtml(labelId)}">Use this protocol with AI agents and apps</h2><p>This trusted Brali record can be turned into a portable SKILL.md-style instruction pack without losing its canonical link, evidence state or check-in. Non-commercial reuse is available under <a href="${license}" rel="license">CC BY-NC-SA 4.0</a>.</p></div><nav class="agent-reuse-links" aria-label="AI reuse instructions for ${escapeHtml(title)}"><a class="button" href="/skill-packs/?hack=${escapeHtml(entry.slug)}">Open free skill pack</a><a class="button quiet" href="/life-os/${escapeHtml(entry.slug)}/index.json">This protocol as JSON</a><a href="/for-ai/integrations/">Integration instructions</a><a href="/cite/">Citation &amp; attribution</a><a href="/terms/">License &amp; commercial terms</a></nav></aside>`;
}

let changed = 0;
let largeImagePages = 0;
let trustedSkillPages = 0;
for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  let html = await readFile(pagePath, "utf8");
  const before = html;
  const imageUrl = pageImage(html);
  const evidenceRecord = evidenceBySlug.get(entry.slug);
  const trusted = evidenceRecord?.indexable === true && ["reviewed", "practical"].includes(evidenceRecord?.status);
  if (trusted) trustedSkillPages += 1;
  if (representativeImage(imageUrl)) largeImagePages += 1;

  html = html.replace(/<!-- brali-hack-discovery -->[\s\S]*?<!-- \/brali-hack-discovery -->/g, "");
  html = html.replace("</head>", `<!-- brali-hack-discovery -->${discoveryMetadata(entry, imageUrl)}<!-- /brali-hack-discovery --></head>`);
  html = enrichSchema(html, entry, imageUrl, trusted);
  html = html.replace(/<aside class="agent-reuse"[\s\S]*?<\/aside>/g, "");
  html = html.replace("</main>", `${reuseBlock(entry, evidenceRecord)}</main>`);

  if (html !== before) {
    await writeFile(pagePath, html);
    changed += 1;
  }
}

console.log(`Hack discovery enhanced: ${changed}/${index.length} pages expose social metadata and machine records; ${trustedSkillPages} trusted pages expose free skill packs; ${largeImagePages} expose representative large-image previews.`);
