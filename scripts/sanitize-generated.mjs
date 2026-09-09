import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence, sourceDetails } from "./lib/content-trust.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const trustedStates = new Set(["reviewed", "practical"]);

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const displayValue = (value) => value == null ? "" : (typeof value === "string" ? value : JSON.stringify(value));
const historicalSourceUrl = (slug) => `/data/life-os-content/${encodeURIComponent(slug)}.json`;
const isTrusted = (evidence) => evidence.indexable === true && trustedStates.has(evidence.status);

export function cleanLegacyBrand(html) {
  return String(html)
    .replace(/https?:\/\/(?:www\.)?metalhatscats\.com\/life-os/gi, "https://brali-lifeos.github.io/life-os")
    .replace(/https?:\/\/(?:www\.)?metalhatscats\.com/gi, "https://brali-lifeos.github.io")
    .replace(/(?:www\.)?metalhatscats\.com/gi, "brali-lifeos.github.io")
    .replace(/metalhatscats\s*[×/]\s*brali\s+lifeos/gi, "Brali LifeOS")
    .replace(/metalhatscats\s+team/gi, "Brali LifeOS")
    .replace(/metalhatscats/gi, "Brali");
}

function evidenceLabel(evidence, source) {
  const sourceLink = source.sourceUrl
    ? `<a href="${escapeHtml(source.sourceUrl)}" rel="noopener noreferrer">source</a>`
    : null;
  const reference = source.reference ? escapeHtml(displayValue(source.reference)) : null;
  const recorded = [sourceLink, reference].filter(Boolean).join(" · ");

  if (evidence.status === "reviewed") {
    return recorded ? `Reviewed · ${recorded}` : "Reviewed as practical guidance.";
  }
  if (evidence.status === "practical") {
    return "Practical guidance; no evidence-like claim is detected in the current source record.";
  }
  if (evidence.status === "restricted") {
    return "Review required; this record is excluded from trusted guidance and recommendations.";
  }
  return recorded
    ? `Source recorded; editorial review pending · ${recorded}`
    : "Evidence-like claims detected; source review pending.";
}

function protocolSummary(article, entry, evidence) {
  const source = sourceDetails(article);
  const trusted = isTrusted(evidence);
  const safety = evidence.sensitive
    ? "<p><strong>Safety:</strong> This record is general educational material, not medical advice, diagnosis, treatment, or a substitute for professional care.</p>"
    : "";
  const reviewNote = evidence.review.note
    ? `<p><strong>Review note:</strong> ${escapeHtml(evidence.review.note)}</p>`
    : "";

  if (!trusted) {
    const state = evidence.status === "restricted" ? "Restricted" : "Pending review";
    return `<section class="callout" data-protocol-summary="true" data-evidence-status="${escapeHtml(evidence.status)}" data-legacy-content-state="historical-source-only"><span class="card-label">${state} · not current guidance</span><h3>Review required before use</h3><p>This record is retained so its provenance and review state remain inspectable, but its inherited long-form guidance has not passed Brali's trust gate and is not rendered as current advice.</p><p><strong>Evidence:</strong> ${evidenceLabel(evidence, source)}</p>${reviewNote}${safety}<p><a href="${historicalSourceUrl(entry.slug)}">Inspect the historical source record</a> <span aria-hidden="true">·</span> <strong>not current guidance</strong></p></section>`;
  }

  const original = article.lifeOsSource ?? {};
  const action = original.whatYouDo || article.description || entry.description || "Choose one small version of this practice to try.";
  const checkIn = original.checkIn || article.checkIn || null;
  return `<section class="callout" data-protocol-summary="true" data-evidence-status="${escapeHtml(evidence.status)}" data-legacy-content-state="current-guidance"><span class="card-label">Protocol summary · ${escapeHtml(evidence.status)}</span><h3>Try this</h3><p>${cleanLegacyBrand(escapeHtml(action))}</p>${checkIn ? `<p><strong>Check-in:</strong> ${cleanLegacyBrand(escapeHtml(checkIn))}</p>` : ""}<p><strong>Evidence:</strong> ${evidenceLabel(evidence, source)}</p>${reviewNote}${safety}</section>`;
}

