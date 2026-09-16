import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const indexable = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&")));
const nonPublicPrefixes = ["reports/", "life-os/taxonomy/status/", "life-os/taxonomy/seo/", "life-os/taxonomy/mini-app/"];

const decode = (value = "") => String(value).replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").trim();
const escapeAttr = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function attrValue(tag = "", name = "") {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return decode(match?.[2] || "");
}
function metaContent(html, key, value) {
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*\\b${key}=["']${value}["'])[^>]*>`, "i"))?.[0] || "";
  return attrValue(tag, "content");
}
function setMeta(html, key, value, content) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${key}=["']${value}["'])[^>]*>`, "gi");
  const replacement = `<meta ${key}="${value}" content="${escapeAttr(content)}">`;
  let seen = false;
  html = html.replace(pattern, () => {
    if (seen) return "";
    seen = true;
    return replacement;
  });
  return seen ? html : html.replace(/<\/head>/i, `${replacement}</head>`);
}
function canonical(html) {
  const tag = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0] || "";
  return attrValue(tag, "href");
}
function setImageAttributes(tag, attrs) {
  let next = tag;
  for (const [name, value] of Object.entries(attrs)) {
    const pattern = new RegExp(`\\s${name}\\s*=\\s*(["']).*?\\1`, "i");
    if (pattern.test(next)) next = next.replace(pattern, ` ${name}="${value}"`);
    else next = next.replace(/\s*\/>$|>$/, (end) => ` ${name}="${value}"${end.trimStart()}`);
  }
  return next;
}
function hardenHomepageImages(html) {
  const dimensions = new Map([
    ["/assets/images/brali-mascot-pointing.png", [1122, 1402, false]],
    ["/assets/images/brali-category-focus.png", [1254, 1254, true]],
    ["/assets/images/brali-category-stress.png", [1254, 1254, true]],
    ["/assets/images/brali-category-memory.png", [1254, 1254, true]],
    ["/assets/images/brali-category-sleep.png", [1254, 1254, true]],
    ["/assets/images/brali-category-habits.png", [1254, 1254, true]],
    ["/assets/images/brali-category-learning.png", [1254, 1254, true]],
    ["/assets/images/brali-category-movement.png", [1254, 1254, true]],
    ["/assets/images/brali-logo.png", [1254, 1254, true]],
    ["/assets/images/brali-audience-people.png?v=20260822e", [1448, 1086, true]],
    ["/assets/images/brali-audience-research.png?v=20260822e", [1448, 1086, true]],
    ["/assets/images/brali-audience-ai.png?v=20260822e", [1448, 1086, true]],
  ]);
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attrValue(tag, "src");
    const spec = dimensions.get(src);
    if (!spec) return tag;
    const [width, height, lazy] = spec;
    const attrs = { width, height, decoding: "async" };
    if (lazy && !/\bhero-mascot\b/.test(tag)) attrs.loading = "lazy";
    if (/\bhero-mascot\b/.test(tag)) attrs.fetchpriority = "high";
    return setImageAttributes(tag, attrs);
  });
}
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

let socialCompleted = 0;
let explicitlyWithheld = 0;
for (const file of await walk(root)) {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  let html = await readFile(file, "utf8");
  if (!/<html\b/i.test(html) || !/<head\b/i.test(html)) continue;
  const url = canonical(html);
  if (url && indexable.has(url)) {
    const titleTag = decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const title = metaContent(html, "property", "og:title") || titleTag.replace(/\s+[—|]\s+Brali(?: LifeOS)?\s*$/i, "");
    const description = metaContent(html, "property", "og:description") || metaContent(html, "name", "description");
    const image = metaContent(html, "property", "og:image");
    html = setMeta(html, "name", "twitter:card", image ? "summary_large_image" : "summary");
    if (title) html = setMeta(html, "name", "twitter:title", title);
    if (description) html = setMeta(html, "name", "twitter:description", description);
    if (image) html = setMeta(html, "name", "twitter:image", image);
    socialCompleted += 1;
  } else if (nonPublicPrefixes.some((prefix) => rel.startsWith(prefix))) {
    const current = metaContent(html, "name", "robots");
    if (!/\bnoindex\b/i.test(current)) {
      html = setMeta(html, "name", "robots", rel.startsWith("reports/") ? "noindex,nofollow" : "noindex,follow");
      explicitlyWithheld += 1;
    }
  }
  if (rel === "index.html") html = hardenHomepageImages(html);
  await writeFile(file, html);
}

console.log(`Search metadata finalized: ${socialCompleted} sitemap HTML page(s) received deterministic Twitter fallback metadata; ${explicitlyWithheld} non-public HTML page(s) explicitly withheld; homepage image loading hardened.`);
