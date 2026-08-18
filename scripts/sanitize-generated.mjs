import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));

const sensitiveZones = new Set([
  "no-depression",
  "no-fears",
  "be-healthy",
  "fit-life",
  "cardio-doc",
  "psychodynamic",
  "metacognitive",
  "cognitive-analytic",
  "positive-psychotherapy",
  "body-oriented",
  "ericksonian",
  "gestalt",
  "exposure",
  "dbt",
  "act",
  "cbt",
]);

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function sourceDetails(article) {
  const original = article.lifeOsSource ?? {};
  const sourceUrl = original.sourceUrl || article.sourceUrl || null;
  const reference = original.reference || article.reference || null;
  const lists = [article.references, article.sources, article.citations].filter(Array.isArray).flat().filter(Boolean);
  return { sourceUrl, reference, listSource: lists[0] ?? null, hasSource: Boolean(sourceUrl || reference || lists.length) };
}

function cleanLegacyBrand(html) {
  return html
    .replaceAll("https://metalhatscats.com/life-os", "https://brali-lifeos.github.io/life-os")
    .replaceAll("http://metalhatscats.com/life-os", "https://brali-lifeos.github.io/life-os")
    .replaceAll("https://metalhatscats.com", "https://brali-lifeos.github.io")
    .replaceAll("http://metalhatscats.com", "https://brali-lifeos.github.io")
    .replaceAll("MetalHatsCats × Brali LifeOS", "Brali LifeOS")
    .replaceAll("MetalHatsCats / Brali LifeOS", "Brali LifeOS")
    .replaceAll("MetalHatsCats Team", "Brali LifeOS")
    .replaceAll("MetalHatsCats", "Brali");
}

function protocolSummary(article, entry, source) {
  const original = article.lifeOsSource ?? {};
  const action = original.whatYouDo || article.description || entry.description || "Choose one small version of this practice to try.";
  const checkIn = original.checkIn || article.checkIn || null;
  const isSensitive = sensitiveZones.has(entry.zone?.slug);

  let evidence;
  if (source.sourceUrl) {
    evidence = `<a href="${escapeHtml(source.sourceUrl)}" rel="noopener noreferrer">Source recorded</a>${source.reference ? ` · ${escapeHtml(source.reference)}` : ""}`;
  } else if (source.reference) {
    evidence = escapeHtml(source.reference);
  } else if (source.listSource) {
    evidence = escapeHtml(typeof source.listSource === "string" ? source.listSource : JSON.stringify(source.listSource));
  } else {
    evidence = isSensitive ? "Source review pending; this page is excluded from search indexing until reviewed." : "Practical guidance; an explicit source is not currently recorded for this entry.";
  }

  const safety = isSensitive && !source.hasSource
    ? "<p><strong>Safety:</strong> Treat this as a general reflection prompt, not medical advice, diagnosis, treatment, or a substitute for professional care.</p>"
    : "";

  return `<section class="callout" data-protocol-summary="true"><span class="card-label">Protocol summary</span><h3>Try this</h3><p>${cleanLegacyBrand(escapeHtml(action))}</p>${checkIn ? `<p><strong>Check-in:</strong> ${cleanLegacyBrand(escapeHtml(checkIn))}</p>` : ""}<p><strong>Evidence:</strong> ${evidence}</p>${safety}</section>`;
}

let changed = 0;
let protectedSensitive = 0;
let protocolSummaries = 0;

for (const entry of index) {
  const htmlPath = path.join(root, "life-os", entry.slug, "index.html");
  const articlePath = path.join(contentRoot, `${entry.slug}.json`);
  const article = JSON.parse(await readFile(articlePath, "utf8"));
  const source = sourceDetails(article);
  let html = await readFile(htmlPath, "utf8");
  const before = html;

  html = cleanLegacyBrand(html);

  if (sensitiveZones.has(entry.zone?.slug) && !source.hasSource) {
    if (!/<meta\s+name=["']robots["']/i.test(html)) {
      html = html.replace(
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,follow\">",
      );
    }
    protectedSensitive += 1;
  }

  if (!html.includes('data-protocol-summary="true"')) {
    const summary = protocolSummary(article, entry, source);
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

console.log(`Generated content sanitized: ${changed} pages changed; ${protocolSummaries} protocol summaries added; ${protectedSensitive} unsourced sensitive pages protected from indexing.`);
