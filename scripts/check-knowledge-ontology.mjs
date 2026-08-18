import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ontology = JSON.parse(await readFile(path.join(root, "data/knowledge-ontology.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/ontology-overrides.json"), "utf8"));
const zones = JSON.parse(await readFile(path.join(root, "data/life-os-zones.json"), "utf8"));
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const hacksSchema = JSON.parse(await readFile(path.join(root, "contracts/hack.schema.json"), "utf8"));
const protocolSchema = JSON.parse(await readFile(path.join(root, "contracts/protocol.schema.json"), "utf8"));
const failures = [];

const uniqueIds = (items, label) => {
  const ids = items.map((item) => item.id);
  for (const id of ids.filter((value, index) => ids.indexOf(value) !== index)) failures.push(`${label}: duplicate id ${id}`);
  return new Set(ids);
};
const domains = uniqueIds(ontology.domains ?? [], "domains");
const topics = uniqueIds(ontology.topics ?? [], "topics");
const methods = uniqueIds(ontology.methods ?? [], "methods");
const lenses = uniqueIds(ontology.lenses ?? [], "lenses");

if (ontology.schema_version !== 2) failures.push("ontology schema_version must be 2");
if ((ontology.domains ?? []).length < 8) failures.push("ontology should contain at least 8 domains");
if ((ontology.topics ?? []).length < 30) failures.push("ontology should contain a useful topic layer, not only renamed legacy zones");
if (!(ontology.methods ?? []).length || !(ontology.lenses ?? []).length) failures.push("ontology must separate Methods and Lenses");

for (const topic of ontology.topics ?? []) {
  if (!domains.has(topic.domain_id)) failures.push(`topic ${topic.id}: unknown domain ${topic.domain_id}`);
  if (!topic.description || !topic.status) failures.push(`topic ${topic.id}: description/status missing`);
}
for (const item of [...(ontology.methods ?? []), ...(ontology.lenses ?? [])]) {
  if (!item.description || !item.status) failures.push(`${item.id}: description/status missing`);
}

const zoneSlugs = new Set(zones.map((zone) => zone.slug));
const mapping = ontology.legacy_zone_map ?? {};
for (const slug of zoneSlugs) if (!mapping[slug]) failures.push(`legacy zone not mapped: ${slug}`);
for (const slug of Object.keys(mapping)) if (!zoneSlugs.has(slug)) failures.push(`ontology maps unknown legacy zone: ${slug}`);
for (const [slug, target] of Object.entries(mapping)) {
  const registry = target.kind === "topic" ? topics : target.kind === "method" ? methods : target.kind === "lens" ? lenses : null;
  if (!registry) failures.push(`${slug}: invalid mapping kind ${target.kind}`);
  else if (!registry.has(target.target_id)) failures.push(`${slug}: unknown ${target.kind} ${target.target_id}`);
}

