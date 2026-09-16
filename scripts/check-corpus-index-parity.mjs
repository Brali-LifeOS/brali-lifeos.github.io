import { readFile } from "node:fs/promises";
import path from "node:path";

// The canonical index (data/life-os-content/index.json) is a mirror of each
// record's presentation fields. This gate fails when the mirror drifts from
// the records it indexes, so a record-level edit can never leave stale
// titles/descriptions publishing through the index, locale snapshots, or any
// other surface built from the index.

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));

const failures = [];
const FIELDS = ["title", "subtitle", "description", "keywords", "zone", "publishedISO", "updatedISO"];

for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const expected = {
    title: article.title,
    subtitle: article.subtitle ?? "",
    description: article.description ?? "",
    keywords: article.keywords ?? [],
    zone: article.zone ?? entry.zone,
    publishedISO: article.meta?.publishedISO ?? entry.publishedISO,
    updatedISO: article.meta?.updatedISO ?? entry.updatedISO,
  };
  for (const field of FIELDS) {
    if (JSON.stringify(entry[field]) !== JSON.stringify(expected[field])) {
      failures.push(`${entry.slug}: index.${field} differs from canonical record`);
    }
  }
}

// The additions registry refreshes existing records during the build and also
// feeds the localization authoring index; its presentation fields must agree
// with the canonical record or the two localization snapshot gates disagree.
const additions = JSON.parse(await readFile(path.join(root, "data/life-os-content-additions.json"), "utf8"));
for (const entry of additions.entries ?? []) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  if (article.title !== entry.title) failures.push(`additions:${entry.slug}: title differs from canonical record`);
  if ((article.subtitle ?? "") !== (entry.subtitle ?? "")) failures.push(`additions:${entry.slug}: subtitle differs from canonical record`);
  if ((article.description ?? "") !== (entry.description ?? "")) failures.push(`additions:${entry.slug}: description differs from canonical record`);
  if (JSON.stringify(article.keywords ?? []) !== JSON.stringify(entry.keywords ?? [])) failures.push(`additions:${entry.slug}: keywords differ from canonical record`);
}

if (failures.length) {
  console.error(`Corpus index parity failed (${failures.length} field(s)):\n- ${failures.slice(0, 20).join("\n- ")}${failures.length > 20 ? `\n- …and ${failures.length - 20} more` : ""}`);
  process.exit(1);
}

console.log(`Corpus index parity verified: ${index.length} index entries match their canonical records.`);
