import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
let missing = 0;
let wrongCount = 0;
let unsafeLinks = 0;

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
    if (slug === entry.slug || evidenceBySlug.get(slug)?.status === "restricted") unsafeLinks += 1;
  }
}

if (missing || wrongCount || unsafeLinks) {
  throw new Error(`Related protocol validation failed: missing=${missing}, wrong link count=${wrongCount}, self/restricted links=${unsafeLinks}.`);
}
console.log(`Related protocol graph verified for ${sourceIndex.length} Growth Library entries.`);
