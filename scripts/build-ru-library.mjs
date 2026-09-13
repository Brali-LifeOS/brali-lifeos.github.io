import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRussianLocalizationAuthoringIndex, localizationSourceSnapshot } from "./lib/ru-localization-source.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const locale = "ru";
const sourceRoot = path.join(root, "data", "localization", locale);
const batchRoot = path.join(sourceRoot, "library");
const outputRoot = path.join(root, locale);

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const ruPathFor = (enPath) => enPath === "/" ? "/ru/" : `/ru${enPath}`;
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();

const [config, site, localizedFlagships, canonicalIndex, authoringIndex, evidence, zonesRu, zonesEn] = await Promise.all([
  readJson(path.join(sourceRoot, "library-manifest.json")),
  readJson(path.join(sourceRoot, "site.json")),
  readJson(path.join(sourceRoot, "flagships.json")),
  readJson(path.join(root, "data", "life-os-content", "index.json")),
  loadRussianLocalizationAuthoringIndex(root),
  readJson(path.join(root, "life-os", "datasets", "evidence.json")),
  readJson(path.join(sourceRoot, "zones.json")),
  readJson(path.join(root, "data", "life-os-zones.json")),
]);

if (config.locale !== locale || config.source_dataset !== "data/life-os-content/index.json") {
  throw new Error("Russian full-corpus localization manifest is invalid");
}

const allowedQuality = new Set(config.quality_states || []);
const qualityRank = new Map([["localized-draft", 0], ["language-reviewed", 1], ["editorial-reviewed", 2]]);
const indexBySlug = new Map(canonicalIndex.map((entry) => [entry.slug, entry]));
const authoringBySlug = new Map(authoringIndex.map((entry) => [entry.slug, entry]));
const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));
const flagshipBySlug = new Map((localizedFlagships.entries || []).map((entry) => [entry.slug, entry]));
const zoneEnBySlug = new Map(zonesEn.map((entry) => [entry.slug, entry]));
const zoneRuBySlug = new Map((zonesRu.records || []).map((entry) => [entry.slug, entry]));

if (zoneEnBySlug.size !== zoneRuBySlug.size || [...zoneEnBySlug.keys()].some((slug) => !zoneRuBySlug.has(slug))) {
  throw new Error("Russian Growth Zone localization must exactly match canonical zone membership");
}

