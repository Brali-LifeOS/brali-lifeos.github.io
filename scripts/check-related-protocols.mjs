import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const ecosystemData = JSON.parse(await readFile(path.join(root, "data/ecosystem-relations.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const sourceSlugs = new Set(sourceIndex.map((entry) => entry.slug));

const ECOSYSTEM_RELATION_POLICIES = {
  understand_with: {
    targetProject: "cognitive-biases",
    targetKind: "cognitive_bias",
    targetIdPrefix: "cognitive-biases:bias:",
    targetHostname: "cognitive-biases.github.io",
    targetPathPrefix: "/biases/",
    heading: "Understand the mechanism",
  },
  structure_with: {
    targetProject: "metkagram",
    targetKind: "method_guide",
    targetIdPrefix: "metkagram:method-guide:",
    targetHostname: "metkagram.github.io",
    targetPathPrefix: "/en/method/guides/",
    heading: "Add language structure",
  },
};

let missing = 0;
let wrongCount = 0;
let unsafeLinks = 0;
let ecosystemErrors = 0;

for (const entry of sourceIndex) {
  const html = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  const section = html.match(/<section class="prose related-protocols" data-related-protocols="true">([\s\S]*?)<\/section>/);
  if (!section) {
    missing += 1;
    continue;
  }
  const links = [...section[1].matchAll(/href="\/life-os\/([^/]+)\/"/g)].map((match) => match[1]);
  if (links.length !== 3) wrongCount += 1;
  for (const slug of links) {
    if (slug === entry.slug || evidenceBySlug.get(slug)?.indexable !== true) unsafeLinks += 1;
  }
}

if (ecosystemData.schemaVersion !== "1.0" || ecosystemData.publisher !== "brali" || ecosystemData.contract !== "outbound-contextual-relations-v1") {
  ecosystemErrors += 1;
}

const relationIds = new Set();
const relationCountBySource = new Map();
for (const relation of ecosystemData.relations ?? []) {
  const source = relation.source ?? {};
  const target = relation.target ?? {};
  const policy = ECOSYSTEM_RELATION_POLICIES[relation.relationType];
  if (!relation.id || relationIds.has(relation.id)) ecosystemErrors += 1;
  relationIds.add(relation.id);
  if (!policy || relation.basis !== "curated-semantic-handoff" || relation.confidence !== "high") ecosystemErrors += 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(relation.reviewedAt ?? "") || !relation.userJob) ecosystemErrors += 1;
  if (source.project !== "brali" || source.kind !== "hack" || !sourceSlugs.has(source.slug)) ecosystemErrors += 1;
  if (source.id !== `brali:hack:${source.slug}` || source.url !== `https://brali-lifeos.github.io/life-os/${source.slug}/`) ecosystemErrors += 1;
  if (evidenceBySlug.get(source.slug)?.indexable !== true) ecosystemErrors += 1;
  if (!policy || target.project !== policy.targetProject || target.kind !== policy.targetKind || !String(target.id ?? "").startsWith(policy.targetIdPrefix) || !target.label || !target.description) ecosystemErrors += 1;
  try {
    const targetUrl = new URL(target.url);
    if (!policy || targetUrl.protocol !== "https:" || targetUrl.hostname !== policy.targetHostname || !targetUrl.pathname.startsWith(policy.targetPathPrefix)) ecosystemErrors += 1;
  } catch {
    ecosystemErrors += 1;
  }

  const count = (relationCountBySource.get(source.slug) ?? 0) + 1;
  relationCountBySource.set(source.slug, count);
  if (count > 2) ecosystemErrors += 1;
}

for (const [slug, count] of relationCountBySource) {
  const html = await readFile(path.join(root, "life-os", slug, "index.html"), "utf8");
  const sections = [...html.matchAll(/<section class="prose ecosystem-context" data-ecosystem-context="true">([\s\S]*?)<\/section>/g)];
  if (sections.length !== 1) {
    ecosystemErrors += 1;
    continue;
  }
  const section = sections[0][1];
  const relationIdsInPage = [...section.matchAll(/data-ecosystem-relation-id="([^"]+)"/g)].map((match) => match[1]);
  if (relationIdsInPage.length !== count) ecosystemErrors += 1;
  for (const relation of (ecosystemData.relations ?? []).filter((item) => item.source?.slug === slug)) {
    const policy = ECOSYSTEM_RELATION_POLICIES[relation.relationType];
    if (!relationIdsInPage.includes(relation.id) || !section.includes(`href="${relation.target.url}"`)) ecosystemErrors += 1;
    if (!section.includes(`data-ecosystem-relation-type="${relation.relationType}"`) || !section.includes(policy.heading)) ecosystemErrors += 1;
  }
  if (!section.includes("does not validate this Brali protocol")) ecosystemErrors += 1;
}

if (missing || wrongCount || unsafeLinks || ecosystemErrors) {
  throw new Error(`Related protocol validation failed: missing=${missing}, wrong link count=${wrongCount}, self/non-indexable links=${unsafeLinks}, ecosystem=${ecosystemErrors}.`);
}
console.log(`Related protocol graph verified for ${sourceIndex.length} Growth Library entries; only indexable entries are recommended.`);
console.log(`Ecosystem relation overlay verified for ${relationCountBySource.size} Brali pages and ${relationIds.size} curated handoffs.`);
