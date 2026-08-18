import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const registry = JSON.parse(await readFile(path.join(root, "data/editorial-normalizations.json"), "utf8"));
const applied = JSON.parse(await readFile(path.join(root, ".editorial-normalizations-applied.json"), "utf8"));
const appliedById = new Map((applied.rules ?? []).map((rule) => [rule.id, rule]));

const rules = (registry.rules ?? []).map((rule) => ({
  id: rule.id,
  status: rule.status,
  reviewed_at: rule.reviewed_at,
  reviewed_by: rule.reviewed_by,
  reason: rule.reason,
  review_source: rule.review_source,
  replacement: rule.replacement,
  applied: appliedById.get(rule.id) ?? { replacements: 0, affected_entries: [] },
}));

const output = {
  schema_version: 1,
  name: "Brali editorial normalization register",
  description: "Reviewed corrections applied to inherited source content before public pages, evidence classification, indexing, and trusted feeds are generated.",
  changed_entries: applied.changed_entries,
  rules,
};
await writeFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), JSON.stringify(output, null, 2));

const manifestPath = path.join(root, "life-os/datasets/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "editorial-normalizations.json"] )];
manifest.editorial_normalizations = { rules: rules.length, changed_entries: applied.changed_entries };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPath = path.join(root, "life-os/datasets/index.html");
let datasetsHtml = await readFile(datasetsPath, "utf8");
if (!datasetsHtml.includes("/life-os/datasets/editorial-normalizations.json")) {
  datasetsHtml = datasetsHtml.replace(
    "</ul>",
    '<li><a href="/life-os/datasets/editorial-normalizations.json">Editorial normalization register (JSON)</a></li></ul>',
  );
  await writeFile(datasetsPath, datasetsHtml);
}

console.log(`Editorial normalization register published: ${rules.length} reviewed rule(s), ${applied.changed_entries} affected entries.`);
