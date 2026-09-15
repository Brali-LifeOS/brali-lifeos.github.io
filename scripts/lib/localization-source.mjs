import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = "data";
const INDEX_PATH = "data/life-os-content/index.json";
const PRIMARY_ADDITIONS_FILE = "life-os-content-additions.json";
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

async function listAdditionRegistryPaths(root) {
  const dataRoot = path.join(root, DATA_ROOT);
  const registryFiles = (await readdir(dataRoot))
    .filter((name) => ADDITIONS_PATTERN.test(name))
    .sort((a, b) => (a === PRIMARY_ADDITIONS_FILE ? -1 : b === PRIMARY_ADDITIONS_FILE ? 1 : a.localeCompare(b)));

  if (!registryFiles.includes(PRIMARY_ADDITIONS_FILE)) {
    throw new Error(`Missing primary content additions registry: ${PRIMARY_ADDITIONS_FILE}`);
  }

  return registryFiles.map((name) => `${DATA_ROOT}/${name}`);
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
  const additionPaths = await listAdditionRegistryPaths(root);
  const [trackedIndex, ...registries] = await Promise.all([
    readTrackedOrWorkingJson(root, INDEX_PATH),
    ...additionPaths.map((relativePath) => readTrackedOrWorkingJson(root, relativePath)),
  ]);

  if (!Array.isArray(trackedIndex)) throw new Error("Canonical authoring index must be an array");

  const bySlug = new Map(trackedIndex.map((entry) => [entry.slug, entry]));
  const additionSources = new Map();

  for (let index = 0; index < registries.length; index += 1) {
    const registry = registries[index];
    const relativePath = additionPaths[index];
    if (registry?.schema_version !== 1 || !Array.isArray(registry.entries)) {
      throw new Error(`${relativePath}: content additions registry must use schema_version 1 and entries[]`);
    }

    for (const entry of registry.entries) {
      if (!entry?.slug) throw new Error(`${relativePath}: content additions registry contains an entry without a slug`);
      if (additionSources.has(entry.slug)) {
        throw new Error(`Duplicate content addition ${entry.slug}: ${additionSources.get(entry.slug)} and ${relativePath}`);
      }
      additionSources.set(entry.slug, relativePath);

      // apply-content-additions.mjs treats every matching additions registry as
      // authoritative for new and deliberately refreshed records. Mirror the
      // same discovery, ordering and precedence here so localization source
      // validation sees the exact canonical corpus the production build sees.
      bySlug.set(entry.slug, entry);
    }
  }

  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
