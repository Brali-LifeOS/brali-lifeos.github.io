import fs from "node:fs";
import path from "node:path";
import { loadKnowledgeOntology } from "./lib/knowledge-ontology.mjs";

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
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();
const ids = (items = []) => new Set(items.map((item) => typeof item === "string" ? item : item?.id).filter(Boolean));
const overlap = (left, right) => [...left].filter((value) => right.has(value));

const candidateStatuses = new Set(["new", "screening", "watch", "support-existing", "challenge-existing"]);
const statusWeight = {
  "challenge-existing": 100,
  watch: 75,
  screening: 50,
  new: 45,
  "support-existing": 35,
};

function signalKind(candidate) {
  const title = text(candidate.title).toLowerCase();
  if (/\b(retract(?:ed|ion)?|withdrawn|withdrawal|expression of concern|erratum|correction)\b/i.test(title)) return "source-integrity-alert";
  if (candidate.status === "challenge-existing") return "challenge";
  if (candidate.status === "watch") return "watch";
  if (candidate.status === "support-existing") return "possible-support";
  return "discovery";
}

function reviewLike(candidate) {
  const title = text(candidate.title).toLowerCase();
  return /systematic review|meta[- ]analysis|umbrella review|scoping review/.test(title);
}

function priorityFor(candidate, bestMatchScore) {
  const kind = signalKind(candidate);
  let score = kind === "source-integrity-alert" ? 120 : (statusWeight[candidate.status] || 30);
  if (reviewLike(candidate)) score += 15;
  score += Math.min(15, (candidate.risk_flags || []).length * 5);
  score += Math.min(15, Math.floor((bestMatchScore || 0) / 20));
  const label = score >= 115 ? "critical-triage" : score >= 90 ? "high" : score >= 60 ? "medium" : "normal";
  return { score, label };
}

function suggestedAction(candidate) {
  const kind = signalKind(candidate);
  if (kind === "source-integrity-alert") return "Verify the source integrity notice against the publisher/primary record immediately. If it affects a cited or relied-on source, create an explicit lifecycle event after review.";
  if (candidate.status === "challenge-existing") return "Read and review the actual source. If the challenge is material to a current Brali claim, append a challenged/evidence-changed lifecycle event; do not change status from metadata alone.";
  if (candidate.status === "watch") return "Review the source when maintaining the affected hacks. Narrow wording or add a watch/review trigger only after the actual source is read.";
  if (candidate.status === "support-existing") return "Review the source before treating it as support. If it adds useful provenance, record an Evidence Decision and only then consider an evidence-added lifecycle event.";
  return "Screen the source for relevance and quality. Metadata discovery alone must not alter evidence or lifecycle state.";
}

const candidates = readJson(candidatesPath);
const decisions = readJson(decisionsPath);
const reviews = readJson(reviewsPath);
const index = readJson(indexPath);
if (!Array.isArray(candidates.candidates)) throw new Error("data/research-candidates.json must contain candidates[]");
if (!Array.isArray(decisions.entries)) throw new Error("data/evidence-decisions.json must contain entries[]");
if (!Array.isArray(reviews.entries) || !Array.isArray(reviews.unresolved_decision_targets)) throw new Error("life-os/datasets/reviews.json must be enriched before research lifecycle watchlist generation");
if (!Array.isArray(index)) throw new Error("data/life-os-content/index.json must be an array");

const reviewedCandidateIds = new Set(decisions.entries.map((entry) => entry.candidate_id).filter(Boolean));
const linkageDebt = reviews.unresolved_decision_targets.map((item) => ({ ...item, priority: "high", source_reviewed: true }));
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
  if (!candidateStatuses.has(candidate.status)) continue;
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
  const priority = priorityFor(candidate, affected[0].match_score);
  queue.push({
    candidate_id: candidate.id,
    workflow_status: candidate.status,
    signal_kind: signalKind(candidate),
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
    review_like_metadata: reviewLike(candidate),
    review_notes: candidate.review_notes || null,
    suggested_action: suggestedAction(candidate),
    affected_hacks: affected,
  });
}
queue.sort((a, b) => b.priority_score - a.priority_score || (b.publication_date || "").localeCompare(a.publication_date || "") || a.candidate_id.localeCompare(b.candidate_id));

