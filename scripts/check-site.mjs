import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "index.html",
  "features/index.html",
  "how-it-works/index.html",
  "screenshots/index.html",
  "docs/index.html",
  "download/index.html",
  "privacy/index.html",
  "terms/index.html",
  "support/index.html",
  "changelog/index.html",
  "life-os/index.html",
  "life-os/areas/index.html",
  "life-os/datasets/evidence.json",
  "life-os/datasets/review-queue.json",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "product-facts.json",
  "redirect-map.md",
];

for (const file of required) await access(path.join(root, file));

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/")) throw new Error("Sitemap lacks migrated Life OS pages.");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/areas/")) throw new Error("Sitemap lacks life area navigation pages.");
if (sitemap.includes("metalhatscats.com")) throw new Error("Sitemap still references MetalHatsCats.");

const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
if (!library.includes('href="/life-os/areas/"')) throw new Error("Growth Library does not link to life areas.");

const datasetsPage = await readFile(path.join(root, "life-os/datasets/index.html"), "utf8");
if (!datasetsPage.includes("/life-os/datasets/evidence.json") || !datasetsPage.includes("/life-os/datasets/review-queue.json")) {
  throw new Error("Dataset page does not expose evidence status and review queue files.");
}

const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidenceIndex = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const reviewQueue = JSON.parse(await readFile(path.join(root, "life-os/datasets/review-queue.json"), "utf8"));
if ((evidenceIndex.entries ?? []).length !== sourceIndex.length) throw new Error("Evidence index does not cover every Growth Library entry.");
if (!(reviewQueue.entries ?? []).every((record) => ["pending-review", "restricted"].includes(record.status))) {
  throw new Error("Evidence review queue contains a non-review status.");
}

console.log(`Static site verified: ${required.length} core files, Growth Library navigation, and ${evidenceIndex.entries.length} evidence records.`);
