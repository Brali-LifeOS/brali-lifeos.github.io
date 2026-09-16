import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence, sourceDetails } from "./lib/content-trust.mjs";

// The canonical migrated corpus contains many long-form articles in body.markdown.
// Restore those generated HTML bodies before applying trust-state presentation rules.
await import("./restore-longform-content.mjs");

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const trustedStates = new Set(["reviewed", "practical"]);
const MIN_LONGFORM_CHARS = 600;

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const displayValue = (value) => value == null ? "" : (typeof value === "string" ? value : JSON.stringify(value));
const historicalSourceUrl = (slug) => `/data/life-os-content/${encodeURIComponent(slug)}.json`;
const isTrusted = (evidence) => evidence.indexable === true && trustedStates.has(evidence.status);
const displayState = (evidence) => isTrusted(evidence)
  ? "current-guidance-visible"
  : evidence.status === "pending-review"
    ? "review-pending-longform-visible"
    : "historical-source-only";
const longformVisible = (evidence) => evidence.status !== "restricted";

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

function reviewReason(evidence) {
  if (evidence.status === "restricted") {
    return "The inherited record is safety-sensitive and does not yet have a usable reviewed source. Its operational guidance stays withheld from search recommendations and reusable skills.";
  }
  if (evidence.reason === "evidence-like-claim-without-source") {
    return "This migrated article contains evidence-like wording without a reviewed supporting source. The long-form article remains visible for readers, while those claims stay outside trusted recommendations until they are reviewed or rewritten.";
  }
  if (evidence.sensitive) {
    return "This migrated article is safety-sensitive and still awaits source review. It remains visible as review-pending educational content, stays out of trusted recommendations, and is withheld from search indexing until review is complete.";
  }
  return "This migrated article has not yet passed Brali's editorial evidence gate. Its long-form content remains visible, but the page is explicitly review-pending and is not treated as trusted recommendation guidance.";
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

  if (evidence.status === "restricted") {
    return `<section class="callout" data-protocol-summary="true" data-evidence-status="restricted" data-legacy-content-state="historical-source-only"><span class="card-label">Restricted · not current guidance</span><h3>Review required before use</h3><p>This record is retained so its provenance and review state remain inspectable, but its inherited operational guidance is not rendered while the safety/source bar is unmet.</p><p><strong>Why withheld:</strong> ${escapeHtml(reviewReason(evidence))}</p><p><strong>Evidence:</strong> ${evidenceLabel(evidence, source)}</p>${reviewNote}${safety}<p><a href="${historicalSourceUrl(entry.slug)}">Inspect the historical source record</a> <span aria-hidden="true">·</span> <strong>not current guidance</strong></p></section>`;
  }

  if (!trusted) {
    return `<section class="callout" data-protocol-summary="true" data-evidence-status="${escapeHtml(evidence.status)}" data-legacy-content-state="review-pending-longform-visible"><span class="card-label">Pending review · long-form article visible</span><h3>Read with the review status in mind</h3><p>${escapeHtml(reviewReason(evidence))}</p><p><strong>Evidence:</strong> ${evidenceLabel(evidence, source)}</p>${reviewNote}${safety}<p><strong>Trust boundary:</strong> Visible does not mean reviewed. This article is not eligible for Brali's trusted recommendation feed or usable Agent Skills until its review state is promoted.</p></section>`;
  }

  const original = article.lifeOsSource ?? {};
  const action = original.whatYouDo || article.description || entry.description || "Choose one small version of this practice to try.";
  const checkIn = original.checkIn || article.checkIn || null;
  return `<section class="callout" data-protocol-summary="true" data-evidence-status="${escapeHtml(evidence.status)}" data-legacy-content-state="current-guidance"><span class="card-label">Protocol summary · ${escapeHtml(evidence.status)}</span><h3>Try this</h3><p>${cleanLegacyBrand(escapeHtml(action))}</p>${checkIn ? `<p><strong>Check-in:</strong> ${cleanLegacyBrand(escapeHtml(checkIn))}</p>` : ""}<p><strong>Evidence:</strong> ${evidenceLabel(evidence, source)}</p>${reviewNote}${safety}</section>`;
}

const finalCalloutPattern = /<aside class="callout"><h3>Try it, then review\.<\/h3>[\s\S]*?<\/aside>/;

function removeGenericTryCallout(html) {
  return html.replace(finalCalloutPattern, "");
}

