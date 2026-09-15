import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const profile = await readJson(".arwp/localization.json");
const source = (profile.locales || []).find((entry) => entry.code === profile.sourceLocale);
if (!source) throw new Error("[localization-cluster-check] source locale missing from registry");

const humanLocales = (profile.locales || []).filter((entry) => entry.role === "human-interface");
const releaseLocales = humanLocales.filter((entry) =>
  ["reviewed-partial", "published"].includes(entry.status) && entry.searchPublication !== "none"
);
const expectedClusterCodes = [source.code, ...releaseLocales.map((entry) => entry.code)];
const manifests = new Map();
const routeMaps = new Map();
for (const locale of humanLocales) {
  const manifest = await readJson(`${locale.code}/manifest.json`);
  manifests.set(locale.code, manifest);
  routeMaps.set(locale.code, new Map((manifest.routes || []).map((route) => [route.canonical_path, route])));
}

const cluster = await readJson("localization-cluster.json");
const clusterCodes = (cluster.locales || []).map((entry) => entry.code);
if (JSON.stringify(clusterCodes) !== JSON.stringify(expectedClusterCodes)) {
  throw new Error(`[localization-cluster-check] locale set drift: expected ${expectedClusterCodes.join(",")}; got ${clusterCodes.join(",")}`);
}
if (cluster.source_locale !== profile.sourceLocale) throw new Error("[localization-cluster-check] source locale drift");

const clusterByCanonical = new Map((cluster.routes || []).map((entry) => [entry.canonical_path, entry]));
const requiredCore = ["/", "/life-os/", "/life-os/flagships/", "/life-os/methodology/", "/research/", "/partners/", "/for-ai/"];
for (const canonicalPath of requiredCore) {
  const row = clusterByCanonical.get(canonicalPath);
  if (!row) throw new Error(`[localization-cluster-check] core route missing from cluster: ${canonicalPath}`);
  for (const locale of releaseLocales) {
    if (!routeMaps.get(locale.code)?.has(canonicalPath)) {
      throw new Error(`[localization-cluster-check] ${locale.code} missing core route ${canonicalPath}`);
    }
    if (!row.alternates?.[locale.languageTag]) {
      throw new Error(`[localization-cluster-check] ${canonicalPath} missing ${locale.languageTag} alternate`);
    }
  }
}

const exactLocales = releaseLocales.filter((locale) => {
  const coverage = manifests.get(locale.code)?.coverage?.library_entries;
  return coverage?.mode === "exact" && coverage.localized === coverage.canonical;
});
if (exactLocales.length > 1) {
  const librarySets = exactLocales.map((locale) => {
    const routes = (manifests.get(locale.code)?.routes || [])
      .filter((route) => ["flagship", "library-entry"].includes(route.kind))
      .map((route) => route.canonical_path)
      .sort();
    return { locale, routes };
  });
  const baseline = JSON.stringify(librarySets[0].routes);
  for (const current of librarySets.slice(1)) {
    if (JSON.stringify(current.routes) !== baseline) {
      throw new Error(`[localization-cluster-check] exact library route parity drift between ${librarySets[0].locale.code} and ${current.locale.code}`);
    }
  }
}

function routeFile(pathname) {
  if (pathname === "/") return path.join(root, "index.html");
  return path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}

function languageAlternates(html) {
  const result = new Map();
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const language = tag.match(/\bhreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (rel !== "alternate" || !language || !href) continue;
    const list = result.get(language) || [];
    list.push(href);
    result.set(language, list);
  }
  return result;
}

function navigationSwitches(html) {
  const nav = html.match(/<div\s+class=["']links["']>([\s\S]*?)<\/div>/i)?.[1] || "";
  const result = new Map();
  for (const tag of nav.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []) {
    const language = tag.match(/\bhreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (language && href) result.set(language, href);
  }
  return result;
}

async function checkPage(pathname, currentLanguageTag, row) {
  const html = await readFile(routeFile(pathname), "utf8");
  const alternates = languageAlternates(html);
  for (const [language, href] of Object.entries(row.alternates || {})) {
    const values = alternates.get(language) || [];
    if (values.length !== 1 || values[0] !== href) {
      throw new Error(`[localization-cluster-check] ${pathname} ${language} alternate must be unique and equal ${href}; got ${values.join(",") || "missing"}`);
    }
  }
  const switches = navigationSwitches(html);
  for (const [language, href] of Object.entries(row.alternates || {})) {
    if (language === "x-default" || language === currentLanguageTag) continue;
    const expectedHref = href.startsWith(base) ? href.slice(base.length) || "/" : href;
    if (switches.get(language) !== expectedHref) {
      throw new Error(`[localization-cluster-check] ${pathname} navigation missing ${language} switch to ${expectedHref}`);
    }
  }
}

for (const row of cluster.routes || []) {
  if (row.alternates?.[source.languageTag] !== row.canonical_url || row.alternates?.["x-default"] !== row.canonical_url) {
    throw new Error(`[localization-cluster-check] ${row.canonical_path} source/x-default drift`);
  }
  await checkPage(row.canonical_path, source.languageTag, row);
  for (const locale of releaseLocales) {
    const route = routeMaps.get(locale.code)?.get(row.canonical_path);
    if (!route) continue;
    if (row.alternates?.[locale.languageTag] !== route.url) {
      throw new Error(`[localization-cluster-check] ${row.canonical_path} cluster URL drift for ${locale.code}`);
    }
    await checkPage(route.path, locale.languageTag, row);
  }
}

console.log(`[localization-cluster-check] passed ${cluster.routes?.length || 0} reciprocal route cluster(s) for ${expectedClusterCodes.join(", ")}`);
