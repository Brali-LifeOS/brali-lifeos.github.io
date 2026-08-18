import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const failures = [];

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const isExternalUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value) && !/brali-lifeos\.github\.io\/life-os/i.test(value);

function urls(article) {
  const result = [];
  const original = article.lifeOsSource ?? {};
  if (isExternalUrl(original.sourceUrl)) result.push(original.sourceUrl);
  for (const list of [article.references, article.sources, article.citations]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string" && isExternalUrl(item)) result.push(item);
      if (item && typeof item === "object") {
        const url = item.url || item.source_url || item.sourceUrl || item.reference_url;
        if (isExternalUrl(url)) result.push(url);
      }
    }
  }
  return [...new Set(result)];
}

let checkedPages = 0;
let checkedLinks = 0;
for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const sourceUrls = urls(article);
  const reviewed = article.editorialCuration?.evidenceStatus === "reviewed";
  if (reviewed && sourceUrls.length === 0) failures.push(`${entry.slug}: reviewed public entry has no external source URL`);
  if (sourceUrls.length === 0) continue;

  const page = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  checkedPages += 1;
  if (!page.includes('data-brali-sources="true"') || !page.includes("<h2>Sources</h2>")) {
    failures.push(`${entry.slug}: source metadata exists but public Sources block is missing`);
    continue;
  }
  for (const url of sourceUrls) {
    checkedLinks += 1;
    if (!page.includes(escapeHtml(url))) failures.push(`${entry.slug}: public page is missing source link ${url}`);
  }
}

if (failures.length) throw new Error(`Public source validation failed with ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
console.log(`Public sources verified: ${checkedPages} page(s), ${checkedLinks} direct source link(s).`);
