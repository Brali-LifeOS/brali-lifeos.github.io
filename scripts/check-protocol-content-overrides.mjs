import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadProtocolOverrides } from "./lib/protocol-overrides.mjs";
import { publicClaimSurface } from "./lib/content-trust.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const registry = await loadProtocolOverrides(root);
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const feedBySlug = new Map((protocols.entries ?? []).map((entry) => [entry.slug, entry]));
const indexable = new Set(indexing.indexable ?? []);
const failures = [];
const decodeHtml = (value) => value
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&amp;", "&");

for (const [slug, override] of Object.entries(registry.entries ?? {})) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${slug}.json`), "utf8"));
  const page = await readFile(path.join(root, "life-os", slug, "index.html"), "utf8");
  const renderedPage = decodeHtml(page);
  const publicClaims = JSON.stringify(publicClaimSurface(article));
  const expectedStatus = override.evidence_status ?? "practical";
  if (article.editorialCuration?.status !== "curated") failures.push(`${slug}: article is not marked curated`);
  if (article.editorialCuration?.evidenceStatus !== expectedStatus) failures.push(`${slug}: editorial evidence status mismatch`);
  if (article.editorialCuration?.reviewedAt !== override.reviewed_at) failures.push(`${slug}: review date mismatch`);
  if (article.editorialCuration?.registry !== registry.sources?.[slug]) failures.push(`${slug}: registry source mismatch`);
  if (!renderedPage.includes(override.lifeOsSource?.whatYouDo ?? "")) failures.push(`${slug}: public page does not contain the curated action`);
  for (const fragment of override.forbidden_public_fragments ?? []) {
    if (publicClaims.includes(fragment)) failures.push(`${slug}: forbidden fragment remains in effective public claims: ${fragment}`);
  }
  const trust = evidenceBySlug.get(slug);
  if (trust?.status !== expectedStatus || trust?.indexable !== true) failures.push(`${slug}: evidence/indexable status mismatch`);
  if (expectedStatus === "reviewed" && trust?.source?.recorded !== true) failures.push(`${slug}: reviewed entry lacks a recorded source`);
  if (!indexable.has(slug)) failures.push(`${slug}: missing from indexable set`);
  if (!feedBySlug.has(slug)) failures.push(`${slug}: missing from trusted protocol feed`);
}

if (failures.length) {
  throw new Error(`Curated protocol validation failed with ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
}
const reviewed = Object.values(registry.entries ?? {}).filter((override) => override.evidence_status === "reviewed").length;
console.log(`Curated protocol overrides verified: ${Object.keys(registry.entries ?? {}).length} entry override(s) from ${registry.files.length} registry file(s); ${reviewed} reviewed-source protocol(s); all are indexable and present in the trusted feed.`);
