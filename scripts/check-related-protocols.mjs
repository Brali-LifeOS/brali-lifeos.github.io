import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const aliases = JSON.parse(await readFile(path.join(root, "data/protocol-aliases.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const aliasSlugs = new Set(Object.keys(aliases.entries ?? {}));
let missing = 0;
let wrongCount = 0;
let unsafeLinks = 0;
let checked = 0;

for (const entry of sourceIndex) {
  if (aliasSlugs.has(entry.slug)) continue;
  checked += 1;
  const html = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  const section = html.match(/<section class="prose related-protocols" data-related-protocols="true">([\s\S]*?)<\/section>/);
  if (!section) {
    missing += 1;
    continue;
  }
  const links = [...section[1].matchAll(/href="\/life-os\/([^/]+)\/"/g)].map((match) => match[1]);
  if (links.length !== 3) wrongCount += 1;
  for (const slug of links) {
    if (slug === entry.slug || aliasSlugs.has(slug) || evidenceBySlug.get(slug)?.indexable !== true) unsafeLinks += 1;
  }
}

if (missing || wrongCount || unsafeLinks) {
  throw new Error(`Related protocol validation failed: missing=${missing}, wrong link count=${wrongCount}, self/alias/non-indexable links=${unsafeLinks}.`);
}
console.log(`Related protocol graph verified for ${checked} canonical Growth Library entries; aliases are skipped and only indexable canonical entries are recommended.`);