const impacted = new Set(queue.flatMap((item) => item.affected_hacks.map((hack) => hack.slug)));
const watchlist = {
  schema_version: 1,
  generated_at: asOf,
  source: "research-candidates + effective Brali ontology + reviewed Evidence Decisions + lifecycle linkage debt",
  policy: "Discovery metadata may create a review task, never an evidence or lifecycle verdict. Candidates already covered by an Evidence Decision are excluded from the open metadata watchlist. Reviewed decisions whose historical target IDs no longer resolve are kept as explicit linkage debt and must not be guessed onto a current hack. Any lifecycle status change requires actual source review and an explicit append-only lifecycle event.",
  summary: {
    research_candidates: candidates.candidates.length,
    candidates_with_evidence_decisions: reviewedCandidateIds.size,
    open_watch_candidates: queue.length,
    impacted_hacks: impacted.size,
    critical_triage: queue.filter((item) => item.priority === "critical-triage").length,
    high_priority: queue.filter((item) => item.priority === "high").length,
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
  return `<li><strong>${escapeHtml(item.priority)} · ${escapeHtml(item.workflow_status)}</strong> — ${escapeHtml(item.title)}<span>${source}. Potentially related hacks: ${targets}. ${escapeHtml(item.suggested_action)}</span></li>`;
}).join("") : "<li>No unresolved research candidates currently map strongly enough to an existing hack.</li>";
const debtItems = linkageDebt.length
  ? linkageDebt.map((item) => `<li><strong>${escapeHtml(item.decision_id)}</strong> → <code>${escapeHtml(item.target_hack_id)}</code><span>${item.source_url ? `<a href="${escapeHtml(item.source_url)}" rel="noopener noreferrer">Reviewed source</a>. ` : ""}${escapeHtml(item.required_action)}</span></li>`).join("")
  : "<li>No reviewed Evidence Decision target currently has unresolved canonical identity.</li>";
const body = `<p class="eyebrow">Research triage</p><h1>Research lifecycle watchlist.</h1><p class="lead">A discovery queue for maintainers. It identifies research leads that may justify re-checking existing hacks, but it deliberately does not change evidence or lifecycle status.</p><aside class="callout"><h2>Metadata is not a verdict</h2><p>Every discovery item below still requires the actual source to be read. A title, abstract record, Crossref entry, Europe PMC record, or automated match cannot refute, validate, downgrade, or restore a Brali hack.</p></aside><div class="grid three"><article class="card"><span class="card-label">Open watch candidates</span><h3>${queue.length}</h3><p>Unresolved metadata leads with a meaningful ontology match.</p></article><article class="card"><span class="card-label">Potentially affected hacks</span><h3>${impacted.size}</h3><p>Unique hacks surfaced for human review, not automatically changed.</p></article><article class="card"><span class="card-label">Reviewed linkage debt</span><h3>${linkageDebt.length}</h3><p>Reviewed decisions whose historical target hack IDs no longer resolve to the current corpus.</p></article></div><section class="prose"><h2>Reviewed linkage debt</h2><p>This is not unreviewed evidence. The source review already exists, but its historical target identity cannot be attached to a current hack without explicit provenance. Do not guess a replacement slug.</p><ul class="article-list">${debtItems}</ul><h2>Highest-priority review leads</h2><ul class="article-list">${items}</ul><h2>How priority works</h2><p>Priority starts from the editorial candidate workflow state, then adds narrow signals for possible source-integrity notices, review/meta-analysis titles, risk flags and strength of Topic/Method matching. The score schedules attention; it is not an evidence score.</p><p><a class="button" href="/life-os/datasets/research-lifecycle-watchlist.json">Machine-readable watchlist</a> <a class="button" href="/life-os/review-log/">Lifecycle review log</a></p></section>`;
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

console.log(`research_lifecycle_watchlist open=${queue.length} impacted_hacks=${impacted.size} reviewed_candidates=${reviewedCandidateIds.size} linkage_debt=${linkageDebt.length} critical=${watchlist.summary.critical_triage} high=${watchlist.summary.high_priority}`);
