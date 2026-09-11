import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const SITE = "https://brali-lifeos.github.io";
const IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";
const sitemapPath = join(ROOT, "sitemap.xml");

const decode = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .trim();
const escapeAttr = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

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

function enrichStructuredData(value, image) {
  if (Array.isArray(value)) return value.map((item) => enrichStructuredData(item, image));
  if (!value || typeof value !== "object") return value;
  const nodeTypes = types(value);
  const imageObject = { "@type": "ImageObject", url: image, contentUrl: image };
  if (nodeTypes.includes("WebPage")) value.primaryImageOfPage = imageObject;
  if (nodeTypes.includes("Article")) value.image = image;
  for (const [key, child] of Object.entries(value)) {
    if (key === "primaryImageOfPage" || key === "image") continue;
    value[key] = enrichStructuredData(child, image);
  }
  return value;
}

function alignStructuredData(html, image) {
  return html.replace(/(<script\b[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (whole, open, raw, close) => {
    try {
      return `${open}${JSON.stringify(enrichStructuredData(JSON.parse(raw), image))}${close}`;
    } catch {
      return whole;
    }
  });
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
  const representative = await selectRepresentativeImage(html);
  if (!representative) continue;

  html = setMeta(html, "property", "og:image", representative.url);
  html = setMeta(html, "property", "og:image:alt", representative.alt);
  html = setMeta(html, "name", "twitter:card", "summary_large_image");
  html = setMeta(html, "name", "twitter:image", representative.url);
  html = setMeta(html, "name", "twitter:image:alt", representative.alt);
  html = alignStructuredData(html, representative.url);
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

console.log(`Brali Image Discovery applied to ${records.length} canonical sitemap page(s) with visible informative images.`);
