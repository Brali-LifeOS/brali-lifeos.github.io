import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadProtocolOverrides } from "./lib/protocol-overrides.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const publicIndex = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));
const lifeAreas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const flagshipConfig = JSON.parse(await readFile(path.join(root, "data/flagship-protocols.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocolFeed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const curated = await loadProtocolOverrides(root);

const sourceBySlug = new Map(sourceIndex.map((entry) => [entry.slug, entry]));
const publicBySlug = new Map(publicIndex.map((entry) => [entry.slug, entry]));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const feedBySlug = new Map((protocolFeed.entries ?? []).map((entry) => [entry.slug, entry]));
const areaBySlug = new Map(lifeAreas.map((area) => [area.slug, area]));
const configuredAreas = Object.keys(flagshipConfig.areas ?? {});
const expectedAreas = lifeAreas.map((area) => area.slug);
const missingAreas = expectedAreas.filter((slug) => !configuredAreas.includes(slug));
const unknownAreas = configuredAreas.filter((slug) => !areaBySlug.has(slug));
const selectedSlugs = Object.values(flagshipConfig.areas ?? {});
const duplicates = selectedSlugs.filter((slug, index) => selectedSlugs.indexOf(slug) !== index);
if (missingAreas.length || unknownAreas.length || duplicates.length) {
  throw new Error(`Flagship configuration invalid. missing=[${missingAreas.join(", ")}], unknown=[${unknownAreas.join(", ")}], duplicate protocols=[${[...new Set(duplicates)].join(", ")}]`);
}

function flagshipDiagnostic(slug, { source, publicEntry, trust, feed, override }) {
  return JSON.stringify({
    slug,
    source: Boolean(source),
    public: Boolean(publicEntry),
    evidence: Boolean(trust),
    feed: Boolean(feed),
    curated: Boolean(override),
    evidence_status: trust?.status ?? null,
    indexable: trust?.indexable ?? null,
    indexing_reason: trust?.indexingReason ?? null,
    claim_categories: trust?.claims?.categories ?? [],
    decision_required_categories: trust?.decision_required_categories ?? [],
    evidence_decision_ids: trust?.evidence_decision_ids ?? [],
  });
}

const flagships = lifeAreas.map((area) => {
  const slug = flagshipConfig.areas[area.slug];
  const source = sourceBySlug.get(slug);
  const publicEntry = publicBySlug.get(slug);
  const trust = evidenceBySlug.get(slug);
  const feed = feedBySlug.get(slug);
  const override = curated.entries?.[slug];
  const diagnostic = flagshipDiagnostic(slug, { source, publicEntry, trust, feed, override });
  if (!source || !publicEntry || !trust || !feed || !override) throw new Error(`Flagship dependency failed: ${diagnostic}`);
  if (trust.indexable !== true || !["reviewed", "practical"].includes(trust.status)) throw new Error(`Flagship discovery quality gate failed: ${diagnostic}`);
  if (source.zone?.slug && !area.zones.includes(source.zone.slug)) throw new Error(`Flagship ${slug} does not belong to configured Life Area ${area.slug}.`);
  return {
    life_area: { slug: area.slug, title: area.title, subtitle: area.subtitle },
    slug,
    url: `${base}/life-os/${slug}/`,
    title: publicEntry.displayTitle || source.title,
    description: source.description,
    action: feed.action,
    check_in: feed.check_in,
    evidence_status: trust.status,
    reviewed_at: trust.review?.reviewedAt ?? override.reviewed_at ?? null,
  };
});

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const cards = flagships.map((item) => `<article class="card"><span class="card-label">${escapeHtml(item.life_area.title)} · ${escapeHtml(item.evidence_status)}</span><h3><a href="/life-os/${item.slug}/">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.action)}</p><p><strong>Check-in:</strong> ${escapeHtml(item.check_in || "Review what happened and decide what to change next.")}</p></article>`).join("");
const canonical = `${base}/life-os/flagships/`;
const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Start Here: Brali Flagship Protocols",
  description: "Seven curated starting protocols, one for each Brali Life Area.",
  url: canonical,
  hasPart: flagships.map((item) => ({ "@type": "Article", name: item.title, url: item.url })),
};
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Start Here — Brali flagship protocols</title><meta name="description" content="Seven curated starting protocols, one for each Brali Life Area."><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="Start Here — Brali flagship protocols"><meta property="og:description" content="Seven curated starting protocols, one for each Brali Life Area."><meta property="og:url" content="${canonical}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali LifeOS"><span>Brali LifeOS</span></a><div class="links"><a href="/life-os/areas/">Life Areas</a><a href="/life-os/">Growth Library</a><a href="/life-os/methodology/">Methodology</a><a class="button yellow" href="/download/">Get Brali</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Start here</p><h1>Seven good first experiments.</h1><p class="lead">The Growth Library is intentionally broad. This smaller set gives you one curated, discovery-ready protocol for each Life Area so you can start with an action instead of studying the taxonomy.</p><div class="grid two">${cards}</div><div class="callout"><h3>Need a different starting point?</h3><p>Browse the seven Life Areas or search the complete trusted Growth Library.</p><a class="button" href="/life-os/areas/">Browse Life Areas</a></div></main><footer class="footer"><div class="wrap footer-row"><small>Brali LifeOS · Flagship protocols</small><div class="footer-links"><a href="/life-os/">Growth Library</a><a href="/life-os/methodology/">Methodology</a><a href="/privacy/">Privacy</a></div></div></footer></body></html>`;
await mkdir(path.join(root, "life-os/flagships"), { recursive: true });
await writeFile(path.join(root, "life-os/flagships/index.html"), html);

const dataset = {
  schema_version: 1,
  name: "Brali flagship protocols",
  selection_rule: flagshipConfig.selection_rule,
  count: flagships.length,
  entries: flagships,
};
await writeFile(path.join(root, "life-os/datasets/flagships.json"), JSON.stringify(dataset, null, 2));

const manifestPath = path.join(root, "life-os/datasets/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "flagships.json"] )];
manifest.flagship_protocols = { count: flagships.length, life_areas: lifeAreas.length };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPath = path.join(root, "life-os/datasets/index.html");
let datasetsHtml = await readFile(datasetsPath, "utf8");
if (!datasetsHtml.includes("/life-os/datasets/flagships.json")) {
  datasetsHtml = datasetsHtml.replace("</ul>", '<li><a href="/life-os/datasets/flagships.json">Flagship protocol collection (JSON)</a></li></ul>');
  await writeFile(datasetsPath, datasetsHtml);
}

for (const relativePath of ["life-os/index.html", "life-os/areas/index.html"]) {
  const file = path.join(root, relativePath);
  let page = await readFile(file, "utf8");
  if (!page.includes('/life-os/flagships/')) {
    const callout = '<div class="callout"><h3>Prefer a smaller starting set?</h3><p>Open seven curated flagship protocols: one practical starting point for each Life Area.</p><a class="button" href="/life-os/flagships/">Start with the flagships</a></div>';
    page = page.replace('<div class="grid three">', `${callout}<div class="grid three">`);
    await writeFile(file, page);
  }
}

const sitemapPath = path.join(root, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
  sitemap = sitemap.replace("</urlset>", `  <url><loc>${canonical}</loc></url>\n</urlset>`);
  await writeFile(sitemapPath, sitemap);
}

console.log(`Flagship collection generated: ${flagships.length} curated starting protocols covering ${lifeAreas.length} Life Areas.`);
