import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const page = await readFile(path.join(root, "life-os/index.html"), "utf8");
const script = await readFile(path.join(root, "library-search.js"), "utf8");

const requiredPageMarkers = [
  'data-library-search="true"',
  'id="protocol-search"',
  'data-search-status',
  'data-search-results',
  '/library-search.css',
  '/library-search.js',
];
for (const marker of requiredPageMarkers) {
  if (!page.includes(marker)) throw new Error(`Growth Library search is missing page marker: ${marker}`);
}

if (!script.includes("fetch('/life-os-index.json')") || !script.includes("fetch('/life-os/datasets/evidence.json')")) {
  throw new Error("Library search does not load both the content and evidence indexes.");
}
if (!script.includes('filter((record) => record.indexable)')) {
  throw new Error("Library search is not explicitly limited to indexable entries.");
}
if (!page.includes('href="/life-os/areas/"')) {
  throw new Error("Growth Library search lacks the Life Area navigation fallback.");
}

console.log('Growth Library search wiring and trust filter verified.');
