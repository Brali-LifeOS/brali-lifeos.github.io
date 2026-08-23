import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const contentRoot = path.join(root, "data/life-os-content");
const outputRoot = path.join(root, "life-os");
const zones = JSON.parse(await readFile(path.join(root, "data/life-os-zones.json"), "utf8"));
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));

const coverAltByArea = new Map([
  ["focus-execution", "A person choosing one next action for focus and reliable follow-through"],
  ["mind-resilience", "A person pausing calmly to notice their experience and regain perspective"],
  ["health-energy", "A person beginning a simple stretch beside a water bottle"],
  ["learning-thinking", "A person comparing notes and marking one useful insight"],
  ["communication-relationships", "Two people practicing clear speaking and attentive listening"],
  ["creativity-expression", "A person sketching and arranging a new visual idea"],
  ["work-money-strategy", "A person comparing options and placing one choice onto a path"],
]);
const areaByZone = new Map();
for (const area of areas) {
  for (const zoneSlug of area.zones) {
    if (areaByZone.has(zoneSlug)) throw new Error(`Growth Zone mapped to more than one Life Area: ${zoneSlug}`);
    areaByZone.set(zoneSlug, area);
  }
}
const uncoveredZones = zones.map((zone) => zone.slug).filter((slug) => !areaByZone.has(slug));
if (uncoveredZones.length) throw new Error(`Growth Zones without hack-cover mapping: ${uncoveredZones.join(", ")}`);

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const escapeAttribute = escapeHtml;
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const canonical = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const cleanHtml = (html = "") => String(html)
  .replaceAll("https://metalhatscats.com/life-os", `${base}/life-os`)
  .replaceAll("http://metalhatscats.com/life-os", `${base}/life-os`)
  .replaceAll("MetalHatsCats × Brali LifeOS", "Brali")
  .replaceAll("MetalHatsCats / Brali LifeOS", "Brali");

function document({ title, description, pathname, body, jsonLd, imagePath = "/assets/images/brali-logo.png" }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeAttribute(text(description).slice(0, 300));
  const url = canonical(pathname);
  const schema = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle} — Brali</title><meta name="description" content="${safeDescription}"><link rel="canonical" href="${url}"><meta property="og:type" content="article"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${url}"><meta property="og:image" content="${base}${imagePath}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css">${schema}</head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a><a href="/faq/">FAQ</a></div></nav></header><main id="content" class="page wrap">${body}</main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Practical knowledge for people and machines.</small></div><div class="footer-links"><a href="/life-os/">Library</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/faq/">FAQ</a><a href="/terms/">Terms</a></div></div></footer></body></html>`;
}

async function save(relativePath, contents) {
  const destination = path.join(root, relativePath, "index.html");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

await rm(outputRoot, { recursive: true, force: true });

const itemsByZone = new Map();
for (const item of index) {
  const list = itemsByZone.get(item.zone.slug) ?? [];
  list.push(item);
  itemsByZone.set(item.zone.slug, list);
}

for (const entry of index) {
  const file = path.join(contentRoot, `${entry.slug}.json`);
  const article = JSON.parse(await readFile(file, "utf8"));
  const body = article.body ?? {};
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const intro = cleanHtml(body.intro?.html || "");
  const substantive = sections.length > 0 || !/Content will be generated by OpenAI/i.test(intro);
  const articleBody = substantive
    ? `${intro ? `<div class="prose">${intro}</div>` : ""}<div class="prose">${sections.map((section) => `<section id="${escapeAttribute(section.slug || "")}">${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}${cleanHtml(section.html)}</section>`).join("\n")}</div>`
    : `<div class="prose"><p>${escapeHtml(article.description || article.lifeOsSource?.whatYouDo || "This practical entry is available in the Brali Growth Library.")}</p></div>`;
  const faq = (article.faq || []).filter((item) => item.question && item.answer).slice(0, 5);
  const faqBody = faq.length ? `<section class="prose"><h2>Questions to consider</h2>${faq.map((item) => `<h3>${escapeHtml(item.question)}</h3>${cleanHtml(item.answerHtml || `<p>${escapeHtml(item.answer)}</p>`)}`).join("")}</section>` : "";
  const articlePath = `/life-os/${entry.slug}/`;
  const area = areaByZone.get(entry.zone.slug);
  const coverPath = `/assets/images/brali-hack-${area.slug}.webp`;
  const cover = `<figure class="hack-cover" data-hack-cover="true" data-life-area="${area.slug}"><img src="${coverPath}" width="1672" height="941" alt="${escapeAttribute(coverAltByArea.get(area.slug))}" fetchpriority="high"></figure>`;
  const schema = { "@context": "https://schema.org", "@type": "Article", headline: entry.title, description: text(entry.description), url: canonical(articlePath), isPartOf: { "@type": "CollectionPage", name: "Brali Growth Library", url: canonical("/life-os/") }, about: entry.keywords || [], datePublished: entry.publishedISO || undefined, dateModified: entry.updatedISO || undefined };
  await save(`life-os/${entry.slug}`, document({ title: entry.title, description: entry.description, pathname: articlePath, jsonLd: schema, imagePath: coverPath, body: `<p class="eyebrow"><a href="/life-os/${entry.zone.slug}/">${escapeHtml(entry.zone.title)}</a> · Growth Library</p><h1>${escapeHtml(entry.title)}</h1>${entry.subtitle ? `<p class="lead">${escapeHtml(entry.subtitle)}</p>` : ""}${cover}${articleBody}${faqBody}<aside class="callout"><h3>Try it, then review.</h3><p>Use the action above as a starting point. Adapt it to your situation, notice what happens, and keep, change, or drop it.</p><a class="button" href="/life-os/">More protocols</a></aside>` }));
}

for (const zone of zones) {
  const entries = (itemsByZone.get(zone.slug) ?? []).sort((a, b) => a.title.localeCompare(b.title));
  const zonePath = `/life-os/${zone.slug}/`;
  const links = entries.map((entry) => `<li><a href="/life-os/${entry.slug}/">${escapeHtml(entry.title)}</a>${entry.description ? `<span>${escapeHtml(text(entry.description).slice(0, 180))}</span>` : ""}</li>`).join("");
  await save(`life-os/${zone.slug}`, document({ title: zone.title, description: zone.subtitle, pathname: zonePath, jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${zone.title} | Brali`, description: zone.subtitle, url: canonical(zonePath) }, body: `<section class="visual-hero visual-hero--hacks"><div class="visual-hero-copy"><p class="eyebrow">Growth Zone</p><h1>${escapeHtml(zone.title)}</h1><p class="lead">${escapeHtml(zone.subtitle)}</p></div><figure class="visual-hero-media"><img src="/assets/images/brali-practical-hack.webp" width="1672" height="941" alt="Three people choosing one action, pausing to try it, and recording an observation" fetchpriority="high"></figure></section><section class="prose"><h2>${entries.length} practical entries</h2><ul class="article-list">${links}</ul></section>` }));
}

