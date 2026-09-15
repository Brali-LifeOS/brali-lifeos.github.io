import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

function page({ pathName, title, description, eyebrow, heading, lead, cards }) {
  const url = `${base}${pathName}`;
  const cardHtml = cards.map((card) => `<article class="card"><span class="card-label">${escapeHtml(card.label)}</span><h2><a href="${escapeHtml(card.href)}">${escapeHtml(card.title)}</a></h2><p>${escapeHtml(card.body)}</p><p><a href="${escapeHtml(card.href)}">Open →</a></p></article>`).join("");
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: "Brali", url: `${base}/` },
  }).replace(/</g, "\\u003c");
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>${escapeHtml(title)} — Brali</title>\n  <meta name="description" content="${escapeHtml(description)}">\n  <link rel="canonical" href="${url}">\n  <meta property="og:type" content="website">\n  <meta property="og:site_name" content="Brali">\n  <meta property="og:title" content="${escapeHtml(title)}">\n  <meta property="og:description" content="${escapeHtml(description)}">\n  <meta property="og:url" content="${url}">\n  <meta property="og:image" content="${base}/assets/images/brali-mascot-hero.png">\n  <link rel="icon" href="/assets/images/brali-logo.png">\n  <link rel="stylesheet" href="/styles.css?v=20260822j">\n  <script type="application/ld+json">${schema}</script>\n</head>\n<body>\n<a class="skip" href="#content">Skip to content</a>\n<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/" aria-label="Brali home"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/life-os/">Explore</a><a href="/life-os/methodology/">Evidence</a><a href="/research/">Research</a><a href="/partners/">Build with Brali</a><a class="button" href="/for-ai/">For AI &amp; Developers</a></div></nav></header>\n<main id="content" class="page wrap"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(heading)}</h1><p class="lead">${escapeHtml(lead)}</p><div class="grid two">${cardHtml}</div></main>\n<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Evidence-aware practical protocols and machine-readable knowledge.</small></div></div></footer>\n</body>\n</html>\n`;
}

const hubs = [
  {
    directory: "quality",
    pathName: "/quality/",
    title: "Quality",
    description: "Brali quality surfaces for claims, outcomes and maintained knowledge integrity.",
    eyebrow: "Quality",
    heading: "See what Brali checks, not just what it publishes",
    lead: "Quality surfaces expose claim boundaries and outcome instrumentation so agents and people can distinguish maintained checks from marketing language.",
    cards: [
      { label: "Claims", href: "/quality/claims/", title: "Claim quality", body: "Inspect claim boundaries, cleanup state and evidence-related quality controls." },
      { label: "Outcomes", href: "/quality/outcomes/", title: "Outcome quality", body: "Inspect how usefulness and execution outcomes are instrumented without fabricating success signals." },
    ],
  },
  {
    directory: "trends",
    pathName: "/trends/",
    title: "Evidence Trends",
    description: "Brali evidence trend reports and review-period snapshots.",
    eyebrow: "Evidence Trends",
    heading: "Track how the evidence layer changes over time",
    lead: "Trend surfaces summarize review activity and evidence movement. They are historical reporting views, not proof that every listed practice is effective.",
    cards: [
      { label: "Evidence", href: "/trends/evidence/", title: "Evidence trends", body: "Browse the maintained evidence trend overview and review-period navigation." },
      { label: "2026-08", href: "/trends/evidence/2026-08/", title: "August 2026 review snapshot", body: "Open the current period snapshot of evidence and review-state changes." },
    ],
  },
];

for (const hub of hubs) {
  const directory = path.join(root, hub.directory);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), page(hub), "utf8");
}

const sitemapPath = path.join(root, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
for (const hub of hubs) {
  const url = `${base}${hub.pathName}`;
  if (!sitemap.includes(`<loc>${url}</loc>`)) sitemap = sitemap.replace(/\s*<\/urlset>\s*$/, `\n  <url><loc>${url}</loc></url>\n</urlset>\n`);
}
await writeFile(sitemapPath, sitemap, "utf8");
console.log(`[navigation-hubs] built ${hubs.length} missing landing hub(s): ${hubs.map((hub) => hub.pathName).join(", ")}`);
