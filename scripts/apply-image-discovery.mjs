import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const SITE = "https://brali-lifeos.github.io";
const IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";
const sitemapPath = join(ROOT, "sitemap.xml");
const TITLE_MAX = 65;
const DESCRIPTION_MAX = 160;

const decode = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .trim();
const escapeAttr = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");
const cleanText = (value = "") => decode(value).replace(/\s+/g, " ").trim();

function htmlPath(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== SITE) return null;
  if (url.pathname === "/") return join(ROOT, "index.html");
  if (url.pathname.endsWith(".html")) return join(ROOT, url.pathname.slice(1));
  return join(ROOT, url.pathname.slice(1), "index.html");
}

function metaContent(html, key, value) {
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*\\b${key}=["']${value}["'])[^>]*>`, "i"))?.[0] || "";
  return decode(tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || "");
}

function setMeta(html, key, value, content) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${key}=["']${value}["'])[^>]*>`, "i");
  const replacement = `<meta ${key}="${value}" content="${escapeAttr(content)}">`;
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace(/<\/head>/i, `${replacement}</head>`);
}

function pageTitle(html) {
  return decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function setPageTitle(html, title) {
  const replacement = `<title>${escapeAttr(title)}</title>`;
  return /<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, replacement)
    : html.replace(/<\/head>/i, `${replacement}</head>`);
}

function truncateAtWord(value, max) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  const budget = Math.max(1, max - 1);
  const probe = text.slice(0, budget + 1);
  const boundary = probe.lastIndexOf(" ");
  const safeBoundary = boundary >= Math.max(24, Math.floor(budget * 0.6));
  const cut = (safeBoundary ? probe.slice(0, boundary) : text.slice(0, budget)).replace(/[\s,:;—-]+$/u, "");
  return `${cut}…`;
}

function conciseTitle(value) {
  const title = cleanText(value);
  if (title.length <= TITLE_MAX) return title;
  const brand = title.match(/(\s+[—|-]\s+Brali(?: LifeOS)?)$/i)?.[1] || "";
  if (!brand) return truncateAtWord(title, TITLE_MAX);
  const core = title.slice(0, -brand.length).trim();
  const coreBudget = TITLE_MAX - brand.length;
  if (coreBudget < 24) return truncateAtWord(title, TITLE_MAX);
  return `${truncateAtWord(core, coreBudget)}${brand}`;
}

function conciseDescription(value) {
  const description = cleanText(value);
  if (description.length <= DESCRIPTION_MAX) return description;
  const sentences = description.match(/[^.!?]+[.!?]+/g) ?? [];
  let candidate = "";
  for (const sentence of sentences) {
    const next = cleanText(candidate ? `${candidate} ${sentence}` : sentence);
    if (next.length > DESCRIPTION_MAX) break;
    candidate = next;
  }
  if (candidate.length >= 80) return candidate;
  return truncateAtWord(description, DESCRIPTION_MAX);
}

function allowLargeImagePreview(html) {
  const current = metaContent(html, "name", "robots");
  const directives = current
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !/^max-image-preview\s*:/i.test(value));
  directives.push("max-image-preview:large");
  return setMeta(html, "name", "robots", directives.join(", "));
}

function setImageAttributes(tag, attributes) {
  let result = tag;
  for (const [name, value] of Object.entries(attributes)) {
    const pattern = new RegExp(`\\s${name}=["'][^"']*["']`, "i");
    if (pattern.test(result)) result = result.replace(pattern, ` ${name}="${value}"`);
    else result = result.replace(/\s*\/>$|>$/, (ending) => ` ${name}="${value}"${ending}`);
  }
  return result;
}

function optimizeHomepageImageLoading(html) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const className = attribute(tag, "class");
    const src = attribute(tag, "src");
    if (className.split(/\s+/).includes("hero-mascot")) {
      return setImageAttributes(tag, { fetchpriority: "high", decoding: "async" });
    }
    const belowFold = className.split(/\s+/).includes("audience-visual") || /\/assets\/images\/brali-category-/i.test(src);
    if (belowFold) return setImageAttributes(tag, { loading: "lazy", decoding: "async", fetchpriority: "low" });
    return tag;
  });
}

function mainHtml(html) {
  return html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
}

