import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VEDOKROK_BANNER, VEDOKROK_FOOTER_LINE } from "./lib/vedokrok-banner.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const canonical = JSON.parse(await readFile(path.join(root, "data", "problem-collections.json"), "utf8"));
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && ["reviewed-partial", "published"].includes(entry.status));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function exists(relative) {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

function exactKeys(values) {
  return [...values].sort().join("\n");
}

function standardizeCanonicalFooter(html) {
  if (html.includes('<div class="footer-links">')) return html;
  const replacement = '<footer class="footer"><div class="wrap footer-row"><div><small>Brali · evidence-informed decisions and practical protocols</small></div><div class="footer-links"><a href="/problems/">Problems</a><a href="/topics/">Topics</a><a href="/for-ai/">For AI</a></div></div></footer>';
  const updated = html.replace(/<footer class="footer">[\s\S]*?<\/footer>/i, replacement);
  if (updated === html) throw new Error("[localized-problems] canonical problem page footer could not be normalized");
  return updated;
}

function routeFile(pathname) {
  return pathname === "/"
    ? path.join(root, "index.html")
    : path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}

for (const collection of canonical.collections || []) {
  const pathname = `/problems/${collection.slug}/`;
  const file = routeFile(pathname);
  const html = await readFile(file, "utf8");
  await writeFile(file, standardizeCanonicalFooter(html));
}
{
  const file = routeFile("/problems/");
  const html = await readFile(file, "utf8");
  await writeFile(file, standardizeCanonicalFooter(html));
}

for (const localeEntry of locales) {
  const locale = localeEntry.code;
  const sourcePath = `data/localization/${locale}/problem-collections.json`;
  if (!(await exists(sourcePath))) continue;

  const [localized, site, library, manifest] = await Promise.all([
    readJson(sourcePath),
    readJson(`data/localization/${locale}/site.json`),
    readJson(`${locale}/library.json`),
    readJson(`${locale}/manifest.json`),
  ]);

  if (localized.schema_version !== 1 || localized.locale !== locale || localized.source_locale !== profile.sourceLocale) {
    throw new Error(`[localized-problems] invalid ${locale} source metadata`);
  }
  if (localized.source_dataset !== "data/problem-collections.json") {
    throw new Error(`[localized-problems] ${locale} source_dataset drift`);
  }
  if (localized.source_updated_at !== canonical.updated_at) {
    throw new Error(`[localized-problems] ${locale} problem copy is stale: ${localized.source_updated_at} != ${canonical.updated_at}`);
  }
  if (!localized.labels || !Array.isArray(localized.collections)) {
    throw new Error(`[localized-problems] ${locale} source lacks labels or collections`);
  }

  const canonicalBySlug = new Map((canonical.collections || []).map((item) => [item.slug, item]));
  const localizedBySlug = new Map(localized.collections.map((item) => [item.slug, item]));
  if (localizedBySlug.size !== localized.collections.length) throw new Error(`[localized-problems] ${locale} duplicate problem slug`);
  if (exactKeys(canonicalBySlug.keys()) !== exactKeys(localizedBySlug.keys())) {
    throw new Error(`[localized-problems] ${locale} problem membership must exactly match canonical ${canonicalBySlug.size}`);
  }

  for (const [slug, item] of localizedBySlug) {
    const source = canonicalBySlug.get(slug);
    const sourceEdges = (source.protocol_edges || []).map((edge) => edge.slug);
    const localizedEdges = (item.protocol_edges || []).map((edge) => edge.slug);
    if (exactKeys(sourceEdges) !== exactKeys(localizedEdges) || new Set(localizedEdges).size !== localizedEdges.length) {
      throw new Error(`[localized-problems] ${locale}/${slug} protocol edge membership drift`);
    }
    if ((item.decision_path || []).length !== (source.decision_path || []).length) {
      throw new Error(`[localized-problems] ${locale}/${slug} decision path length drift`);
    }
    for (const field of ["title", "question", "summary", "stop_rule"]) {
      if (!text(item[field])) throw new Error(`[localized-problems] ${locale}/${slug} missing ${field}`);
    }
  }

  const libraryBySlug = new Map((library.entries || []).map((entry) => [entry.slug, entry]));
  const outputRoot = path.join(root, locale, "problems");
  await mkdir(outputRoot, { recursive: true });

  const localizedPathFor = (canonicalPath) => `/${locale}${canonicalPath}`;
  const routeExists = new Set((manifest.routes || []).map((route) => route.path));
  const addRoute = (kind, localizedPath, canonicalPath, extra = {}) => {
    if (routeExists.has(localizedPath)) throw new Error(`[localized-problems] ${locale} duplicate manifest route ${localizedPath}`);
    routeExists.add(localizedPath);
    manifest.routes.push({
      kind,
      locale,
      path: localizedPath,
      url: canonicalUrl(localizedPath),
      canonical_path: canonicalPath,
      canonical_url: canonicalUrl(canonicalPath),
      quality_state: "editorial-reviewed",
      ...extra,
    });
  };

  function shellDocument({ title, description, localizedPath, canonicalPath, body, schema }) {
    const localizedUrl = canonicalUrl(localizedPath);
    return `<!doctype html>\n<html lang="${escapeHtml(localeEntry.languageTag)}" dir="${escapeHtml(localeEntry.direction || "ltr")}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)} — Brali</title>\n<meta name="description" content="${escapeHtml(text(description).slice(0, 300))}">\n<link rel="canonical" href="${localizedUrl}">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Brali">\n<meta property="og:title" content="${escapeHtml(title)}">\n<meta property="og:description" content="${escapeHtml(text(description).slice(0, 300))}">\n<meta property="og:url" content="${localizedUrl}">\n<link rel="icon" href="/assets/images/brali-logo.png">\n<link rel="stylesheet" href="/styles.css?v=20260920a">\n<script type="application/ld+json">${jsonForHtml(schema)}</script>\n</head>\n<body data-brali-cluster="localized-${escapeHtml(locale)}">\n<a class="skip" href="#content">${escapeHtml(site.shell.skip)}</a>\n<header class="site-header"><nav class="wrap nav" aria-label="${escapeHtml(site.shell.nav_aria)}"><a class="brand" href="/${locale}/" aria-label="${escapeHtml(site.shell.home_aria)}"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/${locale}/life-os/">${escapeHtml(site.shell.nav_library)}</a><a href="/${locale}/problems/">${escapeHtml(localized.labels.all_problems)}</a><a href="/${locale}/life-os/methodology/">${escapeHtml(site.shell.nav_methodology)}</a><a href="/${locale}/research/">${escapeHtml(site.shell.nav_research)}</a><a href="/${locale}/for-ai/">${escapeHtml(site.shell.nav_for_ai)}</a><a lang="en" hreflang="en" href="${escapeHtml(canonicalPath)}">English</a></div></nav></header>\n${VEDOKROK_BANNER}\n<main id="content" class="page wrap">${body}</main>\n<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/${locale}/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>${escapeHtml(site.shell.footer_line)}</small></div><div class="footer-links"><a href="/${locale}/problems/">${escapeHtml(localized.labels.all_problems)}</a><a href="/${locale}/life-os/">${escapeHtml(site.shell.nav_library)}</a><a href="/${locale}/llms.txt">llms.txt</a><a lang="en" hreflang="en" href="${escapeHtml(canonicalPath)}">English</a></div></div><div class="wrap">${VEDOKROK_FOOTER_LINE}</div></footer>\n</body>\n</html>\n`;
  }

  const indexPath = `/${locale}/problems/`;
  const cards = localized.collections.map((item) => `<article class="card"><h2><a href="/${locale}/problems/${escapeHtml(item.slug)}/">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.summary)}</p><p><a href="/${locale}/problems/${escapeHtml(item.slug)}/">${escapeHtml(localized.labels.card_cta)} →</a></p></article>`).join("");
  const indexSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: localized.labels.index_title,
    description: localized.labels.index_description,
    url: canonicalUrl(indexPath),
    inLanguage: localeEntry.languageTag,
    hasPart: localized.collections.map((item) => ({
      "@type": "WebPage",
      name: item.title,
      url: canonicalUrl(`/${locale}/problems/${item.slug}/`),
    })),
  };
  const indexBody = `<p class="eyebrow">${escapeHtml(localized.labels.index_eyebrow)}</p><h1>${escapeHtml(localized.labels.index_heading)}</h1><p class="lead">${escapeHtml(localized.labels.index_lead)}</p><div class="callout">${escapeHtml(localized.labels.trust_note)}</div><section><div class="grid two">${cards}</div></section>`;
  await writeFile(path.join(outputRoot, "index.html"), shellDocument({
    title: localized.labels.index_title,
    description: localized.labels.index_description,
    localizedPath: indexPath,
    canonicalPath: "/problems/",
    body: indexBody,
    schema: indexSchema,
  }));
  addRoute("problem-index", indexPath, "/problems/", { id: "problem-index" });

  for (const source of canonical.collections || []) {
    const item = localizedBySlug.get(source.slug);
    const edgeBySlug = new Map(item.protocol_edges.map((edge) => [edge.slug, edge]));
    const decisions = item.decision_path.map((step, index) => `<article class="card"><span class="card-label">${index + 1}</span><h3>${escapeHtml(step.if)}</h3><p>${escapeHtml(step.try)}</p></article>`).join("");
    const protocols = source.protocol_edges.map((sourceEdge) => {
      const copy = edgeBySlug.get(sourceEdge.slug);
      const protocol = libraryBySlug.get(sourceEdge.slug);
      if (!protocol) throw new Error(`[localized-problems] ${locale}/${source.slug} localized protocol missing from library: ${sourceEdge.slug}`);
      const fit = sourceEdge.fit === "best-fit" ? localized.labels.best_fit : localized.labels.alternative;
      return `<article class="card"><span class="card-label">${escapeHtml(fit)} · ${escapeHtml(protocol.evidence_status || "")}</span><h3><a href="/${locale}/life-os/${escapeHtml(sourceEdge.slug)}/">${escapeHtml(protocol.title)}</a></h3><p><strong>${escapeHtml(localized.labels.when)}:</strong> ${escapeHtml(copy.when)}</p><p><strong>${escapeHtml(localized.labels.why)}:</strong> ${escapeHtml(copy.why)}</p><p><strong>${escapeHtml(localized.labels.caveat)}:</strong> ${escapeHtml(copy.caveat)}</p></article>`;
    }).join("");
    const localizedPath = `/${locale}/problems/${source.slug}/`;
    const canonicalPath = `/problems/${source.slug}/`;
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: item.title,
      description: item.summary,
      url: canonicalUrl(localizedPath),
      inLanguage: localeEntry.languageTag,
      isBasedOn: canonicalUrl(canonicalPath),
      mainEntity: {
        "@type": "ItemList",
        itemListElement: source.protocol_edges.map((edge, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: libraryBySlug.get(edge.slug)?.title || edge.slug,
          url: canonicalUrl(`/${locale}/life-os/${edge.slug}/`),
        })),
      },
    };
    const body = `<p class="eyebrow">${escapeHtml(localized.labels.page_eyebrow)}</p><h1>${escapeHtml(item.title)}</h1><p class="lead">${escapeHtml(item.question)}</p><p>${escapeHtml(item.summary)}</p><div class="callout"><strong>${escapeHtml(localized.labels.how_heading)}:</strong> ${escapeHtml(localized.labels.how_body)} ${escapeHtml(localized.labels.trust_note)}</div><section><h2>${escapeHtml(localized.labels.choose_heading)}</h2><div class="grid three">${decisions}</div><div class="callout"><strong>${escapeHtml(localized.labels.stop_rule)}:</strong> ${escapeHtml(item.stop_rule)}</div></section><section><h2>${escapeHtml(localized.labels.recommend_heading)}</h2><div class="grid two">${protocols}</div></section><aside class="callout"><h3>${escapeHtml(localized.labels.source_heading)}</h3><p>${escapeHtml(localized.labels.source_body)}</p><a class="button" lang="en" hreflang="en" href="${canonicalPath}">${escapeHtml(localized.labels.source_cta)}</a> <a class="button quiet" href="/${locale}/problems/">${escapeHtml(localized.labels.all_problems)}</a></aside>`;
    const directory = path.join(outputRoot, source.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "index.html"), shellDocument({
      title: item.title,
      description: item.summary,
      localizedPath,
      canonicalPath,
      body,
      schema,
    }));
    addRoute("problem-guide", localizedPath, canonicalPath, { id: `problem-${source.slug}` });
  }

  manifest.coverage = {
    ...(manifest.coverage || {}),
    problem_guides: {
      localized: localized.collections.length,
      canonical: (canonical.collections || []).length,
      mode: "exact-declared",
      source_updated_at: canonical.updated_at,
    },
  };
  manifest.routes.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(path.join(root, locale, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const homePath = path.join(root, locale, "index.html");
  let home = await readFile(homePath, "utf8");
  const discoveryBlock = `<aside class="callout" data-brali-localized-problems><h3>${escapeHtml(localized.labels.home_cta)}</h3><p>${escapeHtml(localized.labels.home_body)}</p><a class="button" href="/${locale}/problems/">${escapeHtml(localized.labels.card_cta)}</a></aside>`;
  const discoveryPattern = /<aside class="callout" data-brali-localized-problems>[\s\S]*?<\/aside>/;
  home = discoveryPattern.test(home) ? home.replace(discoveryPattern, discoveryBlock) : home.replace("</main>", `${discoveryBlock}</main>`);
  await writeFile(homePath, home);

  console.log(`[localized-problems] ${locale}: ${localized.collections.length}/${canonical.collections.length} exact problem guides + index route`);
}
