import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadKnowledgeOntology } from "./lib/knowledge-ontology.mjs";

const root = process.cwd();
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const feed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const matcherRaw = await readFile(path.join(root, "homepage-matcher.json"), "utf8");
const matcher = JSON.parse(matcherRaw);
const homepageJs = await readFile(path.join(root, "homepage.js"), "utf8");
const homepageHtml = await readFile(path.join(root, "index.html"), "utf8");
const { ontology } = await loadKnowledgeOntology(root);
const eligible = new Set((evidence.entries ?? []).filter((record) => record.indexable).map((record) => record.slug));
const domainIds = new Set(ontology.domains.map((item) => item.id));
const topicIds = new Set(ontology.topics.map((item) => item.id));
const methodIds = new Set(ontology.methods.map((item) => item.id));
const lensIds = new Set(ontology.lenses.map((item) => item.id));
const seenSlugs = new Set();
const seenIds = new Set();
let invalid = 0;

if (feed.schema_version !== 3 || feed.canonical_language !== "en") invalid += 1;
if (!feed.source_rule?.includes("reviewed entries")) invalid += 1;
if (!feed.ontology_rule?.includes("topic-pending")) invalid += 1;

for (const protocol of feed.entries ?? []) {
  if (!protocol.slug || seenSlugs.has(protocol.slug)) invalid += 1;
  seenSlugs.add(protocol.slug);
  if (!protocol.protocol_id || seenIds.has(protocol.protocol_id)) invalid += 1;
  seenIds.add(protocol.protocol_id);
  if (protocol.language !== "en") invalid += 1;
  if (!eligible.has(protocol.slug)) invalid += 1;
  if (!protocol.title || !protocol.action || !protocol.url) invalid += 1;
  if (!["reviewed", "practical"].includes(protocol.evidence?.status)) invalid += 1;
  if (!protocol.growth_zone?.slug || !protocol.life_area?.slug) invalid += 1;
  if (!protocol.ontology?.domains?.length) invalid += 1;
  if (!["topic-mapped", "topic-pending", "explicit"].includes(protocol.ontology?.classification_status)) invalid += 1;
  if (protocol.ontology?.classification_status === "topic-pending" && protocol.ontology?.topics?.length) invalid += 1;
  for (const item of protocol.ontology?.domains ?? []) if (!domainIds.has(item.id)) invalid += 1;
  for (const item of protocol.ontology?.topics ?? []) if (!topicIds.has(item.id)) invalid += 1;
  for (const item of protocol.ontology?.methods ?? []) if (!methodIds.has(item.id)) invalid += 1;
  for (const item of protocol.ontology?.lenses ?? []) if (!lensIds.has(item.id)) invalid += 1;
  if (protocol.evidence?.status !== "reviewed" && protocol.evidence?.source_url !== null) invalid += 1;
  if (protocol.evidence?.source_url && !/^https?:\/\//i.test(protocol.evidence.source_url)) invalid += 1;
}

const missing = [...eligible].filter((slug) => !seenSlugs.has(slug));
if (feed.count !== (feed.entries ?? []).length || seenSlugs.size !== (feed.entries ?? []).length) invalid += 1;
if ((feed.entries ?? []).length !== eligible.size) invalid += 1;
const topicMapped = (feed.entries ?? []).filter((protocol) => protocol.ontology?.topics?.length).length;
const topicPending = (feed.entries ?? []).length - topicMapped;
if (feed.ontology_coverage?.topic_mapped !== topicMapped || feed.ontology_coverage?.topic_pending !== topicPending) invalid += 1;

const protocolBySlug = new Map((feed.entries ?? []).map((protocol) => [protocol.slug, protocol]));
const expectedHomepageRoutes = {
  focus: "top-3-daily-focus-planner",
  memory: "active-recall-test-yourself",
  stress: "abdominal-breathing-stress-relief",
  sleep: "stop-caffeine-after-lunch",
};
if (matcher.schema_version !== 1 || matcher.generated_from !== "/life-os/datasets/protocols.json") invalid += 1;
if (matcher.generated_from_schema_version !== feed.schema_version) invalid += 1;
if (Buffer.byteLength(matcherRaw) > 32768) invalid += 1;

for (const [goal, slug] of Object.entries(expectedHomepageRoutes)) {
  const protocol = protocolBySlug.get(slug);
  const item = matcher.goals?.[goal];
  if (!protocol || !item) {
    invalid += 1;
    continue;
  }
  const expectedHref = new URL(protocol.url).pathname;
  const expectedSourceHref = protocol.evidence?.source_url || protocol.url;
  const expectedTrust = protocol.evidence?.status === "reviewed" ? "Reviewed" : "Practical";
  const expectedSummary = protocol.description || protocol.action;
  if (item.slug !== protocol.slug || item.protocol_id !== protocol.protocol_id) invalid += 1;
  if (item.title !== protocol.title || item.summary !== expectedSummary) invalid += 1;
  if (item.evidence_status !== protocol.evidence?.status || item.trust !== expectedTrust) invalid += 1;
  if (item.href !== expectedHref || item.source_href !== expectedSourceHref) invalid += 1;
  if (!item.match || !item.limit || !Array.isArray(item.steps) || item.steps.length < 2) invalid += 1;
  if (item.steps?.[0]?.[1] !== protocol.action) invalid += 1;
  if (protocol.check_in && !item.steps.some((step) => step?.[1] === protocol.check_in)) invalid += 1;
}

if (!homepageJs.includes("fetch('/homepage-matcher.json'")) invalid += 1;
if (homepageJs.includes("const protocols = {")) invalid += 1;
for (const staleClaim of ["Evidence Score", "27 studies"]) {
  if (homepageHtml.includes(staleClaim)) invalid += 1;
}

if (invalid || missing.length) {
  throw new Error(`Protocol feed validation failed: invalid=${invalid}, missing eligible entries=${missing.length}.`);
}
const sourced = (feed.entries ?? []).filter((protocol) => protocol.evidence?.source_url).length;
console.log(`Protocol feed verified: ${feed.entries.length} trusted protocols; ${topicMapped} topic-mapped, ${topicPending} topic-pending; ${sourced} reviewed source link(s); homepage matcher canonical for ${Object.keys(expectedHomepageRoutes).length} goals (${Buffer.byteLength(matcherRaw)} bytes).`);

await import('./check-rss-feed.mjs');
