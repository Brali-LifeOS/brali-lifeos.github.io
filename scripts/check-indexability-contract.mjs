import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const sourceLocale = (profile.locales || []).find((entry) => entry.code === profile.sourceLocale);
if (!sourceLocale) throw new Error("[indexability-check] source locale missing from registry");
const releaseLocales = (profile.locales || []).filter((entry) =>
  entry.role === "human-interface"
  && ["reviewed-partial", "published"].includes(entry.status)
  && entry.searchPublication !== "none"
);

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
function tag(html, element, key, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<${element}\\b(?=[^>]*\\b${key}=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
}
function meta(html, key, value) {
  return attr(tag(html, "meta", key, value), "content");
}
function canonical(html) {
  return attr(tag(html, "link", "rel", "canonical"), "href");
}
function title(html) {
  return decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
}
function routeFile(pathname) {
  if (pathname === "/") return path.join(root, "index.html");
  if (pathname.endsWith(".html")) return path.join(root, pathname.slice(1));
  return path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}
function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]).trim());
}
function pathnameFromUrl(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== base) throw new Error(`[indexability-check] unexpected host ${urlValue}`);
  return url.pathname;
}
function languageAlternates(html) {
  const values = new Map();
  for (const link of html.match(/<link\b[^>]*>/gi) || []) {
    if (attr(link, "rel").toLowerCase() !== "alternate") continue;
    const language = attr(link, "hreflang");
    const href = attr(link, "href");
    if (!language || !href) continue;
    const list = values.get(language) || [];
    list.push(href);
    values.set(language, list);
  }
  return values;
}
function anchors(html, currentPath) {
  const result = [];
  for (const anchor of html.match(/<a\b[^>]*>/gi) || []) {
    const href = attr(anchor, "href");
    if (!href || href.startsWith("#") || /^(?:mailto|tel|javascript):/i.test(href)) continue;
    let url;
    try { url = new URL(href, `${base}${currentPath}`); }
    catch { continue; }
    if (url.origin !== base) continue;
    result.push({
      path: url.pathname,
      fragment: url.hash ? decodeURIComponent(url.hash.slice(1)) : "",
      raw: href,
    });
  }
  return result;
}
async function exists(file) {
  try { await access(file); return true; }
  catch { return false; }
}
async function jsonLdLanguages(html) {
  const languages = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(visit);
        if (typeof node.inLanguage === "string") languages.push(node.inLanguage);
        for (const child of Object.values(node)) visit(child);
      };
      visit(value);
    } catch (error) {
      fail(`invalid JSON-LD: ${error.message}`);
    }
  }
  return languages;
}

const [cluster, registry, rootSitemap] = await Promise.all([
  readFile(path.join(root, "localization-cluster.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "indexability.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "sitemap.xml"), "utf8"),
]);
const clusterByCanonical = new Map((cluster.routes || []).map((entry) => [entry.canonical_path, entry]));
if (clusterByCanonical.size !== (cluster.routes || []).length) fail("localization cluster contains duplicate canonical paths");

const rootUrls = locs(rootSitemap);
if (!rootUrls.length) fail("root sitemap is empty");
if (new Set(rootUrls).size !== rootUrls.length) fail("root sitemap contains duplicate URLs");
const rootPaths = new Set(rootUrls.map(pathnameFromUrl));

