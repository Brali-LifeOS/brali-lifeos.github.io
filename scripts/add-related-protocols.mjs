import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const publicIndex = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const normalize = (value = "") => String(value).trim().toLowerCase();
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const publicBySlug = new Map(publicIndex.map((entry) => [entry.slug, entry]));
const areaByZone = new Map();
for (const area of areas) for (const zone of area.zones) areaByZone.set(zone, area.slug);

function keywordSet(entry) {
  return new Set((entry.keywords ?? []).map(normalize).filter((value) => value && value !== "life os"));
}

function sharedKeywords(a, b) {
  const left = keywordSet(a);
  const right = keywordSet(b);
  let count = 0;
  for (const keyword of left) if (right.has(keyword)) count += 1;
  return count;
}

function candidateScore(current, candidate) {
  let score = 0;
  if (candidate.zone?.slug === current.zone?.slug) score += 100;
  const currentArea = areaByZone.get(current.zone?.slug);
  const candidateArea = areaByZone.get(candidate.zone?.slug);
  if (currentArea && currentArea === candidateArea) score += 30;
  score += sharedKeywords(current, candidate) * 8;
  return score;
}

const eligible = sourceIndex.filter((entry) => evidenceBySlug.get(entry.slug)?.indexable === true);
if (eligible.length < 3) throw new Error("Related protocol graph requires at least three indexable entries.");
let linkedPages = 0;
let totalLinks = 0;

for (const current of sourceIndex) {
  const related = eligible
    .filter((candidate) => candidate.slug !== current.slug)
    .map((candidate) => ({ candidate, score: candidateScore(current, candidate) }))
    .sort((a, b) => b.score - a.score || (publicBySlug.get(a.candidate.slug)?.displayTitle ?? a.candidate.title).localeCompare(publicBySlug.get(b.candidate.slug)?.displayTitle ?? b.candidate.title))
    .slice(0, 3)
    .map(({ candidate }) => candidate);

  const items = related.map((candidate) => {
    const publicEntry = publicBySlug.get(candidate.slug);
    const title = publicEntry?.displayTitle || candidate.title;
    const description = candidate.description ? `<span>${escapeHtml(candidate.description.slice(0, 150))}</span>` : "";
    return `<li><a href="/life-os/${candidate.slug}/">${escapeHtml(title)}</a>${description}</li>`;
  }).join("");

  const section = `<section class="prose related-protocols" data-related-protocols="true"><h2>Related protocols</h2><p>Continue with another reviewed or low-risk practical entry that is close to this topic or Life Area.</p><ul class="article-list">${items}</ul></section>`;
  const pagePath = path.join(root, "life-os", current.slug, "index.html");
  let html = await readFile(pagePath, "utf8");
  if (html.includes('data-related-protocols="true"')) continue;

  const finalCallout = '<aside class="callout"><h3>Use this as a starting point</h3>';
  if (html.includes(finalCallout)) html = html.replace(finalCallout, `${section}${finalCallout}`);
  else html = html.replace("</main>", `${section}</main>`);
  await writeFile(pagePath, html);
  linkedPages += 1;
  totalLinks += related.length;
}

console.log(`Related protocols added to ${linkedPages} pages with ${totalLinks} internal links; only indexable entries are recommended.`);
