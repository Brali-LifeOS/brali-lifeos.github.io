import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "data/editorial-normalizations.json"), "utf8"));
const rules = (registry.rules ?? []).filter((rule) => rule.status === "reviewed" && (rule.match || rule.pattern) && typeof rule.replacement === "string");

const stats = new Map(rules.map((rule) => [rule.id, { id: rule.id, replacements: 0, entries: new Set() }]));

function applyRule(output, rule) {
  if (rule.match) {
    if (!output.includes(rule.match)) return { output, occurrences: 0 };
    const occurrences = output.split(rule.match).length - 1;
    return { output: output.split(rule.match).join(rule.replacement), occurrences };
  }
  const flags = [...new Set(`${rule.flags || "giu"}g`.split(""))].join("");
  const regex = new RegExp(rule.pattern, flags);
  const occurrences = [...output.matchAll(regex)].length;
  if (!occurrences) return { output, occurrences: 0 };
  return { output: output.replace(regex, rule.replacement), occurrences };
}

function normalizeValue(value, slug) {
  if (typeof value === "string") {
    let output = value;
    for (const rule of rules) {
      const applied = applyRule(output, rule);
      if (!applied.occurrences) continue;
      output = applied.output;
      const stat = stats.get(rule.id);
      stat.replacements += applied.occurrences;
      stat.entries.add(slug);
    }
    // Reviewed removal rules may leave empty HTML paragraphs behind in stored
    // body/section fragments. Remove only structurally empty paragraphs; do not
    // rewrite surrounding prose.
    output = output.replace(/<p>\s*<\/p>/g, "").replace(/\n{3,}/g, "\n\n");
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, slug));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item, slug)]));
  }
  return value;
}

let changedEntries = 0;
for (const entry of index) {
  const file = path.join(contentRoot, `${entry.slug}.json`);
  const raw = await readFile(file, "utf8");
  const article = JSON.parse(raw);
  const normalized = normalizeValue(article, entry.slug);
  const next = `${JSON.stringify(normalized, null, 2)}\n`;
  if (next !== raw) {
    await writeFile(file, next);
    changedEntries += 1;
  }
}

const report = {
  schema_version: 1,
  changed_entries: changedEntries,
  rules: [...stats.values()].map((stat) => ({ id: stat.id, replacements: stat.replacements, affected_entries: [...stat.entries].sort() })),
};
await writeFile(path.join(root, ".editorial-normalizations-applied.json"), JSON.stringify(report, null, 2));

console.log(`Editorial normalizations applied: ${changedEntries} entries changed across ${rules.length} reviewed rule(s).`);

// The legacy corpus contains large amounts of inherited generated copy with unsupported
// percentages, pseudo-study language and fabricated first-party outcomes. Run the
// deterministic Trustverse cleanup only after explicit curated overrides and reviewed
// normalizations have been applied, so hand-reviewed content remains authoritative.
await import("./apply-trustverse-mass-curation.mjs");
await import("./finalize-trustverse-mass-curation.mjs");