function containInheritedGuidance(html, entry) {
  const finalCalloutPattern = /<aside class="callout"><h3>Try it, then review\.<\/h3>[\s\S]*?<\/aside>/;
  const inheritedRegionPattern = /(<figure class="hack-cover"[\s\S]*?<\/figure>)[\s\S]*?(?=<aside class="callout"><h3>Try it, then review\.<\/h3>)/;
  if (!inheritedRegionPattern.test(html) || !finalCalloutPattern.test(html)) {
    throw new Error(`${entry.slug}: cannot identify generated inherited-guidance boundary.`);
  }
  return html
    .replace(inheritedRegionPattern, "$1")
    .replace(finalCalloutPattern, "");
}

let changed = 0;
let reviewGated = 0;
let protocolSummaries = 0;
let currentGuidance = 0;
const containmentEntries = [];
const byStatus = { reviewed: 0, practical: 0, "pending-review": 0, restricted: 0 };

for (const entry of index) {
  const htmlPath = path.join(root, "life-os", entry.slug, "index.html");
  const articlePath = path.join(contentRoot, `${entry.slug}.json`);
  const article = JSON.parse(await readFile(articlePath, "utf8"));
  const evidence = classifyEvidence(article, entry, overrides);
  const trusted = isTrusted(evidence);
  let html = await readFile(htmlPath, "utf8");
  const before = html;

  byStatus[evidence.status] = (byStatus[evidence.status] ?? 0) + 1;
  html = cleanLegacyBrand(html);
  html = html.replace(/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*>/ig, "");

  if (!trusted) {
    reviewGated += 1;
    html = containInheritedGuidance(html, entry);
  } else {
    currentGuidance += 1;
  }

  if (!html.includes('data-protocol-summary="true"')) {
    const summary = protocolSummary(article, entry, evidence);
    const coverPattern = /(<figure class="hack-cover"[\s\S]*?<\/figure>)/;
    const leadPattern = /(<p class="lead">[\s\S]*?<\/p>)/;
    if (coverPattern.test(html)) html = html.replace(coverPattern, `$1${summary}`);
    else if (leadPattern.test(html)) html = html.replace(leadPattern, `$1${summary}`);
    else html = html.replace("</h1>", `</h1>${summary}`);
    protocolSummaries += 1;
  }

  if (!trusted) {
    const invariants = [
      html.includes('data-legacy-content-state="historical-source-only"'),
      html.includes(historicalSourceUrl(entry.slug)),
      !html.includes("Try it, then review."),
      !html.includes('<div class="prose">'),
      !html.includes('<section class="prose">'),
    ];
    if (invariants.some((value) => !value)) {
      throw new Error(`${entry.slug}: review-gated page leaked inherited guidance after containment.`);
    }
  }

  containmentEntries.push({
    slug: entry.slug,
    canonical_url: `https://brali-lifeos.github.io/life-os/${entry.slug}/`,
    evidence_status: evidence.status,
    evidence_reason: evidence.reason,
    disposition: trusted ? "current-guidance-visible" : "historical-source-only",
    current_guidance_visible: trusted,
    recommendation_eligible: trusted,
    historical_source_url: historicalSourceUrl(entry.slug),
  });

  if (html !== before) {
    await writeFile(htmlPath, html);
    changed += 1;
  }
}

const report = {
  schema_version: 1,
  name: "Brali legacy content containment",
  rule: "Reviewed and practical records may render current guidance. Pending-review and restricted records retain their source JSON for provenance but do not render inherited long-form guidance as current advice.",
  counts: {
    records: index.length,
    current_guidance_visible: currentGuidance,
    historical_source_only: reviewGated,
    by_evidence_status: byStatus,
  },
  entries: containmentEntries,
};
await writeFile(path.join(root, "life-os/datasets/legacy-content-containment.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`Generated content sanitized: ${changed} pages changed; ${protocolSummaries} protocol summaries added; ${currentGuidance} current-guidance pages; ${reviewGated} review-gated pages contained as historical-source-only.`);