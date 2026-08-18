import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const ontology = JSON.parse(await readFile(path.join(root, "data/knowledge-ontology.json"), "utf8"));
const zones = JSON.parse(await readFile(path.join(root, "data/life-os-zones.json"), "utf8"));
const entries = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const canonical = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const pluralFor = (kind) => kind === "lens" ? "lenses" : kind === "method" ? "methods" : kind === "topic" ? "topics" : `${kind}s`;
const zoneBySlug = new Map(zones.map((zone) => [zone.slug, zone]));
const topicById = new Map(ontology.topics.map((item) => [item.id, item]));
const methodById = new Map(ontology.methods.map((item) => [item.id, item]));
const lensById = new Map(ontology.lenses.map((item) => [item.id, item]));
const domainById = new Map(ontology.domains.map((item) => [item.id, item]));
const map = ontology.legacy_zone_map;

const zoneSlugs = new Set(zones.map((zone) => zone.slug));
const mappedSlugs = new Set(Object.keys(map));
const missing = [...zoneSlugs].filter((slug) => !mappedSlugs.has(slug));
const unknown = [...mappedSlugs].filter((slug) => !zoneSlugs.has(slug));
if (missing.length || unknown.length) throw new Error(`Ontology legacy mapping invalid. missing=[${missing.join(", ")}], unknown=[${unknown.join(", ")}]`);

for (const [slug, mapping] of Object.entries(map)) {
  const registry = mapping.kind === "topic" ? topicById : mapping.kind === "method" ? methodById : mapping.kind === "lens" ? lensById : null;
  if (!registry || !registry.has(mapping.target_id)) throw new Error(`Ontology mapping for ${slug} points to unknown ${mapping.kind}:${mapping.target_id}`);
}
for (const topic of ontology.topics) if (!domainById.has(topic.domain_id)) throw new Error(`Topic ${topic.id} points to unknown domain ${topic.domain_id}`);

const entriesByZone = new Map();
for (const entry of entries) {
  const list = entriesByZone.get(entry.zone.slug) ?? [];
  list.push(entry);
  entriesByZone.set(entry.zone.slug, list);
}
const zonesFor = (kind, id) => Object.entries(map).filter(([, value]) => value.kind === kind && value.target_id === id).map(([slug]) => slug);
const entriesFor = (kind, id) => zonesFor(kind, id).flatMap((slug) => entriesByZone.get(slug) ?? []);
const uniqueEntriesFor = (kind, id) => [...new Map(entriesFor(kind, id).map((entry) => [entry.slug, entry])).values()];

