import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const identity = JSON.parse(await readFile(join(root, "data", "site-identity.json"), "utf8"));
const siteOrigin = new URL(identity.siteUrl).origin;
const fail = (message) => { throw new Error(`search_release_gate:${message}`); };

const decode = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replace(/\s+/g, " ")
  .trim();

function tag(html, element, key, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<${element}\\b(?=[^>]*\\b${key}=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
}
function attr(source, name) {
  return decode(source.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
}
function meta(html, key, value) {
  return attr(tag(html, "meta", key, value), "content");
}
function canonical(html) {
  return attr(tag(html, "link", "rel", "canonical"), "href");
}
function title(html) {
  return decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}
function jsonLd(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => {
    try { return JSON.parse(match[1]); }
    catch (error) { fail(`invalid JSON-LD: ${error.message}`); }
  });
}
function collectType(value, type, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) collectType(item, type, found);
    return found;
  }
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.includes(type)) found.push(value);
  for (const child of Object.values(value)) collectType(child, type, found);
  return found;
}
function htmlPath(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== siteOrigin) fail(`sitemap leaks another host: ${urlValue}`);
  if (url.pathname === "/") return join(root, "index.html");
  if (url.pathname.endsWith(".html")) return join(root, url.pathname.slice(1));
  return join(root, url.pathname.slice(1), "index.html");
}

const home = await readFile(join(root, "index.html"), "utf8");
if (title(home) !== identity.homepageTitle) fail(`homepage title mismatch: ${JSON.stringify(title(home))}`);
if (meta(home, "name", "description") !== identity.homepageDescription) fail("homepage description drifted from site identity contract");
if (canonical(home) !== identity.siteUrl) fail(`homepage canonical mismatch: ${canonical(home)}`);
if (meta(home, "property", "og:site_name") !== identity.siteName) fail("homepage og:site_name mismatch");
if (meta(home, "property", "og:url") !== identity.siteUrl) fail("homepage og:url mismatch");
const robotsHome = meta(home, "name", "robots").toLowerCase();
if (robotsHome.includes("noindex") || robotsHome.includes("none")) fail("homepage is accidentally noindex");

const websites = jsonLd(home).flatMap((value) => collectType(value, "WebSite")).filter((node) => node.name && node.url);
if (websites.length !== 1) fail(`homepage must expose exactly one full WebSite identity, found ${websites.length}`);
if (websites[0].name !== identity.siteName || websites[0].url !== identity.siteUrl) fail("WebSite identity disagrees with site identity contract");

const faviconPath = join(root, identity.faviconPath.replace(/^\//, ""));
const favicon = await readFile(faviconPath);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!favicon.subarray(0, 8).equals(pngSignature)) fail("configured favicon is not a PNG");
const width = favicon.readUInt32BE(16);
const height = favicon.readUInt32BE(20);
if (width !== height) fail(`favicon is not square: ${width}x${height}`);
if (width < 48) fail(`favicon source is too small for Search: ${width}x${height}`);

const sitemap = await readFile(join(root, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
if (!locs.length) fail("sitemap has no URL entries");
if (new Set(locs).size !== locs.length) fail("sitemap contains duplicate URLs");
if (!locs.includes(identity.siteUrl)) fail("sitemap omits canonical homepage");
if (locs.some((loc) => /\/404(?:\.html)?\/?$/.test(loc))) fail("404 route is listed in sitemap");

for (const loc of locs) {
  const file = htmlPath(loc);
  let html;
  try { html = await readFile(file, "utf8"); }
  catch { fail(`sitemap URL has no built HTML file: ${loc}`); }
  if (!title(html)) fail(`${loc}: missing title`);
  if (!meta(html, "name", "description")) fail(`${loc}: missing meta description`);
  const pageCanonical = canonical(html);
  if (pageCanonical !== loc) fail(`${loc}: canonical mismatch (${pageCanonical || "none"})`);
  const pageRobots = meta(html, "name", "robots").toLowerCase();
  if (pageRobots.includes("noindex") || pageRobots.includes("none")) fail(`${loc}: sitemap contains a noindex page`);
  for (const block of jsonLd(html)) void block;
}

const robotsTxt = await readFile(join(root, "robots.txt"), "utf8");
if (!robotsTxt.includes(`Sitemap: ${identity.siteUrl}sitemap.xml`)) fail("robots.txt does not advertise canonical sitemap");

const errorHtml = await readFile(join(root, "404.html"), "utf8");
if (!meta(errorHtml, "name", "robots").toLowerCase().includes("noindex")) fail("404.html is missing noindex");
if (canonical(errorHtml)) fail("404.html advertises canonical content");
if (!errorHtml.includes('href="/"')) fail("404.html lacks a homepage recovery path");

const llms = await readFile(join(root, "llms.txt"), "utf8");
if (!llms.startsWith(`# ${identity.siteName}\n`)) fail("llms.txt disagrees with canonical site name");
if (!llms.includes(identity.siteUrl)) fail("llms.txt does not advertise canonical host");

try {
  const profile = await readFile(join(root, "ai", "site-profile.json"), "utf8");
  if (!profile.includes(identity.siteName) || !profile.includes(identity.siteUrl)) fail("AI site profile disagrees with canonical identity");
  if (/localhost|\.vercel\.app/i.test(profile)) fail("AI site profile leaks local/preview identity");
} catch (error) {
  if (String(error?.message || "").startsWith("search_release_gate:")) throw error;
  fail("ai/site-profile.json is missing from the final artifact");
}

await access(join(root, "index.html"));
console.log(`Brali Search Release gate passed: ${locs.length} canonical sitemap pages, exact homepage identity, one WebSite node, ${width}x${height} favicon, robots, noindex 404, llms.txt and AI profile.`);
