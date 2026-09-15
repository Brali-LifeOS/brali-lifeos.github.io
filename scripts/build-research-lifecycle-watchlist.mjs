import fs from "node:fs";
import path from "node:path";
import { loadKnowledgeOntology } from "./lib/knowledge-ontology.mjs";
import {
  openResearchWorkflowStates,
  researchSignalKind,
  researchReviewClass,
  researchPriority,
  suggestedResearchAction,
} from "./lib/research-triage.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const asOf = process.env.BRALI_AS_OF || new Date().toISOString().slice(0, 10);
const candidatesPath = path.join(root, "data", "research-candidates.json");
const decisionsPath = path.join(root, "data", "evidence-decisions.json");
const reviewsPath = path.join(root, "life-os", "datasets", "reviews.json");
const indexPath = path.join(root, "data", "life-os-content", "index.json");
const outputPath = path.join(root, "life-os", "datasets", "research-lifecycle-watchlist.json");
const pagePath = path.join(root, "research", "review-watchlist", "index.html");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const ids = (items = []) => new Set(items.map((item) => typeof item === "string" ? item : item?.id).filter(Boolean));
const overlap = (left, right) => [...left].filter((value) => right.has(value));

const candidates = readJson(candidatesPath);
const decisions = readJson(decisionsPath);
const reviews = readJson(reviewsPath);
const index = readJson(indexPath);
if (!Array.isArray(candidates.candidates)) throw new Error("data/research-candidates.json must contain candidates[]");
if (!Array.isArray(decisions.entries)) throw new Error("data/evidence-decisions.json must contain entries[]");
if (!Array.isArray(reviews.entries) || !Array.isArray(reviews.unresolved_decision_targets) || !Array.isArray(reviews.resolved_decision_targets)) {
  throw new Error("life-os/datasets/reviews.json must be identity-resolved before research lifecycle watchlist generation");
}
if (!Array.isArray(index)) throw new Error("data/life-os-content/index.json must be an array");

const reviewedCandidateIds = new Set(decisions.entries.map((entry) => entry.candidate_id).filter(Boolean));
const linkageDebt = reviews.unresolved_decision_targets.map((item) => ({ ...item, priority: "high", source_reviewed: true }));
const resolvedHistoricalTargetIds = new Set(reviews.resolved_decision_targets.map((item) => item.target_hack_id));
const { classifyRecord } = await loadKnowledgeOntology(root);
const hackClassifications = [];
for (const entry of index) {
  const articlePath = path.join(root, "data", "life-os-content", `${entry.slug}.json`);
  const article = readJson(articlePath);
  const classification = classifyRecord(article, entry.zone.slug, entry.slug);
  hackClassifications.push({
    slug: entry.slug,
    title: entry.title,
    zone: entry.zone.slug,
    domains: ids(classification.domains),
    topics: ids(classification.topics),
    methods: ids(classification.methods),
    lenses: ids(classification.lenses),
  });
}

const queue = [];
for (const candidate of candidates.candidates) {
  if (!openResearchWorkflowStates.has(candidate.status)) continue;
  if (reviewedCandidateIds.has(candidate.id)) continue;

  const candidateTopics = ids(candidate.topic_ids || []);
  const candidateMethods = ids(candidate.method_ids || []);
  const candidateDomains = ids(candidate.domain_ids || []);
  const candidateLenses = ids(candidate.lens_ids || []);
  const candidateZones = ids(candidate.zone_slugs || []);
  const hasStrongTaxonomy = candidateTopics.size > 0 || candidateMethods.size > 0;
  const matches = [];

  for (const hack of hackClassifications) {
    const topics = overlap(candidateTopics, hack.topics);
    const methods = overlap(candidateMethods, hack.methods);
    const domains = overlap(candidateDomains, hack.domains);
    const lenses = overlap(candidateLenses, hack.lenses);
    const zone = candidateZones.has(hack.zone) ? [hack.zone] : [];
    const score = topics.length * 50 + methods.length * 35 + domains.length * 12 + lenses.length * 5 + zone.length * 8;
    const strong = topics.length > 0 || methods.length > 0;
    if (hasStrongTaxonomy ? !strong : score < 12) continue;
    matches.push({
      slug: hack.slug,
      title: hack.title,
      url: `${base}/life-os/${hack.slug}/`,
      match_score: score,
      matched: { topic_ids: topics, method_ids: methods, domain_ids: domains, lens_ids: lenses, zone_slugs: zone },
    });
  }

  matches.sort((a, b) => b.match_score - a.match_score || a.slug.localeCompare(b.slug));
  const affected = matches.slice(0, 12);
  if (!affected.length) continue;
  const priority = researchPriority(candidate, { bestMatchScore: affected[0].match_score });
  const reviewClass = researchReviewClass(candidate);
  queue.push({
    candidate_id: candidate.id,
    workflow_status: candidate.status,
    signal_kind: researchSignalKind(candidate),
    review_class: reviewClass,
    priority: priority.label,
    priority_score: priority.score,
    source_review_required: true,
    title: candidate.title,
    publication_date: candidate.publication_date || null,
    reference_url: candidate.reference_url || null,
    doi: candidate.doi || null,
    pmid: candidate.pmid || null,
    source_provider: candidate.source || null,
    query_ids: candidate.query_ids || [],
    risk_flags: candidate.risk_flags || [],
    review_like_metadata: Boolean(reviewClass),
    review_notes: candidate.review_notes || null,
    suggested_action: suggestedResearchAction(candidate),
    affected_hacks: affected,
  });
}
queue.sort((a, b) => b.priority_score - a.priority_score || (b.publication_date || "").localeCompare(a.publication_date || "") || a.candidate_id.localeCompare(b.candidate_id));

