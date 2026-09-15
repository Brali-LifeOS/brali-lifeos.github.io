import { readFile } from "node:fs/promises";

const profile = JSON.parse(await readFile(".arwp/localization.json", "utf8"));
const base = (process.env.BRALI_LIVE_BASE_URL || profile.site || "https://brali-lifeos.github.io/").replace(/\/$/, "");
const expectedSha = process.env.GITHUB_SHA || "unknown";
const failures = [];
const fail = (message) => failures.push(message);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

function attr(tag, name) {
  return decode(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
}
function element(html, name, key, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<${name}\\b(?=[^>]*\\b${key}=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
}
function meta(html, key, value) {
  return attr(element(html, "meta", key, value), "content");
}
function canonical(html) {
  return attr(element(html, "link", "rel", "canonical"), "href");
}
function hreflang(html, language) {
  const escaped = language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(new RegExp(`<link\\b(?=[^>]*\\brel=["']alternate["'])(?=[^>]*\\bhreflang=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
  return attr(tag, "href");
}
function title(html) {
  return decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
}
function sitemapLocs(xml) {
  return [...xml.matchAll(/<(?:[a-z]+:)?loc>([^<]+)<\/(?:[a-z]+:)?loc>/gi)]
    .filter((match) => !match[0].toLowerCase().startsWith("<image:"))
    .map((match) => decode(match[1]).trim());
}

async function fetchText(pathname, { attempts = 5 } = {}) {
  const separator = pathname.includes("?") ? "&" : "?";
  const url = `${base}${pathname}${separator}verify=${encodeURIComponent(expectedSha)}`;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
          "user-agent": "Brali-Live-Indexability-Check/1.0",
        },
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt < attempts) {
          await wait(700 * attempt);
          continue;
        }
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return { text: await response.text(), response };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(700 * attempt);
    }
  }
  throw new Error(`${pathname}: ${lastError?.message || "fetch failed"}`);
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { await worker(items[index], index); }
      catch (error) { fail(error.message); }
    }
  });
  await Promise.all(runners);
}

const [{ text: registryText }, { text: sitemapXml }, { text: robotsTxt }] = await Promise.all([
  fetchText("/indexability.json"),
  fetchText("/sitemap.xml"),
  fetchText("/robots.txt"),
]);
const registry = JSON.parse(registryText);
const rows = registry.routes || [];
if (!rows.length) throw new Error("[live-indexability] deployed indexability.json has no routes");
if (registry.route_count !== rows.length) fail(`registry route_count drift ${registry.route_count}/${rows.length}`);
if (new Set(rows.map((row) => row.path)).size !== rows.length) fail("deployed indexability registry has duplicate paths");

const sitemapUrls = sitemapLocs(sitemapXml);
const registryUrls = rows.map((row) => row.url);
const sitemapSet = new Set(sitemapUrls);
const registrySet = new Set(registryUrls);
if (sitemapSet.size !== sitemapUrls.length) fail("deployed root sitemap has duplicate canonical URLs");
if (registrySet.size !== registryUrls.length) fail("deployed indexability registry has duplicate canonical URLs");
const missing = registryUrls.filter((url) => !sitemapSet.has(url));
const extra = sitemapUrls.filter((url) => !registrySet.has(url));
if (missing.length || extra.length) fail(`root sitemap/indexability parity drift missing=${missing.slice(0, 8).join(",") || "none"} extra=${extra.slice(0, 8).join(",") || "none"}`);

if (!robotsTxt.includes(`Sitemap: ${base}/sitemap.xml`)) fail("robots.txt does not advertise aggregate sitemap");
for (const locale of (profile.locales || []).filter((entry) => entry.role === "human-interface" && entry.searchPublication !== "none")) {
  const expected = `Sitemap: ${base}${locale.routePrefix}sitemap.xml`;
  if (!robotsTxt.includes(expected)) fail(`robots.txt does not advertise ${locale.code} sitemap`);
}

await mapLimit(rows, 28, async (row) => {
  const { text: html, response } = await fetchText(row.path, { attempts: 4 });
  const finalUrl = new URL(response.url);
  if (response.redirected || finalUrl.pathname !== row.path) throw new Error(`${row.path}: unexpected redirect/final path ${finalUrl.pathname}`);
  if (!title(html)) throw new Error(`${row.path}: missing deployed title`);
  if (!meta(html, "name", "description")) throw new Error(`${row.path}: missing deployed meta description`);
  if (canonical(html) !== row.canonical_url) throw new Error(`${row.path}: deployed canonical drift ${canonical(html) || "missing"}`);
  const robots = meta(html, "name", "robots").toLowerCase();
  if (/\b(?:noindex|none)\b/.test(robots)) throw new Error(`${row.path}: deployed index-eligible URL is noindex`);
  const language = row.language_tag || row.locale;
  if (!new RegExp(`<html\\b[^>]*\\blang=["']${language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html)) {
    throw new Error(`${row.path}: deployed html lang is not ${language}`);
  }
  for (const [alternateLanguage, href] of Object.entries(row.alternates || {})) {
    if (hreflang(html, alternateLanguage) !== href) throw new Error(`${row.path}: deployed hreflang ${alternateLanguage} drift`);
  }
});

if (failures.length) {
  console.error(`[live-indexability] ${failures.length} failure(s)`);
  for (const message of failures.slice(0, 200)) console.error(`  - ${message}`);
  if (failures.length > 200) console.error(`  - ... ${failures.length - 200} more`);
  throw new Error("Deployed indexability graph failed.");
}

console.log(`[live-indexability] verified ${rows.length} deployed canonical pages against aggregate sitemap/indexability.json: HTTP 200/no redirects, self canonical, indexable robots, html lang and declared hreflang all converge.`);
