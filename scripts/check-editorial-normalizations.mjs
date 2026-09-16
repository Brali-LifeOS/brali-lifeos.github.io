import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "data/editorial-normalizations.json"), "utf8"));
const published = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));
let leakedMatches = 0;
let publicationDrift = 0;
let ledgerErrors = 0;

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

  const affected = publishedRule.applied?.affected_entries;
  const replacements = publishedRule.applied?.replacements;
  if (!Array.isArray(affected) || !Number.isInteger(replacements) || replacements < 0) {
    publicationDrift += 1;
    continue;
  }
  if (new Set(affected).size !== affected.length) ledgerErrors += 1;
  if (replacements < affected.length) ledgerErrors += 1;
  if ((replacements === 0) !== (affected.length === 0)) ledgerErrors += 1;
}

for (const entry of index) {
  const source = await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8");
  const generated = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  for (const rule of registry.rules ?? []) {
    if (containsInherited(source, rule) || containsInherited(generated, rule)) leakedMatches += 1;
  }
}

if (leakedMatches || publicationDrift || ledgerErrors) {
  throw new Error(`Editorial normalization validation failed: inherited matches=${leakedMatches}, publication drift=${publicationDrift}, ledger errors=${ledgerErrors}.`);
}
console.log(`Editorial normalizations verified: ${(registry.rules ?? []).length} reviewed rule(s), no inherited claim leakage; application ledger is internally consistent across downstream rewrites.`);
