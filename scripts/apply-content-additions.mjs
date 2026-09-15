import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");
const contentRoot = path.join(dataRoot, "life-os-content");
const indexPath = path.join(contentRoot, "index.json");
const primaryRegistry = "life-os-content-additions.json";

const registryFiles = (await readdir(dataRoot))
  .filter((name) => /^life-os-content-additions(?:-[a-z0-9-]+)?\.json$/i.test(name))
  .sort((a, b) => (a === primaryRegistry ? -1 : b === primaryRegistry ? 1 : a.localeCompare(b)));
if (!registryFiles.includes(primaryRegistry)) throw new Error(`Missing primary content additions registry: ${primaryRegistry}`);

const entries = [];
const entrySources = new Map();
for (const name of registryFiles) {
  const registry = JSON.parse(await readFile(path.join(dataRoot, name), "utf8"));
  if (registry.schema_version !== 1 || !Array.isArray(registry.entries)) {
    throw new Error(`${name}: content additions registry must use schema_version 1 and contain entries[].`);
  }
  for (const entry of registry.entries) {
    if (entrySources.has(entry?.slug)) {
      throw new Error(`Duplicate content addition ${entry?.slug ?? "<missing-slug>"}: ${entrySources.get(entry?.slug)} and ${name}`);
    }
    entries.push(entry);
    entrySources.set(entry?.slug, name);
  }
}

const index = JSON.parse(await readFile(indexPath, "utf8"));
const bySlug = new Map(index.map((entry) => [entry.slug, entry]));
let added = 0;
let updated = 0;

for (const entry of entries) {
  if (!entry?.slug || !entry.title || !entry.description || !entry.zone?.slug || !entry.zone?.title) {
    throw new Error(`Incomplete content addition: ${entry?.slug ?? "<missing-slug>"}`);
  }
  const articlePath = path.join(contentRoot, `${entry.slug}.json`);
  await access(articlePath);
  const article = JSON.parse(await readFile(articlePath, "utf8"));
  if (article.slug !== entry.slug) throw new Error(`${entry.slug}: article slug differs from additions registry`);
  if (article.title !== entry.title) throw new Error(`${entry.slug}: article title differs from additions registry`);
  if (article.zone?.slug !== entry.zone.slug) throw new Error(`${entry.slug}: article zone differs from additions registry`);

  const existing = bySlug.get(entry.slug);
  if (!existing) {
    index.push(entry);
    bySlug.set(entry.slug, entry);
    added += 1;
  } else if (JSON.stringify(existing) !== JSON.stringify(entry)) {
    const position = index.findIndex((item) => item.slug === entry.slug);
    index[position] = entry;
    bySlug.set(entry.slug, entry);
    updated += 1;
  }
}

const slugs = index.map((entry) => entry.slug);
if (new Set(slugs).size !== slugs.length) throw new Error("Content additions produced duplicate slugs in the canonical index");
index.sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
await writeFile(
  path.join(root, ".content-additions-applied.json"),
  `${JSON.stringify({
    schema_version: 1,
    registry: `data/${primaryRegistry}`,
    registry_files: registryFiles.map((name) => `data/${name}`),
    added,
    updated,
    total: index.length,
  }, null, 2)}\n`,
);
console.log(`Content additions applied: ${added} added, ${updated} refreshed from ${registryFiles.length} registry file(s); ${index.length} total entries.`);
