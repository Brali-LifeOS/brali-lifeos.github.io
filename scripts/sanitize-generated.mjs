import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence, sourceDetails } from "./lib/content-trust.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const displayValue = (value) => value == null ? "" : (typeof value === "string" ? value : JSON.stringify(value));

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
    return "Source review pending; this page is excluded from search indexing until reviewed.";
  }
  return recorded
    ? `Source recorded; editorial review pending · ${recorded}`
    : "Evidence-like claims detected; source review pending.";
}

function protocolSummary(article, entry, evidence) {
  const original = article.lifeOsSource ?? {};
  const action = original.whatYouDo || article.description || entry.description || "Choose one small version of this practice to try.";
  const checkIn = original.checkIn || article.checkIn || null;
  const source = sourceDetails(article);
  const safety = evidence.sensitive
    ? "<p><strong>Safety:</strong> This is general educational material, not medical advice, diagnosis, treatment, or a substitute for professional care.</p>"
    : "";
  const reviewNote = evidence.review.note
    ? `<p><strong>Review note:</strong> ${escapeHtml(evidence.review.note)}</p>`
    : "";

  return `<section class="callout" data-protocol-summary="true" data-evidence-status="${escapeHtml(evidence.status)}"><span class="card-label">Protocol summary · ${escapeHtml(evidence.status)}</span><h3>Try this</h3><p>${cleanLegacyBrand(escapeHtml(action))}</p>${checkIn ? `<p><strong>Check-in:</strong> ${cleanLegacyBrand(escapeHtml(checkIn))}</p>` : ""}<p><strong>Evidence:</strong> ${evidenceLabel(evidence, source)}</p>${reviewNote}${safety}</section>`;
}

let changed = 0;
let withheld = 0;
let protocolSummaries = 0;

for (const entry of index) {
  const htmlPath = path.join(root, "life-os", entry.slug, "index.html");
  const articlePath = path.join(contentRoot, `${entry.slug}.json`);
  const article = JSON.parse(await readFile(articlePath, "utf8"));
  const evidence = classifyEvidence(article, entry, overrides);
  let html = await readFile(htmlPath, "utf8");
  const before = html;

  html = cleanLegacyBrand(html);

  if (!evidence.indexable) {
    if (!/<meta\s+name=["']robots["']/i.test(html)) {
      html = html.replace(
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,follow\">",
      );
    }
    withheld += 1;
  }

  if (!html.includes('data-protocol-summary="true"')) {
    const summary = protocolSummary(article, entry, evidence);
    const leadPattern = /(<p class="lead">[\s\S]*?<\/p>)/;
    if (leadPattern.test(html)) html = html.replace(leadPattern, `$1${summary}`);
    else html = html.replace("</h1>", `</h1>${summary}`);
    protocolSummaries += 1;
  }

  if (html !== before) {
    await writeFile(htmlPath, html);
    changed += 1;
  }
}

console.log(`Generated content sanitized: ${changed} pages changed; ${protocolSummaries} protocol summaries added; ${withheld} pages withheld from indexing.`);
