import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const asOf = process.env.BRALI_AS_OF || new Date().toISOString().slice(0, 10);
const reviewsPath = path.join(root, "life-os", "datasets", "reviews.json");
const copyPath = path.join(root, "data", "localization", "ru", "lifecycle.json");
const batchesRoot = path.join(root, "data", "localization", "ru", "library");
const flagshipsPath = path.join(root, "data", "localization", "ru", "flagships.json");
const sponsorshipsPath = path.join(root, "data", "sponsorships.json");
const markerStart = "<!-- brali-ru-hack-lifecycle:start -->";
const markerEnd = "<!-- brali-ru-hack-lifecycle:end -->";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;

if (!fs.existsSync(reviewsPath)) throw new Error("Russian lifecycle surfaces require the canonical lifecycle dataset");
const reviews = readJson(reviewsPath);
const copy = readJson(copyPath);
const sponsorships = readJson(sponsorshipsPath);
if (copy.schema_version !== 1 || copy.locale !== "ru") throw new Error("Invalid Russian lifecycle localization source");
if (!Array.isArray(reviews.entries)) throw new Error("Canonical lifecycle dataset must contain entries[]");

const localizedBySlug = new Map();
for (const name of fs.readdirSync(batchesRoot).filter((name) => name.endsWith(".json")).sort()) {
  const batch = readJson(path.join(batchesRoot, name));
  for (const record of batch.records || []) localizedBySlug.set(record.slug, record);
}
const flagships = readJson(flagshipsPath);
for (const record of flagships.entries || []) localizedBySlug.set(record.slug, record);

for (const entry of reviews.entries) {
  if (!localizedBySlug.has(entry.slug)) throw new Error(`Russian lifecycle localization missing title source for ${entry.slug}`);
}

function eventSummary(event) {
  if (event.summary_i18n?.ru) return escapeHtml(event.summary_i18n.ru);
  if (event.legacy) return escapeHtml(copy.hack.legacy_event);
  return escapeHtml(copy.hack.english_only_event);
}

function eventType(event) {
  return copy.event_type[event.type] || copy.event_type.note;
}

function evidenceRefs(event) {
  if (!Array.isArray(event.evidence_refs) || !event.evidence_refs.length) return "";
  const refs = event.evidence_refs.map((ref) => /^https:\/\//i.test(ref)
    ? `<a href="${escapeHtml(ref)}" rel="noopener noreferrer">источник</a>`
    : `<code>${escapeHtml(ref)}</code>`).join(" · ");
  return `<p><strong>${escapeHtml(copy.hack.references)}:</strong> ${refs}</p>`;
}

function lifecycleBlock(entry) {
  const state = copy.status[entry.status];
  if (!state) throw new Error(`Russian lifecycle copy missing status ${entry.status}`);
  const history = Array.isArray(entry.history) ? [...entry.history].reverse() : [];
  const items = history.length
    ? `<ol>${history.map((event) => `<li data-review-event="${escapeHtml(event.id)}"><p><strong>${escapeHtml(event.date || "")} · ${escapeHtml(eventType(event))}</strong></p><p>${eventSummary(event)}</p>${evidenceRefs(event)}</li>`).join("")}</ol>`
    : `<p>${escapeHtml(copy.hack.no_events)}</p>`;
  const decisions = Number(entry.evidence_decision_count || entry.evidence_decisions?.length || 0);
  const decisionBlock = decisions > 0
    ? `<div class="review-evidence-context"><h3>${escapeHtml(copy.hack.decisions_heading)}</h3><p>${escapeHtml(copy.hack.decisions_body)}</p><p><strong>${escapeHtml(copy.hack.decisions_count)}:</strong> ${decisions}.</p><p><a lang="en" hreflang="en" href="/life-os/datasets/evidence-decisions.json">${escapeHtml(copy.hack.decisions_link)}</a></p></div>`
    : "";
  const latest = entry.latest_update || entry.latestUpdate;
  const reviewAfter = entry.review_after || entry.reviewAfter;
  return `${markerStart}<section id="review-history" class="prose hack-review-history" data-hack-review-history data-review-status="${escapeHtml(entry.status)}"><p class="eyebrow">${escapeHtml(copy.hack.eyebrow)}</p><h2>${escapeHtml(copy.hack.heading)}</h2><p><strong>${escapeHtml(copy.hack.current_status)}: ${escapeHtml(state.label)}.</strong> ${escapeHtml(state.description)}</p>${latest ? `<p><strong>${escapeHtml(copy.hack.latest_update)}:</strong> ${escapeHtml(latest)}</p>` : ""}${reviewAfter ? `<p><strong>${escapeHtml(copy.hack.next_review)}:</strong> ${escapeHtml(reviewAfter)}</p>` : ""}${items}${decisionBlock}<p><a href="/ru/life-os/review-log/">${escapeHtml(copy.hack.review_log)}</a> · <a href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new/choose">${escapeHtml(copy.hack.challenge)}</a></p><p><small>${escapeHtml(copy.hack.boundary)}</small></p></section>${markerEnd}`;
}

