import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { scanGermanLocalizedRecord, scanGermanText } from "./lib/de-language-audit.mjs";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const libraryDir = path.join(root, "data", "localization", "de", "library");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const files = (await readdir(libraryDir)).filter((name) => name.endsWith(".json")).sort();
if (!files.length) throw new Error("[de-language] no German library batches found");

const seen = new Map();
const blocking = [];
const review = [];
let recordCount = 0;
let flagshipCount = 0;

function push(target, location, term) {
  target.push({ location, term });
}

for (const name of files) {
  const file = path.join(libraryDir, name);
  const batch = await readJson(file);
  if (batch.schema_version !== 1) push(blocking, name, "unsupported-schema-version");
  if (batch.locale !== "de") push(blocking, name, `wrong-locale:${batch.locale || "missing"}`);

  const records = Array.isArray(batch.records) ? batch.records : Array.isArray(batch.entries) ? batch.entries : null;
  if (!records) {
    push(blocking, name, "missing-records-or-entries-array");
    continue;
  }

  for (const record of records) {
    recordCount += 1;
    const slug = typeof record?.slug === "string" ? record.slug.trim() : "";
    const location = `${name}/${slug || `record-${recordCount}`}`;

    if (!slug) {
      push(blocking, location, "missing-slug");
      continue;
    }
    if (seen.has(slug)) push(blocking, location, `duplicate-slug:first-seen-in:${seen.get(slug)}`);
    else seen.set(slug, name);

    const source = record?.source;
    if (!source || typeof source !== "object") {
      push(blocking, location, "missing-source-snapshot");
    } else {
      for (const field of ["title", "subtitle", "description", "updatedISO"]) {
        if (typeof source[field] !== "string" || !source[field].trim()) push(blocking, location, `missing-source-${field}`);
      }
    }

    const qualityState = record?.quality_state;
    if (!new Set(["language-reviewed", "human-reviewed"]).has(qualityState)) {
      push(review, location, `unexpected-quality-state:${qualityState || "missing"}`);
    }

    for (const finding of scanGermanLocalizedRecord(record)) {
      for (const term of finding.blocking) push(blocking, `${location}.${finding.field}`, term);
      for (const term of finding.review) push(review, `${location}.${finding.field}`, term);
    }
  }
}

const flagships = await readJson(path.join(root, "data", "localization", "de", "flagships.json"));
if (flagships.locale !== "de" || !Array.isArray(flagships.entries)) push(blocking, "flagships.json", "invalid-flagship-localization-shape");
else {
  for (const entry of flagships.entries) {
    flagshipCount += 1;
    const location = `flagships.json/${entry.slug || `record-${flagshipCount}`}`;
    for (const [field, value] of [
      ["life_area.title", entry.life_area?.title],
      ["life_area.subtitle", entry.life_area?.subtitle],
      ["title", entry.title],
      ["description", entry.description],
      ["action", entry.action],
      ["check_in", entry.check_in],
      ["boundary", entry.boundary],
      ["alternative", entry.alternative],
      ["evidence_label", entry.evidence_label],
    ]) {
      const result = scanGermanText(value, { field, source: "" });
      for (const term of result.blocking) push(blocking, `${location}.${field}`, term);
      for (const term of result.review) push(review, `${location}.${field}`, term);
    }
  }
}

if (blocking.length) {
  console.error(`[de-language] blocking findings: ${blocking.length}`);
  for (const finding of blocking) console.error(`  ${finding.location}: ${finding.term}`);
}
if (review.length) {
  console.error(`[de-language] editorial review findings: ${review.length}`);
  for (const finding of review) console.error(`  ${finding.location}: ${finding.term}`);
}

if (blocking.length || (strict && review.length)) {
  throw new Error(
    strict
      ? "German localization language audit failed in strict mode. Resolve both blocking and editorial-review findings."
      : "German localization language audit found blocking structural/language defects."
  );
}

console.log(
  `[de-language] ${strict ? "strict" : "draft"} audit passed across ${recordCount} library records in ${files.length} batches and ${flagshipCount} rich flagship records` +
    (review.length ? ` with ${review.length} editorial review finding(s) still open.` : ".")
);
