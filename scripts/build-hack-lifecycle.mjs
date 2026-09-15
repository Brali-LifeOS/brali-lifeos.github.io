import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");
const contentRoot = path.join(dataRoot, "life-os-content");
const siteRoot = path.join(root, "life-os");
const registryPath = path.join(dataRoot, "hack-review-events.json");
const indexPath = path.join(contentRoot, "index.json");
const asOf = process.env.BRALI_AS_OF || new Date().toISOString().slice(0, 10);
const markerStart = "<!-- brali-hack-lifecycle:start -->";
const markerEnd = "<!-- brali-hack-lifecycle:end -->";

const allowedStatuses = new Set(["active", "reviewed", "watch", "needs-review", "contested", "refuted", "retired"]);
const allowedTypes = new Set(["reviewed", "evidence-added", "evidence-changed", "observation", "challenged", "refuted", "restored", "retired", "note"]);
const materialTypes = new Set(["evidence-changed", "challenged", "refuted", "restored"]);
const explicitTransitionTypes = new Set(["evidence-changed", "challenged", "refuted", "restored", "retired"]);
const terminalStatuses = new Set(["contested", "refuted", "retired"]);
const supportedEventFields = new Set(["id", "slug", "date", "type", "summary", "summary_i18n", "actor", "evidence_refs", "status_after", "review_after"]);

