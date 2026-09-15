import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

for (const locale of (profile.locales || []).filter((entry) => entry.role === "human-interface")) {
  const sourcePath = path.join(root, "data", "localization", locale.code, "problem-collections.json");
  if (!(await exists(sourcePath))) continue;

  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const manifestPath = path.join(root, locale.code, "manifest.json");
  const llmsPath = path.join(root, locale.code, "llms.txt");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const coverage = manifest.coverage?.problem_guides;
  if (!coverage || coverage.localized !== coverage.canonical) {
    throw new Error(`[localized-discovery-llms] ${locale.code} problem guide coverage is not exact`);
  }

  let llms = await readFile(llmsPath, "utf8");
  const marker = `## ${source.labels.index_title}`;
  const block = `${marker}\n- ${base}/${locale.code}/problems/\n- Localized guides: ${coverage.localized}/${coverage.canonical} (exact canonical membership)\n- Canonical source graph: ${base}/problems/\n- Search eligibility inherits from each canonical English route.\n`;
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\n[\\s\\S]*?(?=\\n## |$)`, "m");
  llms = pattern.test(llms) ? llms.replace(pattern, block.trimEnd()) : `${llms.trimEnd()}\n\n${block}`;
  await writeFile(llmsPath, `${llms.trimEnd()}\n`);
  console.log(`[localized-discovery-llms] ${locale.code}: ${coverage.localized} problem guides exposed`);
}
