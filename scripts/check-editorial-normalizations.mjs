import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "data/editorial-normalizations.json"), "utf8"));
const published = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));
let leakedMatches = 0;
let replacementMissing = 0;

for (const rule of registry.rules ?? []) {
  if (rule.status !== "reviewed" || !rule.reviewed_at || !rule.reviewed_by || !rule.reason || !rule.review_source) {
    throw new Error(`Editorial normalization rule is incomplete: ${rule.id ?? "unknown"}.`);
  }
  const publishedRule = (published.rules ?? []).find((item) => item.id === rule.id);
  if (!publishedRule) throw new Error(`Editorial normalization rule was not published: ${rule.id}.`);
}

for (const entry of index) {
  const source = await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8");
  const generated = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  for (const rule of registry.rules ?? []) {
    if (source.includes(rule.match) || generated.includes(rule.match)) leakedMatches += 1;
    const affected = (published.rules ?? []).find((item) => item.id === rule.id)?.applied?.affected_entries ?? [];
    if (affected.includes(entry.slug) && !source.includes(rule.replacement)) replacementMissing += 1;
  }
}

if (leakedMatches || replacementMissing) {
  throw new Error(`Editorial normalization validation failed: inherited matches=${leakedMatches}, expected replacements missing=${replacementMissing}.`);
}
console.log(`Editorial normalizations verified: ${(registry.rules ?? []).length} reviewed rule(s), no inherited claim leakage.`);
