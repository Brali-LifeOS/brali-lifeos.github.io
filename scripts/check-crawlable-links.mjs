import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const registry = JSON.parse(await readFile(path.join(root, "indexability.json"), "utf8"));
const rows = registry.routes || [];
const failures = [];
const fail = (message) => failures.push(message);

const decode = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

function attr(tag, name) {
  return decode(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
}

function htmlFile(pathname) {
  if (pathname === "/") return path.join(root, "index.html");
  if (pathname.endsWith(".html")) return path.join(root, pathname.slice(1));
  return path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}

function directFile(pathname) {
  return path.join(root, decodeURIComponent(pathname).replace(/^\//, ""));
}

async function targetState(pathname) {
  if (pathname === "/" || pathname.endsWith("/")) {
    try {
      const info = await stat(htmlFile(pathname));
      return { exists: info.isFile(), file: htmlFile(pathname), html: info.isFile() };
    } catch {
      return { exists: false, file: htmlFile(pathname), html: true };
    }
  }
  const file = directFile(pathname);
  try {
    const info = await stat(file);
    if (info.isDirectory()) return { exists: false, file, directoryWithoutSlash: true, html: false };
    return { exists: info.isFile(), file, html: /\.html?$/i.test(pathname) };
  } catch {
    return { exists: false, file, html: /\.html?$/i.test(pathname) };
  }
}

function anchors(html, currentPath) {
  const result = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
    const href = attr(tag, "href");
    if (!href || href.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
    let url;
    try { url = new URL(href, `${base}${currentPath}`); }
    catch {
      fail(`${currentPath}: malformed href ${href}`);
      continue;
    }
    if (url.origin !== base) continue;
    result.push({
      raw: href,
      path: url.pathname,
      fragment: url.hash ? decodeURIComponent(url.hash.slice(1)) : "",
      lang: attr(tag, "lang").toLowerCase(),
      hreflang: attr(tag, "hreflang").toLowerCase(),
    });
  }
  return result;
}

function fragmentExists(html, fragment) {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:id|name)=["']${escaped}["']`, "i").test(html);
}

const rowByPath = new Map(rows.map((row) => [row.path, row]));
if (rowByPath.size !== rows.length) fail("indexability registry has duplicate paths");
const eligiblePaths = new Set(rowByPath.keys());
const inbound = new Map(rows.map((row) => [row.path, new Set()]));
const htmlCache = new Map();

const localizedEquivalent = new Map();
for (const set of registry.translation_sets || []) {
  let sourcePath;
  try { sourcePath = new URL(set.canonical_url).pathname; }
  catch { continue; }
  for (const [language, href] of Object.entries(set.alternates || {})) {
    if (language === "en" || language === "x-default") continue;
    try { localizedEquivalent.set(`${language}\u0000${sourcePath}`, new URL(href).pathname); }
    catch { /* invalid alternates are handled by the indexability contract */ }
  }
}

async function loadHtml(pathname) {
  if (htmlCache.has(pathname)) return htmlCache.get(pathname);
  const html = await readFile(htmlFile(pathname), "utf8");
  htmlCache.set(pathname, html);
  return html;
}

let internalLinks = 0;
let explicitCrossLocale = 0;
for (const row of rows) {
  const html = await loadHtml(row.path);
  for (const link of anchors(html, row.path)) {
    internalLinks += 1;
    const target = await targetState(link.path);
    if (!target.exists) {
      const reason = target.directoryWithoutSlash ? "directory URL omits trailing slash" : "target does not exist";
      fail(`${row.path}: broken internal href ${link.raw} (${reason})`);
      continue;
    }

    if (eligiblePaths.has(link.path) && link.path !== row.path) inbound.get(link.path)?.add(row.path);

    if (link.fragment && target.html) {
      const targetHtml = link.path === row.path ? html : await loadHtml(link.path);
      if (!fragmentExists(targetHtml, link.fragment)) fail(`${row.path}: broken fragment ${link.raw}`);
    }

    if (row.locale !== "en") {
      const equivalent = localizedEquivalent.get(`${row.locale}\u0000${link.path}`);
      if (equivalent && equivalent !== link.path) {
        const explicitLanguageBoundary = link.lang === "en" || link.hreflang === "en";
        if (!explicitLanguageBoundary) {
          fail(`${row.path}: locale leakage ${link.raw}; ${row.locale} equivalent exists at ${equivalent}`);
        } else {
          explicitCrossLocale += 1;
        }
      }
    }
  }
}

for (const row of rows) {
  if ((inbound.get(row.path)?.size || 0) === 0) {
    fail(`${row.path}: index-eligible orphan has no incoming crawlable link from another index-eligible page`);
  }
}

if (failures.length) {
  console.error(`[crawlable-links] ${failures.length} failure(s)`);
  for (const message of failures.slice(0, 300)) console.error(`  - ${message}`);
  if (failures.length > 300) console.error(`  - ... ${failures.length - 300} more`);
  throw new Error("Crawlable link graph failed.");
}

console.log(`[crawlable-links] passed ${rows.length} index-eligible pages and ${internalLinks} internal anchors; zero missing targets, broken fragments, unexplained locale leakage or orphans; explicit cross-locale boundaries=${explicitCrossLocale}.`);