function warningBlock(entry) {
  if (!["needs-review", "contested", "refuted", "retired"].includes(entry.status)) return "";
  const state = copy.status[entry.status];
  return `<aside class="callout" data-ru-review-warning="${escapeHtml(entry.status)}"><p class="eyebrow">${escapeHtml(copy.hack.warning_eyebrow)}</p><h2>${escapeHtml(state.label)}</h2><p>${escapeHtml(state.description)}</p><p><a href="#review-history">${escapeHtml(copy.hack.warning_link)}</a></p></aside>`;
}

let patched = 0;
for (const entry of reviews.entries) {
  const file = path.join(root, "ru", "life-os", entry.slug, "index.html");
  if (!fs.existsSync(file)) throw new Error(`Russian lifecycle page missing for ${entry.slug}`);
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g"), "");
  html = html.replace(/<aside class="callout" data-ru-review-warning="[^"]+">[\s\S]*?<\/aside>/g, "");
  const block = lifecycleBlock(entry);
  const calloutIndex = html.indexOf('<aside class="callout">');
  if (calloutIndex >= 0) html = `${html.slice(0, calloutIndex)}${block}${html.slice(calloutIndex)}`;
  else if (html.includes("</main>")) html = html.replace("</main>", `${block}</main>`);
  else throw new Error(`Cannot inject Russian lifecycle into ${entry.slug}`);
  const warning = warningBlock(entry);
  if (warning) html = html.replace(/(<\/h1>)/, `$1${warning}`);
  fs.writeFileSync(file, html);
  patched += 1;
}