function document({ title, description, pathname, body, schema }) {
  const url = canonical(pathname);
  const jsonLd = schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Brali</title><meta name="description" content="${escapeHtml(text(description).slice(0, 300))}"><link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(text(description).slice(0, 300))}"><meta property="og:url" content="${url}"><meta property="og:image" content="${base}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css">${jsonLd}</head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/ontology/">Ontology</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a></div></nav></header><main id="content" class="page wrap">${body}</main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Practical knowledge for people and machines.</small></div><div class="footer-links"><a href="/life-os/">Library</a><a href="/ontology/">Ontology</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a></div></div></footer></body></html>`;
}

async function save(relativePath, contents) {
  const destination = path.join(root, relativePath, "index.html");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

const entityCard = (kind, item) => {
  const count = uniqueEntriesFor(kind, item.id).length;
  const status = item.status ? `${item.status.replaceAll("-", " ")} · ` : "";
  return `<article class="card"><span class="card-label">${status}${count} mapped entries</span><h3><a href="/ontology/${pluralFor(kind)}/${item.id}/">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.description)}</p></article>`;
};

const domainCards = ontology.domains.map((domain) => {
  const topics = ontology.topics.filter((topic) => topic.domain_id === domain.id);
  const count = [...new Set(topics.flatMap((topic) => uniqueEntriesFor("topic", topic.id).map((entry) => entry.slug)))].length;
  return `<article class="card"><span class="card-label">${topics.length} topics · ${count} topic-mapped entries</span><h3><a href="/ontology/domains/${domain.id}/">${escapeHtml(domain.title)}</a></h3><p>${escapeHtml(domain.description)}</p></article>`;
}).join("");

await save("ontology", document({
  title: "Practical knowledge ontology",
  description: "Brali separates Domains, Topics, Methods, and Lenses so practical knowledge can be classified without mixing problems, therapy schools, professions, and metaphors in one list.",
  pathname: "/ontology/",
  schema: { "@context": "https://schema.org", "@type": "DefinedTermSet", name: "Brali practical knowledge ontology", url: canonical("/ontology/") },
  body: `<p class="eyebrow">Knowledge model v2</p><h1>Separate the problem from the method.</h1><p class="lead">The original Brali catalog mixed goals, methods, professions, philosophies, and subject areas into 49 Growth Zones. The new ontology keeps those URLs stable but gives each concept a clearer role.</p><div class="grid two"><article class="card"><span class="card-label">Where</span><h3>Domain</h3><p>Broad area of life or work, such as Learning & Thinking or Health & Energy.</p></article><article class="card"><span class="card-label">What</span><h3>Topic</h3><p>The concrete problem or capability: Memory, Task Initiation, Sleep, Conflict & Repair, Career.</p></article><article class="card"><span class="card-label">How</span><h3>Method</h3><p>A named structured approach such as WOOP/MCII, Retrieval Practice, TRIZ, ACT-derived, or CBT-derived techniques.</p></article><article class="card"><span class="card-label">Think like</span><h3>Lens</h3><p>A transferable way of thinking borrowed from QA, architecture, detective work, chess, Stoicism, or other disciplines.</p></article></div><section class="prose"><h2>The practical stack</h2><p><code>Domain → Topic → Hack → Protocol</code></p><p>Methods and Lenses can tag the same Hack or Protocol without becoming fake topics. Evidence and source provenance remain separate dimensions.</p><h2>Domains</h2></section><div class="grid three">${domainCards}</div><section class="prose"><h2>Browse other dimensions</h2><ul><li><a href="/ontology/topics/">All Topics</a></li><li><a href="/ontology/methods/">Methods</a></li><li><a href="/ontology/lenses/">Brali Lenses</a></li><li><a href="/life-os/areas/">Legacy Life Areas</a> — preserved for compatibility.</li></ul><h2>Compatibility rule</h2><p>Existing <code>/life-os/{zone}/</code> URLs are not renamed or deleted. Growth Zone is now a legacy collection label; every old zone maps to a Topic, Method, or Lens.</p></section>`
}));

for (const domain of ontology.domains) {
  const topics = ontology.topics.filter((topic) => topic.domain_id === domain.id);
  const cards = topics.map((topic) => entityCard("topic", topic)).join("");
  await save(`ontology/domains/${domain.id}`, document({
    title: domain.title,
    description: domain.description,
    pathname: `/ontology/domains/${domain.id}/`,
    schema: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${domain.title} | Brali ontology`, url: canonical(`/ontology/domains/${domain.id}/`) },
    body: `<p class="eyebrow"><a href="/ontology/">Ontology</a> · Domain</p><h1>${escapeHtml(domain.title)}</h1><p class="lead">${escapeHtml(domain.description)}</p><div class="grid three">${cards}</div>`
  }));
}

await save("ontology/topics", document({
  title: "Topics",
  description: "Concrete problems and capabilities in the Brali practical knowledge ontology.",
  pathname: "/ontology/topics/",
  schema: { "@context": "https://schema.org", "@type": "DefinedTermSet", name: "Brali Topics", url: canonical("/ontology/topics/") },
  body: `<p class="eyebrow"><a href="/ontology/">Ontology</a></p><h1>Topics</h1><p class="lead">Topics describe the problem or capability, not the branded method used to work on it. Empty topics are intentional research gaps rather than invented content.</p><div class="grid three">${ontology.topics.map((topic) => entityCard("topic", topic)).join("")}</div>`
}));

