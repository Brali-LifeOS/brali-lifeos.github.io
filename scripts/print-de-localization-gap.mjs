import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from "./lib/localization-source.mjs";

const root = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const offset = Math.max(0, Number(process.env.GAP_OFFSET || 0));
const limit = Math.max(1, Number(process.env.GAP_LIMIT || 60));

const canonical = await loadLocalizationAuthoringIndex(root);
const flagships = await readJson("data/localization/de/flagships.json");
const localized = new Set((flagships.entries || []).map((entry) => entry.slug));
const dir = path.join(root, "data", "localization", "de", "library");
for (const name of (await readdir(dir)).filter((name) => name.endsWith(".json")).sort()) {
  const batch = await readJson(`data/localization/de/library/${name}`);
  for (const record of batch.records || batch.entries || []) localized.add(record.slug);
}

const missing = canonical.filter((entry) => !localized.has(entry.slug)).map((entry) => ({
  slug: entry.slug,
  zone_slug: entry.zone?.slug || null,
  source: localizationSourceSnapshot(entry),
}));
const slice = missing.slice(offset, offset + limit);
console.log(JSON.stringify({ total: canonical.length, localized: localized.size, missing: missing.length, offset, limit, returned: slice.length, records: slice }, null, 2));
