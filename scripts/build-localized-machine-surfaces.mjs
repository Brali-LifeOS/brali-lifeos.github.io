import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const profile = await readJson(path.join(root, ".arwp", "localization.json"));
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && entry.generator === "generic-v1");

const interpolate = (value, vars) => String(value).replace(/\{([a-z_]+)\}/g, (_match, key) => {
  if (!(key in vars)) throw new Error(`Unknown machine-copy variable: ${key}`);
  return String(vars[key]);
});

for (const entry of locales) {
  const locale = entry.code;
  const sourceRoot = path.join(root, "data", "localization", locale);
  const [copy, manifest, library] = await Promise.all([
    readJson(path.join(sourceRoot, "machine.json")),
    readJson(path.join(root, locale, "manifest.json")),
    readJson(path.join(root, locale, "library.json")),
  ]);
  if (copy.locale !== locale || copy.source_locale !== profile.sourceLocale) {
    throw new Error(`[${locale}] machine copy locale contract mismatch`);
  }
  if (entry.role !== "human-interface") throw new Error(`[${locale}] generic machine surface requires human-interface role`);

  const vars = { localized_count: library.count, canonical_count: library.canonical_count };
  const coverage = library.coverage_mode === "exact"
    ? interpolate(copy.coverage_exact, vars)
    : interpolate(copy.coverage_partial, vars);
  const llms = `# ${copy.title}\n\nLocale: ${locale}\nRole: ${entry.role}\nCanonical locale: ${profile.sourceLocale}\nNo silent fallback: true\nCoverage mode: ${library.coverage_mode}\n${coverage}\n\n## ${copy.machine_surfaces_heading}\n- ${base}/${locale}/manifest.json\n- ${base}/${locale}/library.json\n- ${base}/${locale}/sitemap.xml\n\n${copy.boundary}\n`;
  await writeFile(path.join(root, locale, "llms.txt"), llms);

  // Preserve the stable machine contract used by the original Russian
  // localization while all human-interface locales move through generic-v1.
  // `flagships` is the generic key; `flagship_protocols` remains as a
  // compatibility alias so existing agents and release checks do not lose a
  // useful invariant during the migration.
  manifest.role = entry.role;
  manifest.no_silent_fallback = true;
  manifest.coverage ||= {};
  if (manifest.coverage.flagships) {
    manifest.coverage.flagship_protocols = { ...manifest.coverage.flagships };
  }
  manifest.machine_copy_source = `data/localization/${locale}/machine.json`;
  await writeFile(path.join(root, locale, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[${locale}] localized machine surfaces written with role/fallback compatibility contract.`);
}
