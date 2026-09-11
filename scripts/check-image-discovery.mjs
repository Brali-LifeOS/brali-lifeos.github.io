import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const SITE = "https://brali-lifeos.github.io";
const IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";
const fail = (message) => { throw new Error(`image_discovery:${message}`); };
const decode = (value = "") => String(value).replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").trim();

function htmlPath(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== SITE) return null;
  if (url.pathname === "/") return join(ROOT, "index.html");
  if (url.pathname.endsWith(".html")) return join(ROOT, url.pathname.slice(1));
  return join(ROOT, url.pathname.slice(1), "index.html");
}
function tag(html, element, key, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<${element}\\b(?=[^>]*\\b${key}=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
}
function attr(source, name) {
  return decode(source.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
}
function meta(html, key, value) { return attr(tag(html, "meta", key, value), "content"); }
function walk(value, visitor) {
  if (Array.isArray(value)) { for (const item of value) walk(item, visitor); return; }
  if (!value || typeof value !== "object") return;
  visitor(value);
  for (const child of Object.values(value)) walk(child, visitor);
}
function preferredImages(html) {
  const found = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(match[1]); } catch { continue; }
    walk(parsed, (node) => {
      const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]].filter(Boolean);
      if (types.includes("WebPage")) {
        const image = node.primaryImageOfPage;
        const url = typeof image === "string" ? image : image?.contentUrl || image?.url;
        if (url) found.push(url);
      }
    });
  }
  return found;
}

const manifest = JSON.parse(await readFile(join(ROOT, "data", "image-discovery.json"), "utf8"));
const sitemap = await readFile(join(ROOT, "sitemap.xml"), "utf8");
if (manifest.version !== "0.1" || manifest.site !== `${SITE}/`) fail("manifest identity/version mismatch");
if (!Array.isArray(manifest.records) || !manifest.records.length) fail("manifest has no representative image records");
if (!sitemap.includes(`xmlns:image="${IMAGE_NS}"`)) fail("sitemap is missing Google image namespace");
if (/<image:(caption|geo_location|title|license)>/i.test(sitemap)) fail("deprecated Google image sitemap field found");

const blocks = new Map();
for (const match of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const page = decode(match[1].match(/<loc>([^<]+)<\/loc>/)?.[1] || "");
  if (page) blocks.set(page, match[1]);
}

for (const record of manifest.records) {
  if (!record.page.startsWith(`${SITE}/`)) fail(`wrong page origin: ${record.page}`);
  if (!record.image.startsWith(`${SITE}/`)) fail(`wrong image origin: ${record.image}`);
  if (!String(record.alt || "").trim()) fail(`empty informative alt: ${record.page}`);
  const block = blocks.get(record.page);
  if (!block) fail(`page missing from sitemap: ${record.page}`);
  if (!block.includes(`<image:image><image:loc>${record.image}</image:loc></image:image>`)) fail(`image sitemap entry mismatch: ${record.page}`);

  const file = htmlPath(record.page);
  if (!file) fail(`cannot map HTML path: ${record.page}`);
  const html = await readFile(file, "utf8");
  if (meta(html, "property", "og:image") !== record.image) fail(`og:image mismatch: ${record.page}`);
  if (meta(html, "name", "twitter:image") !== record.image) fail(`twitter:image mismatch: ${record.page}`);
  if (meta(html, "name", "twitter:card") !== "summary_large_image") fail(`twitter card is not large-image: ${record.page}`);
  if (!/max-image-preview\s*:\s*large/i.test(meta(html, "name", "robots"))) fail(`large image preview missing: ${record.page}`);
  if (/\bnoimageindex\b/i.test(meta(html, "name", "robots"))) fail(`noimageindex conflicts with image discovery: ${record.page}`);
  if (!preferredImages(html).includes(record.image)) fail(`primaryImageOfPage mismatch: ${record.page}`);

  const imageUrl = new URL(record.image);
  await access(join(ROOT, decodeURIComponent(imageUrl.pathname).replace(/^\//, "")));
}

console.log(`Brali Image Discovery gate passed for ${manifest.records.length} canonical page(s): sitemap, og/Twitter/schema convergence, preview controls, informative alt and local assets verified.`);