const impacted = new Set(queue.flatMap((item) => item.affected_hacks.map((hack) => hack.slug)));
const watchlist = {
  schema_version: 1,
  generated_at: asOf,
  source: "research-candidates + effective Brali ontology + reviewed Evidence Decisions + governed identity dispositions",
  policy: "Discovery metadata may create a review task, never an evidence or lifecycle verdict. Candidates already covered by an Evidence Decision are excluded from the open metadata watchlist. Historical target identities are resolved only through explicit provenance; unresolved identities remain debt and are never guessed onto a current hack. Any lifecycle status change requires actual source review and an explicit append-only lifecycle event.",
  summary: {
    research_candidates: candidates.candidates.length,
    candidates_with_evidence_decisions: reviewedCandidateIds.size,
    open_watch_candidates: queue.length,
    impacted_hacks: impacted.size,
    source_integrity_alerts: queue.filter((item) => item.signal_kind === "source-integrity-alert").length,
    strong_review_leads: queue.filter((item) => item.review_class === "strong-review-lead").length,
    critical_triage: queue.filter((item) => item.priority === "critical-triage").length,
    high_priority: queue.filter((item) => item.priority === "high").length,
    resolved_historical_target_relations: reviews.resolved_decision_targets.length,
    resolved_historical_target_ids: resolvedHistoricalTargetIds.size,
    reviewed_linkage_debt: linkageDebt.length,
  },
  reviewed_linkage_debt: linkageDebt,
  candidates: queue,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(watchlist, null, 2)}\n`);

const templatePath = path.join(root, "life-os", "about", "index.html");
if (!fs.existsSync(templatePath)) throw new Error("Research watchlist requires life-os/about/index.html as a branded template");
const top = queue.slice(0, 40);
const items = top.length ? top.map((item) => {
  const targets = item.affected_hacks.slice(0, 5).map((hack) => `<a href="/life-os/${escapeHtml(hack.slug)}/">${escapeHtml(hack.title)}</a>`).join(" · ");
  const source = item.reference_url ? `<a href="${escapeHtml(item.reference_url)}" rel="noopener noreferrer">source record</a>` : "source record unavailable";
  const review = item.review_class ? ` · ${escapeHtml(item.review_class)}` : "";
  return `<li><strong>${escapeHtml(item.priority)} · ${escapeHtml(item.workflow_status)}${review}</strong> — ${escapeHtml(item.title)}<span>${source}. Potentially related hacks: ${targets}. ${escapeHtml(item.suggested_action)}</span></li>`;
}).join("") : "<li>No unresolved research candidates currently map strongly enough to an existing hack.</li>";
const identityCopy = linkageDebt.length
  ? `<p><strong>${linkageDebt.length}</strong> reviewed decision-target relation(s) still lack a proven canonical identity. They remain explicit debt and are not guessed onto current hacks.</p>`
  : `<p>Historical target identity debt is closed: ${reviews.resolved_decision_targets.length} reviewed decision-target relation(s) across ${resolvedHistoricalTargetIds.size} historical handle(s) have explicit provenance dispositions. A never-published review target is preserved as such rather than being attached to a similar current hack.</p>`;
const body = `<p class="eyebrow">Research triage</p><h1>Research lifecycle watchlist.</h1><p class="lead">A discovery queue for maintainers. It identifies research leads that may justify re-checking existing hacks, but it deliberately does not change evidence or lifecycle status.</p><aside class="callout"><h2>Metadata is not a verdict</h2><p>Every discovery item below still requires the actual source to be read. A title, abstract record, Crossref entry, Europe PMC record, or automated match cannot refute, validate, downgrade, or restore a Brali hack.</p></aside><div class="grid three"><article class="card"><span class="card-label">Open watch candidates</span><h3>${queue.length}</h3><p>Unresolved metadata leads with a meaningful ontology match.</p></article><article class="card"><span class="card-label">Potentially affected hacks</span><h3>${impacted.size}</h3><p>Unique hacks surfaced for human review, not automatically changed.</p></article><article class="card"><span class="card-label">Historical identity debt</span><h3>${linkageDebt.length}</h3><p>${linkageDebt.length ? "Unresolved reviewed target mappings." : "No unresolved reviewed target mappings."}</p></article></div><section class="prose"><h2>Historical target identities</h2>${identityCopy}<p><a href="/life-os/datasets/reviews.json">Inspect lifecycle identity dispositions in the review dataset</a>.</p><h2>Highest-priority review leads</h2><ul class="article-list">${items}</ul><h2>How priority works</h2><p>Scout and public watchlist use the same triage contract. Priority starts from the editorial candidate workflow state, then adds narrow signals for source-integrity notices, systematic/meta/umbrella review metadata, risk flags and, on this page, strength of Topic/Method matching. The score schedules attention; it is not an evidence score.</p><p><a class="button" href="/life-os/datasets/research-lifecycle-watchlist.json">Machine-readable watchlist</a> <a class="button" href="/life-os/review-log/">Lifecycle review log</a></p></section>`;
let html = fs.readFileSync(templatePath, "utf8");
html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>Research lifecycle watchlist — Brali</title>");
html = html.replace(/<meta name="description" content="[^"]*">/i, '<meta name="description" content="Discovery-only research triage for Brali hacks. Metadata can trigger source review but cannot change evidence or lifecycle status.">');
html = html.replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${base}/research/review-watchlist/">`);
html = html.replace(/<meta property="og:title" content="[^"]*">/i, '<meta property="og:title" content="Research lifecycle watchlist">');
html = html.replace(/<meta property="og:description" content="[^"]*">/i, '<meta property="og:description" content="Discovery-only research triage. Actual source review is required before any evidence or lifecycle conclusion.">');
html = html.replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${base}/research/review-watchlist/">`);
const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Research lifecycle watchlist",
  description: "Discovery-only research triage. Metadata can schedule review but cannot change Brali evidence or lifecycle status.",
  url: `${base}/research/review-watchlist/`,
  isPartOf: { "@type": "WebSite", name: "Brali", url: `${base}/` },
};
if (/<script type="application\/ld\+json">[\s\S]*?<\/script>/i.test(html)) {
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`);
} else {
  html = html.replace("</head>", `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script></head>`);
}
if (/<meta\b(?=[^>]*name=["']robots["'])[^>]*>/i.test(html)) html = html.replace(/<meta\b(?=[^>]*name=["']robots["'])[^>]*>/i, '<meta name="robots" content="noindex,follow">');
else html = html.replace("</head>", '<meta name="robots" content="noindex,follow"></head>');
if (!/<main id="content" class="page wrap">[\s\S]*?<\/main>/i.test(html)) throw new Error("Research watchlist template is missing the expected main element");
html = html.replace(/<main id="content" class="page wrap">[\s\S]*?<\/main>/i, `<main id="content" class="page wrap">${body}</main>`);
fs.mkdirSync(path.dirname(pagePath), { recursive: true });
fs.writeFileSync(pagePath, html);

console.log(`research_lifecycle_watchlist open=${queue.length} impacted_hacks=${impacted.size} reviewed_candidates=${reviewedCandidateIds.size} resolved_historical_relations=${reviews.resolved_decision_targets.length} linkage_debt=${linkageDebt.length} integrity=${watchlist.summary.source_integrity_alerts} strong_reviews=${watchlist.summary.strong_review_leads} critical=${watchlist.summary.critical_triage} high=${watchlist.summary.high_priority}`);
