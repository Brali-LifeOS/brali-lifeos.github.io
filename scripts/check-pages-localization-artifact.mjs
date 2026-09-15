import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const profile = await readJson(".arwp/localization.json");
const sourceLocale = profile.sourceLocale;
const humanLocales = (profile.locales || []).filter((entry) => entry.role === "human-interface");

const failures = [];
const fail = (locale, message) => failures.push(`[${locale}] ${message}`);

function routeFile(pathname) {
  if (pathname === "/") return path.join(root, "index.html");
  return path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

for (const locale of humanLocales) {
  const localeRoot = path.join(root, locale.code);
  const requiredMachine = ["manifest.json", "library.json", "sitemap.xml", "llms.txt"];
  for (const name of requiredMachine) {
    if (!(await exists(path.join(localeRoot, name)))) fail(locale.code, `missing final artifact ${locale.code}/${name}`);
  }
  if (failures.some((item) => item.startsWith(`[${locale.code}] missing final artifact`))) continue;

  const [manifest, library, sitemap, llms, robots] = await Promise.all([
    readJson(`${locale.code}/manifest.json`),
    readJson(`${locale.code}/library.json`),
    readFile(path.join(localeRoot, "sitemap.xml"), "utf8"),
    readFile(path.join(localeRoot, "llms.txt"), "utf8"),
    readFile(path.join(root, "robots.txt"), "utf8"),
  ]);

  if (manifest.locale !== locale.code) fail(locale.code, `manifest locale drift: ${manifest.locale}`);
  if (manifest.language_tag !== locale.languageTag) fail(locale.code, `manifest language_tag drift: ${manifest.language_tag}`);
  if (manifest.source_locale !== sourceLocale) fail(locale.code, `manifest source locale drift: ${manifest.source_locale}`);
  if (manifest.role !== locale.role) fail(locale.code, `manifest role drift: ${manifest.role}`);
  if (manifest.status !== locale.status) fail(locale.code, `manifest status drift: ${manifest.status}`);
  if (manifest.search_publication !== locale.searchPublication) fail(locale.code, `manifest search publication drift: ${manifest.search_publication}`);
  if (manifest.route_prefix !== locale.routePrefix) fail(locale.code, `manifest route prefix drift: ${manifest.route_prefix}`);
  if (manifest.no_silent_fallback !== true) fail(locale.code, "manifest must forbid silent fallback");

  if (library.locale !== locale.code || library.source_locale !== sourceLocale) fail(locale.code, "library identity drift");
  if (library.count !== manifest.coverage?.library_entries?.localized) fail(locale.code, "library localized count != manifest");
  if (library.canonical_count !== manifest.coverage?.library_entries?.canonical) fail(locale.code, "library canonical count != manifest");
  if (library.coverage_mode !== manifest.coverage?.library_entries?.mode) fail(locale.code, "library coverage mode != manifest");
  if (!Array.isArray(library.entries) || library.entries.length !== library.count) fail(locale.code, "library entries/count drift");

  const routePaths = (manifest.routes || []).map((route) => route.path);
  if (!routePaths.length) fail(locale.code, "manifest has no routes");
  if (new Set(routePaths).size !== routePaths.length) fail(locale.code, "manifest contains duplicate routes");

  for (const route of manifest.routes || []) {
    if (!route.path.startsWith(locale.routePrefix)) fail(locale.code, `route escaped prefix: ${route.path}`);
    const file = routeFile(route.path);
    if (!(await exists(file))) {
      fail(locale.code, `manifest route missing from final artifact: ${route.path}`);
      continue;
    }
    const html = await readFile(file, "utf8");
    if (!new RegExp(`<html[^>]+lang=["']${locale.languageTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html)) fail(locale.code, `${route.path} html lang drift`);
    if (!new RegExp(`<html[^>]+dir=["']${(locale.direction || "ltr").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html)) fail(locale.code, `${route.path} html dir drift`);
    if (!html.includes(`<link rel="canonical" href="${route.url}">`)) fail(locale.code, `${route.path} missing self canonical`);
    if (!html.includes(`hreflang="${locale.languageTag}" href="${route.url}"`)) fail(locale.code, `${route.path} missing self hreflang`);
    if (!html.includes(`hreflang="${sourceLocale}" href="${route.canonical_url}"`)) fail(locale.code, `${route.path} missing source hreflang`);
    if (!html.includes(`"inLanguage":"${locale.languageTag}"`)) fail(locale.code, `${route.path} structured-data language drift`);

    const robotsMeta = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/gi) || [];
    const noindex = robotsMeta.some((tag) => /content=["'][^"']*noindex/i.test(tag));
    if (locale.searchPublication === "none" && !noindex) fail(locale.code, `${route.path} draft/search-none route must publish noindex,follow`);
    if (locale.searchPublication !== "none" && noindex) fail(locale.code, `${route.path} release route must not publish noindex`);

    if (!sitemap.includes(`<loc>${route.url}</loc>`)) fail(locale.code, `sitemap missing ${route.path}`);
  }

  for (const token of [
    `Locale: ${locale.code}`,
    `Language tag: ${locale.languageTag}`,
    `Canonical locale: ${sourceLocale}`,
    `Status: ${locale.status}`,
    `Search publication: ${locale.searchPublication}`,
    "No silent fallback: true",
    `Coverage mode: ${library.coverage_mode}`,
    `Localized entries: ${library.count}`,
    `Canonical entries: ${library.canonical_count}`,
    `${base}${locale.routePrefix}library.json`,
  ]) {
    if (!llms.includes(token)) fail(locale.code, `llms.txt missing token: ${token}`);
  }

  const sitemapDeclaration = `Sitemap: ${base}${locale.routePrefix}sitemap.xml`;
  if (locale.searchPublication === "none" && robots.includes(sitemapDeclaration)) fail(locale.code, "robots.txt advertises a search-none locale sitemap");
  if (locale.searchPublication !== "none" && !robots.includes(sitemapDeclaration)) fail(locale.code, "robots.txt does not advertise release locale sitemap");

  if (locale.status === "published" && profile.releaseContract?.coverage === "exact-for-published-human-interface") {
    if (library.coverage_mode !== "exact" || library.count !== library.canonical_count) fail(locale.code, "published locale lacks exact canonical coverage");
  }

  console.log(`[pages-localization-artifact] ${locale.code}: ${manifest.routes?.length || 0} routes; ${library.count}/${library.canonical_count}; status=${locale.status}; search=${locale.searchPublication}`);
}

if (!(await exists(path.join(root, "localization-cluster.json")))) fail("cluster", "missing localization-cluster.json from final Pages artifact");

if (failures.length) {
  console.error(`[pages-localization-artifact] ${failures.length} failure(s)`);
  for (const item of failures.slice(0, 200)) console.error(`  ${item}`);
  if (failures.length > 200) console.error(`  ... ${failures.length - 200} more`);
  throw new Error("Final GitHub Pages localization artifact is inconsistent.");
}

console.log(`[pages-localization-artifact] final Pages root passed for ${humanLocales.map((entry) => entry.code).join(", ")}`);
