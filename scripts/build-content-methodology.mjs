import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const normalizations = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));
const claimDebt = JSON.parse(await readFile(path.join(root, "life-os/datasets/claim-debt.json"), "utf8"));
const knowledgeOntology = JSON.parse(await readFile(path.join(root, "data/knowledge-ontology.json"), "utf8"));
const counts = evidence.counts ?? {};
const claimCounts = claimDebt.counts ?? {};
const canonical = `${base}/life-os/methodology/`;
const topicTitleById = new Map((knowledgeOntology.topics ?? []).map(topic => [topic.id, topic.title]));

const claimCategoryRows = (claimDebt.category_definitions ?? []).map((category) => {
  const count = claimCounts.by_category?.[category.id] ?? 0;
  const mode = category.enforced ? "enforced" : "monitor-only";
  return `<li><strong>${category.id}</strong> · ${mode} · ${count} record${count === 1 ? "" : "s"}. ${category.description}</li>`;
}).join("");
const topicDebtRows = Object.entries(claimCounts.debt_by_topic ?? {})
  .sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))
  .slice(0, 12)
  .map(([topicId, count]) => `<li><strong>${topicTitleById.get(topicId) ?? topicId}</strong> · <code>${topicId}</code> · ${count} debt record${count === 1 ? "" : "s"}</li>`)
  .join("");
const topicDebtGroupCount = Object.keys(claimCounts.debt_by_topic ?? {}).length;

