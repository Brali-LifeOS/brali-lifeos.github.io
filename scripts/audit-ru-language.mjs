import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { findUnexpectedLatinRuns, isRussianLanguageExceptionAllowed, scanRussianText, scanRussianValue } from "./lib/ru-language-audit.mjs";

const root = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const allowlistDoc = await readJson("data/localization/ru/language-allowlist.json");
if (allowlistDoc.schema_version !== 1 || allowlistDoc.locale !== "ru" || !Array.isArray(allowlistDoc.entries)) {
  throw new Error("[ru-language] invalid data/localization/ru/language-allowlist.json");
}
for (const entry of allowlistDoc.entries) {
  if (!entry.term || !entry.location || !entry.reason) throw new Error("[ru-language] every allowlist entry needs term, location and reason");
}
const allowlist = allowlistDoc.entries;
const findings = [];
const reviewedLatinRuns = [];

function inspectText(text, location) {
  const result = scanRussianText(text, { location, allowlist });
  if (result.blocking.length || result.review.length) findings.push({ location, ...result });
  for (const run of findUnexpectedLatinRuns(text)) {
    const term = `latin:${run}`;
    if (isRussianLanguageExceptionAllowed(allowlist, location, term)) {
      reviewedLatinRuns.push({ location, run });
    } else {
      findings.push({ location, blocking: [], review: [term] });
    }
  }
}

function inspectRecord(record, base) {
  const fields = ["title", "subtitle", "description", "action", "check_in", "boundary", "alternative", "evidence_label"];
  for (const field of fields) {
    if (typeof record?.[field] === "string") inspectText(record[field], `${base}.${field}`);
  }
}

const batches = (await readdir(path.join(root, "data", "localization", "ru", "library")))
  .filter((name) => name.endsWith(".json"))
  .sort();
for (const name of batches) {
  const batch = await readJson(`data/localization/ru/library/${name}`);
  for (const record of batch.records || []) inspectRecord(record, `library/${name}/${record.slug}`);
}

const flagships = await readJson("data/localization/ru/flagships.json");
for (const record of flagships.entries || []) inspectRecord(record, `flagships/${record.slug}`);

const zones = await readJson("data/localization/ru/zones.json");
for (const record of zones.records || []) inspectRecord(record, `zones/${record.slug}`);

const primary = await readJson("data/localization/ru/primary-pages.json");
for (const page of primary.pages || []) {
  inspectText(page.title || "", `primary/${page.id}.title`);
  inspectText(page.description || "", `primary/${page.id}.description`);
}

const site = await readJson("data/localization/ru/site.json");
for (const finding of scanRussianValue(site, { location: "site", allowlist })) findings.push(finding);

if (findings.length) {
  console.error(`[ru-language] unresolved editorial terms: ${findings.length}`);
  for (const finding of findings) {
    const terms = [...finding.blocking.map((term) => `BLOCK:${term}`), ...finding.review.map((term) => `REVIEW:${term}`)];
    console.error(`  ${finding.location}: ${terms.join(", ")}`);
  }
  throw new Error("Russian language audit failed. Rewrite the copy or add a narrow, justified location-specific exception.");
}

console.log(`[ru-language] reviewed named/technical Latin exceptions: ${reviewedLatinRuns.length}`);
console.log(`Russian deterministic language audit passed across ${batches.length} library batches, ${flagships.entries?.length || 0} flagships, ${zones.records?.length || 0} zones and ${primary.pages?.length || 0} primary pages.`);
