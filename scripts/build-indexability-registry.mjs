import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const sourceLocale = (profile.locales || []).find((entry) => entry.code === profile.sourceLocale);
if (!sourceLocale) throw new Error("[indexability-build] canonical source locale is not registered");

const releaseLocales = (profile.locales || []).filter((entry) =>
  entry.role === "human-interface"
  && ["reviewed-partial", "published"].includes(entry.status)
  && entry.searchPublication !== "none"
);
const buildSha = process.env.GITHUB_SHA || null;

const decode = (value = "") => String(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const escapeXml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");
const text = (value = "") => decode(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function pathnameFromUrl(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== base) throw new Error(`[indexability-build] unexpected host: ${urlValue}`);
  return url.pathname;
}

function routeFile(pathname) {
  if (pathname === "/") return path.join(root, "index.html");
  if (pathname.endsWith(".html")) return path.join(root, pathname.slice(1));
  return path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}

function attr(tag, name) {
  return decode(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "");
}

function meta(html, key, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*\\b${key}=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
  return attr(tag, "content");
}

function title(html) {
  return text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function stableId(route = {}, canonicalPath) {
  if (route.slug) return `brali:hack:${route.slug}`;
  if (route.id) return `brali:page:${route.id}`;
  const key = canonicalPath === "/" ? "home" : canonicalPath.replace(/^\//, "").replace(/\/$/, "").replaceAll("/", ":");
  return `brali:page:${key || "home"}`;
}

function localeForPath(pathname) {
  return releaseLocales.find((locale) => pathname.startsWith(locale.routePrefix)) || null;
}

function languageLinks(alternates = {}) {
  return Object.entries(alternates)
    .map(([language, href]) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}"/>`)
    .join("\n");
}

function withLanguageLinks(block, alternates) {
  if (!alternates || !Object.keys(alternates).length) return block;
  const cleaned = block.replace(/\s*<xhtml:link\b[^>]*\/>/gi, "");
  const links = languageLinks(alternates);
  return cleaned.replace(/\s*<\/url>\s*$/i, `\n${links}\n  </url>`);
}

const cluster = JSON.parse(await readFile(path.join(root, "localization-cluster.json"), "utf8"));
const clusterByCanonical = new Map((cluster.routes || []).map((entry) => [entry.canonical_path, entry]));
const manifests = new Map();
const routeMetaByCanonical = new Map();
const localizedRouteByPath = new Map();
for (const locale of releaseLocales) {
  const manifest = JSON.parse(await readFile(path.join(root, locale.code, "manifest.json"), "utf8"));
  if (manifest.locale !== locale.code) throw new Error(`[indexability-build] ${locale.code} manifest locale drift`);
  manifests.set(locale.code, manifest);
  for (const route of manifest.routes || []) {
    if (localizedRouteByPath.has(route.path)) throw new Error(`[indexability-build] duplicate localized route: ${route.path}`);
    localizedRouteByPath.set(route.path, { locale, route });
    if (!routeMetaByCanonical.has(route.canonical_path)) routeMetaByCanonical.set(route.canonical_path, route);
  }
}

const rootSitemapPath = path.join(root, "sitemap.xml");
const rootSitemap = await readFile(rootSitemapPath, "utf8");
const blocks = [...rootSitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => `<url>${match[1]}</url>`);
if (!blocks.length) throw new Error("[indexability-build] canonical sitemap has no URLs");
const blockByUrl = new Map();
for (const block of blocks) {
  const url = decode(block.match(/<loc>([^<]+)<\/loc>/)?.[1] || "").trim();
  if (!url) throw new Error("[indexability-build] sitemap URL block is missing loc");
  if (blockByUrl.has(url)) throw new Error(`[indexability-build] canonical sitemap contains duplicate URL ${url}`);
  blockByUrl.set(url, block);
}

for (const [url] of blockByUrl) {
  const pathname = pathnameFromUrl(url);
  const locale = localeForPath(pathname);
  if (locale && !localizedRouteByPath.has(pathname)) {
    throw new Error(`[indexability-build] localized sitemap URL exists outside ${locale.code} manifest: ${pathname}`);
  }
}

for (const row of cluster.routes || []) {
  const sourceUrl = row.canonical_url;
  const sourceBlock = blockByUrl.get(sourceUrl);
  if (!sourceBlock) throw new Error(`[indexability-build] canonical translation route missing from root sitemap: ${row.canonical_path}`);
  blockByUrl.set(sourceUrl, withLanguageLinks(sourceBlock, row.alternates));
}

for (const locale of releaseLocales) {
  const manifest = manifests.get(locale.code);
  for (const route of manifest.routes || []) {
    const clusterRow = clusterByCanonical.get(route.canonical_path);
    if (!clusterRow) throw new Error(`[indexability-build] ${locale.code} route is outside localization cluster: ${route.path}`);
    const existing = blockByUrl.get(route.url);
    const block = existing || `<url>\n    <loc>${escapeXml(route.url)}</loc>\n  </url>`;
    blockByUrl.set(route.url, withLanguageLinks(block, clusterRow.alternates));
  }
}

const rootXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...blockByUrl.values()].map((block) => `  ${block.replace(/^<url>/, "<url>").replace(/\n/g, "\n  ")}`).join("\n")}\n</urlset>\n`;
await writeFile(rootSitemapPath, rootXml);

const rows = [];
for (const [url] of blockByUrl) {
  const pathname = pathnameFromUrl(url);
  const matchedLocale = localeForPath(pathname);
  if (matchedLocale) continue;
  const html = await readFile(routeFile(pathname), "utf8");
  const clusterRow = clusterByCanonical.get(pathname);
  const routeMeta = routeMetaByCanonical.get(pathname) || {};
  rows.push({
    stable_id: stableId(routeMeta, pathname),
    content_type: routeMeta.kind || "page",
    locale: sourceLocale.code,
    language_tag: sourceLocale.languageTag,
    path: pathname,
    url,
    canonical_url: url,
    source_url: url,
    title: title(html),
    description: meta(html, "name", "description"),
    index_eligible: true,
    sitemap: `${base}/sitemap.xml`,
    alternates: clusterRow?.alternates || { [sourceLocale.languageTag]: url, "x-default": url },
    ...(routeMeta.slug ? { slug: routeMeta.slug } : {}),
    ...(routeMeta.zone_slug ? { zone_slug: routeMeta.zone_slug } : {}),
    ...(routeMeta.id ? { page_id: routeMeta.id } : {}),
  });
}

for (const locale of releaseLocales) {
  const manifest = manifests.get(locale.code);
  const sitemapRows = [];
  for (const route of manifest.routes || []) {
    const clusterRow = clusterByCanonical.get(route.canonical_path);
    const html = await readFile(routeFile(route.path), "utf8");
    rows.push({
      stable_id: stableId(route, route.canonical_path),
      content_type: route.kind || "page",
      locale: locale.code,
      language_tag: locale.languageTag,
      path: route.path,
      url: route.url,
      canonical_url: route.url,
      source_url: route.canonical_url,
      title: title(html),
      description: meta(html, "name", "description"),
      index_eligible: true,
      sitemap: `${base}${locale.routePrefix}sitemap.xml`,
      alternates: clusterRow.alternates,
      ...(route.slug ? { slug: route.slug } : {}),
      ...(route.zone_slug ? { zone_slug: route.zone_slug } : {}),
      ...(route.id ? { page_id: route.id } : {}),
      ...(route.quality_state ? { localization_quality: route.quality_state } : {}),
      ...(route.evidence_status ? { evidence_status: route.evidence_status } : {}),
    });
    const links = languageLinks(clusterRow.alternates);
    sitemapRows.push(`  <url>\n    <loc>${escapeXml(route.url)}</loc>${links ? `\n${links}` : ""}\n  </url>`);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapRows.join("\n")}\n</urlset>\n`;
  await writeFile(path.join(root, locale.code, "sitemap.xml"), sitemap);
}

