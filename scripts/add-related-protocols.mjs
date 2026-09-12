import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const publicIndex = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const ecosystemData = JSON.parse(await readFile(path.join(root, "data/ecosystem-relations.json"), "utf8"));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const normalize = (value = "") => String(value).trim().toLowerCase();
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const publicBySlug = new Map(publicIndex.map((entry) => [entry.slug, entry]));
const sourceBySlug = new Map(sourceIndex.map((entry) => [entry.slug, entry]));
const areaByZone = new Map();
for (const area of areas) for (const zone of area.zones) areaByZone.set(zone, area.slug);

const ECOSYSTEM_RELATION_POLICIES = {
  understand_with: {
    targetProject: "cognitive-biases",
    targetKind: "cognitive_bias",
    targetIdPrefix: "cognitive-biases:bias:",
    targetHostname: "cognitive-biases.github.io",
    targetPathPrefix: "/biases/",
    heading: "Understand the mechanism",
    intro: "This Brali page is the action layer. The specialist reference below explains the concept, evidence and limits. It does not validate this Brali protocol or any inherited effect-size claim.",
  },
  structure_with: {
    targetProject: "metkagram",
    targetKind: "method_guide",
    targetIdPrefix: "metkagram:method-guide:",
    targetHostname: "metkagram.github.io",
    targetPathPrefix: "/en/method/guides/",
    heading: "Add language structure",
    intro: "Brali owns the short-session protocol. For a speaking-focused session, the specialist reference below supplies language structure and a different practice step. It does not validate this Brali protocol, prove learning transfer, or make Brali the source of the language material.",
  },
};

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

function validateEcosystemRelations() {
  if (ecosystemData.schemaVersion !== "1.0" || ecosystemData.publisher !== "brali" || ecosystemData.contract !== "outbound-contextual-relations-v1") {
    throw new Error("Unsupported ecosystem relation contract.");
  }

  const seen = new Set();
  const bySource = new Map();
  for (const relation of ecosystemData.relations ?? []) {
    if (!relation.id || seen.has(relation.id)) throw new Error(`Duplicate or missing ecosystem relation id: ${relation.id ?? "<missing>"}`);
    seen.add(relation.id);

    const policy = ECOSYSTEM_RELATION_POLICIES[relation.relationType];
    if (!policy || relation.basis !== "curated-semantic-handoff" || relation.confidence !== "high") {
      throw new Error(`Unsupported ecosystem relation semantics: ${relation.id}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(relation.reviewedAt ?? "")) throw new Error(`Missing ecosystem review date: ${relation.id}`);

    const source = relation.source ?? {};
    const target = relation.target ?? {};
    if (source.project !== "brali" || source.kind !== "hack" || !source.slug || !sourceBySlug.has(source.slug)) {
      throw new Error(`Unknown Brali ecosystem source: ${relation.id}`);
    }
    if (source.id !== `brali:hack:${source.slug}` || source.url !== `https://brali-lifeos.github.io/life-os/${source.slug}/`) {
      throw new Error(`Unstable Brali ecosystem source identity: ${relation.id}`);
    }
    if (evidenceBySlug.get(source.slug)?.indexable !== true) {
      throw new Error(`Ecosystem source is not current indexable guidance: ${relation.id}`);
    }
    if (target.project !== policy.targetProject || target.kind !== policy.targetKind || !String(target.id ?? "").startsWith(policy.targetIdPrefix)) {
      throw new Error(`Unsupported ecosystem target identity: ${relation.id}`);
    }

    let targetUrl;
    try {
      targetUrl = new URL(target.url);
    } catch {
      throw new Error(`Invalid ecosystem target URL: ${relation.id}`);
    }
    if (targetUrl.protocol !== "https:" || targetUrl.hostname !== policy.targetHostname || !targetUrl.pathname.startsWith(policy.targetPathPrefix) || !target.label || !target.description || !relation.userJob) {
      throw new Error(`Unsafe or incomplete ecosystem target: ${relation.id}`);
    }

    const relations = bySource.get(source.slug) ?? [];
    relations.push(relation);
    if (relations.length > 2) throw new Error(`Too many cross-project continuations for ${source.slug}.`);
    bySource.set(source.slug, relations);
  }
  return bySource;
}

const ecosystemBySource = validateEcosystemRelations();
const eligible = sourceIndex.filter((entry) => evidenceBySlug.get(entry.slug)?.indexable === true);
if (eligible.length < 3) throw new Error("Related protocol graph requires at least three indexable entries.");
let linkedPages = 0;
let totalLinks = 0;
let ecosystemPages = 0;
let ecosystemLinks = 0;

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

  const relatedSection = `<section class="prose related-protocols" data-related-protocols="true"><h2>Related protocols</h2><p>Continue with another reviewed or low-risk practical entry that is close to this topic or Life Area.</p><ul class="article-list">${items}</ul></section>`;
  const pagePath = path.join(root, "life-os", current.slug, "index.html");
  let html = await readFile(pagePath, "utf8");

  if (!html.includes('data-related-protocols="true"')) {
    const finalCallout = '<aside class="callout"><h3>Use this as a starting point</h3>';
    if (html.includes(finalCallout)) html = html.replace(finalCallout, `${relatedSection}${finalCallout}`);
    else html = html.replace("</main>", `${relatedSection}</main>`);
    linkedPages += 1;
    totalLinks += related.length;
  }

  html = html.replace(/<section class="prose ecosystem-context" data-ecosystem-context="true">[\s\S]*?<\/section>/g, "");
  const ecosystemRelations = ecosystemBySource.get(current.slug) ?? [];
  if (ecosystemRelations.length) {
    const grouped = new Map();
    for (const relation of ecosystemRelations) {
      const relations = grouped.get(relation.relationType) ?? [];
      relations.push(relation);
      grouped.set(relation.relationType, relations);
    }
    const groups = [...grouped.entries()].map(([relationType, relations]) => {
      const policy = ECOSYSTEM_RELATION_POLICIES[relationType];
      const ecosystemItems = relations.map((relation) => `<li data-ecosystem-relation-id="${escapeHtml(relation.id)}"><a href="${escapeHtml(relation.target.url)}">${escapeHtml(relation.target.label)}</a><span>${escapeHtml(relation.target.description)}</span></li>`).join("");
      return `<div class="ecosystem-context-group" data-ecosystem-relation-type="${escapeHtml(relationType)}"><h2>${escapeHtml(policy.heading)}</h2><p>${escapeHtml(policy.intro)}</p><ul class="article-list">${ecosystemItems}</ul></div>`;
    }).join("");
    const ecosystemSection = `<section class="prose ecosystem-context" data-ecosystem-context="true">${groups}</section>`;
    const relatedMarker = '<section class="prose related-protocols" data-related-protocols="true">';
    if (html.includes(relatedMarker)) html = html.replace(relatedMarker, `${ecosystemSection}${relatedMarker}`);
    else html = html.replace("</main>", `${ecosystemSection}</main>`);
    ecosystemPages += 1;
    ecosystemLinks += ecosystemRelations.length;
  }

  await writeFile(pagePath, html);
}

console.log(`Related protocols added to ${linkedPages} pages with ${totalLinks} internal links; only indexable entries are recommended.`);
console.log(`Ecosystem context rendered on ${ecosystemPages} pages with ${ecosystemLinks} curated cross-project handoffs.`);
