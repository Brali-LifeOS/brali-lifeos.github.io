import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadKnowledgeOntology } from "./lib/knowledge-ontology.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const contentRoot = path.join(root, "data/life-os-content");
const sourceIndex = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const publicIndex = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const { classifyRecord } = await loadKnowledgeOntology(root);

const publicBySlug = new Map(publicIndex.map((entry) => [entry.slug, entry]));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const areaByZone = new Map();
for (const area of areas) for (const zone of area.zones) areaByZone.set(zone, area);
const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
const protocolId = (entry) => clean(entry.protocolId) || `brali:${entry.slug}`;

const protocols = [];
for (const entry of sourceIndex) {
  const trust = evidenceBySlug.get(entry.slug);
  if (!trust?.indexable) continue;

  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const original = article.lifeOsSource ?? {};
  const area = areaByZone.get(entry.zone?.slug) ?? null;
  const publicEntry = publicBySlug.get(entry.slug) ?? entry;
  const action = clean(original.whatYouDo || article.description || entry.description || "Choose one small version of this practice to try.");
  const checkIn = clean(original.checkIn || article.checkIn || "");
  const ontology = classifyRecord(article, entry.zone.slug);

  protocols.push({
    protocol_id: protocolId(entry),
    language: "en",
    slug: entry.slug,
    url: `${base}/life-os/${entry.slug}/`,
    title: clean(publicEntry.displayTitle || entry.title),
    description: clean(entry.description),
    ontology,
    life_area: area ? { slug: area.slug, title: area.title } : null,
    growth_zone: { slug: entry.zone.slug, title: entry.zone.title },
    action,
    check_in: checkIn || null,
    keywords: [...new Set((entry.keywords ?? []).map(clean).filter(Boolean))],
    evidence: {
      status: trust.status,
      source_recorded: Boolean(trust.source?.recorded),
      source_url: trust.status === "reviewed" ? (trust.source?.url ?? null) : null,
      reviewed_at: trust.review?.reviewedAt ?? null,
    },
  });
}

protocols.sort((a, b) => a.title.localeCompare(b.title));
const topicMapped = protocols.filter((entry) => entry.ontology?.topics?.length).length;
const topicPending = protocols.length - topicMapped;

const output = {
  schema_version: 3,
  name: "Brali Protocol Feed",
  description: "Practical protocols that currently meet the Brali public quality and indexing bar, with Brali ontology classification.",
  canonical_url: `${base}/life-os/datasets/protocols.json`,
  canonical_language: "en",
  license: "CC BY-NC-SA 4.0; Brali names and logos are not licensed for reuse.",
  selection_rule: "Only entries with evidence status reviewed or practical are included.",
  identity_rule: "protocol_id identifies the underlying protocol. Future language versions should keep the same protocol_id and change the language field.",
  ontology_rule: "Use ontology.domains/topics/methods/lenses for new integrations. life_area and growth_zone remain compatibility fields. topic-pending means the legacy collection identifies a Method or Lens but the specific Topic still requires editorial classification.",
  source_rule: "External source URLs are exposed only for reviewed entries. A recorded but unreviewed source is not presented as supporting evidence in this feed.",
  count: protocols.length,
  ontology_coverage: { topic_mapped: topicMapped, topic_pending: topicPending },
  fields: ["protocol_id", "language", "slug", "url", "title", "description", "ontology", "life_area", "growth_zone", "action", "check_in", "keywords", "evidence"],
  entries: protocols,
};

await writeFile(path.join(root, "life-os/datasets/protocols.json"), JSON.stringify(output, null, 2));

const homepageRoutes = {
  focus: {
    slug: "top-3-daily-focus-planner",
    match: "A bounded plan that reduces competing priorities",
  },
  memory: {
    slug: "active-recall-test-yourself",
    match: "Retrieval practice with its evidence boundary visible",
  },
  stress: {
    slug: "abdominal-breathing-stress-relief",
    match: "A short breathing practice with its boundary visible",
  },
  sleep: {
    slug: "stop-caffeine-after-lunch",
    match: "A repeatable cutoff to inspect for your sleep routine",
  },
};
const protocolBySlug = new Map(protocols.map((entry) => [entry.slug, entry]));
const homepageGoals = {};
const trustLabel = (status) => status === "reviewed" ? "Reviewed" : "Practical";
const trustLimit = (status) => status === "reviewed"
  ? "Reviewed evidence record. Open the full protocol for supported claims, limitations, and source context."
  : "Practical guidance without a reviewed effectiveness claim. Open the full protocol for boundaries and context.";

for (const [goal, route] of Object.entries(homepageRoutes)) {
  const protocol = protocolBySlug.get(route.slug);
  if (!protocol) throw new Error(`Homepage matcher route is not present in the trusted Protocol Feed: ${goal}/${route.slug}`);
  const sourceHref = protocol.evidence?.source_url || protocol.url;
  const steps = [
    ["Try", protocol.action, "Now"],
    ...(protocol.check_in ? [["Check in", protocol.check_in, "After"]] : []),
    ["Inspect", "Read the full protocol for evidence notes, limitations, and source context.", "Before relying"],
  ];
  homepageGoals[goal] = {
    slug: protocol.slug,
    protocol_id: protocol.protocol_id,
    match: route.match,
    title: protocol.title,
    summary: protocol.description || protocol.action,
    trust: trustLabel(protocol.evidence.status),
    evidence_status: protocol.evidence.status,
    source: protocol.evidence?.source_url ? "Reviewed source attached" : "Brali protocol record",
    source_href: sourceHref,
    limit: trustLimit(protocol.evidence.status),
    href: new URL(protocol.url).pathname,
    steps,
  };
}

const homepageMatcher = {
  schema_version: 1,
  generated_from: "/life-os/datasets/protocols.json",
  generated_from_schema_version: output.schema_version,
  goals: homepageGoals,
};
await writeFile(path.join(root, "homepage-matcher.json"), `${JSON.stringify(homepageMatcher, null, 2)}\n`);

const manifestPath = path.join(root, "life-os/datasets/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "protocols.json"] )];
manifest.protocol_feed = {
  count: protocols.length,
  schema_version: output.schema_version,
  canonical_language: output.canonical_language,
  selection_rule: output.selection_rule,
  ontology_coverage: output.ontology_coverage,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPath = path.join(root, "life-os/datasets/index.html");
let datasetsHtml = await readFile(datasetsPath, "utf8");
if (!datasetsHtml.includes("/life-os/datasets/protocols.json")) {
  datasetsHtml = datasetsHtml.replace(
    "</ul>",
    '<li><a href="/life-os/datasets/protocols.json">Trusted protocol feed (JSON)</a></li></ul>',
  );
  await writeFile(datasetsPath, datasetsHtml);
}

console.log(`Protocol feed generated: ${protocols.length} discovery-ready entries; ${topicMapped} topic-mapped, ${topicPending} topic-pending; homepage matcher generated from ${Object.keys(homepageGoals).length} canonical protocol records.`);