function renderLocalizedPage(template, { title, description, ruPath, enPath, body }) {
  let html = template;
  const ruUrl = canonicalUrl(ruPath);
  const enUrl = canonicalUrl(enPath);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)} — Brali</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeHtml(description)}">`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${ruUrl}">`);
  html = html.replace(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">/gi, "");
  html = html.replace("</head>", `<link rel="alternate" hreflang="ru" href="${ruUrl}"><link rel="alternate" hreflang="en" href="${enUrl}"><link rel="alternate" hreflang="x-default" href="${enUrl}"></head>`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${escapeHtml(title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${ruUrl}">`);
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: title, description, url: ruUrl, inLanguage: "ru", translationOfWork: { "@type": "WebPage", url: enUrl, inLanguage: "en" } };
  if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/i.test(html)) html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`);
  if (!/<main id="content" class="page wrap">[\s\S]*?<\/main>/i.test(html)) throw new Error(`Russian lifecycle template missing main for ${ruPath}`);
  html = html.replace(/<main id="content" class="page wrap">[\s\S]*?<\/main>/i, `<main id="content" class="page wrap">${body}</main>`);
  return html;
}

function patchEnglishReciprocal(enPath, ruPath) {
  const file = enPath === "/" ? path.join(root, "index.html") : path.join(root, enPath.replace(/^\//, "").replace(/\/$/, ""), "index.html");
  if (!fs.existsSync(file)) throw new Error(`Canonical page missing for Russian lifecycle reciprocal: ${enPath}`);
  let html = fs.readFileSync(file, "utf8");
  const headStart = "<!-- brali-lifecycle-ru-hreflang:start -->";
  const headEnd = "<!-- brali-lifecycle-ru-hreflang:end -->";
  const switchStart = "<!-- brali-lifecycle-ru-switch:start -->";
  const switchEnd = "<!-- brali-lifecycle-ru-switch:end -->";
  html = html.replace(new RegExp(`${headStart}[\\s\\S]*?${headEnd}`, "g"), "");
  html = html.replace(new RegExp(`${switchStart}[\\s\\S]*?${switchEnd}`, "g"), "");
  const alternates = `${headStart}<link rel="alternate" hreflang="en" href="${canonicalUrl(enPath)}"><link rel="alternate" hreflang="ru" href="${canonicalUrl(ruPath)}"><link rel="alternate" hreflang="x-default" href="${canonicalUrl(enPath)}">${headEnd}`;
  html = html.replace("</head>", `${alternates}</head>`);
  const switchLink = `${switchStart}<a lang="ru" hreflang="ru" href="${ruPath}">Русский</a>${switchEnd}`;
  if (html.includes("</div></nav></header>")) html = html.replace("</div></nav></header>", `${switchLink}</div></nav></header>`);
  fs.writeFileSync(file, html);
}

const templatePath = path.join(root, "ru", "life-os", "methodology", "index.html");
if (!fs.existsSync(templatePath)) throw new Error("Russian lifecycle surfaces require the generated methodology page as a shell template");
const template = fs.readFileSync(templatePath, "utf8");
const counts = Object.fromEntries(Object.keys(copy.status).map((status) => [status, reviews.entries.filter((entry) => entry.status === status).length]));
const recent = reviews.entries.flatMap((entry) => (entry.history || []).map((event) => ({ event, entry })))
  .sort((a, b) => (b.event.date || "").localeCompare(a.event.date || "") || String(b.event.id || "").localeCompare(String(a.event.id || "")))
  .slice(0, 100);
const cards = Object.entries(counts).map(([status, count]) => `<article class="card"><span class="card-label">${count} ${escapeHtml(copy.ledger.count_suffix)}</span><h3>${escapeHtml(copy.status[status].label)}</h3><p>${escapeHtml(copy.status[status].description)}</p></article>`).join("");
const recentItems = recent.length ? recent.map(({ event, entry }) => {
  const localized = localizedBySlug.get(entry.slug);
  return `<li><a href="/ru/life-os/${escapeHtml(entry.slug)}/#review-history">${escapeHtml(localized.title)}</a><span>${escapeHtml(event.date || "")} · ${escapeHtml(eventType(event))} · ${eventSummary(event)}</span></li>`;
}).join("") : `<li>${escapeHtml(copy.ledger.no_events)}</li>`;
const ledgerBody = `<p class="eyebrow">${escapeHtml(copy.ledger.eyebrow)}</p><h1>${escapeHtml(copy.ledger.heading)}</h1><p class="lead">${escapeHtml(copy.ledger.lead)}</p><div class="grid three">${cards}</div><section class="prose"><h2>${escapeHtml(copy.ledger.recent_heading)}</h2><ul class="article-list">${recentItems}</ul><h2>${escapeHtml(copy.ledger.how_heading)}</h2><p>${escapeHtml(copy.ledger.how_body)}</p><p>${escapeHtml(copy.ledger.observation_body)}</p><p><a class="button" href="/life-os/datasets/reviews.json" lang="en" hreflang="en">${escapeHtml(copy.ledger.machine_link)}</a> <a class="button" href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new/choose">${escapeHtml(copy.ledger.challenge_link)}</a></p></section>`;
const ledgerDir = path.join(root, "ru", "life-os", "review-log");
fs.mkdirSync(ledgerDir, { recursive: true });
fs.writeFileSync(path.join(ledgerDir, "index.html"), renderLocalizedPage(template, {
  title: copy.ledger.title,
  description: copy.ledger.description,
  ruPath: "/ru/life-os/review-log/",
  enPath: "/life-os/review-log/",
  body: ledgerBody,
}));
patchEnglishReciprocal("/life-os/review-log/", "/ru/life-os/review-log/");

