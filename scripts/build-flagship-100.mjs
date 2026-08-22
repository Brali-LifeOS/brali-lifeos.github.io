import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://brali-lifeos.github.io";
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const writeJson = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const writeText = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const clean = (value = "") => String(value ?? "").replace(/\s+/g, " ").trim();
const itemId = (value) => typeof value === "string" ? value : clean(value?.id || value?.slug || value?.title);
const escapeHtml = (value = "") => clean(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[character]);

const policy = read("data/flagship-100-policy.json");
const startHere = read(policy.anchor_source);
const protocols = read("life-os/datasets/protocols.json");
const areas = read("data/life-areas.json");
const platform = read("data/platform.json");
const identity = read("life-os/datasets/identity.json");

const trustedStates = new Set(policy.trusted_states || []);
const areaIds = new Set(areas.map((area) => area.slug));
const anchorSlugs = areas.map((area) => startHere.areas?.[area.slug]).filter(Boolean);
const anchorSet = new Set(anchorSlugs);
const canonicalBySlug = new Map(
  (identity.identities || [])
    .filter((entry) => entry.kind === "protocol")
    .map((entry) => [clean(entry.local_id), entry.id]),
);
const sensitivePattern = new RegExp(
  (policy.sensitive_terms || [])
    .map((term) => String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "i",
);
const scorePolicy = policy.scoring || {};
const contract = policy.quality_contract || {};

function evaluate(entry) {
  const evidence = entry.evidence || {};
  const state = clean(evidence.status);
  const area = entry.life_area?.slug || null;
  const topics = (entry.ontology?.topics || []).map(itemId).filter(Boolean);
  const searchable = [
    entry.title,
    entry.description,
    entry.action,
    entry.check_in,
    ...(entry.keywords || []),
    entry.growth_zone?.title,
  ].map(clean).join(" ");
  const sensitive = Boolean(searchable && sensitivePattern.test(searchable));
  const checks = {
    trusted_state: trustedStates.has(state),
    required_identity: Boolean(clean(entry.protocol_id) && clean(entry.slug) && clean(entry.url)),
    required_content: Boolean(clean(entry.title) && clean(entry.description) && clean(entry.action)),
    valid_life_area: Boolean(area && areaIds.has(area)),
    sensitive_boundary: !sensitive || (state === "reviewed" && Boolean(evidence.source_url)),
    topic_mapped: topics.length > 0,
    has_check_in: Boolean(clean(entry.check_in)),
    source_linked: Boolean(evidence.source_url),
    action_quality: clean(entry.action).length >= Number(contract.minimum_action_characters_for_score || 40),
    description_quality: clean(entry.description).length >= Number(contract.minimum_description_characters_for_score || 60),
  };
  const ineligibleReasons = [];
  if (!checks.trusted_state) ineligibleReasons.push("untrusted-evidence-state");
  if (!checks.required_identity) ineligibleReasons.push("missing-identity");
  if (!checks.required_content) ineligibleReasons.push("missing-core-content");
  if (!checks.valid_life_area) ineligibleReasons.push("missing-or-invalid-life-area");
  if (!checks.sensitive_boundary) ineligibleReasons.push("sensitive-content-without-reviewed-source");
  const eligible = ineligibleReasons.length === 0;

  let qualityScore = 0;
  qualityScore += Number(scorePolicy[state] || 0);
  if (checks.source_linked) qualityScore += Number(scorePolicy.source_url || 0);
  if (checks.topic_mapped) qualityScore += Number(scorePolicy.topic_mapped || 0);
  if (checks.has_check_in) qualityScore += Number(scorePolicy.check_in || 0);
  if (checks.action_quality) qualityScore += Number(scorePolicy.action_quality || 0);
  if (checks.description_quality) qualityScore += Number(scorePolicy.description_quality || 0);

  const strengths = [
    state === "reviewed" ? "source-reviewed" : "trusted-practical",
    checks.source_linked ? "source-linked" : null,
    checks.topic_mapped ? "topic-mapped" : "topic-pending",
    checks.has_check_in ? "has-check-in" : null,
    checks.action_quality ? "clear-action" : null,
    checks.description_quality ? "clear-description" : null,
    anchorSet.has(entry.slug) ? "start-here-anchor" : null,
  ].filter(Boolean);

  return {
    canonical_id: canonicalBySlug.get(entry.slug) || `brali:protocol:${entry.slug}`,
    protocol_id: entry.protocol_id,
    slug: entry.slug,
    url: entry.url,
    title: entry.title,
    description: entry.description,
    action: entry.action,
    check_in: entry.check_in || null,
    life_area: entry.life_area,
    growth_zone: entry.growth_zone,
    ontology: entry.ontology,
    evidence,
    sensitive,
    eligible,
    quality_score: qualityScore,
    quality_checks: checks,
    strengths,
    ineligible_reasons: ineligibleReasons,
    selected: false,
    selection_rank: null,
    selection_score: null,
    selection_reason: null,
  };
}

const candidates = (protocols.entries || []).map(evaluate);
const bySlug = new Map(candidates.map((entry) => [entry.slug, entry]));
for (const slug of anchorSlugs) {
  const candidate = bySlug.get(slug);
  if (!candidate) throw new Error(`Flagship 100 anchor ${slug} is missing from the trusted Protocol Feed.`);
  if (!candidate.eligible) throw new Error(`Flagship 100 anchor ${slug} violates the quality contract: ${candidate.ineligible_reasons.join(", ")}`);
}

const selected = [];
const selectedSlugs = new Set();
const areaCounts = new Map();
const topicCounts = new Map();
const diversity = policy.diversity || {};

const addSelected = (candidate, reason, selectionScore) => {
  candidate.selected = true;
  candidate.selection_rank = selected.length + 1;
  candidate.selection_score = selectionScore;
  candidate.selection_reason = reason;
  selected.push(candidate);
  selectedSlugs.add(candidate.slug);
  const area = candidate.life_area?.slug || "unknown";
  areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
  const topics = (candidate.ontology?.topics || []).map(itemId).filter(Boolean);
  for (const topic of topics) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
};

for (const slug of anchorSlugs) {
  const candidate = bySlug.get(slug);
  addSelected(candidate, "manual-start-here-anchor", candidate.quality_score + 1000);
}

const target = Number(policy.target_count || 100);
const eligibleCount = candidates.filter((entry) => entry.eligible).length;
if (eligibleCount < target) {
  throw new Error(`Flagship 100 needs ${target} eligible protocols, but only ${eligibleCount} meet the quality contract.`);
}

while (selected.length < target) {
  const remaining = candidates.filter((entry) => entry.eligible && !selectedSlugs.has(entry.slug));
  if (!remaining.length) break;
  const ranked = remaining.map((entry) => {
    const area = entry.life_area?.slug || "unknown";
    const areaCount = areaCounts.get(area) || 0;
    const areaBonus = Math.max(
      0,
      Number(diversity.life_area_bonus || 0) - areaCount * Number(diversity.life_area_decay || 0),
    );
    const topics = (entry.ontology?.topics || []).map(itemId).filter(Boolean);
    const leastUsedTopic = topics.length
      ? Math.min(...topics.map((topic) => topicCounts.get(topic) || 0))
      : Number(diversity.topic_bonus || 0);
    const topicBonus = topics.length
      ? Math.max(0, Number(diversity.topic_bonus || 0) - leastUsedTopic * Number(diversity.topic_decay || 0))
      : 0;
    return { entry, selectionScore: entry.quality_score + areaBonus + topicBonus, areaBonus, topicBonus };
  }).sort((a, b) =>
    b.selectionScore - a.selectionScore ||
    b.entry.quality_score - a.entry.quality_score ||
    a.entry.slug.localeCompare(b.entry.slug)
  );
  const best = ranked[0];
  addSelected(
    best.entry,
    `quality-ranked; life-area-bonus=${best.areaBonus}; topic-bonus=${best.topicBonus}`,
    best.selectionScore,
  );
}

if (selected.length !== target) throw new Error(`Flagship 100 selection stopped at ${selected.length}/${target}.`);

const selectedEntries = selected.map((entry) => ({
  canonical_id: entry.canonical_id,
  protocol_id: entry.protocol_id,
  slug: entry.slug,
  url: entry.url,
  title: entry.title,
  description: entry.description,
  action: entry.action,
  check_in: entry.check_in,
  life_area: entry.life_area,
  growth_zone: entry.growth_zone,
  ontology: entry.ontology,
  evidence: entry.evidence,
  sensitive: entry.sensitive,
  quality_score: entry.quality_score,
  quality_checks: entry.quality_checks,
  strengths: entry.strengths,
  selection_rank: entry.selection_rank,
  selection_score: entry.selection_score,
  selection_reason: entry.selection_reason,
}));

const areaCoverage = Object.fromEntries(
  areas.map((area) => [area.slug, selectedEntries.filter((entry) => entry.life_area?.slug === area.slug).length]),
);
const stateCoverage = selectedEntries.reduce((acc, entry) => {
  const state = entry.evidence?.status || "unknown";
  acc[state] = (acc[state] || 0) + 1;
  return acc;
}, {});
const topicMapped = selectedEntries.filter((entry) => (entry.ontology?.topics || []).length > 0).length;
const sourceLinked = selectedEntries.filter((entry) => Boolean(entry.evidence?.source_url)).length;

const core = {
  schema_version: 1,
  dataset_version: platform.dataset_version,
  name: "Brali Flagship 100",
  description: "A deterministic high-trust core selected from the Brali trusted Protocol Feed. The seven manually curated Start Here protocols are preserved as anchors.",
  canonical_url: `${BASE}/life-os/datasets/flagship-100.json`,
  page_url: `${BASE}/life-os/flagships/curated-100/`,
  target_count: target,
  count: selectedEntries.length,
  target_met: selectedEntries.length === target,
  quality_policy: "/data/flagship-100-policy.json",
  selection_rule: "Trusted feed only; complete core content; safety-sensitive items require reviewed evidence with a source URL; then deterministic quality and diversity ranking.",
  caveat: "Flagship status is a retrieval and editorial quality signal. It does not mean every protocol has the same evidence strength or that Brali provides medical advice.",
  summary: {
    eligible_candidates: eligibleCount,
    candidate_count: candidates.length,
    manual_anchors: anchorSlugs.length,
    topic_mapped: topicMapped,
    source_linked: sourceLinked,
    evidence_states: stateCoverage,
    life_areas: areaCoverage,
  },
  entries: selectedEntries,
};
const candidateDoc = {
  schema_version: 1,
  dataset_version: platform.dataset_version,
  name: "Brali Flagship 100 candidate queue",
  policy: "/data/flagship-100-policy.json",
  target_count: target,
  summary: {
    candidates: candidates.length,
    eligible: eligibleCount,
    ineligible: candidates.length - eligibleCount,
    selected: selectedEntries.length,
  },
  entries: candidates.sort((a, b) =>
    Number(b.selected) - Number(a.selected) ||
    b.quality_score - a.quality_score ||
    a.slug.localeCompare(b.slug)
  ),
};

writeJson("life-os/datasets/flagship-100.json", core);
writeJson("life-os/datasets/flagship-100-candidates.json", candidateDoc);

const grouped = areas.map((area) => {
  const items = selectedEntries.filter((entry) => entry.life_area?.slug === area.slug);
  return `<section class="prose"><h2>${escapeHtml(area.title)} <small>${items.length}</small></h2><div class="grid two">${items.map((entry) =>
    `<article class="card"><span class="card-label">#${entry.selection_rank} · ${escapeHtml(entry.evidence?.status)} · score ${entry.quality_score}</span><h3><a href="/life-os/${escapeHtml(entry.slug)}/">${escapeHtml(entry.title)}</a></h3><p>${escapeHtml(entry.action)}</p><p><small>${escapeHtml(entry.strengths.join(" · "))}</small></p></article>`
  ).join("")}</div></section>`;
}).join("");
const pageCanonical = `${BASE}/life-os/flagships/curated-100/`;
const legacyPageCanonical = `${BASE}/life-os/flagships/100/`;
const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Brali Flagship 100",
  description: "100 high-trust practical protocols selected with a transparent quality and safety contract.",
  url: pageCanonical,
  hasPart: selectedEntries.map((entry) => ({ "@type": "Article", name: entry.title, url: entry.url })),
};
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flagship 100 — Brali high-trust protocol core</title><meta name="description" content="100 high-trust Brali protocols selected with a transparent quality, evidence, safety, and diversity contract."><link rel="canonical" href="${pageCanonical}"><meta property="og:type" content="website"><meta property="og:title" content="Brali Flagship 100"><meta property="og:description" content="A smaller high-trust core for people and AI agents."><meta property="og:url" content="${pageCanonical}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/flagships/">Start Here 7</a><a href="/life-os/">Library</a><a href="/ontology/">Ontology</a><a href="/for-ai/">For AI</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">High-trust core</p><h1>Flagship 100</h1><p class="lead">A deliberately smaller core for retrieval and practical use. The seven manually curated Start Here protocols remain anchors; the rest are selected deterministically from the trusted Protocol Feed using evidence, completeness, safety, ontology, and diversity signals.</p><div class="callout"><h3>What this badge means</h3><p>Flagship means the protocol meets Brali's retrieval and editorial quality contract. It does not mean every item has identical scientific evidence, and it is not medical advice.</p><p><a href="/life-os/datasets/flagship-100.json">Selected 100 (JSON)</a> · <a href="/life-os/datasets/flagship-100-candidates.json">Candidate audit trail (JSON)</a> · <a href="/data/flagship-100-policy.json">Selection policy</a></p></div>${grouped}</main><footer class="footer"><div class="wrap footer-row"><small>Brali · Flagship 100 · transparent selection</small></div></footer></body></html>`;
writeText("life-os/flagships/curated-100/index.html", html);
writeText("life-os/flagships/100/index.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flagship 100 moved | Brali</title><meta name="description" content="The Brali Flagship 100 collection now has a clearer canonical URL."><meta name="robots" content="noindex,follow"><link rel="canonical" href="${pageCanonical}"><meta http-equiv="refresh" content="0;url=${pageCanonical}"><script>location.replace('/life-os/flagships/curated-100/'+location.search+location.hash)</script><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"></head><body><main id="content" class="page wrap"><p class="eyebrow">Address updated</p><h1>Flagship 100 has a clearer URL.</h1><p class="lead"><a href="/life-os/flagships/curated-100/">Open the curated Flagship 100 collection →</a></p></main></body></html>`);

const datasetIndexPath = path.join(ROOT, "life-os/datasets/index.html");
if (fs.existsSync(datasetIndexPath)) {
  let datasetHtml = fs.readFileSync(datasetIndexPath, "utf8");
  const additions = [
    ["/life-os/datasets/flagship-100.json", "Flagship 100 high-trust core (JSON)"],
    ["/life-os/datasets/flagship-100-candidates.json", "Flagship 100 candidate audit trail (JSON)"],
  ].filter(([href]) => !datasetHtml.includes(href));
  if (additions.length) {
    datasetHtml = datasetHtml.replace("</ul>", `${additions.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("")}</ul>`);
    fs.writeFileSync(datasetIndexPath, datasetHtml);
  }
}

const apiDir = `api/${platform.api_version}`;
writeJson(`${apiDir}/flagships.json`, core);
const apiIndex = read(`${apiDir}/index.json`);
apiIndex.endpoints = [...new Set([...(apiIndex.endpoints || []), "flagships.json"])];
writeJson(`${apiDir}/index.json`, apiIndex);
const openapi = read(`${apiDir}/openapi.json`);
openapi.paths ||= {};
openapi.paths[`/api/${platform.api_version}/flagships.json`] = {
  get: {
    operationId: "get_flagship_protocols",
    summary: "Get the Brali Flagship 100 high-trust protocol core",
    responses: {
      "200": {
        description: "Flagship 100 dataset",
        content: { "application/json": { schema: { type: "object" } } },
      },
    },
  },
};
writeJson(`${apiDir}/openapi.json`, openapi);

const manifestPath = "life-os/datasets/manifest.json";
const manifest = read(manifestPath);
const publishFiles = [
  "life-os/datasets/flagships.json",
  "life-os/datasets/flagship-100.json",
  "life-os/datasets/flagship-100-candidates.json",
  "data/flagship-100-policy.json",
];
manifest.files = (manifest.files || []).filter((entry) => !publishFiles.includes(typeof entry === "string" ? entry : entry.path));
for (const rel of publishFiles) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const doc = JSON.parse(text);
  const count = Array.isArray(doc) ? doc.length : Array.isArray(doc.entries) ? doc.entries.length : doc.count ?? null;
  manifest.files.push({ path: rel, sha256: hash(text), bytes: Buffer.byteLength(text), count });
}
manifest.files.sort((a, b) => String(a.path || a).localeCompare(String(b.path || b)));
manifest.counts ||= {};
manifest.counts.start_here_flagships = anchorSlugs.length;
manifest.counts.flagship_protocols = selectedEntries.length;
writeJson(manifestPath, manifest);
writeJson(`${apiDir}/manifest.json`, manifest);

const sitemapPath = path.join(ROOT, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, "utf8");
  sitemap = sitemap.replace(`  <url><loc>${legacyPageCanonical}</loc></url>\n`, "");
  if (!sitemap.includes(`<loc>${pageCanonical}</loc>`)) {
    sitemap = sitemap.replace("</urlset>", `  <url><loc>${pageCanonical}</loc></url>\n</urlset>`);
    fs.writeFileSync(sitemapPath, sitemap);
  }
}

console.log(`Flagship 100 generated: ${selectedEntries.length}/${target} selected from ${eligibleCount} eligible candidates across ${Object.keys(areaCoverage).length} Life Areas.`);