const statusCopy = {
  active: ["Active", "Published without a later explicit lifecycle conclusion."],
  reviewed: ["Reviewed", "An editorial or evidence review is recorded and no later event changes that conclusion."],
  watch: ["Watch", "Still usable, but a known uncertainty or fast-changing area deserves monitoring."],
  "needs-review": ["Needs review", "The current conclusion should be re-checked before it is treated as fresh."],
  contested: ["Contested", "Material evidence or reasoning challenges the current recommendation and the issue is unresolved."],
  refuted: ["Refuted", "The central recommendation is no longer supported strongly enough to present as current guidance."],
  retired: ["Retired", "Kept for provenance, but no longer maintained as an active recommendation."],
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function text(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function compareEvents(a, b) {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

function evidenceReference(ref) {
  const safe = escapeHtml(ref);
  return /^https:\/\//i.test(ref) ? `<a href="${safe}" rel="noopener noreferrer">${safe}</a>` : `<code>${safe}</code>`;
}

function validateRegistry(registry, knownSlugs) {
  if (!registry || registry.schema_version !== 1 || !Array.isArray(registry.events)) {
    throw new Error("data/hack-review-events.json must use schema_version 1 with an events array");
  }
  const seenIds = new Set();
  for (const event of registry.events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Hack review event must be an object");
    const unknown = Object.keys(event).filter((key) => !supportedEventFields.has(key));
    if (unknown.length) throw new Error(`${event.id || "unknown event"}: unsupported fields: ${unknown.join(", ")}`);
    if (!/^[a-z0-9][a-z0-9._:-]{5,}$/i.test(event.id || "")) throw new Error(`Invalid hack review event id: ${event.id}`);
    if (seenIds.has(event.id)) throw new Error(`Duplicate hack review event id: ${event.id}`);
    seenIds.add(event.id);
    if (!knownSlugs.has(event.slug)) throw new Error(`${event.id}: unknown hack slug ${event.slug}`);
    if (!validDate(event.date)) throw new Error(`${event.id}: date must be YYYY-MM-DD`);
    if (!allowedTypes.has(event.type)) throw new Error(`${event.id}: unsupported event type ${event.type}`);
    if (typeof event.summary !== "string" || text(event.summary).length < 20) throw new Error(`${event.id}: summary must contain at least 20 characters`);
    if (event.status_after && !allowedStatuses.has(event.status_after)) throw new Error(`${event.id}: invalid status_after ${event.status_after}`);
    if (explicitTransitionTypes.has(event.type) && !event.status_after) throw new Error(`${event.id}: ${event.type} requires status_after`);
    if (event.type === "observation" && event.status_after) throw new Error(`${event.id}: observations cannot change evidence/lifecycle status`);
    if (materialTypes.has(event.type) && (!Array.isArray(event.evidence_refs) || !event.evidence_refs.length)) {
      throw new Error(`${event.id}: ${event.type} requires at least one evidence reference`);
    }
    if (event.evidence_refs && (!Array.isArray(event.evidence_refs) || event.evidence_refs.some((ref) => typeof ref !== "string" || !text(ref)))) {
      throw new Error(`${event.id}: evidence_refs must be non-empty strings`);
    }
    if (event.review_after && !validDate(event.review_after)) throw new Error(`${event.id}: review_after must be YYYY-MM-DD`);
    if (event.summary_i18n) {
      if (typeof event.summary_i18n !== "object" || Array.isArray(event.summary_i18n)) throw new Error(`${event.id}: summary_i18n must be an object`);
      for (const [locale, summary] of Object.entries(event.summary_i18n)) {
        if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) || typeof summary !== "string" || text(summary).length < 10) {
          throw new Error(`${event.id}: invalid localized summary for ${locale}`);
        }
      }
    }
    if (event.type === "challenged" && !new Set(["contested", "needs-review"]).has(event.status_after)) throw new Error(`${event.id}: challenged must lead to contested or needs-review`);
    if (event.type === "refuted" && event.status_after !== "refuted") throw new Error(`${event.id}: refuted event must lead to refuted status`);
    if (event.type === "retired" && event.status_after !== "retired") throw new Error(`${event.id}: retired event must lead to retired status`);
    if (event.type === "restored" && !new Set(["active", "reviewed", "watch"]).has(event.status_after)) throw new Error(`${event.id}: restored must lead to active, reviewed, or watch`);
  }
}

function legacyEvent(article) {
  const curation = article.editorialCuration;
  if (!curation?.reviewedAt || !validDate(curation.reviewedAt)) return null;
  return {
    id: `legacy:${article.slug}:${curation.reviewedAt}`,
    slug: article.slug,
    date: curation.reviewedAt,
    type: "reviewed",
    summary: text(curation.reason) || "Editorial review recorded in the source content provenance.",
    actor: text(curation.reviewedBy) || "Brali editorial review",
    status_after: "reviewed",
    provenance: text(curation.registry) || "editorialCuration",
    evidence_status: text(curation.evidenceStatus) || undefined,
    legacy: true,
  };
}

function deriveState(legacy, events) {
  let status = legacy ? "reviewed" : "active";
  let statusSource = legacy ? legacy.id : "source-default";
  let reviewAfter = null;
  const history = [...(legacy ? [legacy] : []), ...events].sort(compareEvents);

  for (const event of events) {
    if (event.type === "reviewed" && !event.status_after) {
      status = "reviewed";
      statusSource = event.id;
    }
    if (event.status_after) {
      status = event.status_after;
      statusSource = event.id;
    }
    if (new Set(["reviewed", "evidence-changed", "restored"]).has(event.type) && !event.review_after) reviewAfter = null;
    if (event.review_after) reviewAfter = event.review_after;
  }

  if (reviewAfter && reviewAfter <= asOf && !terminalStatuses.has(status)) {
    status = "needs-review";
    statusSource = `review_after:${reviewAfter}`;
  }

  return {
    status,
    statusSource,
    reviewAfter,
    history,
    latestUpdate: history.length ? history[history.length - 1].date : null,
  };
}

function lifecycleBlock(record) {
  const [label, description] = statusCopy[record.status];
  const reversed = [...record.history].reverse();
  const history = reversed.length
    ? `<ol>${reversed.map((event) => {
        const refs = event.evidence_refs?.length ? `<p><strong>References:</strong> ${event.evidence_refs.map(evidenceReference).join(" · ")}</p>` : "";
        const provenance = event.legacy && event.provenance ? ` <small>Source: ${escapeHtml(event.provenance)}</small>` : "";
        return `<li data-review-event="${escapeHtml(event.id)}"><p><strong>${escapeHtml(event.date)} · ${escapeHtml(event.type)}</strong>${event.actor ? ` · ${escapeHtml(event.actor)}` : ""}${provenance}</p><p>${escapeHtml(event.summary)}</p>${refs}</li>`;
      }).join("")}</ol>`
    : `<p>No explicit review event has been recorded yet. The hack remains published from its source content and can be challenged or reviewed.</p>`;
  const next = record.reviewAfter ? `<p><strong>Next review trigger:</strong> ${escapeHtml(record.reviewAfter)}</p>` : "";
  return `${markerStart}<section class="prose hack-review-history" data-hack-review-history data-review-status="${record.status}"><p class="eyebrow">Maintenance record</p><h2>Review history</h2><p><strong>Current status: ${escapeHtml(label)}.</strong> ${escapeHtml(description)}</p>${record.latestUpdate ? `<p><strong>Latest lifecycle update:</strong> ${escapeHtml(record.latestUpdate)}</p>` : ""}${next}${history}<p><a href="/life-os/review-log/">Browse the review ledger</a> · <a href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new/choose">Challenge or update this hack</a></p><p><small>Implementation observations can trigger a review, but they cannot change an evidence conclusion by themselves. Commercial relationships do not control review status or outcomes.</small></p></section>${markerEnd}`;
}

function warningBlock(record) {
  if (!new Set(["needs-review", "contested", "refuted", "retired"]).has(record.status)) return "";
  const [label, description] = statusCopy[record.status];
  return `<aside class="callout" data-review-warning="${record.status}"><p class="eyebrow">Lifecycle warning</p><h2>${escapeHtml(label)}</h2><p>${escapeHtml(description)}</p><p><a href="#review-history">Read the review history before applying this protocol.</a></p></aside>`;
}

function patchHackPage(file, record) {
  if (!fs.existsSync(file)) throw new Error(`Generated hack page missing: ${file}`);
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g"), "");
  html = html.replace(/<aside class="callout" data-review-warning="[^"]+">[\s\S]*?<\/aside>/g, "");
  const block = lifecycleBlock(record).replace('<section class="prose hack-review-history"', '<section id="review-history" class="prose hack-review-history"');
  const calloutIndex = html.indexOf('<aside class="callout">');
  if (calloutIndex >= 0) html = `${html.slice(0, calloutIndex)}${block}${html.slice(calloutIndex)}`;
  else if (html.includes("</main>")) html = html.replace("</main>", `${block}</main>`);
  else throw new Error(`Cannot inject hack lifecycle into ${file}`);
  const warning = warningBlock(record);
  if (warning) html = html.replace(/(<\/h1>)/, `$1${warning}`);
  fs.writeFileSync(file, html);
}

function replaceHeadValue(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function buildLedger(template, records) {
  const counts = Object.fromEntries([...allowedStatuses].map((status) => [status, records.filter((record) => record.status === status).length]));
  const recent = records.flatMap((record) => record.history.map((event) => ({ ...event, title: record.title, url: record.url, current_status: record.status })))
    .sort((a, b) => compareEvents(b, a))
    .slice(0, 100);
  const cards = Object.entries(counts).map(([status, count]) => {
    const [label, description] = statusCopy[status];
    return `<article class="card"><span class="card-label">${count} entries</span><h3>${escapeHtml(label)}</h3><p>${escapeHtml(description)}</p></article>`;
  }).join("");
  const items = recent.length
    ? recent.map((event) => `<li><a href="${event.url}#review-history">${escapeHtml(event.title)}</a><span>${escapeHtml(event.date)} · ${escapeHtml(event.type)} · current: ${escapeHtml(event.current_status)} — ${escapeHtml(event.summary)}</span></li>`).join("")
    : `<li>No explicit review events have been recorded yet.</li>`;
  const body = `<p class="eyebrow">Transparent maintenance</p><h1>Hack review log.</h1><p class="lead">Brali keeps review history visible. A protocol can be revised, challenged, refuted, restored, or retired without erasing what changed.</p><div class="grid three">${cards}</div><section class="prose"><h2>Recent review activity</h2><ul class="article-list">${items}</ul><h2>How to read this ledger</h2><p>The current status is derived from source provenance plus append-only lifecycle events. Existing editorial curation is exposed as legacy review provenance; new changes are recorded in <code>data/hack-review-events.json</code>.</p><p>Personal observations can trigger investigation but cannot change an evidence conclusion on their own. A material challenge or refutation requires traceable references.</p><p><a class="button" href="/life-os/datasets/reviews.json">Machine-readable review data</a> <a class="button" href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new/choose">Submit a challenge</a></p></section>`;

  let html = template;
  html = replaceHeadValue(html, /<title>[\s\S]*?<\/title>/i, "<title>Hack review log — Brali</title>");
  html = replaceHeadValue(html, /<meta name="description" content="[^"]*">/i, '<meta name="description" content="Public review history, current lifecycle status, challenges, refutations and maintenance records for Brali Growth Library hacks.">');
  html = replaceHeadValue(html, /<link rel="canonical" href="[^"]*">/i, '<link rel="canonical" href="https://brali-lifeos.github.io/life-os/review-log/">');
  html = replaceHeadValue(html, /<meta property="og:title" content="[^"]*">/i, '<meta property="og:title" content="Hack review log">');
  html = replaceHeadValue(html, /<meta property="og:description" content="[^"]*">/i, '<meta property="og:description" content="Transparent review history and current lifecycle status for Brali Growth Library hacks.">');
  html = replaceHeadValue(html, /<meta property="og:url" content="[^"]*">/i, '<meta property="og:url" content="https://brali-lifeos.github.io/life-os/review-log/">');
  const schema = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Brali Hack Review Log", description: "Transparent review history and lifecycle status for Brali Growth Library hacks.", url: "https://brali-lifeos.github.io/life-os/review-log/" };
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${JSON.stringify(schema)}</script>`);
  if (!/<main id="content" class="page wrap">[\s\S]*?<\/main>/i.test(html)) throw new Error("Review ledger template is missing the expected main element");
  return html.replace(/<main id="content" class="page wrap">[\s\S]*?<\/main>/i, `<main id="content" class="page wrap">${body}</main>`);
}

const index = readJson(indexPath);
if (!Array.isArray(index) || !index.length) throw new Error("Life OS content index is empty or invalid");
const knownSlugs = new Set(index.map((entry) => entry.slug));
if (knownSlugs.size !== index.length) throw new Error("Life OS content index contains duplicate slugs");
const registry = readJson(registryPath);
validateRegistry(registry, knownSlugs);

const eventsBySlug = new Map();
for (const event of registry.events) {
  const list = eventsBySlug.get(event.slug) || [];
  list.push(event);
  eventsBySlug.set(event.slug, list);
}
for (const events of eventsBySlug.values()) events.sort(compareEvents);

const records = [];
for (const entry of index) {
  const articlePath = path.join(contentRoot, `${entry.slug}.json`);
  if (!fs.existsSync(articlePath)) throw new Error(`Missing source article for ${entry.slug}`);
  const article = readJson(articlePath);
  const legacy = legacyEvent(article);
  const events = eventsBySlug.get(entry.slug) || [];
  const state = deriveState(legacy, events);
  const record = {
    slug: entry.slug,
    title: entry.title,
    url: `/life-os/${entry.slug}/`,
    status: state.status,
    status_source: state.statusSource,
    latest_update: state.latestUpdate,
    review_after: state.reviewAfter,
    history: state.history,
  };
  records.push(record);
  patchHackPage(path.join(siteRoot, entry.slug, "index.html"), record);
}

const statusCounts = Object.fromEntries([...allowedStatuses].map((status) => [status, records.filter((record) => record.status === status).length]));
const publicDataset = {
  schema_version: 1,
  as_of: asOf,
  policy: "https://github.com/Brali-LifeOS/brali-lifeos.github.io/blob/main/HACK_LIFECYCLE.md",
  commercial_influence: "none",
  status_counts: statusCounts,
  entries: records,
};
const datasetDirectory = path.join(siteRoot, "datasets");
fs.mkdirSync(datasetDirectory, { recursive: true });
fs.writeFileSync(path.join(datasetDirectory, "reviews.json"), `${JSON.stringify(publicDataset, null, 2)}\n`);

const datasetsPage = path.join(datasetDirectory, "index.html");
if (fs.existsSync(datasetsPage)) {
  let html = fs.readFileSync(datasetsPage, "utf8");
  if (!html.includes('/life-os/datasets/reviews.json')) {
    html = html.replace("</ul>", '<li><a href="/life-os/datasets/reviews.json">Hack review lifecycle (JSON)</a></li></ul>');
    fs.writeFileSync(datasetsPage, html);
  }
}

const aboutPage = path.join(siteRoot, "about", "index.html");
if (!fs.existsSync(aboutPage)) throw new Error("Cannot build review ledger without life-os/about/index.html");
const ledgerDirectory = path.join(siteRoot, "review-log");
fs.mkdirSync(ledgerDirectory, { recursive: true });
fs.writeFileSync(path.join(ledgerDirectory, "index.html"), buildLedger(fs.readFileSync(aboutPage, "utf8"), records));

const reviewEventCount = registry.events.length;
const legacyCount = records.reduce((sum, record) => sum + record.history.filter((event) => event.legacy).length, 0);
const warningCount = records.filter((record) => new Set(["needs-review", "contested", "refuted", "retired"]).has(record.status)).length;
console.log(`hack_lifecycle entries=${records.length} legacy_reviews=${legacyCount} append_only_events=${reviewEventCount} warnings=${warningCount} as_of=${asOf}`);