async function loadBatches() {
  let names = [];
  try {
    names = (await readdir(batchRoot)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const records = [];
  for (const name of names) {
    const batch = await readJson(path.join(batchRoot, name));
    if (batch.locale !== locale || !Array.isArray(batch.records)) throw new Error(`Invalid Russian localization batch: ${name}`);
    for (const record of batch.records) records.push({ ...record, _batch: name });
  }
  return records;
}

const batchRecords = await loadBatches();
const batchBySlug = new Map();
for (const record of batchRecords) {
  if (batchBySlug.has(record.slug)) throw new Error(`Duplicate Russian library localization: ${record.slug}`);
  if (flagshipBySlug.has(record.slug)) throw new Error(`Flagship ${record.slug} must stay in flagships.json, not a library batch`);
  const source = indexBySlug.get(record.slug);
  if (!source) throw new Error(`Russian library record references unknown canonical slug in the current build: ${record.slug}`);
  const authoringSource = authoringBySlug.get(record.slug) || source;
  const expectedSource = localizationSourceSnapshot(authoringSource);
  for (const [field, value] of Object.entries(expectedSource)) {
    if ((record.source || {})[field] !== value) throw new Error(`Stale Russian source snapshot for ${record.slug}.${field}`);
  }
  if (!allowedQuality.has(record.quality_state)) throw new Error(`Unknown Russian quality state for ${record.slug}: ${record.quality_state}`);
  batchBySlug.set(record.slug, record);
}

const allLocalized = new Map();
for (const [slug, entry] of flagshipBySlug) {
  const source = indexBySlug.get(slug);
  if (!source) throw new Error(`Flagship source missing from canonical index: ${slug}`);
  const sourceForSnapshot = authoringBySlug.get(slug) || source;
  allLocalized.set(slug, {
    slug,
    zone_slug: source.zone.slug,
    title: entry.title,
    subtitle: entry.life_area?.subtitle || entry.description,
    description: entry.description,
    quality_state: "editorial-reviewed",
    action: entry.action,
    check_in: entry.check_in,
    boundary: entry.boundary,
    alternative: entry.alternative,
    source: localizationSourceSnapshot(sourceForSnapshot),
  });
}
for (const [slug, record] of batchBySlug) {
  const source = indexBySlug.get(slug);
  allLocalized.set(slug, { ...record, zone_slug: source.zone.slug });
}

if (config.coverage_mode === "exact" && allLocalized.size !== canonicalIndex.length) {
  const missing = canonicalIndex.filter((entry) => !allLocalized.has(entry.slug)).map((entry) => entry.slug);
  throw new Error(`Russian exact coverage is incomplete: ${allLocalized.size}/${canonicalIndex.length}; missing ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}`);
}

const statusLabel = {
  reviewed: "Проверено",
  practical: "Практический",
  "pending-review": "На проверке",
  restricted: "Ограничено",
};
const qualityLabel = {
  "localized-draft": "Локализованный черновик",
  "language-reviewed": "Языковая проверка пройдена",
  "editorial-reviewed": "Редакционная проверка пройдена",
};
function trustBoundary(status, sensitive) {
  if (status === "reviewed") return "Каноническая запись прошла заявленную проверку источников и формулировок. Это не означает универсального эффекта для каждого человека; сверяйте ограничения и исходный контекст.";
  if (status === "practical") return "Это низкорисковая практическая идея без научного обещания эффективности. Используйте её как небольшой эксперимент и смотрите на собственный результат.";
  if (status === "restricted" || sensitive) return "Чувствительная тема. Запись не входит в обычные доверенные рекомендации Brali и не должна использоваться как диагностика, лечение или замена подходящей профессиональной помощи.";
  return "Материал остаётся на редакционной проверке и не входит в обычные доверенные рекомендации Brali. Русская версия помогает понять идею, но не превращает её в подтверждённый совет.";
}

function shellDocument({ title, description, ruPath, enPath, body, type = "Article", schema = {} }) {
  const ruUrl = canonicalUrl(ruPath);
  const enUrl = canonicalUrl(enPath);
  const structured = { "@context": "https://schema.org", "@type": type, name: title, description, url: ruUrl, inLanguage: "ru", ...schema };
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Brali</title><meta name="description" content="${escapeHtml(text(description).slice(0, 300))}"><link rel="canonical" href="${ruUrl}"><link rel="alternate" hreflang="ru" href="${ruUrl}"><link rel="alternate" hreflang="en" href="${enUrl}"><link rel="alternate" hreflang="x-default" href="${enUrl}"><meta property="og:type" content="${type === "Article" ? "article" : "website"}"><meta property="og:site_name" content="Brali"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(text(description).slice(0, 300))}"><meta property="og:url" content="${ruUrl}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css?v=20260822j"><script type="application/ld+json">${jsonForHtml(structured)}</script></head><body data-brali-cluster="localized-ru-library"><a class="skip" href="#content">${escapeHtml(site.shell.skip)}</a><header class="site-header"><nav class="wrap nav" aria-label="${escapeHtml(site.shell.nav_aria)}"><a class="brand" href="/ru/" aria-label="${escapeHtml(site.shell.home_aria)}"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/ru/life-os/">Библиотека</a><a href="/ru/life-os/flagships/">${escapeHtml(site.shell.nav_flagships)}</a><a href="/ru/life-os/methodology/">${escapeHtml(site.shell.nav_methodology)}</a><a lang="en" hreflang="en" href="${escapeHtml(enPath)}">English</a></div></nav></header><main id="content" class="page wrap">${body}</main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/ru/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>${escapeHtml(site.shell.footer_line)}</small></div><div class="footer-links"><a href="/ru/life-os/">Библиотека</a><a href="/ru/life-os/methodology/">${escapeHtml(site.shell.nav_methodology)}</a><a href="/ru/llms.txt">llms.txt</a><a lang="en" hreflang="en" href="${escapeHtml(enPath)}">English</a></div></div></footer></body></html>`;
}

async function writePage(relative, html) {
  const destination = path.join(outputRoot, relative, "index.html");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

function englishFile(enPath) {
  if (enPath === "/") return path.join(root, "index.html");
  return path.join(root, enPath.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}
async function addReciprocalLocale(enPath, ruPath) {
  const file = englishFile(enPath);
  let html = await readFile(file, "utf8");
  const ruUrl = canonicalUrl(ruPath);
  if (!html.includes(`hreflang="ru" href="${ruUrl}"`)) {
    html = html.replace("</head>", `<link rel="alternate" hreflang="ru" href="${ruUrl}"></head>`);
  }
  if (!html.includes(`lang="ru" hreflang="ru" href="${ruPath}">Русский</a>`)) {
    html = html.replace("</div></nav></header>", `<a lang="ru" hreflang="ru" href="${ruPath}">Русский</a></div></nav></header>`);
  }
  await writeFile(file, html);
}

const generatedRoutes = [];
const addRoute = (kind, ruPath, enPath, extra = {}) => generatedRoutes.push({
  kind, locale: "ru", path: ruPath, url: canonicalUrl(ruPath), canonical_path: enPath, canonical_url: canonicalUrl(enPath), ...extra,
});

const sortedEntries = canonicalIndex.filter((entry) => allLocalized.has(entry.slug)).sort((a, b) => a.title.localeCompare(b.title));
const entriesByZone = new Map();
for (const source of sortedEntries) {
  const list = entriesByZone.get(source.zone.slug) || [];
  list.push(source);
  entriesByZone.set(source.zone.slug, list);
}

for (const source of sortedEntries) {
  if (flagshipBySlug.has(source.slug)) continue;
  const localized = allLocalized.get(source.slug);
  const evidenceRecord = evidenceBySlug.get(source.slug);
  if (!evidenceRecord) throw new Error(`Evidence record missing for localized slug ${source.slug}`);
  const status = evidenceRecord.status;
  const zone = zoneRuBySlug.get(source.zone.slug);
  const enPath = `/life-os/${source.slug}/`;
  const ruPath = ruPathFor(enPath);
  const rich = localized.action && localized.check_in;
  const actionBlock = rich ? `<section class="prose"><h2>Что попробовать</h2><p>${escapeHtml(localized.action)}</p><h2>Что проверить после</h2><p>${escapeHtml(localized.check_in)}</p>${localized.boundary ? `<h2>Где заканчивается рекомендация</h2><p>${escapeHtml(localized.boundary)}</p>` : ""}${localized.alternative ? `<h2>Если не подходит</h2><p>${escapeHtml(localized.alternative)}</p>` : ""}</section>` : "";
  const body = `<p class="eyebrow">${escapeHtml(zone.title)} · русская версия</p><h1>${escapeHtml(localized.title)}</h1><p class="lead">${escapeHtml(localized.description)}</p><div class="grid two"><article class="card"><span class="card-label">Статус обоснованности</span><h3>${escapeHtml(statusLabel[status] || status)}</h3><p><code>${escapeHtml(status)}</code></p></article><article class="card"><span class="card-label">Качество локализации</span><h3>${escapeHtml(qualityLabel[localized.quality_state] || localized.quality_state)}</h3><p>Качество русского текста отслеживается отдельно от доказательности самой идеи.</p></article></div>${actionBlock}<section class="prose"><h2>Что важно знать</h2><p>${escapeHtml(trustBoundary(status, evidenceRecord.sensitive))}</p><h2>Исходный контекст</h2><p>Русская страница сохраняет идентичность канонической записи, но не обязана повторять длинный унаследованный текст слово в слово. Смысл, статус доверия и ограничения важнее размера страницы.</p></section><aside class="callout"><a class="button" lang="en" hreflang="en" href="${escapeHtml(enPath)}">Открыть каноническую английскую запись</a> <a class="button quiet" href="/ru/life-os/${escapeHtml(source.zone.slug)}/">Ещё в этой теме</a></aside>`;
  await writePage(`life-os/${source.slug}`, shellDocument({
    title: localized.title,
    description: localized.description,
    ruPath,
    enPath,
    body,
    schema: {
      headline: localized.title,
      translationOfWork: { "@type": "Article", url: canonicalUrl(enPath), inLanguage: "en" },
      about: [zone.title],
    },
  }));
  await addReciprocalLocale(enPath, ruPath);
  addRoute("library-entry", ruPath, enPath, { slug: source.slug, evidence_status: status, localization_quality: localized.quality_state });
}

const zoneCards = [...zoneRuBySlug.values()].map((zone) => {
  const count = (entriesByZone.get(zone.slug) || []).length;
  return `<article class="card"><span class="card-label">${count} русских записей</span><h3><a href="/ru/life-os/${escapeHtml(zone.slug)}/">${escapeHtml(zone.title)}</a></h3><p>${escapeHtml(zone.subtitle)}</p></article>`;
}).join("");
const libraryDescription = `Русская библиотека Brali: ${allLocalized.size} из ${canonicalIndex.length} канонических записей с отдельным статусом обоснованности и качества локализации.`;
await writePage("life-os", shellDocument({
  title: "Библиотека Brali на русском",
  description: libraryDescription,
  ruPath: "/ru/life-os/",
  enPath: "/life-os/",
  type: "CollectionPage",
  body: `<p class="eyebrow">Библиотека Brali</p><h1>Практические идеи на русском — без потери границ доверия.</h1><p class="lead">${escapeHtml(libraryDescription)} Мы не переводим объём ради объёма: каждая русская запись должна передавать полезный смысл естественным языком и честно показывать, насколько проверена сама рекомендация.</p><div class="grid three">${zoneCards}</div>`,
}));
await addReciprocalLocale("/life-os/", "/ru/life-os/");
addRoute("library-index", "/ru/life-os/", "/life-os/");

for (const zoneEn of zonesEn) {
  const zone = zoneRuBySlug.get(zoneEn.slug);
  const entries = entriesByZone.get(zoneEn.slug) || [];
  const links = entries.map((source) => {
    const localized = allLocalized.get(source.slug);
    const status = evidenceBySlug.get(source.slug)?.status || "pending-review";
    return `<li><a href="/ru/life-os/${escapeHtml(source.slug)}/">${escapeHtml(localized.title)}</a><span>${escapeHtml(statusLabel[status] || status)} · ${escapeHtml(localized.description)}</span></li>`;
  }).join("");
  const enPath = `/life-os/${zoneEn.slug}/`;
  const ruPath = `/ru/life-os/${zoneEn.slug}/`;
  await writePage(`life-os/${zoneEn.slug}`, shellDocument({
    title: zone.title,
    description: zone.subtitle,
    ruPath,
    enPath,
    type: "CollectionPage",
    body: `<p class="eyebrow">Раздел библиотеки</p><h1>${escapeHtml(zone.title)}</h1><p class="lead">${escapeHtml(zone.subtitle)}</p><section class="prose"><h2>${entries.length} локализованных записей</h2><ul class="article-list">${links || "<li>Локализованные записи появятся в следующем проверенном пакете.</li>"}</ul></section>`,
  }));
  await addReciprocalLocale(enPath, ruPath);
  addRoute("zone", ruPath, enPath, { zone: zoneEn.slug, localized_entries: entries.length });
}

let manifest = await readJson(path.join(outputRoot, "manifest.json"));
const routesByPath = new Map((manifest.routes || []).map((route) => [route.path, route]));
for (const route of generatedRoutes) routesByPath.set(route.path, route);
manifest.routes = [...routesByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
const qualityCounts = {};
const evidenceCounts = {};
for (const [slug, localized] of allLocalized) {
  qualityCounts[localized.quality_state] = (qualityCounts[localized.quality_state] || 0) + 1;
  const status = evidenceBySlug.get(slug)?.status || "unknown";
  evidenceCounts[status] = (evidenceCounts[status] || 0) + 1;
}
manifest.coverage = {
  ...(manifest.coverage || {}),
  library_entries: { localized: allLocalized.size, canonical: canonicalIndex.length, mode: config.coverage_mode },
  zones: { localized: zoneRuBySlug.size, canonical: zoneEnBySlug.size },
  localization_quality: qualityCounts,
  localized_evidence_states: evidenceCounts,
  long_form_library: config.coverage_mode === "exact" ? "semantic-layer-exact" : "batched-expansion",
};
manifest.library_issue = 210;
manifest.library_dataset = `${base}/ru/library.json`;
await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const machineEntries = [...allLocalized.values()].map((localized) => {
  const source = indexBySlug.get(localized.slug);
  const trust = evidenceBySlug.get(localized.slug);
  return {
    slug: localized.slug,
    canonical_url: canonicalUrl(`/life-os/${localized.slug}/`),
    localized_url: canonicalUrl(`/ru/life-os/${localized.slug}/`),
    zone: source.zone.slug,
    title: localized.title,
    subtitle: localized.subtitle,
    description: localized.description,
    evidence_status: trust?.status || "unknown",
    sensitive: Boolean(trust?.sensitive),
    localization_quality: localized.quality_state,
    source_updated: localized.source.updatedISO,
  };
}).sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(path.join(outputRoot, "library.json"), `${JSON.stringify({ schema_version: 1, locale: "ru", source_locale: "en", coverage_mode: config.coverage_mode, count: machineEntries.length, canonical_count: canonicalIndex.length, entries: machineEntries }, null, 2)}\n`);

const sitemapUrls = manifest.routes.map((route) => `  <url><loc>${escapeHtml(route.url)}</loc></url>`).join("\n");
await writeFile(path.join(outputRoot, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`);

const llmsPath = path.join(outputRoot, "llms.txt");
let llms = await readFile(llmsPath, "utf8");
const coverageText = config.coverage_mode === "exact"
  ? `Русский семантический слой покрывает все ${canonicalIndex.length} канонических публичных записей библиотеки. Качество языка и редакционный статус каждой записи публикуются отдельно; наличие русского маршрута не повышает evidence-status.`
  : `Русская библиотека расширяется проверенными пакетами: сейчас локализовано ${allLocalized.size} из ${canonicalIndex.length} канонических записей. Отсутствующий русский маршрут означает, что нужно использовать английский канон, а не выдумывать перевод.`;
llms = llms.replace(/## Покрытие[\s\S]*?## Стабильная семантика/, `## Покрытие\n\n${coverageText}\n\nМашинный список русских записей: ${base}/ru/library.json\n\n## Стабильная семантика`);
await writeFile(llmsPath, llms);

console.log(`Russian library layer built: ${allLocalized.size}/${canonicalIndex.length} entries, ${zoneRuBySlug.size} zones, ${manifest.routes.length} total RU human routes.`);