const translationSets = (cluster.routes || []).map((entry) => {
  const routeMeta = routeMetaByCanonical.get(entry.canonical_path) || {};
  return {
    stable_id: stableId(routeMeta, entry.canonical_path),
    canonical_path: entry.canonical_path,
    canonical_url: entry.canonical_url,
    alternates: entry.alternates,
  };
});

const registry = {
  schema_version: 1,
  generated_from: [
    ".arwp/localization.json",
    "sitemap.xml",
    "localization-cluster.json",
    ...releaseLocales.map((locale) => `${locale.code}/manifest.json`),
  ],
  build_sha: buildSha,
  source_locale: profile.sourceLocale,
  index_eligibility: {
    rule: "A URL is eligible only when it is a canonical generated HTML route, is not noindex, belongs to the canonical sitemap or a released locale manifest, and passes the executable indexability contract.",
    excludes: ["redirect", "404", "noindex", "placeholder", "noncanonical", "utility-without-standalone-search-value"],
  },
  sitemap_architecture: "root aggregate sitemap plus generated locale subset sitemaps",
  locale_sitemaps: Object.fromEntries([
    [sourceLocale.code, `${base}/sitemap.xml`],
    ...releaseLocales.map((locale) => [locale.code, `${base}${locale.routePrefix}sitemap.xml`]),
  ]),
  source_url_count: rows.filter((row) => row.locale === sourceLocale.code).length,
  localized_url_count: rows.filter((row) => row.locale !== sourceLocale.code).length,
  route_count: rows.length,
  translation_set_count: translationSets.length,
  translation_sets: translationSets,
  routes: rows,
};

await writeFile(path.join(root, "indexability.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`[indexability-build] ${rows.length} index-eligible route(s); ${translationSets.length} translation set(s); locales=${[sourceLocale.code, ...releaseLocales.map((locale) => locale.code)].join(",")}`);