for (const topic of ontology.topics) {
  const domain = domainById.get(topic.domain_id);
  const mappedZones = zonesFor("topic", topic.id).map((slug) => zoneBySlug.get(slug));
  const mappedEntries = uniqueEntriesFor("topic", topic.id);
  const entriesList = mappedEntries.length ? `<ul class="article-list">${mappedEntries.map((entry) => `<li><a href="/life-os/${entry.slug}/">${escapeHtml(entry.title)}</a>${entry.description ? `<span>${escapeHtml(text(entry.description).slice(0, 180))}</span>` : ""}</li>`).join("")}</ul>` : `<div class="callout"><h3>Research gap</h3><p>This Topic is part of the target ontology but does not yet have a dedicated legacy collection. Research Scout and Taxonomy Curator can use it when new evidence or hacks justify coverage.</p></div>`;
  const legacy = mappedZones.length ? `<p><strong>Legacy collections:</strong> ${mappedZones.map((zone) => `<a href="/life-os/${zone.slug}/">${escapeHtml(zone.title)}</a>`).join(", ")}.</p>` : "";
  await save(`ontology/topics/${topic.id}`, document({
    title: topic.title,
    description: topic.description,
    pathname: `/ontology/topics/${topic.id}/`,
    schema: { "@context": "https://schema.org", "@type": "DefinedTerm", name: topic.title, description: topic.description, url: canonical(`/ontology/topics/${topic.id}/`), inDefinedTermSet: canonical("/ontology/topics/") },
    body: `<p class="eyebrow"><a href="/ontology/domains/${domain.id}/">${escapeHtml(domain.title)}</a> · Topic</p><h1>${escapeHtml(topic.title)}</h1><p class="lead">${escapeHtml(topic.description)}</p><section class="prose">${legacy}<p>Status: <strong>${escapeHtml(topic.status)}</strong>. ${mappedEntries.length} existing entries map here through the compatibility layer.</p></section>${entriesList}`
  }));
}

for (const [kind, items, intro] of [
  ["method", ontology.methods, "Methods are named structured approaches. They can cross Topics and Domains, and sensitive methods do not inherit scientific authority merely from having a name."],
  ["lens", ontology.lenses, "Lenses are ways of thinking borrowed from professions, disciplines, philosophies, or strategic traditions. They generate questions and structures; they are not evidence by themselves."]
]) {
  const plural = pluralFor(kind);
  await save(`ontology/${plural}`, document({
    title: kind === "method" ? "Methods" : "Brali Lenses",
    description: intro,
    pathname: `/ontology/${plural}/`,
    schema: { "@context": "https://schema.org", "@type": "DefinedTermSet", name: kind === "method" ? "Brali Methods" : "Brali Lenses", url: canonical(`/ontology/${plural}/`) },
    body: `<p class="eyebrow"><a href="/ontology/">Ontology</a></p><h1>${kind === "method" ? "Methods" : "Brali Lenses"}</h1><p class="lead">${escapeHtml(intro)}</p><div class="grid three">${items.map((item) => entityCard(kind, item)).join("")}</div>`
  }));
  for (const item of items) {
    const mappedZones = zonesFor(kind, item.id).map((slug) => zoneBySlug.get(slug));
    const mappedEntries = uniqueEntriesFor(kind, item.id);
    const legacy = mappedZones.length ? `<p><strong>Legacy collections:</strong> ${mappedZones.map((zone) => `<a href="/life-os/${zone.slug}/">${escapeHtml(zone.title)}</a>`).join(", ")}.</p>` : `<p>No legacy Growth Zone maps directly to this ${kind}; it is available for new knowledge records.</p>`;
    const entriesList = mappedEntries.length ? `<ul class="article-list">${mappedEntries.map((entry) => `<li><a href="/life-os/${entry.slug}/">${escapeHtml(entry.title)}</a>${entry.description ? `<span>${escapeHtml(text(entry.description).slice(0, 180))}</span>` : ""}</li>`).join("")}</ul>` : "";
    await save(`ontology/${plural}/${item.id}`, document({
      title: item.title,
      description: item.description,
      pathname: `/ontology/${plural}/${item.id}/`,
      schema: { "@context": "https://schema.org", "@type": "DefinedTerm", name: item.title, description: item.description, url: canonical(`/ontology/${plural}/${item.id}/`), inDefinedTermSet: canonical(`/ontology/${plural}/`) },
      body: `<p class="eyebrow"><a href="/ontology/${plural}/">${kind === "method" ? "Methods" : "Lenses"}</a> · ${kind === "method" ? "Method" : "Lens"}</p><h1>${escapeHtml(item.title)}</h1><p class="lead">${escapeHtml(item.description)}</p><section class="prose"><p>Status: <strong>${escapeHtml(item.status)}</strong>.</p>${legacy}<p>A ${kind} is an additional classification dimension. Future hacks and protocols should still identify the concrete Topic they address.</p></section>${entriesList}`
    }));
  }
}

