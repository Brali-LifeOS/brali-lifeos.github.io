import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadProtocolOverrides } from "./lib/protocol-overrides.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const registry = await loadProtocolOverrides(root);
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const feedBySlug = new Map((protocols.entries ?? []).map((entry) => [entry.slug, entry]));
const indexable = new Set(indexing.indexable ?? []);
let failures = 0;

for (const [slug, override] of Object.entries(registry.entries ?? {})) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${slug}.json`), "utf8"));
  const page = await readFile(path.join(root, "life-os", slug, "index.html"), "utf8");
  if (article.editorialCuration?.status !== "curated") failures += 1;
  if (article.editorialCuration?.reviewedAt !== override.reviewed_at) failures += 1;
  if (article.editorialCuration?.registry !== registry.sources?.[slug]) failures += 1;
  if (!page.includes(override.lifeOsSource?.whatYouDo ?? "")) failures += 1;
  for (const fragment of override.forbidden_public_fragments ?? []) {
    if (page.includes(fragment) || JSON.stringify(article).includes(fragment)) failures += 1;
  }
  const trust = evidenceBySlug.get(slug);
  if (trust?.status !== "practical" || trust?.indexable !== true) failures += 1;
  if (!indexable.has(slug)) failures += 1;
  if (!feedBySlug.has(slug)) failures += 1;
}

if (failures) throw new Error(`Curated protocol validation failed with ${failures} problem(s).`);
console.log(`Curated protocol overrides verified: ${Object.keys(registry.entries ?? {}).length} entry override(s) from ${registry.files.length} registry file(s) are practical, indexable, and present in the trusted feed.`);
