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
const isTrusted = record => record?.indexable === true && ["reviewed", "practical"].includes(record?.status);
const isPendingReference = record => record?.status === "pending-review" && record?.sensitive !== true;

function pageImage(html) {
  return html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
}

function representativeImage(url) {
  return Boolean(url) && !/\/brali-logo\.png(?:[?#]|$)/i.test(url);
}

function reviewMetadata(entry, evidenceRecord) {
  if (isTrusted(evidenceRecord)) {
    return {
      title: clean(entry.title),
      description: clean(entry.description).slice(0, 200),
      genre: "Practical guide",
      creativeWorkStatus: null,
    };
  }
  const restricted = evidenceRecord?.status === "restricted";
  return {
    title: `${restricted ? "Restricted review record" : "Review record"}: ${clean(entry.title)}`,
    description: restricted
      ? "Archived Brali review record. Safety-sensitive inherited guidance is withheld until a usable source is reviewed. This page is provenance, not advice."
      : "Archived Brali review record. Inherited guidance is withheld while evidence-like claims await editorial review. Use it for provenance, ontology context and trusted alternatives.",
    genre: "Brali review record",
    creativeWorkStatus: restricted ? "Restricted review" : "Pending review",
  };
}

function discoveryMetadata(entry, imageUrl, evidenceRecord) {
  const published = validDate(entry.publishedISO);
  const modified = validDate(entry.updatedISO);
  const meta = reviewMetadata(entry, evidenceRecord);
  return [
    '<meta name="author" content="Brali">',
    '<meta property="og:site_name" content="Brali">',
    `<meta property="article:section" content="${escapeHtml(entry.zone?.title || "Growth Library")}">`,
    published ? `<meta property="article:published_time" content="${escapeHtml(published)}">` : "",
    modified ? `<meta property="article:modified_time" content="${escapeHtml(modified)}">` : "",
    representativeImage(imageUrl) ? '<meta name="twitter:card" content="summary_large_image">' : '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(representativeImage(imageUrl) ? imageUrl : `${base}/assets/images/brali-logo.png`)}">`,
    `<link rel="license" href="${license}">`,
  ].filter(Boolean).join("");
}

function enrichSchema(html, entry, imageUrl, evidenceRecord) {
  const pathname = `/life-os/${entry.slug}/`;
  const articleUrl = `${base}${pathname}`;
  const trusted = isTrusted(evidenceRecord);
  const meta = reviewMetadata(entry, evidenceRecord);
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (whole, raw) => {
    try {
      const schema = JSON.parse(raw);
      const graph = schema?.["@graph"];
      if (!Array.isArray(graph)) return whole;
      const article = graph.find((node) => node?.["@type"] === "Article");
      const webPage = graph.find((node) => node?.["@type"] === "WebPage");
      if (!article || !webPage) return whole;

      article.inLanguage = "en";
      article.genre = meta.genre;
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
        delete article.creativeWorkStatus;
        article.potentialAction = {
          "@type": "ViewAction",
          name: "Open free Brali Agent Skill",
          target: `${base}/skill-packs/${encodeURIComponent(entry.slug)}/`,
        };
      } else {
        article.headline = meta.title;
        article.description = meta.description;
        article.creativeWorkStatus = meta.creativeWorkStatus;
        article.about = [entry.zone?.title || "Brali Growth Library", evidenceRecord?.status === "restricted" ? "restricted review record" : "pending review record"];
        delete article.citation;
        delete article.potentialAction;
        delete article.keywords;
      }
      if (representativeImage(imageUrl)) {
        article.image = { "@type": "ImageObject", url: imageUrl };
        webPage.primaryImageOfPage = { "@type": "ImageObject", url: imageUrl };
      }
      if (trusted) {
        const keywords = [...new Set((entry.keywords ?? []).map(clean).filter(Boolean))].slice(0, 12);
        if (keywords.length) article.keywords = keywords;
      }

      webPage.mainEntity = { "@id": article["@id"] || `${articleUrl}#article` };
      webPage.inLanguage = "en";
      webPage.isAccessibleForFree = true;
      webPage.license = license;
      webPage.usageInfo = usageInfo;
      webPage.breadcrumb = { "@id": `${articleUrl}#breadcrumbs` };
      if (!trusted) {
        webPage.name = meta.title;
        webPage.description = meta.description;
      }
      return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
    } catch {
      return whole;
    }
  });
}

