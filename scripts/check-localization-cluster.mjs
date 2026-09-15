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
  const librarySets = [];
  for (const locale of exactLocales) {
    const library = await readJson(`${locale.code}/library.json`);
    if (library.locale !== locale.code || library.coverage_mode !== "exact") {
      throw new Error(`[localization-cluster-check] ${locale.code} exact locale has an invalid machine library contract`);
    }
    if (!Array.isArray(library.entries) || library.entries.length !== library.count || library.count !== library.canonical_count) {
      throw new Error(`[localization-cluster-check] ${locale.code} exact machine library count drift`);
    }
    const slugs = library.entries.map((entry) => entry.slug).sort();
    if (new Set(slugs).size !== slugs.length) {
      throw new Error(`[localization-cluster-check] ${locale.code} machine library contains duplicate slugs`);
    }
    for (const slug of slugs) {
      const canonicalPath = `/life-os/${slug}/`;
      if (!routeMaps.get(locale.code)?.has(canonicalPath)) {
        throw new Error(`[localization-cluster-check] ${locale.code} exact library ID ${slug} has no localized manifest route`);
      }
    }
    librarySets.push({ locale, slugs });
  }

  const baseline = librarySets[0];
  const baselineSet = new Set(baseline.slugs);
  for (const current of librarySets.slice(1)) {
    const currentSet = new Set(current.slugs);
    const missing = baseline.slugs.filter((slug) => !currentSet.has(slug));
    const extra = current.slugs.filter((slug) => !baselineSet.has(slug));
    if (missing.length || extra.length) {
      throw new Error(`[localization-cluster-check] exact library ID parity drift between ${baseline.locale.code} and ${current.locale.code}; missing=${missing.slice(0, 10).join(",") || "none"}; extra=${extra.slice(0, 10).join(",") || "none"}`);
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