const zoneCards = zones.map((zone) => { const count = (itemsByZone.get(zone.slug) ?? []).length; return `<article class="card"><span class="card-label">${count} entries</span><h3><a href="/life-os/${zone.slug}/">${escapeHtml(zone.title)}</a></h3><p>${escapeHtml(zone.subtitle)}</p></article>`; }).join("");
await save("life-os", document({ title: "Growth Library", description: "Browse Brali Growth Zones and practical protocols.", pathname: "/life-os/", jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Brali Growth Library", url: canonical("/life-os/") }, body: `<p class="eyebrow">Brali Growth Library</p><h1>Practical ideas for everyday life.</h1><p class="lead">Browse ${index.length} entries across ${zones.length} Growth Zones. Start with a real problem, choose one idea, and treat it as something to try rather than a rule.</p><div class="grid three">${zoneCards}</div>` }));

const specialPages = [
  ["life-os/about", "About the Growth Library", "How Brali turns practical ideas into personal experiments.", `<p class="eyebrow">About Brali</p><h1>Ideas become useful when you try them.</h1><div class="prose"><p>The Brali Growth Library is a collection of practical entries organized by Growth Zone. It is not a prescription. Treat each entry as a starting point you can adapt to your own context.</p><h2>A simple loop</h2><p>Choose a relevant entry, make one action concrete, notice what happened, and adjust.</p><p><a class="button yellow" href="/life-os/">Browse the Growth Library</a></p></div>`],
  ["life-os/catalog", "Growth Library Catalog", "Browse every Brali Growth Library entry.", `<p class="eyebrow">Catalog</p><h1>Every Growth Library entry.</h1><div class="prose"><p>Use your browser’s find command to search this compact static catalog. Entries are grouped by Growth Zone.</p>${zones.map((zone) => `<h2><a href="/life-os/${zone.slug}/">${escapeHtml(zone.title)}</a></h2><p>${escapeHtml(zone.subtitle)}</p>`).join("")}</div>`],
  ["life-os/category", "Growth Library Categories", "Browse Brali Growth Zones.", `<p class="eyebrow">Categories</p><h1>Choose a Growth Zone.</h1><div class="grid three">${zoneCards}</div>`],
  ["life-os/datasets", "Growth Library data", "Machine-readable Brali Growth Library datasets.", `<p class="eyebrow">Machine-readable data</p><h1>Growth Library datasets.</h1><div class="prose"><p>These files describe the public Growth Library and are provided for research, discovery, and implementation work.</p><ul><li><a href="/life-os/datasets/hacks.json">Growth Library entries (JSON)</a></li><li><a href="/life-os/datasets/zones.json">Growth Zones (JSON)</a></li><li><a href="/life-os/datasets/metrics.json">Legacy app metrics schema (JSON)</a></li><li><a href="/life-os/datasets/manifest.json">Dataset manifest (JSON)</a></li></ul></div>`],
  ["life-os/metrics", "Brali personal metrics", "Legacy personal metric definitions from the Brali LifeOS app.", `<p class="eyebrow">Legacy app data</p><h1>Personal metrics from Brali LifeOS.</h1><div class="prose"><p>The original app supported check-ins, logs, and custom metrics. These definitions remain available as historical implementation data in <a href="/life-os/datasets/metrics.json">JSON</a>.</p></div>`],
  ["life-os/taxonomy", "Growth Library taxonomy", "Browse the Brali Growth Library by catalog dimensions.", `<p class="eyebrow">Taxonomy</p><h1>Explore the library from another angle.</h1><div class="prose"><p>The source catalog contains status, SEO, and mini-app classifications. These supporting views remain available while the complete entries live in the Growth Library.</p><ul><li><a href="/life-os/taxonomy/status/">Entry status</a></li><li><a href="/life-os/taxonomy/seo/">Search potential</a></li><li><a href="/life-os/taxonomy/mini-app/">Mini-app classification</a></li></ul></div>`],
  ["life-os/taxonomy/status", "Growth Library entry status", "Growth Library entry statuses.", `<p class="eyebrow">Taxonomy</p><h1>Entry status.</h1><div class="prose"><p>Every public entry is retained at its canonical Growth Library URL. Status labels are preserved in the source dataset.</p></div>`],
  ["life-os/taxonomy/seo", "Growth Library search potential", "Growth Library search classifications.", `<p class="eyebrow">Taxonomy</p><h1>Search classifications.</h1><div class="prose"><p>Search classifications are metadata for the library, not a measure of an entry’s personal usefulness.</p></div>`],
  ["life-os/taxonomy/mini-app", "Growth Library mini-app classifications", "Growth Library mini-app classifications.", `<p class="eyebrow">Taxonomy</p><h1>Mini-app classifications.</h1><div class="prose"><p>This legacy catalog view groups entries by their earlier implementation potential. Browse the Growth Library to use the practical guidance itself.</p></div>`],
];
for (const [relativePath, title, description, body] of specialPages) await save(relativePath, document({ title, description, pathname: `/${relativePath}/`, body }));
for (const relativePath of ["life-os/taxonomy/status/draft-markdown", "life-os/taxonomy/status/missing", "life-os/taxonomy/status/pending", "life-os/taxonomy/status/ready", "life-os/taxonomy/seo/high", "life-os/taxonomy/seo/medium", "life-os/taxonomy/seo/low", "life-os/taxonomy/mini-app/recommended", "life-os/taxonomy/mini-app/not-recommended"]) {
  await save(relativePath, document({ title: "Growth Library classification", description: "Supporting Brali Growth Library classification view.", pathname: `/${relativePath}/`, body: `<p class="eyebrow">Taxonomy</p><h1>Growth Library classification.</h1><div class="prose"><p>This archived classification view points readers back to the complete Brali Growth Library.</p><p><a class="button yellow" href="/life-os/">Browse the library</a></p></div>` }));
}
await mkdir(path.join(outputRoot, "datasets"), { recursive: true });
await cp(path.join(root, "data/life-os/hacks.json"), path.join(outputRoot, "datasets/hacks.json"));
await cp(path.join(root, "data/life-os-zones.json"), path.join(outputRoot, "datasets/zones.json"));
await cp(path.join(root, "data/life-os/metrics.json"), path.join(outputRoot, "datasets/metrics.json"));
await writeFile(path.join(outputRoot, "datasets/manifest.json"), JSON.stringify({ name: "Brali Growth Library", canonical_url: canonical("/life-os/datasets/"), entries: index.length, zones: zones.length, files: ["hacks.json", "zones.json", "metrics.json"] }, null, 2));

const urls = ["/", "/features/", "/how-it-works/", "/screenshots/", "/docs/", "/download/", "/privacy/", "/support/", "/changelog/", "/life-os/", ...specialPages.map(([relativePath]) => `/${relativePath}/`)];
for (const zone of zones) urls.push(`/life-os/${zone.slug}/`);
for (const item of index) urls.push(`/life-os/${item.slug}/`);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${canonical(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(root, "sitemap.xml"), sitemap);
await cp(path.join(root, "data/life-os-content/index.json"), path.join(root, "life-os-index.json"));
console.log(`Built ${index.length} article pages, ${zones.length} zone pages, and sitemap.xml.`);
