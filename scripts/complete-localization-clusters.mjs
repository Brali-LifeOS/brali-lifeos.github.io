import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const sourceLocale = profile.sourceLocale || "en";
const localeEntries = (profile.locales || []).filter((entry) => entry.role === "human-interface");

const exists = async (file) => {
  try { await access(file); return true; } catch { return false; }
};
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const htmlEscape = (value) => String(value).replace(/[&<>'"]/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[ch]);
const htmlFileForPath = (pathname) => pathname === "/"
  ? path.join(root, "index.html")
  : path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");

const manifests = new Map();
for (const entry of localeEntries) {
  const file = path.join(root, entry.code, "manifest.json");
  if (!(await exists(file))) continue;
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifests.set(entry.code, manifest);
}

const routeMaps = new Map();
for (const [locale, manifest] of manifests) {
  routeMaps.set(locale, new Map((manifest.routes || []).map((route) => [route.canonical_path, route])));
}

const canonicalPaths = new Set();
for (const map of routeMaps.values()) for (const canonicalPath of map.keys()) canonicalPaths.add(canonicalPath);

function alternatesFor(canonicalPath) {
  const alternates = [{ code: sourceLocale, languageTag: sourceLocale, label: "English", path: canonicalPath, url: canonicalUrl(canonicalPath) }];
  for (const entry of localeEntries) {
    const route = routeMaps.get(entry.code)?.get(canonicalPath);
    if (!route) continue;
    alternates.push({ code: entry.code, languageTag: entry.languageTag || entry.code, label: entry.label || entry.code, path: route.path, url: route.url });
  }
  return alternates;
}

function normalizeHead(html, canonicalPath, alternates) {
  html = html.replace(/\n?<link\s+rel=["']alternate["'][^>]*hreflang=["'][^"']+["'][^>]*>\s*/gi, "\n");
  const tags = alternates.map((item) => `<link rel="alternate" hreflang="${htmlEscape(item.languageTag)}" href="${htmlEscape(item.url)}">`).join("\n")
    + `\n<link rel="alternate" hreflang="x-default" href="${htmlEscape(canonicalUrl(canonicalPath))}">`;
  const canonicalPattern = /(<link\s+rel=["']canonical["'][^>]*>)/i;
  if (!canonicalPattern.test(html)) throw new Error(`missing canonical link for ${canonicalPath}`);
  return html.replace(canonicalPattern, `$1\n${tags}`);
}

function normalizeSwitchers(html, alternates, currentCode) {
  const links = alternates
    .filter((item) => item.code !== currentCode)
    .map((item) => `<a lang="${htmlEscape(item.languageTag)}" hreflang="${htmlEscape(item.languageTag)}" href="${htmlEscape(item.path)}">${htmlEscape(item.label)}</a>`)
    .join("");
  const languageAnchor = /<a\s+lang=["'](?:en|ru|de)["'][^>]*hreflang=["'](?:en|ru|de)["'][^>]*>[^<]+<\/a>/gi;
  let first = true;
  return html.replace(languageAnchor, (match) => {
    if (!first) return "";
    first = false;
    return links || match;
  });
}

let patched = 0;
for (const canonicalPath of [...canonicalPaths].sort()) {
  const alternates = alternatesFor(canonicalPath);
  if (alternates.length < 2) continue;

  const englishFile = htmlFileForPath(canonicalPath);
  if (await exists(englishFile)) {
    let html = await readFile(englishFile, "utf8");
    html = normalizeHead(html, canonicalPath, alternates);
    html = normalizeSwitchers(html, alternates, sourceLocale);
    await writeFile(englishFile, html);
    patched += 1;
  }

  for (const entry of localeEntries) {
    const route = routeMaps.get(entry.code)?.get(canonicalPath);
    if (!route) continue;
    const file = htmlFileForPath(route.path);
    if (!(await exists(file))) throw new Error(`localized route missing from artifact: ${route.path}`);
    let html = await readFile(file, "utf8");
    html = normalizeHead(html, canonicalPath, alternates);
    html = normalizeSwitchers(html, alternates, entry.code);
    await writeFile(file, html);
    patched += 1;
  }
}

console.log(`Completed multilingual locale clusters across ${patched} rendered pages.`);
