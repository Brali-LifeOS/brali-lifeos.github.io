import { readFile, writeFile } from "node:fs/promises";

const file = "scripts/build-interface-locales.mjs";
const before = "    localizedBySlug.set(record.slug, { ...record, zone_slug: source.zone.slug });";
const after = `    const localized = record.localized && typeof record.localized === "object"\n      ? { ...record, ...record.localized }\n      : record;\n    localizedBySlug.set(record.slug, { ...localized, zone_slug: source.zone.slug });`;

const source = await readFile(file, "utf8");
if (source.includes(after)) {
  console.log("Generic locale renderer already supports nested localized authoring records.");
  process.exit(0);
}
if (!source.includes(before)) throw new Error("Expected generic locale renderer insertion point not found.");
await writeFile(file, source.replace(before, after));
console.log("Patched generic locale renderer to support both flat and source+localized records.");