const body = `<p class="eyebrow">Content methodology</p><h1>Search-visible. Trust-labelled. Recommendation-gated.</h1><p class="lead">Every public Growth Library entry can be indexed, while evidence state independently controls whether Brali recommends it to people or AI agents.</p><section class="prose"><h2>The current quality model</h2><p>The library currently contains ${evidence.entries.length} entries. All ${indexing.indexable_count} public entries are included in the sitemap; ${indexing.trusted_recommendation_count} currently meet the trusted recommendation bar and ${indexing.review_required_count} remain review-gated.</p></section><div class="grid two"><article class="card"><span class="card-label">Reviewed · ${counts.reviewed ?? 0}</span><h3>Claims checked</h3><p>Evidence-like claims have traceable sources where required, and the practical guidance has completed editorial review.</p></article><article class="card"><span class="card-label">Practical · ${counts.practical ?? 0}</span><h3>Low-risk practice</h3><p>The entry is framed as practical guidance and does not contain evidence-like claims that require scientific support.</p></article><article class="card"><span class="card-label">Pending review · ${counts["pending-review"] ?? 0}</span><h3>Searchable, not recommended</h3><p>The public page is crawlable and evidence-labelled, but it stays outside normal trusted recommendations until review is complete.</p></article><article class="card"><span class="card-label">Restricted · ${counts.restricted ?? 0}</span><h3>Higher review bar</h3><p>Sensitive material remains visible for transparency and compatibility, with a clear safety boundary and no promotion into trusted recommendations.</p></article></div><section class="prose"><h2>Current claim debt</h2><p>The claim gate inspected ${claimCounts.records_checked ?? 0} records and found review markers in ${claimCounts.records_with_markers ?? 0}. ${claimCounts.debt_entries ?? 0} records currently carry unresolved claim debt. <strong>${claimCounts.indexable_debt_entries ?? 0} unresolved claim-debt records are eligible for trusted recommendation.</strong></p><p>Claim debt is a review queue, not a verdict that a statement is false. Enforced categories block normal trusted recommendation when review is incomplete; monitor-only categories remain visible so editors can inspect broad effect, mechanism, and research-language wording without pretending a regular expression can replace source review.</p><ul>${claimCategoryRows}</ul><h3>Topic-level debt</h3><p>Claim debt currently spans ${topicDebtGroupCount} mapped Topic${topicDebtGroupCount === 1 ? "" : "s"}. ${claimCounts.topic_pending_debt_entries ?? 0} debt record${claimCounts.topic_pending_debt_entries === 1 ? " remains" : "s remain"} without a canonical Topic assignment. Topic counts are editorial workload signals, not evidence-strength scores.</p>${topicDebtRows ? `<ul>${topicDebtRows}</ul>` : "<p>No mapped Topic debt is currently reported.</p>"}<p><a href="/life-os/datasets/claim-debt.json">Open the complete machine-readable claim-debt report →</a></p><h2>How an entry earns trusted recommendation</h2><ol><li>Start with a concrete action or protocol.</li><li>Detect evidence-like wording, quantitative claims, effect estimates, high-confidence causal assertions, first-party results, guarantees, clinical-outcome wording, and sensitive topics.</li><li>Record usable external sources when factual support is required.</li><li>Review exact wording and sources rather than treating a recorded link as proof.</li><li>Keep every public entry discoverable, but include only <strong>reviewed</strong> and <strong>practical</strong> entries in the Trusted Protocol Feed and normal AI recommendations.</li></ol><h2>Inherited corpus corrections</h2><p>The migrated corpus is preserved for provenance. When the same inherited claim appears across many entries, Brali can apply a reviewed editorial normalization before public pages and evidence states are generated. ${normalizations.rules.length} reviewed normalization rule${normalizations.rules.length === 1 ? " is" : "s are"} currently registered, affecting ${normalizations.changed_entries} source entr${normalizations.changed_entries === 1 ? "y" : "ies"} in this build.</p><p>These corrections are published with their rationale, review date, reviewer, source, and application count rather than silently rewriting the historical corpus.</p><h2>Health and mental health</h2><p>Brali's Growth Library is general educational material and a starting point for personal reflection. It is not medical diagnosis or treatment guidance. Sensitive entries receive a higher review bar and stay outside normal trusted recommendations until reviewed.</p><h2>Machine-readable transparency</h2><ul><li><a href="/life-os/datasets/protocols.json">Trusted Protocol Feed</a> — reviewed and low-risk practical protocols.</li><li><a href="/life-os/datasets/evidence.json">Evidence status index</a> — evidence state for the complete library.</li><li><a href="/life-os/datasets/review-queue.json">Review queue</a> — entries still awaiting editorial work.</li><li><a href="/life-os/datasets/claim-debt.json">Claim debt report</a> — claim categories, enforcement state, Topic aggregation, debt reasons, source presence, and review metadata.</li><li><a href="/life-os/datasets/indexing.json">Indexing policy output</a> — complete search visibility and the separate trusted-recommendation set.</li><li><a href="/life-os/datasets/editorial-normalizations.json">Editorial normalization register</a> — reviewed inherited-claim corrections and where they were applied.</li></ul><p>The static build fails if a public hack is missing from the sitemap, still carries <code>noindex</code>, loses its evidence state, or leaks a review-gated entry into the Trusted Protocol Feed.</p></section><div class="callout"><h3>Use the library as a starting point.</h3><p>Choose a relevant protocol, check its evidence state, try a small version in your own context, record what happened, and revise the practice based on your own signal.</p><a class="button" href="/life-os/">Back to the Growth Library</a></div>`;

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Brali Growth Library content methodology",
  description: "How Brali keeps public hacks search-visible while evidence state separately gates trusted recommendations for people and AI agents.",
  url: canonical,
  isPartOf: { "@type": "CollectionPage", name: "Brali LifeOS Growth Library", url: `${base}/life-os/` },
};

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Content methodology — Brali LifeOS</title><meta name="description" content="How Brali keeps public hacks search-visible while evidence state separately gates trusted recommendations for people and AI agents."><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="Content methodology — Brali LifeOS"><meta property="og:description" content="Complete public indexing with separate evidence-based recommendation gates for the Brali Growth Library."><meta property="og:url" content="${canonical}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali LifeOS"><span>Brali LifeOS</span></a><div class="links"><a href="/life-os/areas/">Life Areas</a><a href="/life-os/">Growth Library</a><a href="/life-os/datasets/">Datasets</a><a class="button yellow" href="/download/">Get Brali</a></div></nav></header><main id="content" class="page wrap">${body}</main><footer class="footer"><div class="wrap footer-row"><small>Brali LifeOS · Content methodology</small><div class="footer-links"><a href="/life-os/">Growth Library</a><a href="/privacy/">Privacy</a><a href="/support/">Support</a></div></div></footer></body></html>`;

const outputDir = path.join(root, "life-os/methodology");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "index.html"), html);

const libraryPath = path.join(root, "life-os/index.html");
let library = await readFile(libraryPath, "utf8");
if (!library.includes('/life-os/methodology/')) {
  library = library.replace('</h1>', '</h1><p class="meta"><a href="/life-os/methodology/">How content trust and indexing work</a></p>');
  await writeFile(libraryPath, library);
}

const sitemapPath = path.join(root, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
  sitemap = sitemap.replace('</urlset>', `  <url><loc>${canonical}</loc></url>\n</urlset>`);
  await writeFile(sitemapPath, sitemap);
}

console.log(`Content methodology page generated with ${indexing.indexable_count} search-visible, ${indexing.trusted_recommendation_count} trusted-recommendation eligible, ${indexing.review_required_count} review-gated, ${claimCounts.debt_entries ?? 0} claim-debt record(s), and ${topicDebtGroupCount} Topic debt group(s).`);
