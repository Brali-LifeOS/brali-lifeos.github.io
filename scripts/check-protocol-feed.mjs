import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const feed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const eligible = new Set((evidence.entries ?? []).filter((record) => record.indexable).map((record) => record.slug));
const seen = new Set();
let invalid = 0;

for (const protocol of feed.entries ?? []) {
  if (!protocol.slug || seen.has(protocol.slug)) invalid += 1;
  seen.add(protocol.slug);
  if (!eligible.has(protocol.slug)) invalid += 1;
  if (!protocol.title || !protocol.action || !protocol.url) invalid += 1;
  if (!["reviewed", "practical"].includes(protocol.evidence?.status)) invalid += 1;
  if (!protocol.growth_zone?.slug || !protocol.life_area?.slug) invalid += 1;
}

const missing = [...eligible].filter((slug) => !seen.has(slug));
if (feed.count !== (feed.entries ?? []).length || seen.size !== (feed.entries ?? []).length) invalid += 1;
if ((feed.entries ?? []).length !== eligible.size) invalid += 1;

if (invalid || missing.length) {
  throw new Error(`Protocol feed validation failed: invalid=${invalid}, missing eligible entries=${missing.length}.`);
}
console.log(`Protocol feed verified: ${feed.entries.length} trusted, unique, discovery-ready protocols.`);
