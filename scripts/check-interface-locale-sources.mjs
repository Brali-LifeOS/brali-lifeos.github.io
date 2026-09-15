import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from "./lib/localization-source.mjs";

const root = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const profile = await readJson(".arwp/localization.json");
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && entry.generator === "generic-v1");

let totalErrors = 0;

for (const localeEntry of locales) {
  const locale = localeEntry.code;
  const sourceRoot = path.join(root, "data", "localization", locale);
  const libraryDir = path.join(sourceRoot, "library");
  try {
    await access(libraryDir);
  } catch {
    console.log(`[${locale}-sources] no library directory; nothing to validate`);
    continue;
  }

  const [canonical, flagships] = await Promise.all([
    loadLocalizationAuthoringIndex(root),
    readJson(`data/localization/${locale}/flagships.json`),
  ]);
  const canonicalBySlug = new Map(canonical.map((record) => [record.slug, record]));
  const seen = new Map((flagships.entries || []).map((entry) => [entry.slug, "flagships.json"]));
  const files = (await readdir(libraryDir)).filter((name) => name.endsWith(".json")).sort();
  const errors = [];
  let localizedCount = seen.size;

  const fail = (location, message) => errors.push({ location, message });

  for (const name of files) {
    const batch = await readJson(`data/localization/${locale}/library/${name}`);
    const records = Array.isArray(batch.records) ? batch.records : Array.isArray(batch.entries) ? batch.entries : null;
    if (!records) {
      fail(name, "missing records/entries array");
      continue;
    }

    for (const record of records) {
      const slug = typeof record?.slug === "string" ? record.slug.trim() : "";
      const location = `${name}/${slug || "<missing-slug>"}`;
      localizedCount += 1;
      if (!slug) {
        fail(location, "missing slug");
        continue;
      }
      if (seen.has(slug)) fail(location, `duplicate slug; first seen in ${seen.get(slug)}`);
      else seen.set(slug, name);

      const current = canonicalBySlug.get(slug);
      if (!current) {
        fail(location, "slug is not present in the canonical authoring corpus (tracked index + additions)");
        continue;
      }

      const expected = localizationSourceSnapshot(current);
      const actual = record?.source;
      if (!actual || typeof actual !== "object") {
        fail(location, "missing source snapshot");
        continue;
      }
      for (const field of ["title", "subtitle", "description", "updatedISO"]) {
        if (actual[field] !== expected[field]) fail(location, `stale source.${field}`);
      }
    }
  }

  if (errors.length) {
    totalErrors += errors.length;
    console.error(`[${locale}-sources] ${errors.length} source-parity error(s) across ${files.length} batch(es)`);
    for (const error of errors.slice(0, 300)) console.error(`  ${error.location}: ${error.message}`);
    if (errors.length > 300) console.error(`  ... ${errors.length - 300} more`);
  } else {
    console.log(`[${locale}-sources] source parity passed: ${localizedCount}/${canonical.length} localized records across ${files.length} batch(es) plus flagships.`);
  }
}

if (totalErrors) throw new Error(`Interface localization source diagnostics found ${totalErrors} error(s).`);
