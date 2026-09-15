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

function element(html, name, key, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<${name}\\b(?=[^>]*\\b${key}=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
}

function meta(html, key, value) {
  return attr(element(html, "meta", key, value), "content");
}

function canonical(html) {
  return attr(element(html, "link", "rel", "canonical"), "href");
}

function noindex(html) {
  return /\b(?:noindex|none)\b/i.test(meta(html, "name", "robots"));
}

function title(html) {
  return text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function setIndexability(html, eligible) {
  const robotsTag = element(html, "meta", "name", "robots");
  if (eligible) {
    if (robotsTag && /\b(?:noindex|none)\b/i.test(attr(robotsTag, "content"))) return html.replace(robotsTag, "");
    return html;
  }
  const replacement = '<meta name="robots" content="noindex,follow">';
  if (robotsTag) return html.replace(robotsTag, replacement);
  return html.replace("</head>", `${replacement}</head>`);
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
  return cleaned.replace(/\s*<\/url>\s*$/i, `\n${links}\n</url>`);
}

const cluster = JSON.parse(await readFile(path.join(root, "localization-cluster.json"), "utf8"));
const clusterByCanonical = new Map((cluster.routes || []).map((entry) => [entry.canonical_path, entry]));
if (clusterByCanonical.size !== (cluster.routes || []).length) throw new Error("[indexability-build] duplicate canonical path in localization cluster");

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

// Search eligibility belongs to the canonical content decision, not to translation
// presence. A translated restricted/noindex page remains a valid human route, but
// it must inherit noindex and stay outside every search sitemap.
const sourceEligibility = new Map();
for (const row of cluster.routes || []) {
  const sourceHtml = await readFile(routeFile(row.canonical_path), "utf8");
  const expectedCanonical = row.canonical_url;
  const actualCanonical = canonical(sourceHtml);
  if (actualCanonical !== expectedCanonical) {
    throw new Error(`[indexability-build] canonical source mismatch ${row.canonical_path}: ${actualCanonical || "missing"}`);
  }
  const eligible = !noindex(sourceHtml);
  const inRootSitemap = blockByUrl.has(expectedCanonical);
  if (eligible && !inRootSitemap) {
    throw new Error(`[indexability-build] indexable canonical translation route missing from root sitemap: ${row.canonical_path}`);
  }
  if (!eligible && inRootSitemap) {
    throw new Error(`[indexability-build] noindex canonical translation route leaked into root sitemap: ${row.canonical_path}`);
  }
  sourceEligibility.set(row.canonical_path, eligible);
  if (eligible) blockByUrl.set(expectedCanonical, withLanguageLinks(blockByUrl.get(expectedCanonical), row.alternates));
}

let localizedEligible = 0;
let localizedWithheld = 0;
for (const locale of releaseLocales) {
  const manifest = manifests.get(locale.code);
  let eligibleCount = 0;
  let withheldCount = 0;
  for (const route of manifest.routes || []) {
    const clusterRow = clusterByCanonical.get(route.canonical_path);
    if (!clusterRow) throw new Error(`[indexability-build] ${locale.code} route is outside localization cluster: ${route.path}`);
    if (!sourceEligibility.has(route.canonical_path)) throw new Error(`[indexability-build] ${locale.code} route has no canonical eligibility decision: ${route.path}`);

    const eligible = sourceEligibility.get(route.canonical_path) === true;
    route.index_eligible = eligible;
    route.indexability_reason = eligible ? "canonical-source-indexable" : "canonical-source-noindex";

    const file = routeFile(route.path);
    const localizedHtml = await readFile(file, "utf8");
    await writeFile(file, setIndexability(localizedHtml, eligible));

    if (eligible) {
      eligibleCount += 1;
      localizedEligible += 1;
      const existing = blockByUrl.get(route.url);
      const block = existing || `<url>\n  <loc>${escapeXml(route.url)}</loc>\n</url>`;
      blockByUrl.set(route.url, withLanguageLinks(block, clusterRow.alternates));
    } else {
      withheldCount += 1;
      localizedWithheld += 1;
      blockByUrl.delete(route.url);
    }
  }
  manifest.coverage = {
    ...(manifest.coverage || {}),
    indexability: {
      eligible: eligibleCount,
      withheld: withheldCount,
      total_routes: (manifest.routes || []).length,
      inherited_from: sourceLocale.code,
    },
  };
  await writeFile(path.join(root, locale.code, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const rootXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...blockByUrl.values()].map((block) => block.replace(/^/gm, "  ")).join("\n")}\n</urlset>\n`;
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
    if (route.index_eligible !== true) continue;
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

const translationSets = (cluster.routes || [])
  .filter((entry) => sourceEligibility.get(entry.canonical_path) === true)
  .map((entry) => {
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
    "canonical HTML robots/canonical state",
    "sitemap.xml",
    "localization-cluster.json",
    ...releaseLocales.map((locale) => `${locale.code}/manifest.json`),
  ],
  build_sha: buildSha,
  source_locale: profile.sourceLocale,
  index_eligibility: {
    rule: "A localized URL is eligible only when its canonical source page is self-canonical, is not noindex, is present in the canonical root sitemap, and the localized route belongs to the released locale manifest. Translation presence alone never grants search eligibility.",
    excludes: ["redirect", "404", "noindex", "restricted-canonical-source", "placeholder", "noncanonical", "utility-without-standalone-search-value"],
  },
  sitemap_architecture: "root aggregate sitemap plus generated locale subset sitemaps",
  locale_sitemaps: Object.fromEntries([
    [sourceLocale.code, `${base}/sitemap.xml`],
    ...releaseLocales.map((locale) => [locale.code, `${base}${locale.routePrefix}sitemap.xml`]),
  ]),
  source_url_count: rows.filter((row) => row.locale === sourceLocale.code).length,
  localized_url_count: rows.filter((row) => row.locale !== sourceLocale.code).length,
  localized_withheld_count: localizedWithheld,
  route_count: rows.length,
  translation_set_count: translationSets.length,
  translation_sets: translationSets,
  routes: rows,
};

await writeFile(path.join(root, "indexability.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`[indexability-build] ${rows.length} index-eligible route(s); ${translationSets.length} indexable translation set(s); localized eligible=${localizedEligible}; localized withheld=${localizedWithheld}; locales=${[sourceLocale.code, ...releaseLocales.map((locale) => locale.code)].join(",")}`);
