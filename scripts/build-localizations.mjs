import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { VEDOKROK_BANNER_RU, VEDOKROK_FOOTER_LINE_RU } from "./lib/vedokrok-banner.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const locale = "ru";
const outputRoot = path.join(root, locale);
const sourceRoot = path.join(root, "data", "localization", locale);

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [site, localized, canonical] = await Promise.all([
  readJson(path.join(sourceRoot, "site.json")),
  readJson(path.join(sourceRoot, "flagships.json")),
  readJson(path.join(root, "life-os", "datasets", "flagships.json")),
]);

if (site.locale !== locale || localized.locale !== locale) {
  throw new Error("Russian localization sources must declare locale=ru");
}
if (site.status !== "reviewed-partial") {
  throw new Error("Russian locale must remain explicitly reviewed-partial until the declared debt is closed");
}

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
};

const flagshipSourceShape = (entry) => ({
  life_area: {
    slug: entry.life_area.slug,
    title: entry.life_area.title,
    subtitle: entry.life_area.subtitle,
  },
  slug: entry.slug,
  title: entry.title,
  description: entry.description,
  action: entry.action,
  check_in: entry.check_in,
  evidence_status: entry.evidence_status,
  reviewed_at: entry.reviewed_at,
});

const fingerprint = (entry) => createHash("sha256")
  .update(JSON.stringify(canonicalize(flagshipSourceShape(entry))))
  .digest("hex");

const canonicalBySlug = new Map(canonical.entries.map((entry) => [entry.slug, entry]));
const localizedBySlug = new Map(localized.entries.map((entry) => [entry.slug, entry]));
const canonicalSlugs = [...canonicalBySlug.keys()].sort();
const localizedSlugs = [...localizedBySlug.keys()].sort();
if (JSON.stringify(canonicalSlugs) !== JSON.stringify(localizedSlugs)) {
  throw new Error(`Russian flagship coverage drift: expected ${canonicalSlugs.join(", ")}; got ${localizedSlugs.join(", ")}`);
}
for (const entry of localized.entries) {
  const source = canonicalBySlug.get(entry.slug);
  if (!source) throw new Error(`Unknown localized flagship: ${entry.slug}`);
  const currentFingerprint = fingerprint(source);
  if (entry.sourceFingerprint !== currentFingerprint) {
    throw new Error(`Stale Russian localization for ${entry.slug}: canonical flagship source changed`);
  }
  if (entry.evidence_status !== source.evidence_status) {
    throw new Error(`Evidence state drift for ${entry.slug}`);
  }
  if (entry.reviewed_at !== source.reviewed_at) {
    throw new Error(`Review-date drift for ${entry.slug}`);
  }
}

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]);
const escapeAttribute = escapeHtml;
const absolute = (pathname) => `${base}${pathname}`;
const stripTrailingSlash = (pathname) => pathname === "/" ? "/" : pathname.replace(/\/$/, "");
const canonicalUrl = (pathname) => absolute(pathname.endsWith("/") ? pathname : `${pathname}/`);
const ruPathFor = (enPath) => enPath === "/" ? "/ru/" : `/ru${enPath}`;
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const formatDate = (iso) => {
  const [year, month, day] = String(iso).split("-");
  return `${day}.${month}.${year}`;
};

const routes = [];