const manifests = new Map();
const eligibleByPath = new Map();
const manifestRouteCount = new Map();
for (const locale of releaseLocales) {
  const [manifest, libraryManifest, localeSitemap] = await Promise.all([
    readFile(path.join(root, locale.code, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, locale.datasetRoot || `data/localization/${locale.code}`, "library-manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, locale.code, "sitemap.xml"), "utf8"),
  ]);
  manifests.set(locale.code, manifest);
  if (manifest.locale !== locale.code) fail(`${locale.code}: manifest locale drift`);
  if (manifest.search_publication !== locale.searchPublication) fail(`${locale.code}: search publication drift`);
  if (libraryManifest.coverage_mode === "exact") {
    const coverage = manifest.coverage?.library_entries;
    if (coverage?.mode !== "exact" || coverage.localized !== coverage.canonical) {
      fail(`${locale.code}: exact library source contract is not preserved by generated manifest`);
    }
  }

  const routes = manifest.routes || [];
  manifestRouteCount.set(locale.code, routes.length);
  const routePaths = routes.map((route) => route.path);
  const routeUrls = routes.map((route) => route.url);
  const canonicalPaths = routes.map((route) => route.canonical_path);
  if (new Set(routePaths).size !== routePaths.length) fail(`${locale.code}: duplicate route path in manifest`);
  if (new Set(routeUrls).size !== routeUrls.length) fail(`${locale.code}: duplicate route URL in manifest`);
  if (new Set(canonicalPaths).size !== canonicalPaths.length) fail(`${locale.code}: duplicate canonical mapping in manifest`);

  const sitemapUrls = locs(localeSitemap);
  if (new Set(sitemapUrls).size !== sitemapUrls.length) fail(`${locale.code}: locale sitemap contains duplicate URLs`);
  const expected = [...routeUrls].sort();
  const actual = [...sitemapUrls].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const missing = expected.filter((url) => !actualSet.has(url));
    const extra = actual.filter((url) => !expectedSet.has(url));
    fail(`${locale.code}: locale sitemap != manifest; missing=${missing.slice(0, 5).join(",") || "none"}; extra=${extra.slice(0, 5).join(",") || "none"}`);
  }

  for (const route of routes) {
    if (!route.path.startsWith(locale.routePrefix)) fail(`${locale.code}: route escaped locale prefix ${route.path}`);
    if (eligibleByPath.has(route.path)) fail(`route collision across locales: ${route.path}`);
    eligibleByPath.set(route.path, { locale, route });
    if (!rootPaths.has(route.path)) fail(`${locale.code}: root aggregate sitemap missing ${route.path}`);
  }
}

for (const pathname of rootPaths) {
  for (const locale of releaseLocales) {
    if (pathname.startsWith(locale.routePrefix) && !eligibleByPath.has(pathname)) {
      fail(`${locale.code}: localized root-sitemap URL exists outside manifest/indexability graph: ${pathname}`);
    }
  }
}

const registryRows = registry.routes || [];
if (registry.route_count !== registryRows.length) fail("indexability registry route_count drift");
if (registry.translation_set_count !== (registry.translation_sets || []).length) fail("indexability registry translation_set_count drift");
const registryTuple = registryRows.map((row) => `${row.locale}\u0000${row.path}`);
if (new Set(registryTuple).size !== registryTuple.length) fail("indexability registry contains duplicate locale/path rows");
const stableTuple = registryRows.map((row) => `${row.locale}\u0000${row.stable_id}`);
if (new Set(stableTuple).size !== stableTuple.length) fail("indexability registry contains duplicate stable IDs within a locale");
if (registryRows.some((row) => row.index_eligible !== true)) fail("indexability registry contains a non-eligible row");

const expectedRegistryPaths = new Set([
  ...[...rootPaths].filter((pathname) => !releaseLocales.some((locale) => pathname.startsWith(locale.routePrefix))),
  ...eligibleByPath.keys(),
]);
const registryPaths = new Set(registryRows.map((row) => row.path));
if (expectedRegistryPaths.size !== registryPaths.size || [...expectedRegistryPaths].some((pathname) => !registryPaths.has(pathname))) {
  fail(`indexability registry path parity drift: expected=${expectedRegistryPaths.size}; actual=${registryPaths.size}`);
}

const htmlByPath = new Map();
const inbound = new Map([...expectedRegistryPaths].map((pathname) => [pathname, new Set()]));
for (const pathname of expectedRegistryPaths) {
  const file = routeFile(pathname);
  if (!(await exists(file))) {
    fail(`${pathname}: generated page missing`);
    continue;
  }
  const html = await readFile(file, "utf8");
  htmlByPath.set(pathname, html);
  for (const link of anchors(html, pathname)) {
    if (expectedRegistryPaths.has(link.path) && link.path !== pathname) inbound.get(link.path)?.add(pathname);
    if (link.path.endsWith("/") && !(await exists(routeFile(link.path)))) {
      fail(`${pathname}: broken internal route ${link.raw}`);
    }
    if (link.fragment && await exists(routeFile(link.path))) {
      const targetHtml = link.path === pathname ? html : (htmlByPath.get(link.path) || await readFile(routeFile(link.path), "utf8"));
      const escaped = link.fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\b(?:id|name)=["']${escaped}["']`, "i").test(targetHtml)) {
        fail(`${pathname}: broken fragment ${link.raw}`);
      }
    }
  }
}

for (const pathname of expectedRegistryPaths) {
  if ((inbound.get(pathname)?.size || 0) === 0) fail(`${pathname}: index-eligible orphan has no crawlable incoming link from another index-eligible page`);
}

for (const [pathname, html] of htmlByPath) {
  const localized = eligibleByPath.get(pathname);
  const locale = localized?.locale || sourceLocale;
  const route = localized?.route || null;
  const expectedUrl = route?.url || `${base}${pathname}`;
  const expectedLanguage = locale.languageTag;
  if (!new RegExp(`<html\\b[^>]*\\blang=["']${expectedLanguage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html)) {
    fail(`${pathname}: html lang must be ${expectedLanguage}`);
  }
  if (!title(html)) fail(`${pathname}: missing title`);
  if (!meta(html, "name", "description")) fail(`${pathname}: missing meta description`);
  if (canonical(html) !== expectedUrl) fail(`${pathname}: canonical must be self (${expectedUrl}); got ${canonical(html) || "missing"}`);
  if (meta(html, "property", "og:url") && meta(html, "property", "og:url") !== expectedUrl) {
    fail(`${pathname}: og:url is not canonical self URL`);
  }
  const robots = meta(html, "name", "robots").toLowerCase();
  if (/\b(?:noindex|none)\b/.test(robots)) fail(`${pathname}: index-eligible page is noindex`);

  const languages = await jsonLdLanguages(html);
  if (languages.length && !languages.includes(expectedLanguage)) fail(`${pathname}: structured data has no inLanguage=${expectedLanguage}`);

  const canonicalPath = route?.canonical_path || pathname;
  const clusterRow = clusterByCanonical.get(canonicalPath);
  if (clusterRow) {
    const alternates = languageAlternates(html);
    for (const [language, href] of Object.entries(clusterRow.alternates || {})) {
      const values = alternates.get(language) || [];
      if (values.length !== 1 || values[0] !== href) {
        fail(`${pathname}: hreflang ${language} must be exactly ${href}; got ${values.join(",") || "missing"}`);
      }
    }
    for (const language of alternates.keys()) {
      if (!(language in (clusterRow.alternates || {}))) fail(`${pathname}: stale/unexpected hreflang ${language}`);
    }
  }
}

for (const row of cluster.routes || []) {
  if (!rootPaths.has(row.canonical_path)) fail(`${row.canonical_path}: canonical translation source absent from root sitemap`);
  for (const locale of releaseLocales) {
    const route = (manifests.get(locale.code)?.routes || []).find((candidate) => candidate.canonical_path === row.canonical_path);
    if (!route) continue;
    if (row.alternates?.[locale.languageTag] !== route.url) fail(`${row.canonical_path}: cluster/manifest alternate drift for ${locale.code}`);
  }
}

if (failures.length) {
  console.error(`[indexability-check] ${failures.length} failure(s)`);
  for (const message of failures.slice(0, 250)) console.error(`  - ${message}`);
  if (failures.length > 250) console.error(`  - ... ${failures.length - 250} more`);
  throw new Error("Indexability contract failed.");
}

console.log(`[indexability-check] passed ${registryRows.length} routes, ${cluster.routes?.length || 0} translation sets, ${[...manifestRouteCount.entries()].map(([locale, count]) => `${locale}=${count}`).join(", ")}; zero sitemap drift, locale orphans, bad canonicals, broken hreflang or crawlable-link gaps.`);
