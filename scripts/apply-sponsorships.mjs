import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "data", "sponsorships.json");
const reviewsPath = path.join(root, "life-os", "datasets", "reviews.json");
const asOf = process.env.BRALI_AS_OF || new Date().toISOString().slice(0, 10);
const markerStart = "<!-- brali-sponsorship:start -->";
const markerEnd = "<!-- brali-sponsorship:end -->";
const blockedStatuses = new Set(["needs-review", "contested", "refuted", "retired"]);
const allowedFields = new Set(["id", "slug", "sponsor_name", "headline", "copy", "url", "cta", "starts_on", "ends_on", "active"]);

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
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validate(registry, reviews) {
  if (!registry || registry.schema_version !== 1 || !Array.isArray(registry.placements)) throw new Error("data/sponsorships.json must use schema_version 1 with a placements array");
  const known = new Set(reviews.entries.map((entry) => entry.slug));
  const ids = new Set();
  const activeBySlug = new Map();
  for (const placement of registry.placements) {
    if (!placement || typeof placement !== "object" || Array.isArray(placement)) throw new Error("Sponsorship placement must be an object");
    const unknown = Object.keys(placement).filter((key) => !allowedFields.has(key));
    if (unknown.length) throw new Error(`${placement.id || "unknown sponsorship"}: unsupported fields: ${unknown.join(", ")}`);
    if (!/^[a-z0-9][a-z0-9._:-]{5,}$/i.test(placement.id || "")) throw new Error(`Invalid sponsorship id: ${placement.id}`);
    if (ids.has(placement.id)) throw new Error(`Duplicate sponsorship id: ${placement.id}`);
    ids.add(placement.id);
    if (!known.has(placement.slug)) throw new Error(`${placement.id}: unknown hack slug ${placement.slug}`);
    for (const field of ["sponsor_name", "headline", "copy", "cta"]) {
      if (typeof placement[field] !== "string" || !text(placement[field])) throw new Error(`${placement.id}: ${field} is required`);
      if (/[<>]/.test(placement[field])) throw new Error(`${placement.id}: ${field} must be plain text, not HTML`);
    }
    if (typeof placement.url !== "string" || !/^https:\/\/[^\s]+$/i.test(placement.url)) throw new Error(`${placement.id}: url must be HTTPS`);
    if (!validDate(placement.starts_on) || !validDate(placement.ends_on) || placement.starts_on > placement.ends_on) throw new Error(`${placement.id}: invalid sponsorship date window`);
    if (typeof placement.active !== "boolean") throw new Error(`${placement.id}: active must be boolean`);
    const isLive = placement.active && placement.starts_on <= asOf && placement.ends_on >= asOf;
    if (!isLive) continue;
    const review = reviews.entries.find((entry) => entry.slug === placement.slug);
    if (blockedStatuses.has(review.status)) throw new Error(`${placement.id}: sponsorship is blocked while ${placement.slug} is ${review.status}`);
    if (activeBySlug.has(placement.slug)) throw new Error(`${placement.slug}: only one active sponsorship card is allowed per hack`);
    activeBySlug.set(placement.slug, placement.id);
  }
}

function sponsorshipBlock(placement) {
  return `${markerStart}<aside class="callout sponsorship" data-sponsorship-id="${escapeHtml(placement.id)}" data-nosnippet><p class="eyebrow">Sponsored</p><h3>${escapeHtml(placement.headline)}</h3><p>${escapeHtml(placement.copy)}</p><p><strong>Partner:</strong> ${escapeHtml(placement.sponsor_name)}</p><p><a class="button" href="${escapeHtml(placement.url)}" rel="sponsored nofollow noopener">${escapeHtml(placement.cta)}</a></p><p><small>This commercial placement does not affect Brali evidence, review status, retrieval, or ranking.</small></p></aside>${markerEnd}`;
}

function patchPlacement(placement) {
  const file = path.join(root, "life-os", placement.slug, "index.html");
  if (!fs.existsSync(file)) throw new Error(`${placement.id}: generated hack page is missing`);
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g"), "");
  const lifecycleEnd = html.indexOf("<!-- brali-hack-lifecycle:end -->");
  if (lifecycleEnd < 0) throw new Error(`${placement.id}: lifecycle surface missing; refusing sponsorship without editorial separation`);
  const insertion = lifecycleEnd + "<!-- brali-hack-lifecycle:end -->".length;
  html = `${html.slice(0, insertion)}${sponsorshipBlock(placement)}${html.slice(insertion)}`;
  fs.writeFileSync(file, html);
}

