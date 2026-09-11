import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const indexPath = path.join(contentRoot, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
let changed = 0;

for (const entry of index) {
  const file = path.join(contentRoot, `${entry.slug}.json`);
  const raw = await readFile(file, "utf8");
  const article = JSON.parse(raw);
  if (!article.trustverseCuration) continue;

  if (typeof article.subtitle === "string") {
    article.subtitle = article.subtitle.replace(/without assuming a guaranteed result\.?/gi, "without assuming the outcome in advance.");
  }

  for (const field of ["title", "subtitle", "description"]) {
    if (typeof article[field] === "string" && article[field].trim()) entry[field] = article[field].trim();
  }

  const next = `${JSON.stringify(article, null, 2)}\n`;
  if (next !== raw) {
    await writeFile(file, next);
    changed += 1;
  }
}

await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Trustverse mass curation finalized: ${changed} article file(s) normalized; source index synchronized.`);
