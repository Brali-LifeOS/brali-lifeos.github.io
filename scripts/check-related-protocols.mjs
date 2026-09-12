import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const ecosystemData = JSON.parse(await readFile(path.join(root, "data/ecosystem-relations.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const sourceSlugs = new Set(sourceIndex.map((entry) => entry.slug));
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
  if (!relation.id || relationIds.has(relation.id)) ecosystemErrors += 1;
  relationIds.add(relation.id);
  if (relation.relationType !== "understand_with" || relation.basis !== "curated-semantic-handoff" || relation.confidence !== "high") ecosystemErrors += 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(relation.reviewedAt ?? "") || !relation.userJob) ecosystemErrors += 1;
  if (source.project !== "brali" || source.kind !== "hack" || !sourceSlugs.has(source.slug)) ecosystemErrors += 1;
  if (source.id !== `brali:hack:${source.slug}` || source.url !== `https://brali-lifeos.github.io/life-os/${source.slug}/`) ecosystemErrors += 1;
  if (target.project !== "cognitive-biases" || target.kind !== "cognitive_bias" || !String(target.id ?? "").startsWith("cognitive-biases:bias:") || !target.label || !target.description) ecosystemErrors += 1;
  try {
    const targetUrl = new URL(target.url);
    if (targetUrl.protocol !== "https:" || targetUrl.hostname !== "cognitive-biases.github.io") ecosystemErrors += 1;
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
  const relationIdsInPage = [...sections[0][1].matchAll(/data-ecosystem-relation-id="([^"]+)"/g)].map((match) => match[1]);
  if (relationIdsInPage.length !== count) ecosystemErrors += 1;
  for (const relation of (ecosystemData.relations ?? []).filter((item) => item.source?.slug === slug)) {
    if (!relationIdsInPage.includes(relation.id) || !sections[0][1].includes(`href="${relation.target.url}"`)) ecosystemErrors += 1;
  }
  if (!sections[0][1].includes("does not validate this Brali protocol")) ecosystemErrors += 1;
}

if (missing || wrongCount || unsafeLinks || ecosystemErrors) {
  throw new Error(`Related protocol validation failed: missing=${missing}, wrong link count=${wrongCount}, self/non-indexable links=${unsafeLinks}, ecosystem=${ecosystemErrors}.`);
}
console.log(`Related protocol graph verified for ${sourceIndex.length} Growth Library entries; only indexable entries are recommended.`);
console.log(`Ecosystem relation overlay verified for ${relationCountBySource.size} Brali pages and ${relationIds.size} curated handoffs.`);
