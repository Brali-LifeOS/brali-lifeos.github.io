import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const INDEX_PATH = "data/life-os-content/index.json";
const DATA_ROOT = "data";
const PRIMARY_ADDITIONS = "life-os-content-additions.json";
const ADDITIONS_PATTERN = /^life-os-content-additions(?:-[a-z0-9-]+)?\.json$/i;

async function readTrackedOrWorkingJson(root, relativePath) {
  try {
    const content = execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(content);
  } catch {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  }
}

export function localizationSourceSnapshot(entry) {
  return {
    title: entry.title,
    subtitle: entry.subtitle || "",
    description: entry.description || "",
    updatedISO: entry.updatedISO || "",
  };
}

export async function loadLocalizationAuthoringIndex(root = process.cwd()) {
  const dataRoot = path.join(root, DATA_ROOT);
  const registryFiles = (await readdir(dataRoot))
    .filter((name) => ADDITIONS_PATTERN.test(name))
    .sort((a, b) => (a === PRIMARY_ADDITIONS ? -1 : b === PRIMARY_ADDITIONS ? 1 : a.localeCompare(b)));
  if (!registryFiles.includes(PRIMARY_ADDITIONS)) {
    throw new Error(`Missing primary content additions registry: ${PRIMARY_ADDITIONS}`);
  }

  const trackedIndex = await readTrackedOrWorkingJson(root, INDEX_PATH);
  if (!Array.isArray(trackedIndex)) throw new Error("Canonical authoring index must be an array");

  const bySlug = new Map(trackedIndex.map((entry) => [entry.slug, entry]));
  const additionSources = new Map();
  for (const name of registryFiles) {
    const relativePath = `${DATA_ROOT}/${name}`;
    const registry = await readTrackedOrWorkingJson(root, relativePath);
    if (registry?.schema_version !== 1 || !Array.isArray(registry.entries)) {
      throw new Error(`${name}: content additions registry must use schema_version 1 and entries[]`);
    }
    for (const entry of registry.entries) {
      if (!entry?.slug) throw new Error(`${name}: content additions registry contains an entry without a slug`);
      if (additionSources.has(entry.slug)) {
        throw new Error(`Duplicate content addition ${entry.slug}: ${additionSources.get(entry.slug)} and ${name}`);
      }
      additionSources.set(entry.slug, name);
      // Mirror apply-content-additions.mjs exactly: every additions registry is
      // authoritative over the tracked index for both additions and refreshes.
      bySlug.set(entry.slug, entry);
    }
  }

  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
