import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const ontology = JSON.parse(await readFile(path.join(root, "data/knowledge-ontology.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const candidates = JSON.parse(await readFile(path.join(root, "data/research-candidates.json"), "utf8"));
const records = evidence.entries ?? [];

const byId = (items) => new Map(items.map((item) => [item.id, item]));
const domainById = byId(ontology.domains);
const topicById = byId(ontology.topics);
const methodById = byId(ontology.methods);
const lensById = byId(ontology.lenses);
const percent = (part, total) => total ? Math.round((part / total) * 1000) / 10 : 0;

const topicMapped = records.filter((record) => record.ontology?.topics?.length).length;
const topicPendingRecords = records.filter((record) => record.ontology?.classification_status === "topic-pending");
const methodTagged = records.filter((record) => record.ontology?.methods?.length).length;
const lensTagged = records.filter((record) => record.ontology?.lenses?.length).length;
const domainMapped = records.filter((record) => record.ontology?.domains?.length).length;
const trustedTopicPending = (protocols.entries ?? [])
  .filter((protocol) => protocol.ontology?.classification_status === "topic-pending")
  .map((protocol) => ({
    slug: protocol.slug,
    title: protocol.title,
    url: protocol.url,
    action: protocol.action,
    domain_ids: (protocol.ontology?.domains ?? []).map((item) => item.id),
    method_ids: (protocol.ontology?.methods ?? []).map((item) => item.id),
    lens_ids: (protocol.ontology?.lenses ?? []).map((item) => item.id),
    legacy_growth_zone_slug: protocol.ontology?.legacy?.growth_zone_slug ?? protocol.growth_zone?.slug ?? null,
    evidence_status: protocol.evidence?.status ?? null
  }))
  .sort((a, b) => a.title.localeCompare(b.title));

const countEntities = (kind) => {
  const counts = new Map();
  for (const record of records) for (const item of record.ontology?.[kind] ?? []) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return counts;
};
const domainCounts = countEntities("domains");
const topicCounts = countEntities("topics");
const methodCounts = countEntities("methods");
const lensCounts = countEntities("lenses");

const pendingByZone = new Map();
for (const record of topicPendingRecords) {
  const zone = record.ontology?.legacy?.growth_zone_slug ?? "unknown";
  const current = pendingByZone.get(zone) ?? { zone_slug: zone, entries: 0, trusted: 0 };
  current.entries += 1;
  if (record.indexable) current.trusted += 1;
  pendingByZone.set(zone, current);
}
const unresolvedCollections = [...pendingByZone.values()].map((item) => {
  const mapping = ontology.legacy_zone_map[item.zone_slug];
  const registry = mapping?.kind === "method" ? methodById : mapping?.kind === "lens" ? lensById : null;
  const target = registry?.get(mapping?.target_id);
  return { ...item, kind: mapping?.kind ?? "unknown", target_id: mapping?.target_id ?? null, target_title: target?.title ?? null };
}).sort((a, b) => b.entries - a.entries || a.zone_slug.localeCompare(b.zone_slug));

const domains = ontology.domains.map((item) => ({ id: item.id, title: item.title, entries: domainCounts.get(item.id) ?? 0 }));
const topics = ontology.topics.map((item) => ({ id: item.id, title: item.title, domain_id: item.domain_id, status: item.status, entries: topicCounts.get(item.id) ?? 0, research_candidates: (candidates.candidates ?? []).filter((candidate) => candidate.topic_ids?.includes(item.id)).length }));
const methods = ontology.methods.map((item) => ({ id: item.id, title: item.title, status: item.status, entries: methodCounts.get(item.id) ?? 0, research_candidates: (candidates.candidates ?? []).filter((candidate) => candidate.method_ids?.includes(item.id)).length }));
const lenses = ontology.lenses.map((item) => ({ id: item.id, title: item.title, status: item.status, entries: lensCounts.get(item.id) ?? 0, research_candidates: (candidates.candidates ?? []).filter((candidate) => candidate.lens_ids?.includes(item.id)).length }));
const growthGaps = topics.filter((item) => item.status === "growth-gap").sort((a, b) => (a.entries - b.entries) || a.title.localeCompare(b.title));

const report = {
  schema_version: 2,
  name: "Brali Ontology Coverage",
  generated_from: "evidence index + trusted protocol feed + research candidate queue",
  summary: {
    library_entries: records.length,
    trusted_protocols: protocols.count ?? 0,
    domain_mapped: domainMapped,
    topic_mapped: topicMapped,
    topic_pending: topicPendingRecords.length,
    trusted_topic_pending: trustedTopicPending.length,
    topic_coverage_percent: percent(topicMapped, records.length),
    method_tagged: methodTagged,
    lens_tagged: lensTagged,
    research_candidates: (candidates.candidates ?? []).length,
    growth_gap_topics: growthGaps.length
  },
  migration_rule: "topic-pending is deliberate: a legacy Method or Lens collection provides a useful secondary classification but cannot honestly determine the concrete Topic for every contained entry.",
  domains,
  topics,
  methods,
  lenses,
  trusted_topic_pending: trustedTopicPending,
  unresolved_legacy_collections: unresolvedCollections,
  growth_gap_topics: growthGaps
};

const datasetRoot = path.join(root, "life-os/datasets");
await mkdir(datasetRoot, { recursive: true });
await writeFile(path.join(datasetRoot, "ontology-coverage.json"), JSON.stringify(report, null, 2));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const cards = `<div class="grid three"><article class="card"><span class="card-label">Library</span><h3>${records.length} entries</h3><p>${topicMapped} have a concrete Topic; ${topicPendingRecords.length} still require Topic classification.</p></article><article class="card"><span class="card-label">Coverage</span><h3>${report.summary.topic_coverage_percent}% Topic-mapped</h3><p>Every entry has a Domain and at least one semantic classification from the compatibility layer.</p></article><article class="card"><span class="card-label">Trusted triage</span><h3>${trustedTopicPending.length} trusted records pending</h3><p>These already appear in the recommendation feed, so they are the first Topic-classification backlog.</p></article></div>`;
const trustedRows = trustedTopicPending.map((item) => `<tr><td><a href="/life-os/${escapeHtml(item.slug)}/">${escapeHtml(item.title)}</a></td><td>${escapeHtml(item.legacy_growth_zone_slug || "—")}</td><td>${escapeHtml([...item.method_ids, ...item.lens_ids].join(", ") || "—")}</td><td>${escapeHtml(item.evidence_status || "—")}</td></tr>`).join("");
const pendingRows = unresolvedCollections.map((item) => `<tr><td><a href="/life-os/${escapeHtml(item.zone_slug)}/">${escapeHtml(item.zone_slug)}</a></td><td>${escapeHtml(item.kind)}</td><td>${item.target_id ? `<a href="/ontology/${item.kind === "method" ? "methods" : "lenses"}/${escapeHtml(item.target_id)}/">${escapeHtml(item.target_title || item.target_id)}</a>` : "—"}</td><td>${item.entries}</td><td>${item.trusted}</td></tr>`).join("");
const gapRows = growthGaps.map((item) => `<tr><td><a href="/ontology/topics/${escapeHtml(item.id)}/">${escapeHtml(item.title)}</a></td><td>${escapeHtml(domainById.get(item.domain_id)?.title || item.domain_id)}</td><td>${item.entries}</td><td>${item.research_candidates}</td></tr>`).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ontology coverage — Brali</title><meta name="description" content="Track Brali ontology migration coverage, unresolved legacy collections, and research growth gaps."><link rel="canonical" href="${base}/ontology/coverage/"><link rel="stylesheet" href="/styles.css"></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/ontology/">Ontology</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow"><a href="/ontology/">Ontology</a> · Coverage</p><h1>Measure the migration instead of pretending it is finished.</h1><p class="lead">Brali keeps legacy URLs stable while moving toward Domain → Topic → Hack → Protocol. This page shows which parts are already semantically classified and which still need editorial work.</p>${cards}<section class="prose"><h2>Trusted records needing Topic classification</h2><p>These protocols already meet the public trust/indexing bar. They are resolved before bulk legacy content because recommendation systems can already return them.</p><table><thead><tr><th>Protocol</th><th>Legacy zone</th><th>Method / Lens</th><th>Evidence</th></tr></thead><tbody>${trustedRows}</tbody></table><h2>Why Topic coverage is not 100%</h2><p>A legacy collection such as CBT or Quality Assurance identifies a Method or Lens, not the concrete user problem of every entry inside it. Brali marks those entries <code>topic-pending</code> rather than manufacturing a false Topic.</p><p><a href="/life-os/datasets/ontology-coverage.json">Open machine-readable coverage report →</a></p><h2>Legacy collections needing Topic classification</h2><table><thead><tr><th>Legacy collection</th><th>Type</th><th>Mapped entity</th><th>Entries</th><th>Trusted</th></tr></thead><tbody>${pendingRows}</tbody></table><h2>Growth-gap Topics</h2><p>These are deliberate targets for research and curation. Zero entries means Brali has named the gap but has not invented filler content for it.</p><table><thead><tr><th>Topic</th><th>Domain</th><th>Entries</th><th>Research candidates</th></tr></thead><tbody>${gapRows}</tbody></table></section></main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Practical knowledge for people and machines.</small></div></div></footer></body></html>`;
await mkdir(path.join(root, "ontology/coverage"), { recursive: true });
await writeFile(path.join(root, "ontology/coverage/index.html"), html);

const ontologyHubPath = path.join(root, "ontology/index.html");
let ontologyHub = await readFile(ontologyHubPath, "utf8");
if (!ontologyHub.includes('data-ontology-coverage="true"')) {
  ontologyHub = ontologyHub.replace('<h2>Browse other dimensions</h2>', `<div class="callout" data-ontology-coverage="true"><h3>Ontology coverage</h3><p>${report.summary.topic_coverage_percent}% of current library entries have a concrete Topic. Track unresolved legacy collections and deliberate growth gaps instead of hiding migration debt.</p><a class="button" href="/ontology/coverage/">Open coverage report</a></div><h2>Browse other dimensions</h2>`);
  await writeFile(ontologyHubPath, ontologyHub);
}

const manifestPath = path.join(datasetRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "ontology-coverage.json"])];
manifest.ontology_coverage = report.summary;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPage = path.join(datasetRoot, "index.html");
let datasetsHtml = await readFile(datasetsPage, "utf8");
if (!datasetsHtml.includes("ontology-coverage.json")) {
  datasetsHtml = datasetsHtml.replace("</ul>", '<li><a href="/life-os/datasets/ontology-coverage.json">Ontology coverage (JSON)</a></li></ul>');
  await writeFile(datasetsPage, datasetsHtml);
}

const sitemapPath = path.join(root, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
if (!sitemap.includes(`${base}/ontology/coverage/`)) {
  sitemap = sitemap.replace("</urlset>", `  <url><loc>${base}/ontology/coverage/</loc></url>\n</urlset>`);
  await writeFile(sitemapPath, sitemap);
}

console.log(`Ontology coverage generated: ${topicMapped}/${records.length} Topic-mapped; ${topicPendingRecords.length} pending; ${trustedTopicPending.length} trusted pending; ${growthGaps.length} growth-gap Topics.`);
for (const item of trustedTopicPending) console.log(`TOPIC_PENDING_TRUSTED ${item.slug} | ${item.legacy_growth_zone_slug} | ${item.title}`);
