import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VEDOKROK_BANNER_RU, VEDOKROK_BANNER_DE, VEDOKROK_FOOTER_LINE_RU, VEDOKROK_FOOTER_LINE_DE } from "./lib/vedokrok-banner.mjs";
const vedokrokBanner = (code) => (code === "de" ? VEDOKROK_BANNER_DE : VEDOKROK_BANNER_RU);
const vedokrokFooterLine = (code) => (code === "de" ? VEDOKROK_FOOTER_LINE_DE : VEDOKROK_FOOTER_LINE_RU);

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const canonicalConfig = JSON.parse(await readFile(path.join(root, "data", "topic-hubs.json"), "utf8"));
const canonicalDataset = JSON.parse(await readFile(path.join(root, "life-os", "datasets", "topic-hubs.json"), "utf8"));
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && ["reviewed-partial", "published"].includes(entry.status));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;

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

function sourceShape(hub) {
  return {
    title: hub.title,
    question: hub.question,
    summary: hub.summary,
    primary_topic_ids: hub.primary_topic_ids || [],
    related_topic_ids: hub.related_topic_ids || [],
  };
}

function sameSource(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

for (const localeEntry of locales) {
  const locale = localeEntry.code;
  const sourcePath = `data/localization/${locale}/topic-hubs.json`;
  if (!(await exists(sourcePath))) continue;

  const [localized, problems, site, library, manifest] = await Promise.all([
    readJson(sourcePath),
    readJson(`data/localization/${locale}/problem-collections.json`),
    readJson(`data/localization/${locale}/site.json`),
    readJson(`${locale}/library.json`),
    readJson(`${locale}/manifest.json`),
  ]);

  if (localized.schema_version !== 1 || localized.locale !== locale || localized.source_locale !== profile.sourceLocale) {
    throw new Error(`[localized-topics] invalid ${locale} source metadata`);
  }
  if (localized.source_dataset !== "data/topic-hubs.json") {
    throw new Error(`[localized-topics] ${locale} source_dataset drift`);
  }
  if (localized.quality_state !== "editorial-reviewed") {
    throw new Error(`[localized-topics] ${locale} topic hubs must be editorial-reviewed before publication`);
  }
  if (!localized.labels || !Array.isArray(localized.hubs)) {
    throw new Error(`[localized-topics] ${locale} source lacks labels or hubs`);
  }
  if (!text(problems.labels?.all_problems)) {
    throw new Error(`[localized-topics] ${locale} localized problem navigation label is missing`);
  }

  const canonicalBySlug = new Map((canonicalConfig.hubs || []).map((item) => [item.slug, item]));
  const generatedBySlug = new Map((canonicalDataset.hubs || []).map((item) => [item.slug, item]));
  const localizedBySlug = new Map(localized.hubs.map((item) => [item.slug, item]));
  if (localizedBySlug.size !== localized.hubs.length) throw new Error(`[localized-topics] ${locale} duplicate hub slug`);
  if (exactKeys(canonicalBySlug.keys()) !== exactKeys(localizedBySlug.keys())) {
    throw new Error(`[localized-topics] ${locale} hub membership must exactly match canonical ${canonicalBySlug.size}`);
  }
  if (exactKeys(canonicalBySlug.keys()) !== exactKeys(generatedBySlug.keys())) {
    throw new Error("[localized-topics] canonical topic config and generated dataset membership drift");
  }

  for (const [slug, item] of localizedBySlug) {
    const source = canonicalBySlug.get(slug);
    if (!sameSource(item.source, sourceShape(source))) {
      throw new Error(`[localized-topics] ${locale}/${slug} source snapshot is stale`);
    }
    for (const field of ["title", "question", "summary"]) {
      if (!text(item[field])) throw new Error(`[localized-topics] ${locale}/${slug} missing ${field}`);
    }
  }

  const libraryBySlug = new Map((library.entries || []).map((entry) => [entry.slug, entry]));
  const outputRoot = path.join(root, locale, "topics");
  await mkdir(outputRoot, { recursive: true });

  const routeExists = new Set((manifest.routes || []).map((route) => route.path));
  const addRoute = (kind, localizedPath, canonicalPath, extra = {}) => {
    if (routeExists.has(localizedPath)) throw new Error(`[localized-topics] ${locale} duplicate manifest route ${localizedPath}`);
    routeExists.add(localizedPath);
    manifest.routes.push({
      kind,
      locale,
      path: localizedPath,
      url: canonicalUrl(localizedPath),
      canonical_path: canonicalPath,
      canonical_url: canonicalUrl(canonicalPath),
      quality_state: localized.quality_state,
      ...extra,
    });
  };

  function shellDocument({ title, description, localizedPath, canonicalPath, body, schema }) {
    const localizedUrl = canonicalUrl(localizedPath);
    return `<!doctype html>\n<html lang="${escapeHtml(localeEntry.languageTag)}" dir="${escapeHtml(localeEntry.direction || "ltr")}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)} — Brali</title>\n<meta name="description" content="${escapeHtml(text(description).slice(0, 300))}">\n<link rel="canonical" href="${localizedUrl}">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Brali">\n<meta property="og:title" content="${escapeHtml(title)}">\n<meta property="og:description" content="${escapeHtml(text(description).slice(0, 300))}">\n<meta property="og:url" content="${localizedUrl}">\n<link rel="icon" href="/assets/images/brali-logo.png">\n<link rel="stylesheet" href="/styles.css?v=20260920a">\n<script type="application/ld+json">${jsonForHtml(schema)}</script>\n</head>\n<body data-brali-cluster="localized-${escapeHtml(locale)}">\n<a class="skip" href="#content">${escapeHtml(site.shell.skip)}</a>\n<header class="site-header"><nav class="wrap nav" aria-label="${escapeHtml(site.shell.nav_aria)}"><a class="brand" href="/${locale}/" aria-label="${escapeHtml(site.shell.home_aria)}"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/${locale}/topics/">${escapeHtml(localized.labels.all_topics)}</a><a href="/${locale}/life-os/">${escapeHtml(site.shell.nav_library)}</a><a href="/${locale}/problems/">${escapeHtml(problems.labels.all_problems)}</a><a href="/${locale}/research/">${escapeHtml(site.shell.nav_research)}</a><a href="/${locale}/for-ai/">${escapeHtml(site.shell.nav_for_ai)}</a><a lang="en" hreflang="en" href="${escapeHtml(canonicalPath)}">English</a></div></nav></header>\n${vedokrokBanner(locale)}\n<main id="content" class="page wrap">${body}</main>\n<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/${locale}/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>${escapeHtml(site.shell.footer_line)}</small></div><div class="footer-links"><a href="/${locale}/topics/">${escapeHtml(localized.labels.all_topics)}</a><a href="/${locale}/life-os/">${escapeHtml(site.shell.nav_library)}</a><a href="/${locale}/llms.txt">llms.txt</a><a lang="en" hreflang="en" href="${escapeHtml(canonicalPath)}">English</a></div></div><div class="wrap">${vedokrokFooterLine(locale)}</div></footer>\n</body>\n</html>\n`;
  }

  const indexPath = `/${locale}/topics/`;
  const cards = localized.hubs.map((item) => {
    const source = generatedBySlug.get(item.slug);
    return `<article class="card"><span class="card-label">${escapeHtml(localized.labels.card_protocols_label)}: ${(source.protocols || []).length} · ${escapeHtml(localized.labels.card_evidence_label)}: ${(source.evidence_decisions || []).length}</span><h2><a href="/${locale}/topics/${escapeHtml(item.slug)}/">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.summary)}</p><p><a href="/${locale}/topics/${escapeHtml(item.slug)}/">${escapeHtml(localized.labels.card_cta)} →</a></p></article>`;
  }).join("");
  const indexSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: localized.labels.index_title,
    description: localized.labels.index_description,
    url: canonicalUrl(indexPath),
    inLanguage: localeEntry.languageTag,
    hasPart: localized.hubs.map((item) => ({
      "@type": "CollectionPage",
      name: item.title,
      url: canonicalUrl(`/${locale}/topics/${item.slug}/`),
    })),
  };
  const indexBody = `<p class="eyebrow">${escapeHtml(localized.labels.index_eyebrow)}</p><h1>${escapeHtml(localized.labels.index_heading)}</h1><p class="lead">${escapeHtml(localized.labels.index_lead)}</p><div class="grid two">${cards}</div>`;
  await writeFile(path.join(outputRoot, "index.html"), shellDocument({
    title: localized.labels.index_title,
    description: localized.labels.index_description,
    localizedPath: indexPath,
    canonicalPath: "/topics/",
    body: indexBody,
    schema: indexSchema,
  }));
  addRoute("topic-index", indexPath, "/topics/", { id: "topic-index" });

  const localizedIndexJson = {
    schema_version: 1,
    locale,
    source_locale: profile.sourceLocale,
    canonical_path: "/topics/",
    quality_state: localized.quality_state,
    hubs: [],
  };

  for (const canonicalHub of canonicalDataset.hubs || []) {
    const item = localizedBySlug.get(canonicalHub.slug);
    const localizedPath = `/${locale}/topics/${canonicalHub.slug}/`;
    const canonicalPath = `/topics/${canonicalHub.slug}/`;
    const protocols = (canonicalHub.protocols || []).map((protocol) => {
      const copy = libraryBySlug.get(protocol.slug);
      if (!copy) throw new Error(`[localized-topics] ${locale}/${canonicalHub.slug} localized protocol missing: ${protocol.slug}`);
      return {
        slug: protocol.slug,
        title: copy.title,
        description: copy.description,
        action: copy.action,
        check_in: copy.check_in,
        evidence_status: protocol.evidence?.status || null,
        url: `/${locale}/life-os/${protocol.slug}/`,
      };
    });

    const protocolCards = protocols.length
      ? protocols.map((protocol) => `<article class="card"><h3><a href="${escapeHtml(protocol.url)}">${escapeHtml(protocol.title)}</a></h3><p>${escapeHtml(protocol.action || protocol.description)}</p>${protocol.check_in ? `<p><strong>${escapeHtml(localized.labels.protocol_check_in)}:</strong> ${escapeHtml(protocol.check_in)}</p>` : ""}</article>`).join("")
      : `<div class="callout"><strong>${escapeHtml(localized.labels.coverage_gap_heading)}:</strong> ${escapeHtml(localized.labels.coverage_gap_body)}</div>`;

    const evidenceCount = (canonicalHub.evidence_decisions || []).length;
    const researchCount = (canonicalHub.research_watch || []).length;
    const schema = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: item.title,
      description: item.summary,
      url: canonicalUrl(localizedPath),
      inLanguage: localeEntry.languageTag,
      isBasedOn: canonicalUrl(canonicalPath),
      hasPart: protocols.map((protocol) => ({
        "@type": "Article",
        name: protocol.title,
        url: canonicalUrl(protocol.url),
      })),
    };
    const body = `<p class="eyebrow">${escapeHtml(localized.labels.page_eyebrow)}</p><h1>${escapeHtml(item.title)}</h1><p class="lead">${escapeHtml(item.question)}</p><p>${escapeHtml(item.summary)}</p><div class="callout"><strong>${escapeHtml(localized.labels.trust_heading)}:</strong> ${escapeHtml(localized.labels.trust_body)}</div><section><h2>${escapeHtml(localized.labels.protocols_heading)}</h2><div class="grid two">${protocolCards}</div></section><section class="prose"><h2>${escapeHtml(localized.labels.evidence_heading)}</h2><p>${escapeHtml(localized.labels.evidence_prefix)} <strong>${evidenceCount}</strong>. ${escapeHtml(localized.labels.evidence_suffix)}</p></section><section class="prose"><h2>${escapeHtml(localized.labels.research_heading)}</h2><p>${escapeHtml(localized.labels.research_prefix)} <strong>${researchCount}</strong>. ${escapeHtml(localized.labels.research_suffix)}</p></section><aside class="callout"><h3>${escapeHtml(localized.labels.source_heading)}</h3><p>${escapeHtml(localized.labels.source_body)}</p><a class="button" lang="en" hreflang="en" href="${canonicalPath}">${escapeHtml(localized.labels.source_cta)}</a> <a class="button quiet" href="/${locale}/topics/">${escapeHtml(localized.labels.all_topics)}</a></aside>`;

    const directory = path.join(outputRoot, canonicalHub.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "index.html"), shellDocument({
      title: item.title,
      description: item.summary,
      localizedPath,
      canonicalPath,
      body,
      schema,
    }));

    const localizedHubJson = {
      schema_version: 1,
      locale,
      source_locale: profile.sourceLocale,
      slug: canonicalHub.slug,
      title: item.title,
      question: item.question,
      summary: item.summary,
      canonical_path: canonicalPath,
      localized_path: localizedPath,
      quality_state: localized.quality_state,
      coverage_status: canonicalHub.coverage_status,
      protocol_count: protocols.length,
      evidence_decision_count: evidenceCount,
      research_watch_count: researchCount,
      protocols,
      canonical_detail_url: canonicalUrl(canonicalPath),
    };
    await writeFile(path.join(directory, "index.json"), `${JSON.stringify(localizedHubJson, null, 2)}\n`);
    localizedIndexJson.hubs.push(localizedHubJson);
    addRoute("topic-hub", localizedPath, canonicalPath, { id: `topic-${canonicalHub.slug}` });
  }

  await writeFile(path.join(outputRoot, "index.json"), `${JSON.stringify(localizedIndexJson, null, 2)}\n`);
  manifest.coverage = {
    ...(manifest.coverage || {}),
    topic_hubs: {
      localized: localized.hubs.length,
      canonical: (canonicalConfig.hubs || []).length,
      mode: "exact-declared",
      quality_state: localized.quality_state,
    },
  };
  manifest.routes.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(path.join(root, locale, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const discoveryBlock = `<aside class="callout" data-brali-localized-topics><h3>${escapeHtml(localized.labels.home_heading)}</h3><p>${escapeHtml(localized.labels.home_body)}</p><a class="button" href="/${locale}/topics/">${escapeHtml(localized.labels.card_cta)}</a></aside>`;
  for (const relative of [`${locale}/index.html`, `${locale}/life-os/index.html`, `${locale}/research/index.html`]) {
    if (!(await exists(relative))) continue;
    const file = path.join(root, relative);
    let html = await readFile(file, "utf8");
    if (!html.includes("data-brali-localized-topics")) {
      if (!html.includes("</main>")) throw new Error(`[localized-topics] ${relative} has no main closing tag`);
      html = html.replace("</main>", `${discoveryBlock}</main>`);
      await writeFile(file, html);
    }
  }

  console.log(`[localized-topics] ${locale}: generated ${localized.hubs.length} reviewed topic hub(s) plus index from exact canonical membership`);
}
