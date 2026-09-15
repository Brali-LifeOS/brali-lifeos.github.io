import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const sourceLocale = profile.sourceLocale || "en";
const localeEntries = (profile.locales || []).filter((entry) => entry.role === "human-interface");
const failures = [];
const fail = (message) => failures.push(message);

const exists = async (file) => {
  try { await access(file); return true; } catch { return false; }
};
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const htmlFileForPath = (pathname) => pathname === "/"
  ? path.join(root, "index.html")
  : path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");

const manifests = new Map();
const routeMaps = new Map();
for (const entry of localeEntries) {
  const locale = entry.code;
  const requiredFiles = ["manifest.json", "sitemap.xml", "llms.txt", "library.json"];
  for (const relative of requiredFiles) {
    if (!(await exists(path.join(root, locale, relative)))) fail(`${locale}/${relative} missing from final artifact`);
  }
  const manifestFile = path.join(root, locale, "manifest.json");
  if (!(await exists(manifestFile))) continue;
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.locale !== locale) fail(`${locale}/manifest.json locale drift`);
  if (manifest.role !== entry.role) fail(`${locale}/manifest.json role drift: expected ${entry.role}, got ${manifest.role ?? "missing"}`);
  if (manifest.no_silent_fallback !== true) fail(`${locale}/manifest.json must forbid silent fallback`);
  if (manifest.coverage?.flagships && manifest.coverage?.flagship_protocols) {
    if (JSON.stringify(manifest.coverage.flagships) !== JSON.stringify(manifest.coverage.flagship_protocols)) {
      fail(`${locale}/manifest.json flagship compatibility alias drift`);
    }
  }
  manifests.set(locale, manifest);
  routeMaps.set(locale, new Map((manifest.routes || []).map((route) => [route.canonical_path, route])));
}

for (const entry of localeEntries) {
  if (!manifests.has(entry.code)) fail(`${entry.code} manifest unavailable; declared human-interface locale was not rendered`);
}

const canonicalPaths = new Set();
for (const map of routeMaps.values()) for (const canonicalPath of map.keys()) canonicalPaths.add(canonicalPath);

function expectedAlternates(canonicalPath) {
  const expected = [{ code: sourceLocale, languageTag: sourceLocale, label: "English", path: canonicalPath, url: canonicalUrl(canonicalPath) }];
  for (const entry of localeEntries) {
    const route = routeMaps.get(entry.code)?.get(canonicalPath);
    if (!route) continue;
    expected.push({ code: entry.code, languageTag: entry.languageTag || entry.code, label: entry.label || entry.code, path: route.path, url: route.url });
  }
  return expected;
}

function checkPage(html, pagePath, canonicalPath, currentCode, expected) {
  const ownUrl = currentCode === sourceLocale
    ? canonicalUrl(canonicalPath)
    : routeMaps.get(currentCode)?.get(canonicalPath)?.url;
  if (ownUrl && !html.includes(`<link rel="canonical" href="${ownUrl}">`)) fail(`${pagePath} does not self-canonicalize`);

  for (const alternate of expected) {
    const token = `hreflang="${alternate.languageTag}" href="${alternate.url}"`;
    if (!html.includes(token)) fail(`${pagePath} missing hreflang ${alternate.languageTag} -> ${alternate.url}`);
  }
  const xDefault = `hreflang="x-default" href="${canonicalUrl(canonicalPath)}"`;
  if (!html.includes(xDefault)) fail(`${pagePath} missing source-locale x-default`);

  for (const alternate of expected.filter((item) => item.code !== currentCode)) {
    const switchToken = `hreflang="${alternate.languageTag}" href="${alternate.path}"`;
    if (!html.includes(switchToken)) fail(`${pagePath} missing locale switch to ${alternate.code}`);
  }
}

for (const canonicalPath of [...canonicalPaths].sort()) {
  const expected = expectedAlternates(canonicalPath);
  const englishFile = htmlFileForPath(canonicalPath);
  if (!(await exists(englishFile))) {
    fail(`canonical page missing from artifact: ${canonicalPath}`);
  } else {
    checkPage(await readFile(englishFile, "utf8"), canonicalPath, canonicalPath, sourceLocale, expected);
  }

  for (const entry of localeEntries) {
    const route = routeMaps.get(entry.code)?.get(canonicalPath);
    if (!route) continue;
    const file = htmlFileForPath(route.path);
    if (!(await exists(file))) {
      fail(`localized page missing from artifact: ${route.path}`);
      continue;
    }
    checkPage(await readFile(file, "utf8"), route.path, canonicalPath, entry.code, expected);
  }
}

for (const entry of localeEntries) {
  const locale = entry.code;
  const manifest = manifests.get(locale);
  if (!manifest) continue;
  const sitemap = await readFile(path.join(root, locale, "sitemap.xml"), "utf8");
  for (const route of manifest.routes || []) {
    if (!sitemap.includes(`<loc>${route.url}</loc>`)) fail(`${locale}/sitemap.xml missing ${route.path}`);
  }
  const llms = await readFile(path.join(root, locale, "llms.txt"), "utf8");
  if (!llms.includes(`Locale: ${locale}`)) fail(`${locale}/llms.txt missing locale declaration`);
  if (!llms.includes(`Role: ${entry.role}`)) fail(`${locale}/llms.txt missing role declaration`);
  if (!llms.includes(`Canonical locale: ${sourceLocale}`)) fail(`${locale}/llms.txt missing canonical locale declaration`);
  if (!llms.includes("No silent fallback: true")) fail(`${locale}/llms.txt missing no-silent-fallback declaration`);
}

if (failures.length) {
  console.error(`[localization-artifact] ${failures.length} failure(s)`);
  for (const message of failures.slice(0, 300)) console.error(`  ${message}`);
  if (failures.length > 300) console.error(`  ... ${failures.length - 300} more`);
  process.exit(1);
}

console.log(`Final localization artifact passed: ${localeEntries.map((entry) => entry.code).join(", ")} with ${canonicalPaths.size} canonical route clusters.`);
