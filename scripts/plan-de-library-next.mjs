import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const libraryDir = path.join(root, "data", "localization", "de", "library");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Math.min(250, Number(limitArg?.split("=")[1] || 25)));
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));

const canonical = await readJson("data/life-os-content/index.json");
if (!Array.isArray(canonical)) throw new Error("Canonical index must be an array");

const seen = new Set();
try {
  await access(libraryDir);
  const files = (await readdir(libraryDir)).filter((name) => name.endsWith(".json")).sort();
  for (const name of files) {
    const batch = await readJson(`data/localization/de/library/${name}`);
    const records = Array.isArray(batch.records) ? batch.records : Array.isArray(batch.entries) ? batch.entries : [];
    for (const record of records) if (typeof record?.slug === "string") seen.add(record.slug);
  }
} catch {
  // A new locale may have no batches yet.
}

const missing = canonical.filter((record) => !seen.has(record.slug));
const next = missing.slice(0, limit).map(({ slug, title, subtitle, description, updatedISO }) => ({
  slug,
  source: { title, subtitle, description, updatedISO },
}));

console.log(`[de-plan] localized=${seen.size} canonical=${canonical.length} missing=${missing.length}`);
console.log(JSON.stringify(next, null, 2));
