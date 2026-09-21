import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VEDOKROK_BANNER_RU, VEDOKROK_FOOTER_LINE_RU } from "./lib/vedokrok-banner.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const locale = "ru";
const outputRoot = path.join(root, locale);
const sourceRoot = path.join(root, "data", "localization", locale);

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [site, config] = await Promise.all([
  readJson(path.join(sourceRoot, "site.json")),
  readJson(path.join(sourceRoot, "primary-pages.json")),
]);

if (config.locale !== locale || config.source_locale !== "en" || config.quality !== "language-reviewed") {
  throw new Error("Russian primary-page localization contract is invalid");
}

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]);
const escapeAttribute = escapeHtml;
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const nav = {
  library: site.shell.nav_library || "Библиотека",
  methodology: site.shell.nav_methodology || "Как мы проверяем",
  research: site.shell.nav_research || "Исследования",
  partners: site.shell.nav_partners || "Партнёрства",
  forAi: site.shell.nav_for_ai || "Для AI",
};

function navLink(href, label, currentRoute, { button = false } = {}) {
  const current = href === currentRoute ? ' aria-current="page"' : "";
  const className = button ? ' class="button"' : "";
  return `<a${className} href="${href}"${current}>${escapeHtml(label)}</a>`;
}

function shellDocument(page, body) {
  const ruUrl = canonicalUrl(page.route);
  const enUrl = canonicalUrl(page.source_route);
  const structured = {
    "@context": "https://schema.org",
    "@type": page.schema_type || "WebPage",
    name: page.title,
    description: page.description,
    url: ruUrl,
    inLanguage: "ru",
    translationOfWork: { "@type": "WebPage", url: enUrl, inLanguage: "en" },
    isPartOf: { "@type": "WebSite", name: "Brali", url: `${base}/` },
  };
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(page.title)} — Brali</title>
  <meta name="description" content="${escapeAttribute(page.description)}">
  <link rel="canonical" href="${ruUrl}">
  <link rel="alternate" hreflang="ru" href="${ruUrl}">
  <link rel="alternate" hreflang="en" href="${enUrl}">
  <link rel="alternate" hreflang="x-default" href="${enUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Brali">
  <meta property="og:title" content="${escapeAttribute(page.title)}">
  <meta property="og:description" content="${escapeAttribute(page.description)}">
  <meta property="og:url" content="${ruUrl}">
  <meta property="og:image" content="${base}/assets/images/brali-mascot-hero.png">
  <link rel="icon" href="/assets/images/brali-logo.png">
  <link rel="stylesheet" href="/styles.css?v=20260920a">
  <script type="application/ld+json">${jsonForHtml(structured)}</script>
</head>
<body data-brali-cluster="localized-ru-primary">
<a class="skip" href="#content">${escapeHtml(site.shell.skip)}</a>
<header class="site-header"><nav class="wrap nav" aria-label="${escapeAttribute(site.shell.nav_aria)}"><a class="brand" href="/ru/" aria-label="${escapeAttribute(site.shell.home_aria)}"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links">${navLink("/ru/life-os/", nav.library, page.route)}${navLink("/ru/life-os/methodology/", nav.methodology, page.route)}${navLink("/ru/research/", nav.research, page.route)}${navLink("/ru/partners/", nav.partners, page.route)}${navLink("/ru/for-ai/", nav.forAi, page.route, { button: true })}<a lang="en" hreflang="en" href="${escapeAttribute(page.source_route)}">${escapeHtml(site.shell.language_switch)}</a></div></nav></header>
${VEDOKROK_BANNER_RU}
<main id="content" class="page wrap">${body}</main>
<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/ru/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>${escapeHtml(site.shell.footer_line)}</small></div><div class="footer-links"><a href="/ru/life-os/">${escapeHtml(nav.library)}</a><a href="/ru/research/">${escapeHtml(nav.research)}</a><a href="/ru/for-ai/">${escapeHtml(nav.forAi)}</a><a href="/ru/partners/">${escapeHtml(nav.partners)}</a><a href="/ru/life-os/methodology/">${escapeHtml(nav.methodology)}</a><a href="/ru/llms.txt">llms.txt</a><a lang="en" hreflang="en" href="${escapeAttribute(page.source_route)}">English</a></div></div><div class="wrap">${VEDOKROK_FOOTER_LINE_RU}</div></footer>
</body>
</html>`;
}

function englishFile(sourcePath) {
  return path.join(root, sourcePath);
}

async function addReciprocalLocale(page) {
  const file = englishFile(page.source_path);
  let html = await readFile(file, "utf8");
  const ruUrl = canonicalUrl(page.route);
  if (!html.includes(`hreflang="ru" href="${ruUrl}"`)) {
    html = html.replace("</head>", `<link rel="alternate" hreflang="ru" href="${ruUrl}"></head>`);
  }
  const navClose = "</div></nav></header>";
  if (!html.includes(`lang="ru" hreflang="ru" href="${page.route}"`)) {
    html = html.replace(navClose, `<a lang="ru" hreflang="ru" href="${page.route}">Русский</a>${navClose}`);
  }
  await writeFile(file, html);
}

let manifest = await readJson(path.join(outputRoot, "manifest.json"));
const routesByPath = new Map((manifest.routes || []).map((route) => [route.path, route]));

for (const page of config.pages) {
  const canonical = await readFile(englishFile(page.source_path), "utf8");
  for (const marker of page.source_markers || []) {
    if (!canonical.includes(marker)) {
      throw new Error(`Stale Russian primary-page localization for ${page.id}: missing canonical marker ${JSON.stringify(marker)}`);
    }
  }

  const fragment = await readFile(path.join(root, page.fragment), "utf8");
  if (!/[А-Яа-яЁё]/.test(fragment)) {
    throw new Error(`Russian primary-page fragment lacks Cyrillic: ${page.id}`);
  }
  const relativeOutput = page.route.replace(/^\/ru\//, "").replace(/\/$/, "");
  const destination = path.join(outputRoot, relativeOutput, "index.html");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, shellDocument(page, fragment));
  await addReciprocalLocale(page);

  routesByPath.set(page.route, {
    kind: page.kind || "primary-hub",
    locale: "ru",
    path: page.route,
    url: canonicalUrl(page.route),
    canonical_path: page.source_route,
    canonical_url: canonicalUrl(page.source_route),
    localization_quality: config.quality,
  });
}

manifest.routes = [...routesByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
manifest.coverage = {
  ...(manifest.coverage || {}),
  primary_product_hubs: {
    state: "language-reviewed",
    localized: config.pages.length,
    canonical: config.pages.length,
  },
};
await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const llmsPath = path.join(outputRoot, "llms.txt");
let llms = await readFile(llmsPath, "utf8");
const hubLines = config.pages.map((page) => `- ${page.title}: ${canonicalUrl(page.route)}`).join("\n");
const block = `## Основные русские хабы\n${hubLines}\n\nЕсли русской дочерней страницы нет в manifest, переход к английской версии должен быть явным. Машинные JSON/API-контракты сохраняют канонические имена полей и не переводятся только ради локали.\n`;
if (!llms.includes("## Основные русские хабы")) {
  llms = `${llms.trim()}\n\n${block}`;
  await writeFile(llmsPath, llms);
}

console.log(`Built ${config.pages.length} language-reviewed Russian primary product hub(s).`);
