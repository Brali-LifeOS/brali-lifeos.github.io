import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "data/editorial-normalizations.json"), "utf8"));
const published = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));
let leakedMatches = 0;
let replacementMissing = 0;
let publicationDrift = 0;

function containsInherited(value, rule) {
  if (rule.match) return value.includes(rule.match);
  if (!rule.pattern) return false;
  const flags = [...new Set(String(rule.flags || "giu").replaceAll("g", "").split(""))].join("");
  return new RegExp(rule.pattern, flags).test(value);
}

for (const rule of registry.rules ?? []) {
  if (rule.status !== "reviewed" || !rule.reviewed_at || !rule.reviewed_by || !rule.reason || !rule.review_source) {
    throw new Error(`Editorial normalization rule is incomplete: ${rule.id ?? "unknown"}.`);
  }
  if (!(rule.match || rule.pattern) || typeof rule.replacement !== "string") {
    throw new Error(`Editorial normalization rule has no executable transform: ${rule.id ?? "unknown"}.`);
  }
  const publishedRule = (published.rules ?? []).find((item) => item.id === rule.id);
  if (!publishedRule) throw new Error(`Editorial normalization rule was not published: ${rule.id}.`);
  if (publishedRule.replacement !== rule.replacement) publicationDrift += 1;
  if (!Array.isArray(publishedRule.applied?.affected_entries) || !Number.isInteger(publishedRule.applied?.replacements)) {
    publicationDrift += 1;
  }
}

for (const entry of index) {
  const source = await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8");
  const generated = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  for (const rule of registry.rules ?? []) {
    if (containsInherited(source, rule) || containsInherited(generated, rule)) leakedMatches += 1;

    const publishedRule = (published.rules ?? []).find((item) => item.id === rule.id);
    const affected = publishedRule?.applied?.affected_entries ?? [];
    // A literal, non-empty replacement has a deterministic post-condition we can
    // validate directly in the normalized canonical JSON. Deletion rules have no
    // replacement string to find, and regex replacements may contain captures such
    // as $1, so for those the fail-closed invariant is absence of the inherited
    // match plus the published application ledger above.
    if (
      affected.includes(entry.slug)
      && rule.match
      && rule.replacement.length > 0
      && !source.includes(rule.replacement)
    ) {
      replacementMissing += 1;
    }
  }
}

if (leakedMatches || replacementMissing || publicationDrift) {
  throw new Error(`Editorial normalization validation failed: inherited matches=${leakedMatches}, expected replacements missing=${replacementMissing}, publication drift=${publicationDrift}.`);
}
console.log(`Editorial normalizations verified: ${(registry.rules ?? []).length} reviewed rule(s), no inherited claim leakage; deletion/regex transforms validated by absence plus application ledger.`);
