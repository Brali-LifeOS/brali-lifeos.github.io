import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const profile = await readJson(".arwp/localization.json");
const sourceLocale = profile.sourceLocale;
const source = (profile.locales || []).find((entry) => entry.code === sourceLocale);
if (!source) throw new Error(`[profile-locales] missing source locale ${sourceLocale}`);

const canonical = await readJson("data/life-os-content/index.json");
const canonicalZones = await readJson("data/life-os-zones.json");
const evidence = await readJson("life-os/datasets/evidence.json");
const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]);
const escapeAttribute = escapeHtml;
const absolute = (pathname) => `${base}${pathname}`;
const canonicalUrl = (pathname) => absolute(pathname === "/" || pathname.endsWith("/") ? pathname : `${pathname}/`);
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

function localePathFor(code, canonicalPath) {
  if (canonicalPath === "/") return `/${code}/`;
  return `/${code}${canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`}`;
}

function outputRelative(localePath) {
  const clean = localePath.replace(/^\/+|\/+$/g, "");
  return clean ? path.join(clean, "index.html") : "index.html";
}

function localizedShape(record) {
  const value = record?.localized && typeof record.localized === "object" ? record.localized : record;
  return {
    title: String(value?.title || "").trim(),
    subtitle: String(value?.subtitle || "").trim(),
    description: String(value?.description || "").trim(),
  };
}

async function loadLocalizedLibrary(locale) {
  const directory = path.join(root, "data", "localization", locale.code, "library");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const bySlug = new Map();
  for (const name of files) {
    const batch = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    const records = Array.isArray(batch.records) ? batch.records : Array.isArray(batch.entries) ? batch.entries : [];
    for (const record of records) {
      if (!record?.slug) throw new Error(`[profile-locales:${locale.code}] ${name} contains a record without slug`);
      if (bySlug.has(record.slug)) throw new Error(`[profile-locales:${locale.code}] duplicate localized slug ${record.slug}`);
      const text = localizedShape(record);
      if (!text.title || !text.subtitle || !text.description) throw new Error(`[profile-locales:${locale.code}] incomplete localized copy for ${record.slug}`);
      bySlug.set(record.slug, { ...record, ...text });
    }
  }
  const canonicalSlugs = new Set(canonical.map((entry) => entry.slug));
  const missing = [...canonicalSlugs].filter((slug) => !bySlug.has(slug));
  const extra = [...bySlug.keys()].filter((slug) => !canonicalSlugs.has(slug));
  if (missing.length || extra.length) {
    throw new Error(`[profile-locales:${locale.code}] library parity failed; missing=${missing.slice(0, 20).join(",")}; extra=${extra.slice(0, 20).join(",")}`);
  }
  return bySlug;
}

function languageLinks({ locale, canonicalPath }) {
  const current = localePathFor(locale.code, canonicalPath);
  const russian = localePathFor("ru", canonicalPath);
  return [
    `<a lang="en" hreflang="en" href="${escapeAttribute(canonicalPath)}">English</a>`,
    locale.code === "ru" ? "" : `<a lang="ru" hreflang="ru" href="${escapeAttribute(russian)}">Русский</a>`,
    locale.code === "de" ? "" : `<a lang="de" hreflang="de" href="${escapeAttribute(localePathFor("de", canonicalPath))}">Deutsch</a>`,
  ].filter(Boolean).join("");
}

function shellDocument({ locale, site, title, description, localePath, canonicalPath, body, type = "WebPage" }) {
  const localeUrl = canonicalUrl(localePath);
  const sourceUrl = canonicalUrl(canonicalPath);
  const structured = {
    "@context": "https://schema.org",
    "@type": type,
    name: title,
    description,
    url: localeUrl,
    inLanguage: locale.languageTag,
    isPartOf: { "@type": "WebSite", name: "Brali", url: `${base}/` },
  };
  return `<!doctype html><html lang="${escapeAttribute(locale.languageTag)}" dir="${escapeAttribute(locale.direction || "ltr")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Brali</title><meta name="description" content="${escapeAttribute(description)}"><link rel="canonical" href="${localeUrl}"><link rel="alternate" hreflang="${escapeAttribute(locale.languageTag)}" href="${localeUrl}"><link rel="alternate" hreflang="${escapeAttribute(sourceLocale)}" href="${sourceUrl}"><link rel="alternate" hreflang="x-default" href="${sourceUrl}"><meta property="og:type" content="${type === "Article" ? "article" : "website"}"><meta property="og:site_name" content="Brali"><meta property="og:title" content="${escapeAttribute(title)}"><meta property="og:description" content="${escapeAttribute(description)}"><meta property="og:url" content="${localeUrl}"><meta property="og:image" content="${base}/assets/images/brali-mascot-hero.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css?v=20260822j"><script type="application/ld+json">${jsonForHtml(structured)}</script></head><body data-brali-cluster="localized-${escapeAttribute(locale.code)}"><a class="skip" href="#content">${escapeHtml(site.shell.skip)}</a><header class="site-header"><nav class="wrap nav" aria-label="${escapeAttribute(site.shell.nav_aria)}"><a class="brand" href="/${escapeAttribute(locale.code)}/" aria-label="${escapeAttribute(site.shell.home_aria)}"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/${escapeAttribute(locale.code)}/life-os/">${escapeHtml(site.shell.library)}</a><a href="/${escapeAttribute(locale.code)}/life-os/methodology/">${escapeHtml(site.shell.methodology)}</a><a href="/${escapeAttribute(locale.code)}/research/">${escapeHtml(site.shell.research)}</a><a href="/${escapeAttribute(locale.code)}/partners/">${escapeHtml(site.shell.partners)}</a><a class="button" href="/${escapeAttribute(locale.code)}/for-ai/">${escapeHtml(site.shell.for_ai)}</a>${languageLinks({ locale, canonicalPath })}</div></nav></header><main id="content" class="page wrap">${body}</main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/${escapeAttribute(locale.code)}/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>${escapeHtml(site.shell.footer)}</small></div><div class="footer-links"><a href="/${escapeAttribute(locale.code)}/life-os/">${escapeHtml(site.shell.library)}</a><a href="/${escapeAttribute(locale.code)}/life-os/methodology/">${escapeHtml(site.shell.methodology)}</a><a href="/${escapeAttribute(locale.code)}/llms.txt">llms.txt</a>${languageLinks({ locale, canonicalPath })}</div></div></footer></body></html>`;
}

