import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const INDEX_PATH = "data/life-os-content/index.json";
const ADDITIONS_PATH = "data/life-os-content-additions.json";

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
  const [trackedIndex, additions] = await Promise.all([
    readTrackedOrWorkingJson(root, INDEX_PATH),
    readTrackedOrWorkingJson(root, ADDITIONS_PATH),
  ]);
  if (!Array.isArray(trackedIndex)) throw new Error("Canonical authoring index must be an array");
  if (additions?.schema_version !== 1 || !Array.isArray(additions.entries)) {
    throw new Error("Content additions registry must use schema_version 1 and entries[]");
  }

  const bySlug = new Map(trackedIndex.map((entry) => [entry.slug, entry]));
  for (const entry of additions.entries) {
    if (!entry?.slug) throw new Error("Content additions registry contains an entry without a slug");
    if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