function shellDocument({ title, description, ruPath, enPath, type = "WebPage", body, schema = {} }) {
  const ruUrl = canonicalUrl(ruPath);
  const enUrl = canonicalUrl(enPath);
  const structured = {
    "@context": "https://schema.org",
    "@type": type,
    name: title,
    description,
    url: ruUrl,
    inLanguage: "ru",
    ...schema,
  };
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — Brali</title>
  <meta name="description" content="${escapeAttribute(description)}">
  <link rel="canonical" href="${ruUrl}">
  <link rel="alternate" hreflang="ru" href="${ruUrl}">
  <link rel="alternate" hreflang="en" href="${enUrl}">
  <link rel="alternate" hreflang="x-default" href="${enUrl}">
  <meta property="og:type" content="${type === "Article" ? "article" : "website"}">
  <meta property="og:site_name" content="Brali">
  <meta property="og:title" content="${escapeAttribute(title)}">
  <meta property="og:description" content="${escapeAttribute(description)}">
  <meta property="og:url" content="${ruUrl}">
  <meta property="og:image" content="${base}/assets/images/brali-mascot-hero.png">
  <link rel="icon" href="/assets/images/brali-logo.png">
  <link rel="stylesheet" href="/styles.css?v=20260920a">
  <script type="application/ld+json">${jsonForHtml(structured)}</script>
</head>
<body data-brali-cluster="localized-ru">
<a class="skip" href="#content">${escapeHtml(site.shell.skip)}</a>
<header class="site-header"><nav class="wrap nav" aria-label="${escapeAttribute(site.shell.nav_aria)}"><a class="brand" href="/ru/" aria-label="${escapeAttribute(site.shell.home_aria)}"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/ru/life-os/flagships/">${escapeHtml(site.shell.nav_flagships)}</a><a href="/ru/life-os/methodology/">${escapeHtml(site.shell.nav_methodology)}</a><a lang="en" hreflang="en" href="${escapeAttribute(enPath)}">${escapeHtml(site.shell.language_switch)}</a></div></nav></header>
${VEDOKROK_BANNER_RU}
<main id="content" class="page wrap">${body}</main>
<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/ru/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>${escapeHtml(site.shell.footer_line)}</small></div><div class="footer-links"><a href="/ru/life-os/flagships/">${escapeHtml(site.shell.nav_flagships)}</a><a href="/ru/life-os/methodology/">${escapeHtml(site.shell.nav_methodology)}</a><a href="/ru/llms.txt">llms.txt</a><a lang="en" hreflang="en" href="${escapeAttribute(enPath)}">English</a></div></div><div class="wrap">${VEDOKROK_FOOTER_LINE_RU}</div></footer>
</body>
</html>`;
}

async function savePage(relativePath, html, ruPath, enPath, kind) {
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
  routes.push({
    kind,
    locale: "ru",
    path: ruPath,
    url: canonicalUrl(ruPath),
    canonical_path: enPath,
    canonical_url: canonicalUrl(enPath),
  });
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const flagshipCards = localized.entries.map((entry) => `<article class="card"><span class="card-label">${escapeHtml(entry.life_area.title)} · ${escapeHtml(entry.evidence_label)}</span><h3><a href="/ru/life-os/${escapeAttribute(entry.slug)}/">${escapeHtml(entry.title)}</a></h3><p>${escapeHtml(entry.description)}</p><p><a href="/ru/life-os/${escapeAttribute(entry.slug)}/">${escapeHtml(site.collection.card_cta)} →</a></p></article>`).join("");

const homeBody = `
<section class="visual-hero visual-hero--hacks">
  <div class="visual-hero-copy"><p class="eyebrow">${escapeHtml(site.home.eyebrow)}</p><h1>${escapeHtml(site.home.heading)}</h1><p class="lead">${escapeHtml(site.home.lead)}</p><p><a class="button yellow" href="/ru/life-os/flagships/">${escapeHtml(site.home.primary_cta)}</a> <a class="button quiet" href="/ru/life-os/methodology/">${escapeHtml(site.home.secondary_cta)}</a></p></div>
  <figure class="visual-hero-media"><img src="/assets/images/brali-mascot-hero.png" alt="Талисман Brali рядом с карточками практических протоколов" fetchpriority="high"></figure>
</section>
<section class="prose"><p class="eyebrow">${escapeHtml(site.home.coverage_eyebrow)}</p><h2>${escapeHtml(site.home.coverage_heading)}</h2><p>${escapeHtml(site.home.coverage_lead)}</p></section>
<div class="grid three">${flagshipCards}</div>
<section class="prose"><p class="eyebrow">${escapeHtml(site.home.evidence_eyebrow)}</p><h2>${escapeHtml(site.home.evidence_heading)}</h2><p>${escapeHtml(site.home.evidence_body)}</p><p><a class="button" href="/ru/life-os/methodology/">${escapeHtml(site.home.evidence_cta)}</a></p></section>
<div class="grid two"><article class="card"><span class="card-label">${escapeHtml(site.home.machine_eyebrow)}</span><h3>${escapeHtml(site.home.machine_heading)}</h3><p>${escapeHtml(site.home.machine_body)}</p><p><a href="/ru/llms.txt">${escapeHtml(site.home.machine_cta)} →</a></p></article><article class="card"><span class="card-label">${escapeHtml(site.shell.coverage_label)}</span><h3>${escapeHtml(site.home.boundary_heading)}</h3><p>${escapeHtml(site.home.boundary_body)}</p></article></div>`;

await savePage("index.html", shellDocument({
  title: site.home.title,
  description: site.home.description,
  ruPath: "/ru/",
  enPath: "/",
  body: homeBody,
  schema: { isPartOf: { "@type": "WebSite", name: "Brali", url: `${base}/` } },
}), "/ru/", "/", "homepage");

const collectionBody = `<p class="eyebrow">${escapeHtml(site.collection.eyebrow)}</p><h1>${escapeHtml(site.collection.heading)}</h1><p class="lead">${escapeHtml(site.collection.lead)}</p><div class="grid three">${flagshipCards}</div><aside class="callout"><h3>${escapeHtml(site.home.boundary_heading)}</h3><p>${escapeHtml(site.home.boundary_body)}</p><a class="button" href="/ru/life-os/methodology/">${escapeHtml(site.home.evidence_cta)}</a></aside>`;
await savePage("life-os/flagships/index.html", shellDocument({
  title: site.collection.title,
  description: site.collection.description,
  ruPath: "/ru/life-os/flagships/",
  enPath: "/life-os/flagships/",
  type: "CollectionPage",
  body: collectionBody,
  schema: { isPartOf: { "@type": "WebSite", name: "Brali", url: `${base}/` } },
}), "/ru/life-os/flagships/", "/life-os/flagships/", "collection");

const methodology = site.methodology;
const methodologyBody = `<p class="eyebrow">${escapeHtml(methodology.eyebrow)}</p><h1>${escapeHtml(methodology.heading)}</h1><p class="lead">${escapeHtml(methodology.lead)}</p><section class="prose"><h2>${escapeHtml(methodology.states_heading)}</h2></section><div class="grid two"><article class="card"><span class="card-label">reviewed</span><h3>${escapeHtml(methodology.reviewed_title)}</h3><p>${escapeHtml(methodology.reviewed_body)}</p></article><article class="card"><span class="card-label">practical</span><h3>${escapeHtml(methodology.practical_title)}</h3><p>${escapeHtml(methodology.practical_body)}</p></article><article class="card"><span class="card-label">pending-review</span><h3>${escapeHtml(methodology.pending_title)}</h3><p>${escapeHtml(methodology.pending_body)}</p></article><article class="card"><span class="card-label">restricted</span><h3>${escapeHtml(methodology.restricted_title)}</h3><p>${escapeHtml(methodology.restricted_body)}</p></article></div><section class="prose"><h2>${escapeHtml(methodology.claims_heading)}</h2><p>${escapeHtml(methodology.claims_body)}</p><h2>${escapeHtml(methodology.ru_heading)}</h2><p>${escapeHtml(methodology.ru_body)}</p><h2>${escapeHtml(methodology.health_heading)}</h2><p>${escapeHtml(methodology.health_body)}</p><h2>${escapeHtml(methodology.machine_heading)}</h2><p>${escapeHtml(methodology.machine_body)}</p><p><a href="/ru/manifest.json">Russian locale manifest</a> · <a href="/ru/llms.txt">Russian llms.txt</a></p></section><aside class="callout"><a class="button yellow" href="/ru/life-os/flagships/">${escapeHtml(methodology.back_cta)}</a></aside>`;
await savePage("life-os/methodology/index.html", shellDocument({
  title: methodology.title,
  description: methodology.description,
  ruPath: "/ru/life-os/methodology/",
  enPath: "/life-os/methodology/",
  body: methodologyBody,
  schema: { isPartOf: { "@type": "CollectionPage", name: "Brali", url: `${base}/life-os/` } },
}), "/ru/life-os/methodology/", "/life-os/methodology/", "methodology");

for (const entry of localized.entries) {
  const enPath = `/life-os/${entry.slug}/`;
  const ruPath = ruPathFor(enPath);
  const body = `<p class="eyebrow">${escapeHtml(site.protocol.eyebrow)} · ${escapeHtml(entry.life_area.title)}</p><h1>${escapeHtml(entry.title)}</h1><p class="lead">${escapeHtml(entry.description)}</p><div class="grid two"><article class="card"><span class="card-label">${escapeHtml(site.protocol.status_label)}</span><h3>${escapeHtml(entry.evidence_label)}</h3><p><code>${escapeHtml(entry.evidence_status)}</code> · <time datetime="${escapeAttribute(entry.reviewed_at)}">${escapeHtml(formatDate(entry.reviewed_at))}</time></p></article><article class="card"><span class="card-label">${escapeHtml(entry.life_area.title)}</span><h3>${escapeHtml(entry.life_area.subtitle)}</h3></article></div><section class="prose"><h2>${escapeHtml(site.protocol.action_heading)}</h2><p>${escapeHtml(entry.action)}</p><h2>${escapeHtml(site.protocol.check_heading)}</h2><p>${escapeHtml(entry.check_in)}</p><h2>${escapeHtml(site.protocol.boundary_heading)}</h2><p>${escapeHtml(entry.boundary)}</p><h2>${escapeHtml(site.protocol.alternative_heading)}</h2><p>${escapeHtml(entry.alternative)}</p></section><aside class="callout"><h3>${escapeHtml(site.protocol.source_heading)}</h3><p>${escapeHtml(site.protocol.source_body)}</p><a class="button" lang="en" hreflang="en" href="${escapeAttribute(enPath)}">${escapeHtml(site.protocol.source_cta)}</a> <a class="button quiet" href="/ru/life-os/flagships/">${escapeHtml(site.protocol.collection_cta)}</a></aside>`;
  await savePage(path.join("life-os", entry.slug, "index.html"), shellDocument({
    title: entry.search.title,
    description: entry.search.description,
    ruPath,
    enPath,
    type: "Article",
    body,
    schema: {
      headline: entry.title,
      dateModified: entry.reviewed_at,
      isBasedOn: canonicalUrl(enPath),
      about: entry.life_area.title,
      isPartOf: { "@type": "CollectionPage", name: site.collection.title, url: canonicalUrl("/ru/life-os/flagships/") },
    },
  }), ruPath, enPath, "protocol");
}

const llms = `# Brali — русский слой\n\nLocale: ru\nRole: human-interface\nStatus: reviewed-partial\nCanonical locale: en\nNo silent fallback: true\n\n## Покрытие\n\nРусский слой включает главную страницу, методологию контента и все 7 текущих flagship-протоколов Brali. Остальная библиотека НЕ считается локализованной. Если русского маршрута нет в /ru/manifest.json, используйте каноническую английскую запись и не описывайте её как русскую локализацию.\n\n## Стабильная семантика\n\n- Slug протокола сохраняется между en и ru.\n- Канонические машинные evidence-status сохраняются без перевода: reviewed, practical, pending-review, restricted.\n- Русские подписи предназначены для человека и не заменяют машинный статус.\n- Локализация не повышает уровень доказательности и не создаёт новых научных утверждений.\n\n## Основные маршруты\n\n- ${base}/ru/ — русская главная.\n- ${base}/ru/life-os/flagships/ — 7 локализованных стартовых протоколов.\n- ${base}/ru/life-os/methodology/ — русское объяснение trust/evidence модели.\n- ${base}/ru/manifest.json — машинный manifest покрытия.\n- ${base}/life-os/datasets/flagships.json — канонический английский набор flagship-протоколов.\n- ${base}/life-os/datasets/protocols.json — канонический Trusted Protocol Feed.\n\n## Правило ответа агента\n\nПредпочитайте русскую страницу, когда она объявлена в manifest. Сохраняйте статус обоснованности и границы рекомендации. Для неподдерживаемой русской страницы явно переходите к английскому канону вместо выдуманного перевода.\n`;
await writeFile(path.join(outputRoot, "llms.txt"), llms);

const manifest = {
  schema_version: 1,
  locale: "ru",
  source_locale: "en",
  role: "human-interface",
  status: "reviewed-partial",
  search_publication: "limited",
  no_silent_fallback: true,
  source_dataset: `${base}/life-os/datasets/flagships.json`,
  coverage: {
    homepage: "complete",
    methodology: "complete-for-declared-scope",
    flagship_protocols: { state: "complete", localized: localized.entries.length, canonical: canonical.entries.length },
    long_form_library: "partial",
    secondary_product_surfaces: "out-of-scope",
    rendered_narrow_layout_review: "not-assessed",
  },
  routes,
  debt_ledger: `${base}/data/localization/quality-debt.json`,
  evidence_boundary: "This manifest proves declared Russian source/build coverage only. It does not prove deployed indexing, ranking, cultural fit, AI citation or conversion.",
};
await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const sitemapUrls = routes.map((route) => `  <url><loc>${escapeHtml(route.url)}</loc></url>`).join("\n");
await writeFile(path.join(outputRoot, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`);

async function englishFileFor(enPath) {
  if (enPath === "/") return path.join(root, "index.html");
  return path.join(root, stripTrailingSlash(enPath), "index.html");
}

async function decorateEnglishPage(route) {
  const file = await englishFileFor(route.canonical_path);
  let html = await readFile(file, "utf8");
  const start = "<!-- brali-localization:ru:start -->";
  const end = "<!-- brali-localization:ru:end -->";
  const switchStart = "<!-- brali-localization-switch:ru:start -->";
  const switchEnd = "<!-- brali-localization-switch:ru:end -->";
  html = html.replace(new RegExp(`${start}[\\s\\S]*?${end}`, "g"), "");
  html = html.replace(new RegExp(`${switchStart}[\\s\\S]*?${switchEnd}`, "g"), "");
  const alternates = `${start}<link rel="alternate" hreflang="en" href="${route.canonical_url}"><link rel="alternate" hreflang="ru" href="${route.url}"><link rel="alternate" hreflang="x-default" href="${route.canonical_url}">${end}`;
  if (!html.includes("</head>")) throw new Error(`Cannot inject hreflang into ${route.canonical_path}`);
  html = html.replace("</head>", `${alternates}</head>`);
  const switchLink = `${switchStart}<a lang="ru" hreflang="ru" href="${route.path}">Русский</a>${switchEnd}`;
  if (!html.includes("</div></nav></header>")) throw new Error(`Cannot inject locale switch into ${route.canonical_path}`);
  html = html.replace("</div></nav></header>", `${switchLink}</div></nav></header>`);
  await writeFile(file, html);
}

for (const route of routes) await decorateEnglishPage(route);

const robotsPath = path.join(root, "robots.txt");
let robots = await readFile(robotsPath, "utf8");
const ruSitemap = `Sitemap: ${base}/ru/sitemap.xml`;
if (!robots.includes(ruSitemap)) robots = `${robots.trimEnd()}\n${ruSitemap}\n`;
await writeFile(robotsPath, robots);

console.log(`Built Russian localization: ${routes.length} human pages + llms.txt + manifest + sitemap.`);
