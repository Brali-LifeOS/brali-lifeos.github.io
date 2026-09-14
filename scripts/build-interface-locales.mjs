import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from "./lib/localization-source.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const profile = await readJson(path.join(root, ".arwp", "localization.json"));
const genericLocales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && entry.generator === "generic-v1");

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
};
const flagshipSourceShape = (entry) => ({
  life_area: { slug: entry.life_area.slug, title: entry.life_area.title, subtitle: entry.life_area.subtitle },
  slug: entry.slug,
  title: entry.title,
  description: entry.description,
  action: entry.action,
  check_in: entry.check_in,
  evidence_status: entry.evidence_status,
  reviewed_at: entry.reviewed_at,
});
const flagshipFingerprint = (entry) => createHash("sha256")
  .update(JSON.stringify(canonicalize(flagshipSourceShape(entry))))
  .digest("hex");
const englishFile = (pathname) => pathname === "/"
  ? path.join(root, "index.html")
  : path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");

async function buildLocale(localeEntry) {
  const locale = localeEntry.code;
  const outputRoot = path.join(root, locale);
  const sourceRoot = path.join(root, "data", "localization", locale);
  const batchRoot = path.join(sourceRoot, "library");
  const routeFor = (enPath) => enPath === "/" ? `/${locale}/` : `/${locale}${enPath}`;

  const [site, localizedFlagships, config, primaryPages, zonesLocalized, canonicalFlagships, canonicalIndex, authoringIndex, evidence, canonicalZones] = await Promise.all([
    readJson(path.join(sourceRoot, "site.json")),
    readJson(path.join(sourceRoot, "flagships.json")),
    readJson(path.join(sourceRoot, "library-manifest.json")),
    readJson(path.join(sourceRoot, "primary-pages.json")),
    readJson(path.join(sourceRoot, "zones.json")),
    readJson(path.join(root, "life-os", "datasets", "flagships.json")),
    readJson(path.join(root, "data", "life-os-content", "index.json")),
    loadLocalizationAuthoringIndex(root),
    readJson(path.join(root, "life-os", "datasets", "evidence.json")),
    readJson(path.join(root, "data", "life-os-zones.json")),
  ]);

  if (site.locale !== locale || localizedFlagships.locale !== locale || config.locale !== locale || primaryPages.locale !== locale || zonesLocalized.locale !== locale) {
    throw new Error(`[${locale}] localization sources must agree on locale`);
  }
  if (site.source_locale !== profile.sourceLocale || primaryPages.source_locale !== profile.sourceLocale) {
    throw new Error(`[${locale}] source locale drift`);
  }
  if (config.source_dataset !== "data/life-os-content/index.json") throw new Error(`[${locale}] invalid source dataset`);

  const canonicalFlagshipBySlug = new Map(canonicalFlagships.entries.map((entry) => [entry.slug, entry]));
  const localizedFlagshipBySlug = new Map(localizedFlagships.entries.map((entry) => [entry.slug, entry]));
  const canonicalFlagshipSlugs = [...canonicalFlagshipBySlug.keys()].sort();
  const localizedFlagshipSlugs = [...localizedFlagshipBySlug.keys()].sort();
  if (JSON.stringify(canonicalFlagshipSlugs) !== JSON.stringify(localizedFlagshipSlugs)) {
    throw new Error(`[${locale}] flagship membership drift`);
  }
  for (const entry of localizedFlagships.entries) {
    const source = canonicalFlagshipBySlug.get(entry.slug);
    if (entry.sourceFingerprint !== flagshipFingerprint(source)) throw new Error(`[${locale}] stale flagship ${entry.slug}`);
    if (entry.evidence_status !== source.evidence_status || entry.reviewed_at !== source.reviewed_at) {
      throw new Error(`[${locale}] flagship trust metadata drift for ${entry.slug}`);
    }
  }

  const canonicalZoneBySlug = new Map(canonicalZones.map((entry) => [entry.slug, entry]));
  const localizedZoneBySlug = new Map((zonesLocalized.records || []).map((entry) => [entry.slug, entry]));
  if (canonicalZoneBySlug.size !== localizedZoneBySlug.size || [...canonicalZoneBySlug.keys()].some((slug) => !localizedZoneBySlug.has(slug))) {
    throw new Error(`[${locale}] Growth Zone localization must exactly match canonical zone membership`);
  }

  const canonicalBySlug = new Map(canonicalIndex.map((entry) => [entry.slug, entry]));
  const authoringBySlug = new Map(authoringIndex.map((entry) => [entry.slug, entry]));
  const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));
  const allowedQuality = new Set(config.quality_states || []);
  const batchRecords = [];
  let batchNames = [];
  try {
    batchNames = (await readdir(batchRoot)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const name of batchNames) {
    const batch = await readJson(path.join(batchRoot, name));
    if (batch.locale !== locale || !Array.isArray(batch.records)) throw new Error(`[${locale}] invalid localization batch ${name}`);
    for (const record of batch.records) batchRecords.push({ ...record, _batch: name });
  }

  const localizedBySlug = new Map();
  for (const entry of localizedFlagships.entries) {
    const source = canonicalBySlug.get(entry.slug);
    if (!source) throw new Error(`[${locale}] flagship source missing from canonical corpus: ${entry.slug}`);
    localizedBySlug.set(entry.slug, {
      slug: entry.slug,
      zone_slug: source.zone.slug,
      title: entry.title,
      subtitle: entry.life_area?.subtitle || entry.description,
      description: entry.description,
      quality_state: "editorial-reviewed",
      action: entry.action,
      check_in: entry.check_in,
      boundary: entry.boundary,
      alternative: entry.alternative,
      source: localizationSourceSnapshot(authoringBySlug.get(entry.slug) || source),
    });
  }
  for (const record of batchRecords) {
    if (localizedBySlug.has(record.slug)) throw new Error(`[${locale}] duplicate localized slug ${record.slug}`);
    const source = canonicalBySlug.get(record.slug);
    if (!source) throw new Error(`[${locale}] unknown canonical slug ${record.slug}`);
    if (!allowedQuality.has(record.quality_state)) throw new Error(`[${locale}] invalid quality state ${record.slug}: ${record.quality_state}`);
    const expected = localizationSourceSnapshot(authoringBySlug.get(record.slug) || source);
    for (const [field, value] of Object.entries(expected)) {
      if (record.source?.[field] !== value) throw new Error(`[${locale}] stale source snapshot ${record.slug}.${field}`);
    }
    localizedBySlug.set(record.slug, { ...record, zone_slug: source.zone.slug });
  }

  if (config.coverage_mode === "exact" && localizedBySlug.size !== canonicalIndex.length) {
    const missing = canonicalIndex.filter((entry) => !localizedBySlug.has(entry.slug)).map((entry) => entry.slug);
    throw new Error(`[${locale}] exact coverage incomplete ${localizedBySlug.size}/${canonicalIndex.length}: ${missing.slice(0, 20).join(", ")}`);
  }

  const routes = [];
  const addRoute = (kind, localizedPath, canonicalPath, extra = {}) => routes.push({
    kind,
    locale,
    path: localizedPath,
    url: canonicalUrl(localizedPath),
    canonical_path: canonicalPath,
    canonical_url: canonicalUrl(canonicalPath),
    ...extra,
  });

  function shellDocument({ title, description, localizedPath, canonicalPath, body, type = "WebPage", schema = {} }) {
    const localizedUrl = canonicalUrl(localizedPath);
    const canonical = canonicalUrl(canonicalPath);
    const structured = { "@context": "https://schema.org", "@type": type, name: title, description, url: localizedUrl, inLanguage: localeEntry.languageTag, ...schema };
    return `<!doctype html>\n<html lang="${escapeHtml(localeEntry.languageTag)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)} — Brali</title>\n<meta name="description" content="${escapeHtml(text(description).slice(0, 300))}">\n<link rel="canonical" href="${localizedUrl}">\n<link rel="alternate" hreflang="${escapeHtml(localeEntry.languageTag)}" href="${localizedUrl}">\n<link rel="alternate" hreflang="en" href="${canonical}">\n<link rel="alternate" hreflang="x-default" href="${canonical}">\n<meta property="og:type" content="${type === "Article" ? "article" : "website"}">\n<meta property="og:site_name" content="Brali">\n<meta property="og:title" content="${escapeHtml(title)}">\n<meta property="og:description" content="${escapeHtml(text(description).slice(0, 300))}">\n<meta property="og:url" content="${localizedUrl}">\n<link rel="icon" href="/assets/images/brali-logo.png">\n<link rel="stylesheet" href="/styles.css?v=20260822j">\n<script type="application/ld+json">${jsonForHtml(structured)}</script>\n</head>\n<body data-brali-cluster="localized-${escapeHtml(locale)}">\n<a class="skip" href="#content">${escapeHtml(site.shell.skip)}</a>\n<header class="site-header"><nav class="wrap nav" aria-label="${escapeHtml(site.shell.nav_aria)}"><a class="brand" href="/${locale}/" aria-label="${escapeHtml(site.shell.home_aria)}"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/${locale}/life-os/">${escapeHtml(site.shell.nav_library)}</a><a href="/${locale}/life-os/flagships/">${escapeHtml(site.shell.nav_flagships)}</a><a href="/${locale}/life-os/methodology/">${escapeHtml(site.shell.nav_methodology)}</a><a href="/${locale}/research/">${escapeHtml(site.shell.nav_research)}</a><a href="/${locale}/partners/">${escapeHtml(site.shell.nav_partners)}</a><a href="/${locale}/for-ai/">${escapeHtml(site.shell.nav_for_ai)}</a><a lang="en" hreflang="en" href="${escapeHtml(canonicalPath)}">English</a></div></nav></header>\n<main id="content" class="page wrap">${body}</main>\n<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/${locale}/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>${escapeHtml(site.shell.footer_line)}</small></div><div class="footer-links"><a href="/${locale}/life-os/">${escapeHtml(site.shell.nav_library)}</a><a href="/${locale}/life-os/methodology/">${escapeHtml(site.shell.nav_methodology)}</a><a href="/${locale}/llms.txt">llms.txt</a><a lang="en" hreflang="en" href="${escapeHtml(canonicalPath)}">English</a></div></div></footer>\n</body>\n</html>`;
  }

  async function savePage(relativePath, html, localizedPath, canonicalPath, kind, extra = {}) {
    const destination = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, html);
    addRoute(kind, localizedPath, canonicalPath, extra);
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const flagshipCards = localizedFlagships.entries.map((entry) => `<article class="card"><span class="card-label">${escapeHtml(entry.life_area.title)} · ${escapeHtml(entry.evidence_label)}</span><h3><a href="/${locale}/life-os/${escapeHtml(entry.slug)}/">${escapeHtml(entry.title)}</a></h3><p>${escapeHtml(entry.description)}</p><p><a href="/${locale}/life-os/${escapeHtml(entry.slug)}/">${escapeHtml(site.collection.card_cta)} →</a></p></article>`).join("");
  const homeBody = `<section class="visual-hero visual-hero--hacks"><div class="visual-hero-copy"><p class="eyebrow">${escapeHtml(site.home.eyebrow)}</p><h1>${escapeHtml(site.home.heading)}</h1><p class="lead">${escapeHtml(site.home.lead)}</p><p><a class="button yellow" href="/${locale}/life-os/">${escapeHtml(site.home.primary_cta)}</a> <a class="button quiet" href="/${locale}/life-os/methodology/">${escapeHtml(site.home.secondary_cta)}</a></p></div><figure class="visual-hero-media"><img src="/assets/images/brali-mascot-hero.png" alt="" fetchpriority="high"></figure></section><section class="prose"><p class="eyebrow">${escapeHtml(site.home.coverage_eyebrow)}</p><h2>${escapeHtml(site.home.coverage_heading)}</h2><p>${escapeHtml(site.home.coverage_lead)}</p></section><div class="grid three">${flagshipCards}</div><section class="prose"><p class="eyebrow">${escapeHtml(site.home.evidence_eyebrow)}</p><h2>${escapeHtml(site.home.evidence_heading)}</h2><p>${escapeHtml(site.home.evidence_body)}</p><p><a class="button" href="/${locale}/life-os/methodology/">${escapeHtml(site.home.evidence_cta)}</a></p></section><div class="grid two"><article class="card"><span class="card-label">${escapeHtml(site.home.machine_eyebrow)}</span><h3>${escapeHtml(site.home.machine_heading)}</h3><p>${escapeHtml(site.home.machine_body)}</p><p><a href="/${locale}/llms.txt">${escapeHtml(site.home.machine_cta)} →</a></p></article><article class="card"><span class="card-label">${escapeHtml(site.shell.coverage_label)}</span><h3>${escapeHtml(site.home.boundary_heading)}</h3><p>${escapeHtml(site.home.boundary_body)}</p></article></div>`;
  await savePage("index.html", shellDocument({ title: site.home.title, description: site.home.description, localizedPath: `/${locale}/`, canonicalPath: "/", body: homeBody }), `/${locale}/`, "/", "homepage");

  const collectionPath = `/${locale}/life-os/flagships/`;
  const collectionBody = `<p class="eyebrow">${escapeHtml(site.collection.eyebrow)}</p><h1>${escapeHtml(site.collection.heading)}</h1><p class="lead">${escapeHtml(site.collection.lead)}</p><div class="grid three">${flagshipCards}</div><aside class="callout"><h3>${escapeHtml(site.home.boundary_heading)}</h3><p>${escapeHtml(site.home.boundary_body)}</p><a class="button" href="/${locale}/life-os/methodology/">${escapeHtml(site.home.evidence_cta)}</a></aside>`;
  await savePage("life-os/flagships/index.html", shellDocument({ title: site.collection.title, description: site.collection.description, localizedPath: collectionPath, canonicalPath: "/life-os/flagships/", body: collectionBody, type: "CollectionPage" }), collectionPath, "/life-os/flagships/", "collection");

  const methodology = site.methodology;
  const methodologyPath = `/${locale}/life-os/methodology/`;
  const methodologyBody = `<p class="eyebrow">${escapeHtml(methodology.eyebrow)}</p><h1>${escapeHtml(methodology.heading)}</h1><p class="lead">${escapeHtml(methodology.lead)}</p><section class="prose"><h2>${escapeHtml(methodology.states_heading)}</h2></section><div class="grid two"><article class="card"><span class="card-label">reviewed</span><h3>${escapeHtml(methodology.reviewed_title)}</h3><p>${escapeHtml(methodology.reviewed_body)}</p></article><article class="card"><span class="card-label">practical</span><h3>${escapeHtml(methodology.practical_title)}</h3><p>${escapeHtml(methodology.practical_body)}</p></article><article class="card"><span class="card-label">pending-review</span><h3>${escapeHtml(methodology.pending_title)}</h3><p>${escapeHtml(methodology.pending_body)}</p></article><article class="card"><span class="card-label">restricted</span><h3>${escapeHtml(methodology.restricted_title)}</h3><p>${escapeHtml(methodology.restricted_body)}</p></article></div><section class="prose"><h2>${escapeHtml(methodology.claims_heading)}</h2><p>${escapeHtml(methodology.claims_body)}</p><h2>${escapeHtml(methodology.locale_heading)}</h2><p>${escapeHtml(methodology.locale_body)}</p><h2>${escapeHtml(methodology.health_heading)}</h2><p>${escapeHtml(methodology.health_body)}</p><h2>${escapeHtml(methodology.machine_heading)}</h2><p>${escapeHtml(methodology.machine_body)}</p><p><a href="/${locale}/manifest.json">Locale manifest</a> · <a href="/${locale}/llms.txt">llms.txt</a></p></section><aside class="callout"><a class="button yellow" href="/${locale}/life-os/flagships/">${escapeHtml(methodology.back_cta)}</a></aside>`;
  await savePage("life-os/methodology/index.html", shellDocument({ title: methodology.title, description: methodology.description, localizedPath: methodologyPath, canonicalPath: "/life-os/methodology/", body: methodologyBody }), methodologyPath, "/life-os/methodology/", "methodology");

  const formatDate = (iso) => {
    const [year, month, day] = String(iso).split("-");
    return `${day}.${month}.${year}`;
  };
  for (const entry of localizedFlagships.entries) {
    const canonicalPath = `/life-os/${entry.slug}/`;
    const localizedPath = routeFor(canonicalPath);
    const body = `<p class="eyebrow">${escapeHtml(site.protocol.eyebrow)} · ${escapeHtml(entry.life_area.title)}</p><h1>${escapeHtml(entry.title)}</h1><p class="lead">${escapeHtml(entry.description)}</p><div class="grid two"><article class="card"><span class="card-label">${escapeHtml(site.protocol.status_label)}</span><h3>${escapeHtml(entry.evidence_label)}</h3><p><code>${escapeHtml(entry.evidence_status)}</code> · <time datetime="${escapeHtml(entry.reviewed_at)}">${escapeHtml(formatDate(entry.reviewed_at))}</time></p></article><article class="card"><span class="card-label">${escapeHtml(entry.life_area.title)}</span><h3>${escapeHtml(entry.life_area.subtitle)}</h3></article></div><section class="prose"><h2>${escapeHtml(site.protocol.action_heading)}</h2><p>${escapeHtml(entry.action)}</p><h2>${escapeHtml(site.protocol.check_heading)}</h2><p>${escapeHtml(entry.check_in)}</p><h2>${escapeHtml(site.protocol.boundary_heading)}</h2><p>${escapeHtml(entry.boundary)}</p><h2>${escapeHtml(site.protocol.alternative_heading)}</h2><p>${escapeHtml(entry.alternative)}</p></section><aside class="callout"><h3>${escapeHtml(site.protocol.source_heading)}</h3><p>${escapeHtml(site.protocol.source_body)}</p><a class="button" lang="en" hreflang="en" href="${canonicalPath}">${escapeHtml(site.protocol.source_cta)}</a> <a class="button quiet" href="/${locale}/life-os/flagships/">${escapeHtml(site.protocol.collection_cta)}</a></aside>`;
    await savePage(`life-os/${entry.slug}/index.html`, shellDocument({ title: entry.title, description: entry.description, localizedPath, canonicalPath, body, type: "Article" }), localizedPath, canonicalPath, "flagship", { slug: entry.slug });
  }

  const statusLabels = site.library.status_labels;
  const qualityLabels = site.library.quality_labels;
  const trustBoundary = (status, sensitive) => {
    if (status === "restricted" || sensitive) return site.library.trust_boundaries.restricted;
    return site.library.trust_boundaries[status] || site.library.trust_boundaries["pending-review"];
  };
  const sortedLocalized = [...localizedBySlug.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title, locale));
  for (const [slug, localized] of sortedLocalized) {
    if (localizedFlagshipBySlug.has(slug)) continue;
    const source = canonicalBySlug.get(slug);
    const evidenceRecord = evidenceBySlug.get(slug);
    if (!evidenceRecord) throw new Error(`[${locale}] evidence record missing for ${slug}`);
    const zone = localizedZoneBySlug.get(source.zone.slug);
    const canonicalPath = `/life-os/${slug}/`;
    const localizedPath = routeFor(canonicalPath);
    const rich = localized.action && localized.check_in;
    const actionBlock = rich ? `<section class="prose"><h2>${escapeHtml(site.library.action_heading)}</h2><p>${escapeHtml(localized.action)}</p><h2>${escapeHtml(site.library.check_heading)}</h2><p>${escapeHtml(localized.check_in)}</p>${localized.boundary ? `<h2>${escapeHtml(site.library.boundary_heading)}</h2><p>${escapeHtml(localized.boundary)}</p>` : ""}${localized.alternative ? `<h2>${escapeHtml(site.library.alternative_heading)}</h2><p>${escapeHtml(localized.alternative)}</p>` : ""}</section>` : "";
    const body = `<p class="eyebrow">${escapeHtml(zone.title)} · ${escapeHtml(site.library.eyebrow_suffix)}</p><h1>${escapeHtml(localized.title)}</h1><p class="lead">${escapeHtml(localized.description)}</p><div class="grid two"><article class="card"><span class="card-label">${escapeHtml(site.library.status_heading)}</span><h3>${escapeHtml(statusLabels[evidenceRecord.status] || evidenceRecord.status)}</h3><p><code>${escapeHtml(evidenceRecord.status)}</code></p></article><article class="card"><span class="card-label">${escapeHtml(site.library.quality_heading)}</span><h3>${escapeHtml(qualityLabels[localized.quality_state] || localized.quality_state)}</h3><p>${escapeHtml(site.library.quality_body)}</p></article></div>${actionBlock}<section class="prose"><h2>${escapeHtml(site.library.important_heading)}</h2><p>${escapeHtml(trustBoundary(evidenceRecord.status, evidenceRecord.sensitive))}</p><h2>${escapeHtml(site.library.source_context_heading)}</h2><p>${escapeHtml(site.library.source_context_body)}</p></section><aside class="callout"><a class="button" lang="en" hreflang="en" href="${canonicalPath}">${escapeHtml(site.library.open_english)}</a> <a class="button quiet" href="/${locale}/life-os/${escapeHtml(source.zone.slug)}/">${escapeHtml(site.library.more_topic)}</a></aside>`;
    await savePage(`life-os/${slug}/index.html`, shellDocument({ title: localized.title, description: localized.description, localizedPath, canonicalPath, body, type: "Article" }), localizedPath, canonicalPath, "library-entry", { slug, quality_state: localized.quality_state, evidence_status: evidenceRecord.status });
  }

  const entriesByZone = new Map();
  for (const [slug] of sortedLocalized) {
    const source = canonicalBySlug.get(slug);
    const list = entriesByZone.get(source.zone.slug) || [];
    list.push(slug);
    entriesByZone.set(source.zone.slug, list);
  }
  const zoneCards = (zonesLocalized.records || []).map((zone) => `<article class="card"><h3><a href="/${locale}/life-os/${escapeHtml(zone.slug)}/">${escapeHtml(zone.title)}</a></h3><p>${escapeHtml(zone.subtitle)}</p><p><code>${entriesByZone.get(zone.slug)?.length || 0}</code></p></article>`).join("");
  const libraryPath = `/${locale}/life-os/`;
  const libraryBody = `<p class="eyebrow">${escapeHtml(site.shell.nav_library)} · ${escapeHtml(site.shell.coverage_label)}</p><h1>${escapeHtml(site.shell.nav_library)}</h1><p class="lead">${escapeHtml(site.home.coverage_lead)}</p><div class="grid three">${zoneCards}</div>`;
  await savePage("life-os/index.html", shellDocument({ title: `${site.shell.nav_library} — Brali`, description: site.home.description, localizedPath: libraryPath, canonicalPath: "/life-os/", body: libraryBody, type: "CollectionPage" }), libraryPath, "/life-os/", "library-index");

  for (const zone of zonesLocalized.records || []) {
    const slugs = entriesByZone.get(zone.slug) || [];
    const cards = slugs.map((slug) => {
      const item = localizedBySlug.get(slug);
      return `<article class="card"><h3><a href="/${locale}/life-os/${escapeHtml(slug)}/">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.description)}</p></article>`;
    }).join("");
    const canonicalPath = `/life-os/${zone.slug}/`;
    const localizedPath = routeFor(canonicalPath);
    const body = `<p class="eyebrow">${escapeHtml(site.shell.nav_library)}</p><h1>${escapeHtml(zone.title)}</h1><p class="lead">${escapeHtml(zone.subtitle)}</p>${cards ? `<div class="grid two">${cards}</div>` : `<aside class="callout"><p>${escapeHtml(site.home.coverage_lead)}</p></aside>`}`;
    await savePage(`life-os/${zone.slug}/index.html`, shellDocument({ title: zone.title, description: zone.subtitle, localizedPath, canonicalPath, body, type: "CollectionPage" }), localizedPath, canonicalPath, "zone", { zone_slug: zone.slug });
  }

  for (const page of primaryPages.pages || []) {
    const sourceHtml = await readFile(path.join(root, page.source_path), "utf8");
    for (const marker of page.source_markers || []) {
      if (!sourceHtml.includes(marker)) throw new Error(`[${locale}] primary page source drift ${page.id}: missing marker ${marker}`);
    }
    const fragment = await readFile(path.join(root, page.fragment), "utf8");
    const localizedPath = page.route;
    const relative = localizedPath.replace(new RegExp(`^/${locale}/`), "").replace(/\/$/, "");
    await savePage(`${relative}/index.html`, shellDocument({ title: page.title, description: page.description, localizedPath, canonicalPath: page.source_route, body: fragment, type: page.schema_type || "WebPage" }), localizedPath, page.source_route, "primary-hub", { id: page.id });
  }

  const machineEntries = sortedLocalized.map(([slug, localized]) => {
    const source = canonicalBySlug.get(slug);
    const evidenceRecord = evidenceBySlug.get(slug);
    return {
      slug,
      canonical_id: source.id || `brali:hack:${slug}`,
      zone_slug: source.zone.slug,
      title: localized.title,
      subtitle: localized.subtitle,
      description: localized.description,
      localization_quality: localized.quality_state,
      evidence_status: evidenceRecord?.status || null,
      canonical_url: canonicalUrl(`/life-os/${slug}/`),
      localized_url: canonicalUrl(`/${locale}/life-os/${slug}/`),
    };
  });
  const machineLibrary = {
    schema_version: 1,
    locale,
    source_locale: profile.sourceLocale,
    coverage_mode: config.coverage_mode,
    count: machineEntries.length,
    canonical_count: canonicalIndex.length,
    entries: machineEntries,
  };
  await writeFile(path.join(outputRoot, "library.json"), `${JSON.stringify(machineLibrary, null, 2)}\n`);

  const manifest = {
    schema_version: 1,
    locale,
    language_tag: localeEntry.languageTag,
    source_locale: profile.sourceLocale,
    status: site.status,
    no_silent_fallback: true,
    coverage: {
      library_entries: { localized: localizedBySlug.size, canonical: canonicalIndex.length, mode: config.coverage_mode },
      zones: { localized: localizedZoneBySlug.size, canonical: canonicalZones.length, mode: "exact" },
      flagships: { localized: localizedFlagshipBySlug.size, canonical: canonicalFlagships.entries.length, mode: "exact" },
      primary_pages: { localized: (primaryPages.pages || []).length, canonical: (primaryPages.pages || []).length, mode: "exact-declared" },
    },
    routes,
  };
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const coverageLine = config.coverage_mode === "exact"
    ? `Abdeckung: alle ${canonicalIndex.length} kanonischen öffentlichen Bibliothekseinträge sind lokalisiert.`
    : `Abdeckung: ${localizedBySlug.size} von ${canonicalIndex.length} kanonischen Bibliothekseinträgen. Nicht aufgeführte Einträge gelten nicht als deutsch lokalisiert.`;
  const llms = `# Brali — Deutsch\n\nLocale: ${locale}\nCanonical locale: ${profile.sourceLocale}\nNo silent fallback: true\nCoverage mode: ${config.coverage_mode}\n${coverageLine}\n\n## Maschinenlesbare Flächen\n- ${base}/${locale}/manifest.json\n- ${base}/${locale}/library.json\n- ${base}/${locale}/sitemap.xml\n\nKanonische Slugs, IDs, Evidenzstatus und Provenienz bleiben englisch/kanonisch. Eine deutsche Formulierung darf den Vertrauensstatus nicht erhöhen.\n`;
  await writeFile(path.join(outputRoot, "llms.txt"), llms);

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url><loc>${route.url}</loc></url>`).join("\n")}\n</urlset>\n`;
  await writeFile(path.join(outputRoot, "sitemap.xml"), sitemap);

  const canonicalRoutes = new Map(routes.map((route) => [route.canonical_path, route]));
  for (const route of canonicalRoutes.values()) {
    const file = englishFile(route.canonical_path);
    let html;
    try {
      html = await readFile(file, "utf8");
    } catch {
      throw new Error(`[${locale}] canonical page missing for reciprocal locale link: ${route.canonical_path}`);
    }
    const alternate = `<link rel="alternate" hreflang="${localeEntry.languageTag}" href="${route.url}">`;
    if (!html.includes(alternate)) html = html.replace("</head>", `${alternate}</head>`);
    const switchLink = `<a lang="${localeEntry.languageTag}" hreflang="${localeEntry.languageTag}" href="${route.path}">${escapeHtml(localeEntry.label)}</a>`;
    if (!html.includes(switchLink)) {
      if (!html.includes("</div></nav></header>")) throw new Error(`[${locale}] cannot add locale switch to ${route.canonical_path}`);
      html = html.replace("</div></nav></header>", `${switchLink}</div></nav></header>`);
    }
    await writeFile(file, html);
  }

  const robotsPath = path.join(root, "robots.txt");
  let robots = await readFile(robotsPath, "utf8");
  const sitemapLine = `Sitemap: ${base}/${locale}/sitemap.xml`;
  if (!robots.includes(sitemapLine)) robots = `${robots.trimEnd()}\n${sitemapLine}\n`;
  await writeFile(robotsPath, robots);

  console.log(`Built ${localeEntry.label} localization: ${routes.length} human pages; ${localizedBySlug.size}/${canonicalIndex.length} library entries; mode=${config.coverage_mode}.`);
}

for (const localeEntry of genericLocales) await buildLocale(localeEntry);