async function buildLocale(locale) {
  const sourceRoot = path.join(root, "data", "localization", locale.code);
  try {
    await access(path.join(sourceRoot, "site.json"));
  } catch {
    console.log(`[profile-locales] ${locale.code}: no site.json; skipping profile builder`);
    return;
  }
  const site = await readJson(`data/localization/${locale.code}/site.json`);
  if (site.locale !== locale.code) throw new Error(`[profile-locales:${locale.code}] site locale mismatch`);
  const localizedBySlug = await loadLocalizedLibrary(locale);
  const zoneSource = await readJson(`data/localization/${locale.code}/zones.json`);
  const zones = Array.isArray(zoneSource.records) ? zoneSource.records : [];
  const zonesBySlug = new Map(zones.map((entry) => [entry.slug, entry]));
  const missingZones = canonicalZones.filter((entry) => !zonesBySlug.has(entry.slug));
  const extraZones = zones.filter((entry) => !canonicalZones.some((sourceZone) => sourceZone.slug === entry.slug));
  if (missingZones.length || extraZones.length) throw new Error(`[profile-locales:${locale.code}] zone parity failed`);

  const outputRoot = path.join(root, locale.code);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const routes = [];
  async function savePage({ canonicalPath, kind, body, title, description, type = "WebPage", slug = null, evidenceStatus = null, localizationQuality = null }) {
    const localePath = localePathFor(locale.code, canonicalPath);
    const destination = path.join(root, outputRelative(localePath));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, shellDocument({ locale, site, title, description, localePath, canonicalPath, body, type }), "utf8");
    const route = {
      kind,
      locale: locale.code,
      path: localePath,
      url: canonicalUrl(localePath),
      canonical_path: canonicalPath,
      canonical_url: canonicalUrl(canonicalPath),
    };
    if (slug) route.slug = slug;
    if (evidenceStatus) route.evidence_status = evidenceStatus;
    if (localizationQuality) route.localization_quality = localizationQuality;
    routes.push(route);
  }

  const libraryEntries = canonical.map((entry) => {
    const localized = localizedBySlug.get(entry.slug);
    const evidenceEntry = evidenceBySlug.get(entry.slug);
    if (!evidenceEntry) throw new Error(`[profile-locales:${locale.code}] missing evidence state for ${entry.slug}`);
    return {
      slug: entry.slug,
      canonical_url: canonicalUrl(`/life-os/${entry.slug}/`),
      localized_url: canonicalUrl(`/${locale.code}/life-os/${entry.slug}/`),
      zone: entry.zone?.slug || evidenceEntry.zone || "",
      title: localized.title,
      subtitle: localized.subtitle,
      description: localized.description,
      evidence_status: evidenceEntry.status,
      sensitive: Boolean(evidenceEntry.sensitive),
      localization_quality: localized.quality_state || "language-reviewed",
      source_updated: entry.updatedISO,
    };
  });
  const libraryBySlug = new Map(libraryEntries.map((entry) => [entry.slug, entry]));

  const indexCards = libraryEntries.slice(0, 12).map((entry) => `<article class="card"><span class="card-label">${escapeHtml(zonesBySlug.get(entry.zone)?.title || entry.zone)} · ${escapeHtml(entry.evidence_status)}</span><h3><a href="/${locale.code}/life-os/${escapeAttribute(entry.slug)}/">${escapeHtml(entry.title)}</a></h3><p>${escapeHtml(entry.description)}</p></article>`).join("");
  await savePage({
    canonicalPath: "/",
    kind: "homepage",
    title: site.home.title,
    description: site.home.description,
    body: `<section class="visual-hero visual-hero--hacks"><div class="visual-hero-copy"><p class="eyebrow">${escapeHtml(site.home.eyebrow)}</p><h1>${escapeHtml(site.home.heading)}</h1><p class="lead">${escapeHtml(site.home.lead)}</p><p><a class="button yellow" href="/${locale.code}/life-os/">${escapeHtml(site.home.primary_cta)}</a> <a class="button quiet" href="/${locale.code}/life-os/methodology/">${escapeHtml(site.home.secondary_cta)}</a></p></div><figure class="visual-hero-media"><img src="/assets/images/brali-mascot-hero.png" alt="Brali" fetchpriority="high"></figure></section><div class="grid three">${indexCards}</div>`,
  });

  const grouped = new Map();
  for (const entry of libraryEntries) {
    if (!grouped.has(entry.zone)) grouped.set(entry.zone, []);
    grouped.get(entry.zone).push(entry);
  }
  const zoneSections = canonicalZones.map((zone) => {
    const localizedZone = zonesBySlug.get(zone.slug);
    const items = (grouped.get(zone.slug) || []).map((entry) => `<li><a href="/${locale.code}/life-os/${escapeAttribute(entry.slug)}/">${escapeHtml(entry.title)}</a> <small>${escapeHtml(entry.evidence_status)}</small></li>`).join("");
    return `<section class="prose"><h2>${escapeHtml(localizedZone.title)}</h2><p>${escapeHtml(localizedZone.subtitle)}</p><ul>${items}</ul></section>`;
  }).join("");
  await savePage({
    canonicalPath: "/life-os/",
    kind: "library-index",
    title: site.library.title,
    description: site.library.description,
    body: `<p class="eyebrow">${escapeHtml(site.library.eyebrow)}</p><h1>${escapeHtml(site.library.heading)}</h1><p class="lead">${escapeHtml(site.library.lead)}</p>${zoneSections}`,
  });

  const flagshipSlugs = [
    "25-minute-pomodoro-focus-sprints",
    "circles-of-control-planner",
    "10-minute-morning-stretch-routine",
    "weekly-theme-learning-sprints",
    "active-listening-exercises",
    "brainwriting-group-idea-generation",
    "start-with-a-hypothesis",
  ].filter((slug) => libraryBySlug.has(slug));
  const flagshipCards = flagshipSlugs.map((slug) => {
    const entry = libraryBySlug.get(slug);
    return `<article class="card"><span class="card-label">${escapeHtml(entry.evidence_status)}</span><h3><a href="/${locale.code}/life-os/${escapeAttribute(slug)}/">${escapeHtml(entry.title)}</a></h3><p>${escapeHtml(entry.description)}</p></article>`;
  }).join("");
  await savePage({
    canonicalPath: "/life-os/flagships/",
    kind: "collection",
    title: site.flagships.title,
    description: site.flagships.description,
    type: "CollectionPage",
    body: `<p class="eyebrow">${escapeHtml(site.flagships.eyebrow)}</p><h1>${escapeHtml(site.flagships.heading)}</h1><p class="lead">${escapeHtml(site.flagships.lead)}</p><div class="grid three">${flagshipCards}</div>`,
  });

  await savePage({
    canonicalPath: "/life-os/methodology/",
    kind: "methodology",
    title: site.methodology.title,
    description: site.methodology.description,
    body: `<p class="eyebrow">${escapeHtml(site.methodology.eyebrow)}</p><h1>${escapeHtml(site.methodology.heading)}</h1><p class="lead">${escapeHtml(site.methodology.lead)}</p><section class="prose"><h2>${escapeHtml(site.methodology.states_heading)}</h2><p>${escapeHtml(site.methodology.states_body)}</p><h2>${escapeHtml(site.methodology.coverage_heading)}</h2><p>${escapeHtml(site.methodology.coverage_body)}</p><h2>${escapeHtml(site.methodology.machine_heading)}</h2><p>${escapeHtml(site.methodology.machine_body)}</p><p><a href="/${locale.code}/manifest.json">manifest.json</a> · <a href="/${locale.code}/library.json">library.json</a> · <a href="/${locale.code}/llms.txt">llms.txt</a></p></section>`,
  });

  for (const [canonicalPath, key, kind] of [["/research/", "research", "primary-hub"], ["/partners/", "partners", "primary-hub"], ["/for-ai/", "for_ai", "primary-hub"]]) {
    const page = site[key];
    const cta = key === "for_ai"
      ? `<a class="button yellow" href="/${locale.code}/llms.txt">${escapeHtml(page.cta)}</a>`
      : `<a class="button" lang="en" hreflang="en" href="${escapeAttribute(canonicalPath)}">${escapeHtml(page.cta)}</a>`;
    await savePage({
      canonicalPath,
      kind,
      title: page.title,
      description: page.description,
      localizationQuality: "language-reviewed",
      body: `<p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.heading)}</h1><p class="lead">${escapeHtml(page.lead)}</p><p>${cta}</p>`,
    });
  }

  for (const entry of libraryEntries) {
    const zone = zonesBySlug.get(entry.zone);
    await savePage({
      canonicalPath: `/life-os/${entry.slug}/`,
      kind: "library-entry",
      slug: entry.slug,
      evidenceStatus: entry.evidence_status,
      localizationQuality: entry.localization_quality,
      title: entry.title,
      description: entry.description,
      type: "Article",
      body: `<p class="eyebrow">${escapeHtml(zone?.title || entry.zone)} · ${escapeHtml(locale.label)}</p><h1>${escapeHtml(entry.title)}</h1><p class="lead">${escapeHtml(entry.subtitle)}</p><section class="prose"><p>${escapeHtml(entry.description)}</p><h2>${escapeHtml(site.protocol.evidence_label)}</h2><p><code>${escapeHtml(entry.evidence_status)}</code></p><h2>${escapeHtml(site.protocol.source_label)}</h2><p>${escapeHtml(site.protocol.source_body)}</p><p><a class="button" lang="en" hreflang="en" href="/life-os/${escapeAttribute(entry.slug)}/">${escapeHtml(site.protocol.source_cta)}</a> <a class="button quiet" href="/${locale.code}/life-os/">${escapeHtml(site.protocol.back_cta)}</a></p></section>`,
    });
  }

  const qualityCounts = {};
  const evidenceCounts = {};
  for (const entry of libraryEntries) {
    qualityCounts[entry.localization_quality] = (qualityCounts[entry.localization_quality] || 0) + 1;
    evidenceCounts[entry.evidence_status] = (evidenceCounts[entry.evidence_status] || 0) + 1;
  }
  const manifest = {
    schema_version: 1,
    locale: locale.code,
    source_locale: sourceLocale,
    role: locale.role,
    status: locale.status,
    search_publication: locale.searchPublication,
    no_silent_fallback: true,
    source_dataset: `${base}/data/life-os-content/index.json`,
    coverage: {
      homepage: "complete",
      methodology: "complete-for-declared-scope",
      flagship_protocols: { state: "localized-from-library", localized: flagshipSlugs.length, canonical: flagshipSlugs.length },
      long_form_library: "semantic-layer-exact",
      secondary_product_surfaces: "explicit-source-locale-boundary",
      rendered_narrow_layout_review: "automated-browser-gated",
      primary_product_hubs: { state: "language-reviewed", localized: 3, canonical: 3 },
      library_entries: { localized: libraryEntries.length, canonical: canonical.length, mode: "exact" },
      zones: { localized: zones.length, canonical: canonicalZones.length },
      localization_quality: qualityCounts,
      localized_evidence_states: evidenceCounts,
    },
    routes,
    evidence_boundary: profile.evidenceBoundary,
    library_dataset: `${base}/${locale.code}/library.json`,
  };
  const library = {
    schema_version: 1,
    locale: locale.code,
    source_locale: sourceLocale,
    coverage_mode: "exact",
    count: libraryEntries.length,
    canonical_count: canonical.length,
    entries: libraryEntries,
  };
  await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputRoot, "library.json"), `${JSON.stringify(library, null, 2)}\n`, "utf8");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url><loc>${escapeHtml(route.url)}</loc></url>`).join("\n")}\n</urlset>\n`;
  await writeFile(path.join(outputRoot, "sitemap.xml"), sitemap, "utf8");
  const llms = `# Brali — ${locale.label}\n\nLocale: ${locale.code}\nCanonical locale: ${sourceLocale}\nNo silent fallback: true\nStatus: ${locale.status}\nSearch publication: ${locale.searchPublication}\nCoverage: ${libraryEntries.length}/${canonical.length} canonical library entries; ${zones.length}/${canonicalZones.length} zones.\n\nMachine-readable library: ${base}/${locale.code}/library.json\nLocale manifest: ${base}/${locale.code}/manifest.json\nLocale sitemap: ${base}/${locale.code}/sitemap.xml\nCanonical knowledge base: ${base}/life-os/\n\nThe localized language is presentation. Canonical slugs, evidence states and provenance remain controlled by the English source locale.\n`;
  await writeFile(path.join(outputRoot, "llms.txt"), llms, "utf8");

  const robotsPath = path.join(root, "robots.txt");
  const sitemapLine = `Sitemap: ${base}/${locale.code}/sitemap.xml`;
  const robots = await readFile(robotsPath, "utf8");
  if (!robots.includes(sitemapLine)) await writeFile(robotsPath, `${robots.trimEnd()}\n${sitemapLine}\n`, "utf8");

  console.log(`[profile-locales] ${locale.code}: generated ${routes.length} routes; ${libraryEntries.length}/${canonical.length} library entries; ${zones.length}/${canonicalZones.length} zones.`);
}

for (const locale of profile.locales || []) {
  if (locale.role !== "human-interface" || locale.code === profile.releaseContract?.referenceImplementation) continue;
  await buildLocale(locale);
}
