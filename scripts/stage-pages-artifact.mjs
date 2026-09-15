import { cp, lstat, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "_site");
const topLevelExcluded = new Set([".git", ".github", ".arwp", "node_modules", "scripts", "artifacts", "_site"]);
const excludedDirectoryNames = new Set([".git", "node_modules", "__pycache__", ".pytest_cache"]);
const excludedTopLevelFiles = new Set([
  "AGENTS.md",
  "AGENT_LOOP.md",
  "CONTRIBUTING.md",
  "design-qa.md",
  "redirect-map.md",
]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

function shouldCopy(source) {
  const relative = path.relative(root, source);
  if (!relative || relative.startsWith("..")) return true;
  const parts = relative.split(path.sep);
  if (parts.length === 1) {
    if (topLevelExcluded.has(parts[0])) return false;
    if (excludedTopLevelFiles.has(parts[0])) return false;
  }
  if (parts.some((part) => excludedDirectoryNames.has(part))) return false;
  return true;
}

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!shouldCopy(path.join(root, entry.name))) continue;
  await cp(path.join(root, entry.name), path.join(output, entry.name), {
    recursive: true,
    force: true,
    filter: shouldCopy,
  });
}

let files = 0;
let bytes = 0;
let nodeModules = 0;
let internalScripts = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const rel = path.relative(output, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") nodeModules += 1;
      if (rel === "scripts" || rel.startsWith("scripts/")) internalScripts += 1;
      await inspect(full);
    } else if (entry.isFile()) {
      const info = await stat(full);
      files += 1;
      bytes += info.size;
    }
  }
}
await inspect(output);

if (nodeModules) throw new Error(`[pages-artifact] staged artifact still contains ${nodeModules} node_modules director${nodeModules === 1 ? "y" : "ies"}`);
if (internalScripts) throw new Error(`[pages-artifact] staged artifact still contains internal scripts`);
for (const forbidden of [".github", ".arwp", "AGENTS.md", "AGENT_LOOP.md", "CONTRIBUTING.md"]) {
  try {
    await lstat(path.join(output, forbidden));
    throw new Error(`[pages-artifact] forbidden development surface still staged: ${forbidden}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const megabytes = bytes / 1024 / 1024;
console.log(`[pages-artifact] staged ${files} public file(s), ${megabytes.toFixed(1)} MiB; node_modules=0; internal scripts=0.`);
