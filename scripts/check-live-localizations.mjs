import { readFile } from "node:fs/promises";

const profile = JSON.parse(await readFile(".arwp/localization.json", "utf8"));
const requestedLocale = process.env.LOCALIZATION_LOCALE || profile.releaseContract?.referenceImplementation;
const locale = (profile.locales || []).find((entry) => entry.code === requestedLocale);
if (!locale || locale.role !== "human-interface") throw new Error(`[live-localization] unknown human-interface locale: ${requestedLocale}`);

const sourceLocale = profile.sourceLocale;
const languageTag = process.env.LOCALIZATION_LANGUAGE_TAG || locale.languageTag;
const routePrefix = locale.routePrefix;
const base = (process.env.BRALI_LIVE_BASE_URL || profile.site || "https://brali-lifeos.github.io/").replace(/\/$/, "");
const expectedSha = process.env.GITHUB_SHA || "unknown";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(pathname, { attempts = 6 } = {}) {
  const url = `${base}${pathname}${pathname.includes("?") ? "&" : "?"}verify=${encodeURIComponent(expectedSha)}`;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "cache-control": "no-cache", pragma: "no-cache", "user-agent": "Brali-Live-Localization-Check/4.0" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return { text: await response.text(), headers: response.headers, url: response.url };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(1500 * attempt);
    }
  }
  throw new Error(`Could not fetch ${pathname}: ${lastError?.message || "unknown error"}`);
}

const assert = (condition, message) => {
  if (!condition) throw new Error(`[live-localization:${requestedLocale}] ${message}`);
};

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const failures = [];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { await worker(items[index], index); }
      catch (error) { failures.push(error); }
    }
  });
  await Promise.all(runners);
  if (failures.length) {
    const first = failures[0];
    throw new Error(`${first.message}${failures.length > 1 ? ` (+${failures.length - 1} more live localization failure(s))` : ""}`);
  }
}

const { text: manifestText } = await fetchText(`${routePrefix}manifest.json`);
const manifest = JSON.parse(manifestText);
assert(manifest.locale === requestedLocale, `manifest locale must be ${requestedLocale}`);
assert(manifest.source_locale === sourceLocale, `manifest source locale must be ${sourceLocale}`);
assert(manifest.role === "human-interface", "manifest role must be human-interface");
assert(manifest.status === locale.status, `manifest status ${manifest.status} does not match registry ${locale.status}`);
assert(manifest.no_silent_fallback === true, "manifest must forbid silent fallback");
assert(manifest.search_publication === locale.searchPublication, `manifest search publication ${manifest.search_publication} does not match registry ${locale.searchPublication}`);
assert(Array.isArray(manifest.routes) && manifest.routes.length >= 7, "manifest must declare the required localized human routes");

const routePaths = manifest.routes.map((route) => route.path);
assert(new Set(routePaths).size === routePaths.length, "manifest contains duplicate localized routes");
const routeByPath = new Map(manifest.routes.map((route) => [route.path, route]));
const requiredSuffixes = ["", "life-os/", "life-os/flagships/", "life-os/methodology/", "research/", "partners/", "for-ai/"];
for (const suffix of requiredSuffixes) {
  const required = `${routePrefix}${suffix}`;
  assert(routeByPath.has(required), `manifest missing required route ${required}`);
}

const { text: libraryText } = await fetchText(`${routePrefix}library.json`);
const library = JSON.parse(libraryText);
assert(library.locale === requestedLocale && library.source_locale === sourceLocale, "localized library identity drift");
assert(library.count === manifest.coverage?.library_entries?.localized, "library count must match manifest coverage");
assert(library.canonical_count === manifest.coverage?.library_entries?.canonical, "canonical library count must match manifest coverage");
assert(library.coverage_mode === manifest.coverage?.library_entries?.mode, "library coverage mode must match manifest");
assert(Array.isArray(library.entries) && library.entries.length === library.count, "localized library entries/count drift");
for (const entry of library.entries) {
  assert(["reviewed", "practical", "pending-review", "restricted"].includes(entry.evidence_status), `invalid evidence state for ${entry.slug}`);
  assert(["localized-draft", "language-reviewed", "editorial-reviewed"].includes(entry.localization_quality), `invalid localization quality for ${entry.slug}`);
}
if (profile.releaseContract?.coverage === "exact-for-published-human-interface" && locale.status === "published") {
  assert(library.coverage_mode === "exact", "published locale must use exact library coverage");
  assert(library.count === library.canonical_count, "published locale must cover the full canonical library");
}

const eligibleRoutes = (manifest.routes || []).filter((route) => route.index_eligible === true);
const withheldRoutes = (manifest.routes || []).filter((route) => route.index_eligible === false);
if (locale.searchPublication !== "none") {
  assert(eligibleRoutes.length + withheldRoutes.length === manifest.routes.length, "every release route must declare boolean index_eligible");
  assert(manifest.coverage?.indexability?.eligible === eligibleRoutes.length, "manifest eligible indexability count drift");
  assert(manifest.coverage?.indexability?.withheld === withheldRoutes.length, "manifest withheld indexability count drift");
}

