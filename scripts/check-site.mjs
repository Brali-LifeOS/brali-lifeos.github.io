import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "index.html",
  "homepage.css",
  "library-search.js",
  "library-search.css",
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
  "life-os/datasets/title-quality.json",
  "life-os/datasets/indexing.json",
  "life-os/datasets/protocols.json",
  "life-os/datasets/editorial-normalizations.json",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "product-facts.json",
  "redirect-map.md",
];

for (const file of required) await access(path.join(root, file));

const homepage = await readFile(path.join(root, "index.html"), "utf8");
if (!homepage.includes('class="protocol-demo"')) throw new Error("Homepage lacks the protocol example.");
if (!homepage.includes('href="/life-os/areas/"')) throw new Error("Homepage does not provide a Life Areas entry point.");
if (/class="app-card"/.test(homepage)) throw new Error("Homepage still uses the logo-only hero card.");

const docs = await readFile(path.join(root, "docs/index.html"), "utf8");
if (!docs.includes("Run one small experiment first.")) throw new Error("Getting-started page is not experiment-first.");
if (!docs.includes('href="/life-os/flagships/"')) throw new Error("Getting-started page does not link to flagship protocols.");
if (!docs.includes("Choose → Practice → Check in → Review → Keep or change.")) throw new Error("Getting-started page does not explain the Brali review loop.");

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/")) throw new Error("Sitemap lacks migrated Life OS pages.");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/areas/")) throw new Error("Sitemap lacks life area navigation pages.");
if (sitemap.includes("metalhatscats.com")) throw new Error("Sitemap still references MetalHatsCats.");

const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
if (!library.includes('href="/life-os/areas/"')) throw new Error("Growth Library does not link to life areas.");

const datasetsPage = await readFile(path.join(root, "life-os/datasets/index.html"), "utf8");
for (const dataset of ["evidence.json", "review-queue.json", "title-quality.json", "indexing.json", "protocols.json", "editorial-normalizations.json"]) {
  if (!datasetsPage.includes(`/life-os/datasets/${dataset}`)) throw new Error(`Dataset page does not expose ${dataset}.`);
}

const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const publicIndex = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));
const evidenceIndex = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const reviewQueue = JSON.parse(await readFile(path.join(root, "life-os/datasets/review-queue.json"), "utf8"));
const titleQuality = JSON.parse(await readFile(path.join(root, "life-os/datasets/title-quality.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const normalizations = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));

if ((evidenceIndex.entries ?? []).length !== sourceIndex.length) throw new Error("Evidence index does not cover every Growth Library entry.");
if (!(reviewQueue.entries ?? []).every((record) => ["pending-review", "restricted"].includes(record.status))) {
  throw new Error("Evidence review queue contains a non-review status.");
}
if (publicIndex.length !== sourceIndex.length || !publicIndex.every((entry) => typeof entry.displayTitle === "string" && entry.displayTitle.trim())) {
  throw new Error("Public Life OS index lacks normalized display titles.");
}
if (!Number.isInteger(titleQuality.changed_count) || !Number.isInteger(titleQuality.unresolved_count)) {
  throw new Error("Title quality report is malformed.");
}
if (!Number.isInteger(protocols.count) || protocols.count !== (protocols.entries ?? []).length) {
  throw new Error("Protocol feed is malformed.");
}
if (!Array.isArray(normalizations.rules)) throw new Error("Editorial normalization register is malformed.");

console.log(`Static site verified: ${required.length} core files, experiment-first onboarding, protocol-first homepage, trusted search/feed, editorial provenance, ${evidenceIndex.entries.length} evidence records, and earned indexing outputs.`);
