import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { localizationSourceSnapshot } from "./lib/ru-localization-source.mjs";

// Refreshes the embedded `source` snapshot of reviewed localized library records
// after the canonical English record changed. The freshness gates in
// scripts/build-ru-library.mjs and scripts/check-interface-locale-sources.mjs
// intentionally fail when a canonical title/subtitle/description moves, so an
// editor must confirm the localized text still matches the new canonical
// semantics before the snapshot is bumped. This tool only performs the
// mechanical bump for slugs listed in an explicit review manifest; it refuses
// to refresh unlisted stale records, so it cannot be used to silence the gate.
//
// Usage:
//   node scripts/refresh-localization-source-snapshots.mjs <review-manifest.json> [--source head|working]
//
// Review manifest:
//   { "schema_version": 1, "locales": { "ru": ["slug-a", ...], "de": [...] } }
//
// --source head (default) refreshes against the tracked index; --source working
// refreshes against the working-tree index, i.e. the values HEAD will carry
// after the current changes are committed.

const root = process.cwd();
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: node scripts/refresh-localization-source-snapshots.mjs <review-manifest.json> [--source head|working]");
const sourceFlag = process.argv.indexOf("--source");
const source = sourceFlag >= 0 && process.argv[sourceFlag + 1] === "working" ? "working" : "head";

const review = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
if (review.schema_version !== 1 || !review.locales || typeof review.locales !== "object") {
  throw new Error("Review manifest must use schema_version 1 with a locales object.");
}

const trackedIndex = source === "working"
  ? JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"))
  : JSON.parse(execFileSync("git", ["show", "HEAD:data/life-os-content/index.json"], {
      cwd: root,
      encoding: "utf8",
    }));
const sourceBySlug = new Map(trackedIndex.map((entry) => [entry.slug, entry]));

const locales = ["ru", "de"];
const summary = {};
for (const locale of locales) {
  const reviewed = new Set(review.locales[locale] ?? []);
  const batchDir = path.join(root, "data", "localization", locale, "library");
  const files = (await readdir(batchDir)).filter((name) => name.endsWith(".json")).sort();
  let refreshed = 0;
  const staleUnreviewed = [];
  for (const name of files) {
    const file = path.join(batchDir, name);
    const batch = JSON.parse(await readFile(file, "utf8"));
    let touched = false;
    for (const record of batch.records ?? []) {
      const source = sourceBySlug.get(record.slug);
      if (!source) throw new Error(`${locale}/${name}/${record.slug}: canonical slug missing from tracked index`);
      const expected = localizationSourceSnapshot(source);
      const current = record.source ?? {};
      const staleFields = Object.entries(expected).filter(([field, value]) => current[field] !== value);
      if (!staleFields.length) continue;
      if (!reviewed.has(record.slug)) {
        staleUnreviewed.push(`${name}/${record.slug}: ${staleFields.map(([field]) => field).join(", ")}`);
        continue;
      }
      record.source = expected;
      touched = true;
      refreshed += 1;
    }
    if (touched) await writeFile(file, `${JSON.stringify(batch, null, 2)}\n`);
  }
  if (staleUnreviewed.length) {
    throw new Error(
      `${locale}: ${staleUnreviewed.length} stale record(s) missing from the review manifest; ` +
      `confirm the localized text still matches the canonical source and list them explicitly:\n- ${staleUnreviewed.join("\n- ")}`,
    );
  }
  summary[locale] = refreshed;
}

console.log(`Localization source snapshots refreshed: ${JSON.stringify(summary)}`);
