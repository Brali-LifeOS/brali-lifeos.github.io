import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const feed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const eligible = new Set((evidence.entries ?? []).filter((record) => record.indexable).map((record) => record.slug));
const seenSlugs = new Set();
const seenIds = new Set();
let invalid = 0;

if (feed.schema_version !== 2 || feed.canonical_language !== "en") invalid += 1;

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
}

const missing = [...eligible].filter((slug) => !seenSlugs.has(slug));
if (feed.count !== (feed.entries ?? []).length || seenSlugs.size !== (feed.entries ?? []).length) invalid += 1;
if ((feed.entries ?? []).length !== eligible.size) invalid += 1;

if (invalid || missing.length) {
  throw new Error(`Protocol feed validation failed: invalid=${invalid}, missing eligible entries=${missing.length}.`);
}
console.log(`Protocol feed verified: ${feed.entries.length} trusted, unique protocols with stable identity and language metadata.`);
