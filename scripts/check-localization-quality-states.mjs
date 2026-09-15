import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const profile = await readJson(".arwp/localization.json");
const failures = [];

function fail(locale, location, message) {
  failures.push(`${locale}:${location}: ${message}`);
}

for (const localeEntry of profile.locales || []) {
  if (localeEntry.role !== "human-interface" || localeEntry.status === "draft") continue;

  const locale = localeEntry.code;
  const manifest = await readJson(`${localeEntry.datasetRoot}/library-manifest.json`);
  const states = Array.isArray(manifest.quality_states) ? manifest.quality_states : [];
  const rank = new Map(states.map((state, index) => [state, index]));
  const minimumPublic = manifest.minimum_public_quality;
  const trustedMinimum = manifest.trusted_minimum_quality || minimumPublic;

  if (!states.length) {
    fail(locale, "library-manifest", "quality_states must be a non-empty ordered array");
    continue;
  }
  if (!rank.has(minimumPublic)) fail(locale, "library-manifest", `minimum_public_quality is not declared in quality_states: ${minimumPublic}`);
  if (!rank.has(trustedMinimum)) fail(locale, "library-manifest", `trusted_minimum_quality is not declared in quality_states: ${trustedMinimum}`);
  if (!rank.has(minimumPublic) || !rank.has(trustedMinimum)) continue;

  const libraryDir = path.join(root, localeEntry.datasetRoot, "library");
  const files = (await readdir(libraryDir)).filter((name) => name.endsWith(".json")).sort();
  let authoredCount = 0;
  for (const name of files) {
    const batch = await readJson(`${localeEntry.datasetRoot}/library/${name}`);
    const records = Array.isArray(batch.records) ? batch.records : Array.isArray(batch.entries) ? batch.entries : null;
    if (!records) {
      fail(locale, name, "missing records/entries array");
      continue;
    }
    for (const record of records) {
      authoredCount += 1;
      const state = record?.quality_state;
      const slug = record?.slug || `<record-${authoredCount}>`;
      if (!rank.has(state)) {
        fail(locale, `${name}/${slug}`, `invalid quality_state=${state || "missing"}`);
        continue;
      }
      if (rank.get(state) < rank.get(minimumPublic)) {
        fail(locale, `${name}/${slug}`, `quality_state=${state} is below minimum_public_quality=${minimumPublic}`);
      }
    }
  }

  const machine = await readJson(`${locale}/library.json`);
  let machineCount = 0;
  for (const record of machine.entries || []) {
    machineCount += 1;
    const state = record?.localization_quality;
    const slug = record?.slug || `<entry-${machineCount}>`;
    if (!rank.has(state)) {
      fail(locale, `machine/${slug}`, `invalid localization_quality=${state || "missing"}`);
      continue;
    }
    if (rank.get(state) < rank.get(minimumPublic)) {
      fail(locale, `machine/${slug}`, `localization_quality=${state} is below minimum_public_quality=${minimumPublic}`);
    }
    if (["reviewed", "practical"].includes(record?.evidence_status) && rank.get(state) < rank.get(trustedMinimum)) {
      fail(locale, `machine/${slug}`, `trusted evidence requires localization quality >= ${trustedMinimum}, got ${state}`);
    }
  }

  console.log(`[localization-quality] ${locale}: ${authoredCount} authored batch record(s), ${machineCount} generated record(s), public>=${minimumPublic}, trusted>=${trustedMinimum}`);
}

if (failures.length) {
  for (const failure of failures.slice(0, 300)) console.error(`  ${failure}`);
  if (failures.length > 300) console.error(`  ... ${failures.length - 300} more`);
  throw new Error(`[localization-quality] ${failures.length} quality-state contract failure(s)`);
}

console.log("Localization quality-state contract passed for every release-state human-interface locale.");