function reuseBlock(entry, evidenceRecord) {
  const title = clean(entry.title);
  const labelId = `use-${entry.slug}-with-ai`;
  const trusted = isTrusted(evidenceRecord);
  if (!trusted) {
    return `<aside class="agent-reuse" data-agent-reuse="true" data-agent-reuse-license="CC-BY-NC-SA-4.0" data-agent-skill="review-gated" aria-labelledby="${escapeHtml(labelId)}"><div><span class="card-label">Review-gated record</span><h2 id="${escapeHtml(labelId)}">Not packaged as a Brali Skill yet</h2><p>This record remains available for provenance, but Brali does not turn pending-review or restricted guidance into a reusable AI skill. Inspect the evidence state and wait for the quality gate rather than copying an unreviewed routine into an agent.</p></div><nav class="agent-reuse-links" aria-label="Review status for ${escapeHtml(title)}"><a class="button" href="/life-os/methodology/">How the evidence gate works</a><a class="button quiet" href="/life-os/${escapeHtml(entry.slug)}/index.json">Inspect this record as JSON</a><a href="/cite/">Citation &amp; attribution</a></nav></aside>`;
  }
  return `<aside class="agent-reuse" data-agent-reuse="true" data-agent-reuse-license="CC-BY-NC-SA-4.0" data-agent-skill="available" aria-labelledby="${escapeHtml(labelId)}"><div><span class="card-label">Free Brali Agent Skill</span><h2 id="${escapeHtml(labelId)}">Use this protocol with AI agents and apps</h2><p>This trusted Brali record has a stable generated skill page and portable SKILL.md instruction without losing its canonical link, evidence state or check-in. Non-commercial reuse is available under <a href="${license}" rel="license">CC BY-NC-SA 4.0</a>.</p></div><nav class="agent-reuse-links" aria-label="AI reuse instructions for ${escapeHtml(title)}"><a class="button" href="/skill-packs/${escapeHtml(entry.slug)}/">Open free Agent Skill</a><a class="button quiet" href="/life-os/${escapeHtml(entry.slug)}/index.json">This protocol as JSON</a><a href="/for-ai/integrations/">Integration instructions</a><a href="/cite/">Citation &amp; attribution</a><a href="/terms/">License &amp; commercial terms</a></nav></aside>`;
}

let changed = 0;
let largeImagePages = 0;
let trustedSkillPages = 0;
let pendingReferencePages = 0;
for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  let html = await readFile(pagePath, "utf8");
  const before = html;
  const imageUrl = pageImage(html);
  const evidenceRecord = evidenceBySlug.get(entry.slug);
  const trusted = isTrusted(evidenceRecord);
  if (trusted) trustedSkillPages += 1;
  if (isPendingReference(evidenceRecord)) pendingReferencePages += 1;
  if (representativeImage(imageUrl)) largeImagePages += 1;

  html = html.replace(/<!-- brali-hack-discovery -->[\s\S]*?<!-- \/brali-hack-discovery -->/g, "");
  html = html.replace("</head>", `<!-- brali-hack-discovery -->${discoveryMetadata(entry, imageUrl, evidenceRecord)}<!-- /brali-hack-discovery --></head>`);
  html = enrichSchema(html, entry, imageUrl, evidenceRecord);
  html = html.replace(/<aside class="agent-reuse"[\s\S]*?<\/aside>/g, "");
  html = html.replace("</main>", `${reuseBlock(entry, evidenceRecord)}</main>`);

  if (html !== before) {
    await writeFile(pagePath, html);
    changed += 1;
  }
}

console.log(`Hack discovery enhanced: ${changed}/${index.length} pages expose social metadata and machine records; ${trustedSkillPages} trusted pages link stable free Agent Skills; ${pendingReferencePages} pending-review pages preserve neutral discovery metadata; ${largeImagePages} expose representative large-image previews.`);