const knownEntries = new Set(sourceIndex.map((entry) => entry.slug));
if (overrides.schema_version !== 1) failures.push("ontology overrides schema_version must be 1");
for (const [slug, override] of Object.entries(overrides.entries ?? {})) {
  if (!knownEntries.has(slug)) failures.push(`ontology override references unknown entry: ${slug}`);
  if (!Array.isArray(override.topic_ids) || !override.topic_ids.length) failures.push(`${slug}: ontology override must assign at least one Topic`);
  for (const id of override.topic_ids ?? []) if (!topics.has(id)) failures.push(`${slug}: ontology override references unknown Topic ${id}`);
  for (const id of override.domain_ids ?? []) if (!domains.has(id)) failures.push(`${slug}: ontology override references unknown Domain ${id}`);
  for (const id of override.method_ids ?? []) if (!methods.has(id)) failures.push(`${slug}: ontology override references unknown Method ${id}`);
  for (const id of override.lens_ids ?? []) if (!lenses.has(id)) failures.push(`${slug}: ontology override references unknown Lens ${id}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(override.reviewed_at ?? "") || !override.reviewed_by || !override.reason) failures.push(`${slug}: ontology override lacks review provenance`);
}

for (const [schema, label] of [[hacksSchema, "hack"], [protocolSchema, "protocol"]]) {
  for (const field of ["domain_slugs", "topic_slugs", "method_slugs", "lens_slugs"]) {
    if (!schema.properties?.[field]) failures.push(`${label} contract missing ontology field ${field}`);
  }
}

const requiredPages = [
  "ontology/index.html",
  "ontology/topics/index.html",
  "ontology/methods/index.html",
  "ontology/lenses/index.html",
  "life-os/datasets/ontology.json",
  "life-os/datasets/ontology-overrides.json",
];
for (const domain of ontology.domains ?? []) requiredPages.push(`ontology/domains/${domain.id}/index.html`);
for (const topic of ontology.topics ?? []) requiredPages.push(`ontology/topics/${topic.id}/index.html`);
for (const method of ontology.methods ?? []) requiredPages.push(`ontology/methods/${method.id}/index.html`);
for (const lens of ontology.lenses ?? []) requiredPages.push(`ontology/lenses/${lens.id}/index.html`);
for (const zone of zones) requiredPages.push(`life-os/${zone.slug}/index.html`);
for (const file of requiredPages) {
  try { await access(path.join(root, file)); }
  catch { failures.push(`generated ontology/compatibility page missing: ${file}`); }
}

const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
if (!library.includes('href="/ontology/"')) failures.push("Growth Library does not link to the ontology");
if (!library.includes('data-ontology-entry="true"')) failures.push("Growth Library ontology migration callout missing");
const areas = await readFile(path.join(root, "life-os/areas/index.html"), "utf8");
if (!areas.includes('data-domain-migration="true"')) failures.push("legacy Life Areas page does not explain Domain migration");
const dataset = JSON.parse(await readFile(path.join(root, "life-os/datasets/ontology.json"), "utf8"));
const publicOverrides = JSON.parse(await readFile(path.join(root, "life-os/datasets/ontology-overrides.json"), "utf8"));
if (dataset.schema_version !== 2 || Object.keys(dataset.legacy_zone_map ?? {}).length !== zones.length) failures.push("published ontology dataset is incomplete");
if (Object.keys(publicOverrides.entries ?? {}).length !== Object.keys(overrides.entries ?? {}).length) failures.push("published ontology overrides are incomplete");
if (!dataset.topics?.some((topic) => topic.id === "environment-design")) failures.push("published ontology dataset lacks Environment Design Topic");

const memoryPage = await readFile(path.join(root, "ontology/topics/memory/index.html"), "utf8");
if (!memoryPage.includes('/life-os/detective-mnemonic-memory-tricks/')) failures.push("Memory Topic page does not include reviewed record-level classification");
const environmentPage = await readFile(path.join(root, "ontology/topics/environment-design/index.html"), "utf8");
for (const slug of ["home-privacy-planner", "ergonomic-workspace-assessment", "smart-home-roi-planner"]) {
  if (!environmentPage.includes(`/life-os/${slug}/`)) failures.push(`Environment Design Topic page missing reviewed classification ${slug}`);
}

for (const zone of zones) {
  const html = await readFile(path.join(root, "life-os", zone.slug, "index.html"), "utf8");
  if (!html.includes('data-ontology-mapping="true"')) failures.push(`${zone.slug}: public legacy collection lacks ontology mapping`);
}

if (failures.length) throw new Error(`Knowledge ontology validation failed with ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
console.log(`Knowledge ontology verified: ${ontology.domains.length} domains, ${ontology.topics.length} topics, ${ontology.methods.length} methods, ${ontology.lenses.length} lenses, ${Object.keys(overrides.entries ?? {}).length} reviewed entry overrides, ${zones.length} preserved legacy zones.`);