const commonSourceShellLeakage = /\b(?:Skip to content|Main navigation|Optional analytics|Analytics preference|Allow analytics|Necessary only)\b/i;
const robotsNoindex = /<meta\b(?=[^>]*name=["']robots["'])[^>]*content=["'][^"']*(?:noindex|none)[^"']*["'][^>]*>/i;
await mapLimit(manifest.routes, 16, async (route) => {
  assert(route.path.startsWith(routePrefix), `route escaped locale prefix: ${route.path}`);
  const { text: html } = await fetchText(route.path, { attempts: 4 });
  assert(new RegExp(`<html[^>]+lang=["']${languageTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html), `${route.path} must publish html lang=${languageTag}`);
  assert(new RegExp(`<html[^>]+dir=["']${(locale.direction || "ltr").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html), `${route.path} must publish html dir=${locale.direction || "ltr"}`);
  assert(html.includes(`<link rel="canonical" href="${route.url}">`), `${route.path} must publish its self canonical`);
  assert(html.includes(`hreflang="${languageTag}" href="${route.url}"`), `${route.path} must publish ${languageTag} hreflang`);
  assert(html.includes(`hreflang="${sourceLocale}" href="${route.canonical_url}"`), `${route.path} must publish ${sourceLocale} hreflang`);
  assert(html.includes(`hreflang="x-default" href="${route.canonical_url}"`), `${route.path} must publish x-default`);
  assert(html.includes(`"inLanguage":"${languageTag}"`), `${route.path} structured data must publish inLanguage=${languageTag}`);
  assert(!commonSourceShellLeakage.test(html), `${route.path} leaked source-language shell UI`);
  if (locale.searchPublication === "none" || route.index_eligible === false) assert(robotsNoindex.test(html), `${route.path} withheld route must publish noindex,follow`);
  else assert(!robotsNoindex.test(html), `${route.path} index-eligible route must not publish noindex`);

  const { text: canonicalHtml } = await fetchText(route.canonical_path, { attempts: 4 });
  assert(canonicalHtml.includes(`hreflang="${languageTag}" href="${route.url}"`), `${route.canonical_path} must reciprocate ${languageTag} hreflang`);
});

const [{ text: sitemap }, { text: rootSitemap }, { text: indexabilityText }] = await Promise.all([
  fetchText(`${routePrefix}sitemap.xml`),
  fetchText("/sitemap.xml"),
  fetchText("/indexability.json"),
]);
const indexability = JSON.parse(indexabilityText);
const registryPaths = new Set((indexability.routes || []).filter((route) => route.locale === requestedLocale).map((route) => route.path));
for (const route of manifest.routes) {
  const inLocaleSitemap = sitemap.includes(`<loc>${route.url}</loc>`);
  const inRootSitemap = rootSitemap.includes(`<loc>${route.url}</loc>`);
  const inRegistry = registryPaths.has(route.path);
  if (route.index_eligible === true) {
    assert(inLocaleSitemap, `localized sitemap missing eligible ${route.path}`);
    assert(inRootSitemap, `root sitemap missing eligible ${route.path}`);
    assert(inRegistry, `indexability.json missing eligible ${route.path}`);
  } else {
    assert(!inLocaleSitemap, `localized sitemap leaked withheld ${route.path}`);
    assert(!inRootSitemap, `root sitemap leaked withheld ${route.path}`);
    assert(!inRegistry, `indexability.json leaked withheld ${route.path}`);
  }
}

const { text: llms } = await fetchText(`${routePrefix}llms.txt`);
for (const token of [
  `Locale: ${requestedLocale}`,
  `Canonical locale: ${sourceLocale}`,
  "No silent fallback: true",
  `${base}${routePrefix}library.json`,
]) assert(llms.includes(token), `localized llms.txt missing token: ${token}`);
if (library.coverage_mode === "exact") assert(library.count === library.canonical_count, "exact live coverage must match the canonical corpus");

const { text: robots } = await fetchText("/robots.txt");
const sitemapLine = `Sitemap: ${base}${routePrefix}sitemap.xml`;
if (locale.searchPublication === "none") assert(!robots.includes(sitemapLine), "robots.txt must not advertise a staged/noindex localized sitemap");
else assert(robots.includes(sitemapLine), "robots.txt must advertise the search-published localized sitemap");

console.log(`Live ${requestedLocale} localization passed: ${manifest.routes.length} human routes; indexable=${eligibleRoutes.length}; withheld=${withheldRoutes.length}; ${library.count}/${library.canonical_count} library entries; mode=${library.coverage_mode}; status=${manifest.status}; search=${locale.searchPublication}.`);