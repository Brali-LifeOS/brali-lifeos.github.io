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
    // rewrite surrounding prose. Trailing spaces at line ends are migration
    // artifacts (the markdown renderer trimEnds every line, and stored HTML
    // renders verbatim with the spaces invisible); strip them so regenerated
    // pages do not re-introduce trailing whitespace into every future diff.
    output = output.replace(/[ \t]+$/gm, "").replace(/<p>\s*<\/p>/g, "").replace(/\n{3,}/g, "\n\n");
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, slug));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item, slug)]));
  }
  return value;
}

let changedEntries = 0;
const articles = new Map();
for (const entry of index) {
  const file = path.join(contentRoot, `${entry.slug}.json`);
  const raw = await readFile(file, "utf8");
  const article = JSON.parse(raw);
  const normalized = normalizeValue(article, entry.slug);
  articles.set(entry.slug, normalized);
  const next = `${JSON.stringify(normalized, null, 2)}\n`;
  if (next !== raw) {
    await writeFile(file, next);
    changedEntries += 1;
  }
}

// The canonical index mirrors the presentation fields of each record. Keep the
// mirror explicit: whenever a reviewed normalization changes a record's public
// title/subtitle/description (or keywords/zone/dates), the index entry must
// move with it, so no surface can keep publishing pre-normalization wording.
let indexChanged = 0;
const syncedIndex = index.map((entry) => {
  const article = articles.get(entry.slug);
  if (!article) throw new Error(`Canonical index references missing record: ${entry.slug}`);
  const next = {
    ...entry,
    title: article.title,
    subtitle: article.subtitle ?? "",
    description: article.description ?? "",
    keywords: article.keywords ?? [],
    zone: article.zone ?? entry.zone,
    publishedISO: article.meta?.publishedISO ?? entry.publishedISO,
    updatedISO: article.meta?.updatedISO ?? entry.updatedISO,
  };
  if (JSON.stringify(next) !== JSON.stringify(entry)) indexChanged += 1;
  return next;
});
if (indexChanged) await writeFile(path.join(contentRoot, "index.json"), `${JSON.stringify(syncedIndex, null, 2)}\n`);

const report = {
  schema_version: 1,
  changed_entries: changedEntries,
  rules: [...stats.values()].map((stat) => ({ id: stat.id, replacements: stat.replacements, affected_entries: [...stat.entries].sort() })),
};
await writeFile(path.join(root, ".editorial-normalizations-applied.json"), JSON.stringify(report, null, 2));

console.log(`Editorial normalizations applied: ${changedEntries} entries changed across ${rules.length} reviewed rule(s); index synchronized for ${indexChanged} entr${indexChanged === 1 ? "y" : "ies"}.`);

// Trust-state problems are no longer solved by shrinking articles. The Trustverse
// mass rewrite replaced substantive migrated bodies with short claim-free templates;
// the current publication contract keeps the long-form article visible and marks
// unreviewed claim-bearing records as pending-review instead. Only the explicit,
// recorded taxonomy correction finalizer still runs here.
await import("./finalize-trustverse-mass-curation.mjs");
