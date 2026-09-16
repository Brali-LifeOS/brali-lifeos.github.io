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
function imageTags(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
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
const recordByPage = new Map(manifest.records.map((record) => [record.page, record]));

for (const page of blocks.keys()) {
  const file = htmlPath(page);
  if (!file) fail(`cannot map HTML path: ${page}`);
  const html = await readFile(file, "utf8");
  if (!meta(html, "property", "og:title")) fail(`missing og:title: ${page}`);
  if (!meta(html, "property", "og:description")) fail(`missing og:description: ${page}`);
  if (meta(html, "property", "og:url") !== page) fail(`og:url is not canonical self URL: ${page}`);
  if (!meta(html, "name", "twitter:title")) fail(`missing twitter:title: ${page}`);
  if (!meta(html, "name", "twitter:description")) fail(`missing twitter:description: ${page}`);
  const card = meta(html, "name", "twitter:card");
  if (!new Set(["summary", "summary_large_image"]).has(card)) fail(`invalid or missing twitter:card: ${page}`);

  const record = recordByPage.get(page);
  if (record && card !== "summary_large_image") fail(`representative image page must use summary_large_image: ${page}`);
  if (!record && card !== "summary") fail(`page without representative image must use summary card: ${page}`);

  if (page === `${SITE}/`) {
    const tags = imageTags(html);
    const hero = tags.find((image) => /\bhero-mascot\b/.test(attr(image, "class")));
    if (!hero || attr(hero, "fetchpriority") !== "high") fail("homepage hero mascot must use fetchpriority=high");
    if (attr(hero, "decoding") !== "async") fail("homepage hero mascot must use decoding=async");
    const belowFold = tags.filter((image) => /\baudience-visual\b/.test(attr(image, "class")) || /\/assets\/images\/brali-category-/i.test(attr(image, "src")));
    if (!belowFold.length) fail("homepage performance cohort was not found");
    for (const image of belowFold) {
      if (attr(image, "loading") !== "lazy") fail(`homepage below-fold image is not lazy: ${attr(image, "src")}`);
      if (attr(image, "decoding") !== "async") fail(`homepage below-fold image is not async-decoded: ${attr(image, "src")}`);
      if (attr(image, "fetchpriority") !== "low") fail(`homepage below-fold image is not low priority: ${attr(image, "src")}`);
    }
  }
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

console.log(`Brali social/Image Discovery gate passed for ${blocks.size} canonical page(s): universal OG/Twitter metadata, ${manifest.records.length} representative-image page(s), schema/sitemap convergence and homepage loading priorities verified.`);
