import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profilePath = path.join(root, ".arwp", "localization.json");
const profile = JSON.parse(await readFile(profilePath, "utf8"));
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

const rootSitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const sourceUrls = [...rootSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]).trim());
if (!sourceUrls.length) throw new Error("[indexability-build] canonical sitemap has no URLs");
if (new Set(sourceUrls).size !== sourceUrls.length) throw new Error("[indexability-build] canonical sitemap contains duplicate URLs");

const cluster = JSON.parse(await readFile(path.join(root, "localization-cluster.json"), "utf8"));
const clusterByCanonical = new Map((cluster.routes || []).map((entry) => [entry.canonical_path, entry]));
const manifests = new Map();
for (const locale of releaseLocales) {
  const manifest = JSON.parse(await readFile(path.join(root, locale.code, "manifest.json"), "utf8"));
  if (manifest.locale !== locale.code) throw new Error(`[indexability-build] ${locale.code} manifest locale drift`);
  manifests.set(locale.code, manifest);
}

const rows = [];
const sourcePaths = new Set();
for (const url of sourceUrls) {
  const pathname = pathnameFromUrl(url);
  sourcePaths.add(pathname);
  const html = await readFile(routeFile(pathname), "utf8");
  const clusterRow = clusterByCanonical.get(pathname);
  rows.push({
    stable_id: stableId({}, pathname),
    content_type: "page",
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
  });
}

for (const locale of releaseLocales) {
  const manifest = manifests.get(locale.code);
  const sitemapRows = [];
  for (const route of manifest.routes || []) {
    const clusterRow = clusterByCanonical.get(route.canonical_path);
    if (!clusterRow) throw new Error(`[indexability-build] ${locale.code} route is outside localization cluster: ${route.path}`);
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

    const alternates = Object.entries(clusterRow.alternates || {})
      .map(([language, href]) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}"/>`)
      .join("\n");
    sitemapRows.push(`  <url>\n    <loc>${escapeXml(route.url)}</loc>${alternates ? `\n${alternates}` : ""}\n  </url>`);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapRows.join("\n")}\n</urlset>\n`;
  await writeFile(path.join(root, locale.code, "sitemap.xml"), sitemap);
}

const translationSets = (cluster.routes || []).map((entry) => ({
  stable_id: stableId({}, entry.canonical_path),
  canonical_path: entry.canonical_path,
  canonical_url: entry.canonical_url,
  alternates: entry.alternates,
}));

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
  locale_sitemaps: Object.fromEntries([
    [sourceLocale.code, `${base}/sitemap.xml`],
    ...releaseLocales.map((locale) => [locale.code, `${base}${locale.routePrefix}sitemap.xml`]),
  ]),
  source_url_count: sourceUrls.length,
  localized_url_count: rows.filter((row) => row.locale !== sourceLocale.code).length,
  route_count: rows.length,
  translation_set_count: translationSets.length,
  translation_sets: translationSets,
  routes: rows,
};

await writeFile(path.join(root, "indexability.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`[indexability-build] ${rows.length} index-eligible route(s); ${translationSets.length} translation set(s); locales=${[sourceLocale.code, ...releaseLocales.map((locale) => locale.code)].join(",")}`);
