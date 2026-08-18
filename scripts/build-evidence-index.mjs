import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence } from "./lib/content-trust.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const outputRoot = path.join(root, "life-os/datasets");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const knownSlugs = new Set(index.map((entry) => entry.slug));
const allowedStatuses = new Set(["reviewed", "practical", "pending-review", "restricted"]);

for (const [slug, override] of Object.entries(overrides.entries ?? {})) {
  if (!knownSlugs.has(slug)) throw new Error(`Evidence override references unknown entry: ${slug}`);
  if (!allowedStatuses.has(override.status)) throw new Error(`Evidence override has invalid status for ${slug}: ${override.status}`);
  if (!override.reviewed_at || !override.reviewed_by) {
    throw new Error(`Evidence override for ${slug} must record reviewed_at and reviewed_by.`);
  }
}

const records = [];
for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const record = classifyEvidence(article, entry, overrides);
  const manual = overrides.entries?.[entry.slug];
  if (manual?.status === "practical" && record.claims.evidenceLanguage) {
    throw new Error(`Cannot mark ${entry.slug} practical while evidence-like claims remain in the source record.`);
  }
  if (manual?.status === "reviewed" && (record.claims.evidenceLanguage || record.sensitive) && !record.source.recorded) {
    throw new Error(`Cannot mark ${entry.slug} reviewed without a usable source while evidence or sensitive-content review is required.`);
  }
  records.push(record);
}
records.sort((a, b) => a.slug.localeCompare(b.slug));

const counts = records.reduce((acc, record) => {
  acc[record.status] = (acc[record.status] ?? 0) + 1;
  return acc;
}, {});

const priority = { restricted: 0, "pending-review": 1, practical: 2, reviewed: 3 };
const queue = records
  .filter((record) => record.status === "restricted" || record.status === "pending-review")
  .sort((a, b) => (priority[a.status] - priority[b.status]) || Number(b.claims.quantitative) - Number(a.claims.quantitative) || a.slug.localeCompare(b.slug));

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "evidence.json"), JSON.stringify({
  schema_version: 1,
  name: "Brali Growth Library evidence index",
  statuses: ["reviewed", "practical", "pending-review", "restricted"],
  counts,
  entries: records,
}, null, 2));
await writeFile(path.join(outputRoot, "review-queue.json"), JSON.stringify({
  schema_version: 1,
  name: "Brali Growth Library evidence review queue",
  priority: "restricted first, then pending-review; quantitative claims first within each status",
  entries: queue,
}, null, 2));

const manifestPath = path.join(outputRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "evidence.json", "review-queue.json"])];
manifest.evidence_status_counts = counts;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPage = path.join(root, "life-os/datasets/index.html");
let html = await readFile(datasetsPage, "utf8");
if (!html.includes("/life-os/datasets/evidence.json")) {
  html = html.replace(
    "</ul>",
    '<li><a href="/life-os/datasets/evidence.json">Evidence status index (JSON)</a></li><li><a href="/life-os/datasets/review-queue.json">Evidence review queue (JSON)</a></li></ul>',
  );
  await writeFile(datasetsPage, html);
}

console.log(`Evidence index generated: ${records.length} entries; ${queue.length} queued for review.`);