// Re-label legacy collection pages without breaking their URLs.
for (const zone of zones) {
  const mapping = map[zone.slug];
  const label = mapping.kind === "topic" ? "Topic" : mapping.kind === "method" ? "Method" : "Lens";
  const targetUrl = `/ontology/${pluralFor(mapping.kind)}/${mapping.target_id}/`;
  const pagePath = path.join(root, "life-os", zone.slug, "index.html");
  let html = await readFile(pagePath, "utf8");
  html = html.replace('<p class="eyebrow">Growth Zone</p>', `<p class="eyebrow">${label} · Legacy collection</p>`);
  const marker = '<section class="prose"><h2>';
  if (html.includes(marker) && !html.includes('data-ontology-mapping="true"')) {
    html = html.replace(marker, `<div class="callout" data-ontology-mapping="true"><h3>New ontology</h3><p>This stable legacy collection now maps to the ${label.toLowerCase()} <a href="${targetUrl}">${escapeHtml((mapping.kind === "topic" ? topicById : mapping.kind === "method" ? methodById : lensById).get(mapping.target_id).title)}</a>.</p></div>${marker}`);
  }
  await writeFile(pagePath, html);
}

const libraryPath = path.join(root, "life-os/index.html");
let libraryHtml = await readFile(libraryPath, "utf8");
libraryHtml = libraryHtml.replace(`Browse ${entries.length} entries across ${zones.length} Growth Zones.`, `Browse ${entries.length} entries. The original ${zones.length} Growth Zone URLs remain stable while the new ontology separates Topics, Methods, and Lenses.`);
if (!libraryHtml.includes('data-ontology-entry="true"')) {
  libraryHtml = libraryHtml.replace('<div class="grid three">', '<div class="callout" data-ontology-entry="true"><h3>Browse the new knowledge model</h3><p>Start with a Domain and Topic, or explore Methods and Brali Lenses separately. Old Growth Zone links still work.</p><a class="button" href="/ontology/">Open ontology</a></div><div class="grid three">');
}
await writeFile(libraryPath, libraryHtml);

const legacyAreasPath = path.join(root, "life-os/areas/index.html");
let legacyAreasHtml = await readFile(legacyAreasPath, "utf8");
if (!legacyAreasHtml.includes('data-domain-migration="true"')) {
  legacyAreasHtml = legacyAreasHtml.replace('<div class="grid three">', '<div class="callout" data-domain-migration="true"><h3>Life Areas are now legacy navigation</h3><p>New knowledge records use <strong>Domains</strong> and <strong>Topics</strong>. This page remains available so existing links and older integrations continue to work.</p><a class="button" href="/ontology/">Browse Domains & Topics</a></div><div class="grid three">');
  await writeFile(legacyAreasPath, legacyAreasHtml);
}

const datasetRoot = path.join(root, "life-os/datasets");
await mkdir(datasetRoot, { recursive: true });
await cp(path.join(root, "data/knowledge-ontology.json"), path.join(datasetRoot, "ontology.json"));
const manifestPath = path.join(datasetRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "ontology.json"])];
manifest.ontology = { schema_version: ontology.schema_version, domains: ontology.domains.length, topics: ontology.topics.length, methods: ontology.methods.length, lenses: ontology.lenses.length, legacy_zones_mapped: Object.keys(map).length };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPage = path.join(datasetRoot, "index.html");
let datasetsHtml = await readFile(datasetsPage, "utf8");
if (!datasetsHtml.includes('/life-os/datasets/ontology.json')) {
  datasetsHtml = datasetsHtml.replace('</ul>', '<li><a href="/life-os/datasets/ontology.json">Knowledge ontology (JSON)</a></li></ul>');
  await writeFile(datasetsPage, datasetsHtml);
}

const sitemapPath = path.join(root, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
const urls = [
  "/ontology/", "/ontology/topics/", "/ontology/methods/", "/ontology/lenses/",
  ...ontology.domains.map((item) => `/ontology/domains/${item.id}/`),
  ...ontology.topics.map((item) => `/ontology/topics/${item.id}/`),
  ...ontology.methods.map((item) => `/ontology/methods/${item.id}/`),
  ...ontology.lenses.map((item) => `/ontology/lenses/${item.id}/`),
];
const extra = urls.filter((url) => !sitemap.includes(`<loc>${canonical(url)}</loc>`)).map((url) => `  <url><loc>${canonical(url)}</loc></url>`).join("\n");
if (extra) {
  sitemap = sitemap.replace("</urlset>", `${extra}\n</urlset>`);
  await writeFile(sitemapPath, sitemap);
}

console.log(`Knowledge ontology generated: ${ontology.domains.length} domains, ${ontology.topics.length} topics, ${ontology.methods.length} methods, ${ontology.lenses.length} lenses; ${Object.keys(map).length} legacy zones mapped.`);