const activePlacements = (sponsorships.placements || []).filter((placement) => placement.active && placement.starts_on <= asOf && placement.ends_on >= asOf).length;
const sponsor = copy.sponsorship;
const sponsorshipBody = `<p class="eyebrow">${escapeHtml(sponsor.eyebrow)}</p><h1>${escapeHtml(sponsor.heading)}</h1><p class="lead">${escapeHtml(sponsor.lead)}</p><section class="prose"><h2>${escapeHtml(sponsor.underwriting_heading)}</h2><p>${escapeHtml(sponsor.underwriting_body)}</p><h2>${escapeHtml(sponsor.cards_heading)}</h2><p>${escapeHtml(sponsor.cards_body)}</p><h2>${escapeHtml(sponsor.relationships_heading)}</h2><p>${escapeHtml(sponsor.relationships_body)}</p><h2>${escapeHtml(sponsor.inventory_heading)}</h2><p>${escapeHtml(sponsor.inventory_prefix)}: ${activePlacements}.</p><p><a class="button" href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new/choose">${escapeHtml(sponsor.partnership_link)}</a> <a class="button" href="/ru/life-os/review-log/">${escapeHtml(sponsor.review_link)}</a></p><p><small>${escapeHtml(sponsor.policy_note)}</small></p></section>`;
const sponsorshipDir = path.join(root, "ru", "sponsorship");
fs.mkdirSync(sponsorshipDir, { recursive: true });
fs.writeFileSync(path.join(sponsorshipDir, "index.html"), renderLocalizedPage(template, {
  title: sponsor.title,
  description: sponsor.description,
  ruPath: "/ru/sponsorship/",
  enPath: "/sponsorship/",
  body: sponsorshipBody,
}));
patchEnglishReciprocal("/sponsorship/", "/ru/sponsorship/");

const manifestPath = path.join(root, "ru", "manifest.json");
const manifest = readJson(manifestPath);
const additions = [
  { kind: "review-ledger", locale: "ru", path: "/ru/life-os/review-log/", url: canonicalUrl("/ru/life-os/review-log/"), canonical_path: "/life-os/review-log/", canonical_url: canonicalUrl("/life-os/review-log/") },
  { kind: "commercial-policy", locale: "ru", path: "/ru/sponsorship/", url: canonicalUrl("/ru/sponsorship/"), canonical_path: "/sponsorship/", canonical_url: canonicalUrl("/sponsorship/") },
];
const routes = new Map((manifest.routes || []).map((route) => [route.path, route]));
for (const route of additions) routes.set(route.path, route);
manifest.routes = [...routes.values()].sort((a, b) => a.path.localeCompare(b.path));
manifest.coverage = { ...(manifest.coverage || {}), lifecycle_trust_surfaces: { localized: 2, canonical: 2, status: "complete-for-declared-scope" } };
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const sitemapPath = path.join(root, "ru", "sitemap.xml");
const sitemapUrls = manifest.routes.map((route) => `  <url><loc>${escapeHtml(route.url)}</loc></url>`).join("\n");
fs.writeFileSync(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`);

const llmsPath = path.join(root, "ru", "llms.txt");
let llms = fs.readFileSync(llmsPath, "utf8");
const llmsStart = "<!-- brali-ru-lifecycle:start -->";
const llmsEnd = "<!-- brali-ru-lifecycle:end -->";
const section = `${llmsStart}\n## История проверок и коммерческая независимость\n\n- Журнал проверок: ${base}/ru/life-os/review-log/\n- Правила коммерческой независимости: ${base}/ru/sponsorship/\n- Канонические машиночитаемые данные истории: ${base}/life-os/datasets/reviews.json\n\nРусская версия показывает статус сопровождения отдельно от evidence-status. Изменение, оспаривание или опровержение не выводится из перевода и не создаётся автоматически из исследовательской метаинформации.\n${llmsEnd}`;
const expression = new RegExp(`${llmsStart}[\\s\\S]*?${llmsEnd}`, "g");
llms = expression.test(llms) ? llms.replace(expression, section) : `${llms.trimEnd()}\n\n${section}\n`;
fs.writeFileSync(llmsPath, llms);

console.log(`ru_lifecycle hacks=${patched} review_log=1 sponsorship=1 manifest_routes=${manifest.routes.length} active_sponsorships=${activePlacements}`);