function makePolicyPage(template, activeCount) {
  const body = `<p class="eyebrow">Commercial independence</p><h1>Sponsor the work, never the verdict.</h1><p class="lead">Brali can accept commercial support, but sponsorship is structurally separated from evidence, review status, search, retrieval and recommendations.</p><section class="prose"><h2>Preferred model: independent review underwriting</h2><p>A partner can fund the cost of reviewing a topic or maintenance batch. It cannot choose the conclusion, evidence grade, wording, lifecycle status, ranking, or whether a hack survives review.</p><h2>Contextual sponsor cards</h2><p>Paid cards, when used, appear only after the review-history surface. They are visibly labelled <strong>Sponsored</strong>, contain no arbitrary scripts, and use sponsored/nofollow link attributes. Brali automatically blocks paid cards on hacks that are due for review, contested, refuted, or retired.</p><h2>Affiliate and integration relationships</h2><p>Affiliate compensation does not create an editorial recommendation. Data/API and integration partnerships must remain separate from the free evidence and lifecycle records.</p><h2>Current inventory</h2><p>${activeCount ? `${activeCount} sponsored placement${activeCount === 1 ? " is" : "s are"} active today.` : "There are no active sponsored placements today."}</p><p><a class="button" href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new/choose">Discuss a partnership</a> <a class="button" href="/life-os/review-log/">Review ledger</a></p><p><small>The full policy is versioned in the public repository as <code>SPONSORSHIP_POLICY.md</code>.</small></p></section>`;
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>Sponsorship policy — Brali</title>");
  html = html.replace(/<meta name="description" content="[^"]*">/i, '<meta name="description" content="How Brali separates sponsorship, review funding and affiliate relationships from evidence, lifecycle status and recommendations.">');
  html = html.replace(/<link rel="canonical" href="[^"]*">/i, '<link rel="canonical" href="https://brali-lifeos.github.io/sponsorship/">');
  html = html.replace(/<meta property="og:title" content="[^"]*">/i, '<meta property="og:title" content="Sponsorship policy">');
  html = html.replace(/<meta property="og:description" content="[^"]*">/i, '<meta property="og:description" content="Sponsor the work, never the verdict: Brali commercial independence rules.">');
  html = html.replace(/<meta property="og:url" content="[^"]*">/i, '<meta property="og:url" content="https://brali-lifeos.github.io/sponsorship/">');
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: "Brali Sponsorship Policy", description: "Commercial independence and sponsorship rules for Brali.", url: "https://brali-lifeos.github.io/sponsorship/" };
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${JSON.stringify(schema)}</script>`);
  if (!/<main id="content" class="page wrap">[\s\S]*?<\/main>/i.test(html)) throw new Error("Sponsorship template is missing the expected main element");
  return html.replace(/<main id="content" class="page wrap">[\s\S]*?<\/main>/i, `<main id="content" class="page wrap">${body}</main>`);
}

if (!fs.existsSync(reviewsPath)) throw new Error("Hack review dataset must be built before sponsorship rendering");
const registry = readJson(dataPath);
const reviews = readJson(reviewsPath);
validate(registry, reviews);

let activeCount = 0;
for (const placement of registry.placements) {
  const isLive = placement.active && placement.starts_on <= asOf && placement.ends_on >= asOf;
  if (!isLive) continue;
  patchPlacement(placement);
  activeCount += 1;
}

const templatePath = path.join(root, "life-os", "about", "index.html");
if (!fs.existsSync(templatePath)) throw new Error("Cannot build sponsorship policy page without life-os/about/index.html");
const destination = path.join(root, "sponsorship");
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, "index.html"), makePolicyPage(fs.readFileSync(templatePath, "utf8"), activeCount));

console.log(`sponsorships configured=${registry.placements.length} active=${activeCount} blocked_statuses=${[...blockedStatuses].join(",")}`);
