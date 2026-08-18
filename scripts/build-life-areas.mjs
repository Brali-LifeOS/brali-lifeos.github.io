import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const zones = JSON.parse(await readFile(path.join(root, "data/life-os-zones.json"), "utf8"));
const entries = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const canonical = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const zoneBySlug = new Map(zones.map((zone) => [zone.slug, zone]));
const entryCountByZone = new Map();
for (const entry of entries) entryCountByZone.set(entry.zone.slug, (entryCountByZone.get(entry.zone.slug) ?? 0) + 1);

const mappedZones = areas.flatMap((area) => area.zones);
const duplicates = mappedZones.filter((slug, index) => mappedZones.indexOf(slug) !== index);
const missing = zones.map((zone) => zone.slug).filter((slug) => !mappedZones.includes(slug));
const unknown = mappedZones.filter((slug) => !zoneBySlug.has(slug));
if (duplicates.length || missing.length || unknown.length) {
  throw new Error(`Life area mapping invalid. duplicates=[${[...new Set(duplicates)].join(", ")}], missing=[${missing.join(", ")}], unknown=[${[...new Set(unknown)].join(", ")}]`);
}

function document({ title, description, pathname, body, schema }) {
  const url = canonical(pathname);
  const jsonLd = JSON.stringify(schema).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Brali LifeOS</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${base}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${jsonLd}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali LifeOS"><span>Brali LifeOS</span></a><div class="links"><a href="/life-os/">Growth Library</a><a href="/life-os/areas/">Life areas</a><a href="/docs/">Getting started</a><a class="button yellow" href="/download/">Get Brali</a></div></nav></header><main id="content" class="page wrap">${body}</main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali LifeOS</span></a><small>Choose, practice, and review what works.</small></div><div class="footer-links"><a href="/life-os/">Growth Library</a><a href="/privacy/">Privacy</a><a href="/support/">Support</a></div></div></footer></body></html>`;
}

async function save(relativePath, contents) {
  const destination = path.join(root, relativePath, "index.html");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

const areaCards = areas.map((area) => {
  const entryCount = area.zones.reduce((total, slug) => total + (entryCountByZone.get(slug) ?? 0), 0);
  return `<article class="card"><span class="card-label">${area.zones.length} zones · ${entryCount} entries</span><h3><a href="/life-os/areas/${area.slug}/">${escapeHtml(area.title)}</a></h3><p>${escapeHtml(area.subtitle)}</p></article>`;
}).join("");

await save("life-os/areas", document({
  title: "Life areas",
  description: "Start with a familiar area of life, then explore the detailed Brali Growth Zones inside it.",
  pathname: "/life-os/areas/",
  schema: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Brali LifeOS life areas", url: canonical("/life-os/areas/") },
  body: `<p class="eyebrow">Growth Library</p><h1>Start with the part of life you want to work on.</h1><p class="lead">The detailed Growth Library has ${zones.length} Growth Zones. These seven life areas give you a simpler first step without removing the deeper taxonomy.</p><div class="grid three">${areaCards}</div>`
}));

for (const area of areas) {
  const areaPath = `/life-os/areas/${area.slug}/`;
  const zoneCards = area.zones.map((slug) => {
    const zone = zoneBySlug.get(slug);
    const count = entryCountByZone.get(slug) ?? 0;
    return `<article class="card"><span class="card-label">${count} entries</span><h3><a href="/life-os/${slug}/">${escapeHtml(zone.title)}</a></h3><p>${escapeHtml(zone.subtitle)}</p></article>`;
  }).join("");
  const entryCount = area.zones.reduce((total, slug) => total + (entryCountByZone.get(slug) ?? 0), 0);
  await save(`life-os/areas/${area.slug}`, document({
    title: area.title,
    description: area.subtitle,
    pathname: areaPath,
    schema: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${area.title} | Brali LifeOS`,
      description: area.subtitle,
      url: canonical(areaPath),
      isPartOf: { "@type": "CollectionPage", name: "Brali LifeOS life areas", url: canonical("/life-os/areas/") }
    },
    body: `<p class="eyebrow"><a href="/life-os/areas/">Life areas</a> · Growth Library</p><h1>${escapeHtml(area.title)}</h1><p class="lead">${escapeHtml(area.subtitle)}</p><section class="prose"><p>${entryCount} practical entries are organized across ${area.zones.length} detailed Growth Zones. Choose the zone that best matches what you want to try or understand next.</p></section><div class="grid three">${zoneCards}</div>`
  }));
}

const libraryPath = path.join(root, "life-os/index.html");
let libraryHtml = await readFile(libraryPath, "utf8");
if (!libraryHtml.includes('href="/life-os/areas/"')) {
  const areaCallout = '<div class="callout"><h3>Not sure which Growth Zone to choose?</h3><p>Start with one of seven familiar life areas, then narrow down to the detailed methods and topics inside it.</p><a class="button" href="/life-os/areas/">Browse life areas</a></div>';
  libraryHtml = libraryHtml.replace('<div class="grid three">', `${areaCallout}<div class="grid three">`);
  await writeFile(libraryPath, libraryHtml);
}

const sitemapPath = path.join(root, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
const areaUrls = ["/life-os/areas/", ...areas.map((area) => `/life-os/areas/${area.slug}/`)];
const missingUrls = areaUrls.filter((url) => !sitemap.includes(`<loc>${canonical(url)}</loc>`));
if (missingUrls.length) {
  const extra = missingUrls.map((url) => `  <url><loc>${canonical(url)}</loc></url>`).join("\n");
  sitemap = sitemap.replace("</urlset>", `${extra}\n</urlset>`);
  await writeFile(sitemapPath, sitemap);
}

console.log(`Life areas generated: ${areas.length} areas covering ${mappedZones.length} Growth Zones.`);
