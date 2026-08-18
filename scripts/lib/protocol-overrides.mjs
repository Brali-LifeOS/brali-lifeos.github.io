import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function loadProtocolOverrides(root) {
  const dataRoot = path.join(root, "data");
  const names = (await readdir(dataRoot))
    .filter((name) => /^protocol-content-overrides(?:-[a-z0-9-]+)?\.json$/i.test(name))
    .sort();
  if (!names.length) throw new Error("No protocol content override registry was found.");

  const entries = {};
  const sources = {};
  for (const name of names) {
    const registry = JSON.parse(await readFile(path.join(dataRoot, name), "utf8"));
    for (const [slug, override] of Object.entries(registry.entries ?? {})) {
      if (entries[slug]) throw new Error(`Duplicate protocol content override for ${slug}: ${sources[slug]} and ${name}.`);
      entries[slug] = override;
      sources[slug] = name;
    }
  }
  return { schema_version: 1, entries, sources, files: names };
}