function containInheritedGuidance(html, entry) {
  const inheritedRegionPattern = /(<figure class="hack-cover"[\s\S]*?<\/figure>)[\s\S]*?(?=<aside class="callout"><h3>Try it, then review\.<\/h3>)/;
  if (!inheritedRegionPattern.test(html) || !finalCalloutPattern.test(html)) {
    throw new Error(`${entry.slug}: cannot identify generated inherited-guidance boundary.`);
  }
  return html
    .replace(inheritedRegionPattern, "$1")
    .replace(finalCalloutPattern, "");
}

function neutralizeRestrictedRecord(html, entry, evidence) {
  const title = `Restricted review record: ${entry.title}`;
  const description = "Archived Brali review record. Safety-sensitive inherited operational guidance is withheld until the source and safety bar is met. This page exists for provenance and trust-state inspection, not as advice.";
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const canonical = `https://brali-lifeos.github.io/life-os/${entry.slug}/`;

  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle} — Brali</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapedDescription}">`)
    .replace(/<meta property="og:type" content="[^"]*">/i, '<meta property="og:type" content="website">')
    .replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${escapedTitle}">`)
    .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${escapedDescription}">`)
    .replace(/<meta name="twitter:title" content="[^"]*">/i, `<meta name="twitter:title" content="${escapedTitle}">`)
    .replace(/<meta name="twitter:description" content="[^"]*">/i, `<meta name="twitter:description" content="${escapedDescription}">`)
    .replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${escapedTitle}</h1>`)
    .replace(/<p class="lead">[\s\S]*?<\/p>/i, `<p class="lead">${escapedDescription}</p>`)
    .replace(/<span aria-current="page"[^>]*>[\s\S]*?<\/span>/i, `<span aria-current="page" title="${escapedTitle}">${escapedTitle}</span>`);

  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i, (whole, raw) => {
    try {
      const schema = JSON.parse(raw);
      const graph = Array.isArray(schema?.["@graph"]) ? schema["@graph"] : [];
      for (const node of graph) {
        if (node?.["@type"] === "WebPage") {
          node.name = title;
          node.description = description;
          node.url = canonical;
        }
        if (node?.["@type"] === "Article") {
          node.headline = title;
          node.description = description;
          node.url = canonical;
          node.genre = "Brali review record";
          node.creativeWorkStatus = "Restricted review";
          node.about = [entry.zone?.title || "Brali Growth Library", "restricted review record"];
          delete node.citation;
        }
        if (node?.["@type"] === "BreadcrumbList") {
          const items = node.itemListElement ?? [];
          const last = items.at(-1);
          if (last) last.name = title;
        }
      }
      return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
    } catch {
      throw new Error(`${entry.slug}: cannot neutralize restricted review-record structured data.`);
    }
  });

  return html;
}

function annotatePendingReviewSchema(html, evidence) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i, (whole, raw) => {
    try {
      const schema = JSON.parse(raw);
      const graph = Array.isArray(schema?.["@graph"]) ? schema["@graph"] : [];
      for (const node of graph) {
        if (node?.["@type"] === "Article") node.creativeWorkStatus = evidence.sensitive ? "Pending safety/source review" : "Pending editorial evidence review";
      }
      return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
    } catch {
      return whole;
    }
  });
}

function revisionHistory(article, entry, evidence) {
  const dateOnly = (value) => value ? String(value).slice(0, 10) : null;
  const published = dateOnly(article.meta?.publishedISO ?? entry.publishedISO);
  const updated = dateOnly(article.meta?.updatedISO ?? entry.updatedISO ?? published);
  const reviewed = dateOnly(evidence.review?.reviewedAt ?? article.editorialCuration?.reviewedAt ?? article.trustverseCuration?.reviewed_at);
  const reviewer = evidence.review?.reviewedBy ?? article.editorialCuration?.reviewedBy ?? article.trustverseCuration?.reviewed_by ?? null;
  const currentVersion = updated || reviewed || published || "migrated";
  const items = [];

  if (published) items.push(`<li><strong>Version ${escapeHtml(published)}:</strong> first recorded publication in the migrated Brali corpus.</li>`);
  if (updated && updated !== published) items.push(`<li><strong>Version ${escapeHtml(updated)}:</strong> current article revision.</li>`);
  if (!published && updated) items.push(`<li><strong>Version ${escapeHtml(updated)}:</strong> current article revision.</li>`);
  if (reviewed) items.push(`<li><strong>Evidence review ${escapeHtml(reviewed)}:</strong> ${reviewer ? `reviewed by ${escapeHtml(reviewer)}; ` : ""}evidence state is <code>${escapeHtml(evidence.status)}</code>.</li>`);
  if (!items.length) items.push(`<li><strong>Version migrated:</strong> preserved from the canonical migrated source record; evidence state is <code>${escapeHtml(evidence.status)}</code>.</li>`);

  return `<section class="prose article-versions" data-article-versions="true" data-version-current="${escapeHtml(currentVersion)}"><h2>Article versions</h2><p>Brali keeps substantive article history visible. Later reviews may refresh wording, sources, examples, or boundaries without silently replacing the record.</p><ul>${items.join("")}</ul><p><a href="${historicalSourceUrl(entry.slug)}">Canonical source record</a> · Evidence state: <strong>${escapeHtml(evidence.status)}</strong>.</p></section>`;
}

function injectRevisionHistory(html, article, entry, evidence) {
  if (html.includes('data-article-versions="true"')) return html;
  const section = revisionHistory(article, entry, evidence);
  return html.replace("</main>", `${section}</main>`);
}

function isMarkdownLongform(article) {
  const markdown = typeof article.body?.markdown === "string" ? article.body.markdown.trim() : "";
  const sections = Array.isArray(article.body?.sections) ? article.body.sections : [];
  return markdown.length >= MIN_LONGFORM_CHARS && sections.length === 0;
}

let changed = 0;
let restrictedCount = 0;
let pendingVisible = 0;
let protocolSummaries = 0;
let currentGuidance = 0;
const publicationEntries = [];
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

  if (evidence.status === "restricted") {
    restrictedCount += 1;
    html = containInheritedGuidance(html, entry);
    html = neutralizeRestrictedRecord(html, entry, evidence);
  } else if (!trusted) {
    pendingVisible += 1;
    html = removeGenericTryCallout(html);
    html = annotatePendingReviewSchema(html, evidence);
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

  html = injectRevisionHistory(html, article, entry, evidence);

  if (evidence.status === "restricted") {
    const invariants = [
      html.includes('data-legacy-content-state="historical-source-only"'),
      html.includes(historicalSourceUrl(entry.slug)),
      html.includes("Restricted review record:"),
      !html.includes("Try it, then review."),
      !html.includes('<div class="prose" data-longform-source="body.markdown">'),
    ];
    if (invariants.some((value) => !value)) {
      throw new Error(`${entry.slug}: restricted page leaked inherited operational guidance or lost its trust boundary.`);
    }
  } else if (!trusted) {
    const invariants = [
      html.includes('data-legacy-content-state="review-pending-longform-visible"'),
      html.includes('<div class="prose"'),
      html.includes('data-article-versions="true"'),
      !html.includes("Review record:"),
      !html.includes("Try it, then review."),
    ];
    if (isMarkdownLongform(article)) invariants.push(html.includes('data-longform-source="body.markdown"'));
    if (invariants.some((value) => !value)) {
      throw new Error(`${entry.slug}: pending-review page lost its visible long-form article or review boundary.`);
    }
  } else {
    const invariants = [html.includes('data-article-versions="true"')];
    if (isMarkdownLongform(article)) invariants.push(html.includes('data-longform-source="body.markdown"'));
    if (invariants.some((value) => !value)) {
      throw new Error(`${entry.slug}: trusted page lost long-form content or revision history.`);
    }
  }

  publicationEntries.push({
    slug: entry.slug,
    canonical_url: `https://brali-lifeos.github.io/life-os/${entry.slug}/`,
    evidence_status: evidence.status,
    evidence_reason: evidence.reason,
    disposition: displayState(evidence),
    current_guidance_visible: trusted,
    longform_visible: longformVisible(evidence),
    recommendation_eligible: trusted,
    review_record_search_candidate: evidence.status === "pending-review" && !evidence.sensitive,
    historical_source_url: historicalSourceUrl(entry.slug),
    article_versions_visible: true,
  });

  if (html !== before) {
    await writeFile(htmlPath, html);
    changed += 1;
  }
}

const report = {
  schema_version: 3,
  name: "Brali long-form publication and trust boundary",
  rule: "Reviewed/practical records render current guidance. Pending-review records keep their substantive long-form article visible with an explicit review-pending boundary and remain ineligible for trusted recommendations. Restricted records retain source provenance but withhold inherited operational guidance until the safety/source bar is met. Every hack page exposes article-version metadata at the bottom.",
  counts: {
    records: index.length,
    current_guidance_visible: currentGuidance,
    review_pending_longform_visible: pendingVisible,
    historical_source_only: restrictedCount,
    pending_review_search_candidates: byStatus["pending-review"],
    by_evidence_status: byStatus,
  },
  entries: publicationEntries,
};
await writeFile(path.join(root, "life-os/datasets/legacy-content-containment.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`Generated content sanitized: ${changed} pages changed; ${protocolSummaries} protocol summaries added; ${currentGuidance} trusted current-guidance pages; ${pendingVisible} pending-review long-form pages visible; ${restrictedCount} restricted pages remain operationally withheld.`);