function imageCandidates(html) {
  const main = mainHtml(html);
  const candidates = [];
  const preferredPatterns = [
    /<figure\b[^>]*class=["'][^"']*\bhack-cover\b[^"']*["'][^>]*>[\s\S]*?<img\b([^>]*)>/i,
    /<figure\b[^>]*class=["'][^"']*\barticle-visual\b[^"']*["'][^>]*>[\s\S]*?<img\b([^>]*)>/i,
    /<img\b(?=[^>]*class=["'][^"']*\bhero-mascot\b[^"']*["'])([^>]*)>/i
  ];
  for (const pattern of preferredPatterns) {
    const match = main.match(pattern);
    if (match) candidates.push(match[1]);
  }
  for (const match of main.matchAll(/<img\b([^>]*)>/gi)) candidates.push(match[1]);
  return candidates;
}

function attribute(attrs, name) {
  return decode(String(attrs).match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
}

async function selectRepresentativeImage(html) {
  const seen = new Set();
  for (const attrs of imageCandidates(html)) {
    const src = attribute(attrs, "src");
    const alt = attribute(attrs, "alt");
    if (!src || !alt || seen.has(src)) continue;
    seen.add(src);
    if (/brali-logo|favicon|icon(?:\.|-)/i.test(src)) continue;
    let url;
    try { url = new URL(src, `${SITE}/`); } catch { continue; }
    if (url.origin !== SITE) continue;
    const local = join(ROOT, decodeURIComponent(url.pathname).replace(/^\//, ""));
    try { await access(local); } catch { continue; }
    return { url: `${url.origin}${url.pathname}`, alt, source: "visible-informative-image" };
  }
  return null;
}

function types(node) {
  return Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]].filter(Boolean);
}

function containsType(value, type) {
  if (Array.isArray(value)) return value.some((item) => containsType(item, type));
  if (!value || typeof value !== "object") return false;
  if (types(value).includes(type)) return true;
  return Object.values(value).some((child) => containsType(child, type));
}

function imageObject(image) {
  return { "@type": "ImageObject", url: image, contentUrl: image };
}

function enrichStructuredData(value, image) {
  if (Array.isArray(value)) return value.map((item) => enrichStructuredData(item, image));
  if (!value || typeof value !== "object") return value;
  const nodeTypes = types(value);
  if (nodeTypes.includes("WebPage")) value.primaryImageOfPage = imageObject(image);
  if (nodeTypes.includes("Article")) value.image = image;
  for (const [key, child] of Object.entries(value)) {
    if (key === "primaryImageOfPage" || key === "image") continue;
    value[key] = enrichStructuredData(child, image);
  }
  return value;
}

function alignStructuredData(html, image, page) {
  let sawWebPage = false;
  let result = html.replace(/(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (whole, open, raw, close) => {
    try {
      const parsed = JSON.parse(raw);
      if (containsType(parsed, "WebPage")) sawWebPage = true;
      return `${open}${JSON.stringify(enrichStructuredData(parsed, image))}${close}`;
    } catch {
      return whole;
    }
  });
  if (!sawWebPage) {
    const webpage = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${page}#webpage`,
      url: page,
      primaryImageOfPage: imageObject(image)
    };
    result = result.replace(/<\/head>/i, `<script type="application/ld+json" data-image-discovery="true">${JSON.stringify(webpage)}</script></head>`);
  }
  return result;
}

let sitemap = await readFile(sitemapPath, "utf8");
const records = [];
const blocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);

for (const inner of blocks) {
  const page = decode(inner.match(/<loc>([^<]+)<\/loc>/)?.[1] || "");
  if (!page) continue;
  const file = htmlPath(page);
  if (!file) continue;
  let html;
  try { html = await readFile(file, "utf8"); } catch { continue; }

  if (page === `${SITE}/`) html = optimizeHomepageImageLoading(html);

  const serpTitle = conciseTitle(pageTitle(html));
  const serpDescription = conciseDescription(metaContent(html, "name", "description"));
  if (!serpTitle || !serpDescription) throw new Error(`Cannot finalize SERP/social metadata without title/description: ${page}`);

  html = setPageTitle(html, serpTitle);
  html = setMeta(html, "name", "description", serpDescription);
  html = setMeta(html, "property", "og:title", serpTitle);
  html = setMeta(html, "property", "og:description", serpDescription);
  html = setMeta(html, "property", "og:url", page);
  html = setMeta(html, "name", "twitter:title", serpTitle);
  html = setMeta(html, "name", "twitter:description", serpDescription);

  const representative = await selectRepresentativeImage(html);
  if (!representative) {
    html = setMeta(html, "name", "twitter:card", "summary");
    await writeFile(file, html);
    continue;
  }

  // Image discovery runs over the aggregate multilingual sitemap. Keep preview
  // semantics aligned for every index-eligible page selected for a real visible
  // informative image. Restricted/noindex routes never enter this sitemap.
  html = allowLargeImagePreview(html);
  html = setMeta(html, "property", "og:image", representative.url);
  html = setMeta(html, "property", "og:image:alt", representative.alt);
  html = setMeta(html, "name", "twitter:card", "summary_large_image");
  html = setMeta(html, "name", "twitter:image", representative.url);
  html = setMeta(html, "name", "twitter:image:alt", representative.alt);
  html = alignStructuredData(html, representative.url, page);
  await writeFile(file, html);
  records.push({ page, image: representative.url, alt: representative.alt, source: representative.source });
}

if (!sitemap.includes(`xmlns:image="${IMAGE_NS}"`)) {
  sitemap = sitemap.replace(/<urlset\b([^>]*)>/, `<urlset$1 xmlns:image="${IMAGE_NS}">`);
}
const byPage = new Map(records.map((record) => [record.page, record.image]));
sitemap = sitemap.replace(/<url>([\s\S]*?)<\/url>/g, (whole, inner) => {
  const page = decode(inner.match(/<loc>([^<]+)<\/loc>/)?.[1] || "");
  const image = byPage.get(page);
  if (!image) return whole;
  const cleaned = inner.replace(/<image:image>[\s\S]*?<\/image:image>/g, "");
  return `<url>${cleaned}<image:image><image:loc>${image}</image:loc></image:image></url>`;
});
await writeFile(sitemapPath, sitemap);
await writeFile(join(ROOT, "data", "image-discovery.json"), `${JSON.stringify({ version: "0.1", site: `${SITE}/`, records }, null, 2)}\n`);

console.log(`Brali SERP/social metadata finalized for ${blocks.length} sitemap page(s); Image Discovery applied to ${records.length} page(s) with visible informative images.`);
