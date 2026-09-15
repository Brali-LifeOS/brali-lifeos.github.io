import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const libraryDir = path.join(root, "data", "localization", "de", "library");
const complete = process.argv.includes("--complete");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));

try {
  await access(libraryDir);
} catch {
  console.log("[de-contract] no German library directory; nothing to validate");
  process.exit(0);
}

const canonical = await readJson("data/life-os-content/index.json");
if (!Array.isArray(canonical)) throw new Error("[de-contract] canonical data/life-os-content/index.json must be an array");

const canonicalBySlug = new Map(canonical.map((record) => [record.slug, record]));
const files = (await readdir(libraryDir)).filter((name) => name.endsWith(".json")).sort();
const seen = new Map();
const errors = [];
let localizedCount = 0;

function fail(location, message) {
  errors.push({ location, message });
}

function currentSourceSnapshot(record) {
  return {
    title: record?.title,
    subtitle: record?.subtitle,
    description: record?.description,
    updatedISO: record?.updatedISO,
  };
}

for (const name of files) {
  const batch = await readJson(`data/localization/de/library/${name}`);
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
      fail(location, "slug is not present in current data/life-os-content/index.json");
      continue;
    }

    const expected = currentSourceSnapshot(current);
    const actual = record?.source;
    if (!actual || typeof actual !== "object") {
      fail(location, "missing source snapshot");
      continue;
    }

    for (const field of ["title", "subtitle", "description", "updatedISO"]) {
      if (actual[field] !== expected[field]) {
        fail(location, `stale source.${field}; refresh from current canonical record before reviewing German copy`);
      }
    }
  }
}

if (complete) {
  for (const slug of canonicalBySlug.keys()) {
    if (!seen.has(slug)) fail(`canonical/${slug}`, "missing German localization record");
  }
}

if (errors.length) {
  console.error(`[de-contract] ${errors.length} canonical parity error(s)`);
  for (const error of errors.slice(0, 200)) console.error(`  ${error.location}: ${error.message}`);
  if (errors.length > 200) console.error(`  ... ${errors.length - 200} more`);
  throw new Error(
    complete
      ? "German library is not in complete canonical parity."
      : "German draft contains stale, duplicate or non-canonical records."
  );
}

console.log(
  `[de-contract] ${complete ? "complete" : "draft"} parity passed: ${localizedCount}/${canonical.length} canonical records localized across ${files.length} batch(es).`
);
