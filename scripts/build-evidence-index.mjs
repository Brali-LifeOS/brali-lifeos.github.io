import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence } from "./lib/content-trust.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const contentRoot = path.join(root, "data/life-os-content");
const outputRoot = path.join(root, "life-os/datasets");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const aliases = JSON.parse(await readFile(path.join(root, "data/protocol-aliases.json"), "utf8"));
const knownSlugs = new Set(index.map((entry) => entry.slug));
const allowedStatuses = new Set(["reviewed", "practical", "pending-review", "restricted"]);

for (const [slug, override] of Object.entries(overrides.entries ?? {})) {
  if (!knownSlugs.has(slug)) throw new Error(`Evidence override references unknown entry: ${slug}`);
  if (!allowedStatuses.has(override.status)) throw new Error(`Evidence override has invalid status for ${slug}: ${override.status}`);
  if (!override.reviewed_at || !override.reviewed_by) {
    throw new Error(`Evidence override for ${slug} must record reviewed_at and reviewed_by.`);
  }
}

for (const [slug, alias] of Object.entries(aliases.entries ?? {})) {
  if (!knownSlugs.has(slug)) throw new Error(`Protocol alias references unknown source entry: ${slug}`);
  if (!knownSlugs.has(alias.canonical_slug)) throw new Error(`Protocol alias references unknown canonical entry: ${slug} -> ${alias.canonical_slug}`);
  if (slug === alias.canonical_slug) throw new Error(`Protocol alias cannot point to itself: ${slug}`);
  if (!alias.reason?.trim()) throw new Error(`Protocol alias must explain why it exists: ${slug}`);
}

const records = [];
for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const classified = classifyEvidence(article, entry, overrides);
  const alias = aliases.entries?.[entry.slug] ?? null;
  const record = alias
    ? {
        ...classified,
        alias_of: alias.canonical_slug,
        canonical_url: `${base}/life-os/${alias.canonical_slug}/`,
      }
    : classified;
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

function withEditorialPriority(record) {
  let score = record.status === "restricted" ? 200 : 50;
  const factors = [record.status];

  if (record.sensitive) {
    score += 40;
    factors.push("sensitive-topic");
  }
  if (record.claims.quantitative) {
    score += 30;
    factors.push("quantitative-claims");
  }
  if (record.claims.evidenceLanguage) {
    score += 20;
    factors.push("evidence-language");
  }
  if (!record.source.recorded) {
    score += 15;
    factors.push("no-usable-source");
  } else if (record.status === "pending-review") {
    score += 5;
    factors.push("source-recorded-not-reviewed");
  }

  return {
    ...record,
    editorial_priority: { score, factors },
  };
}

const queue = records
  .filter((record) => !record.alias_of && (record.status === "restricted" || record.status === "pending-review"))
  .map(withEditorialPriority)
  .sort((a, b) => (b.editorial_priority.score - a.editorial_priority.score) || a.slug.localeCompare(b.slug));

const aliasEntries = Object.entries(aliases.entries ?? {}).map(([slug, alias]) => ({
  slug,
  url: `${base}/life-os/${slug}/`,
  canonical_slug: alias.canonical_slug,
  canonical_url: `${base}/life-os/${alias.canonical_slug}/`,
  reason: alias.reason,
}));

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "evidence.json"), JSON.stringify({
  schema_version: 1,
  name: "Brali Growth Library evidence index",
  statuses: ["reviewed", "practical", "pending-review", "restricted"],
  counts,
  entries: records,
}, null, 2));
await writeFile(path.join(outputRoot, "review-queue.json"), JSON.stringify({
  schema_version: 2,
  name: "Brali Growth Library evidence review queue",
  priority: "Restricted entries always rank ahead of pending-review entries. Protocol aliases are excluded because they point to a canonical protocol instead of requiring a second editorial review.",
  priority_model: {
    version: 1,
    purpose: "Editorial triage only; the score is not a clinical-risk or evidence-strength measure.",
    weights: {
      restricted: 200,
      pending_review: 50,
      sensitive_topic: 40,
      quantitative_claims: 30,
      evidence_language: 20,
      no_usable_source: 15,
      source_recorded_not_reviewed: 5
    }
  },
  excluded_alias_count: aliasEntries.length,
  entries: queue,
}, null, 2));
await writeFile(path.join(outputRoot, "aliases.json"), JSON.stringify({
  schema_version: 1,
  name: "Brali protocol aliases",
  rule: "Aliases preserve old public URLs while routing discovery to one canonical protocol.",
  count: aliasEntries.length,
  entries: aliasEntries,
}, null, 2));

const manifestPath = path.join(outputRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "evidence.json", "review-queue.json", "aliases.json"])];
manifest.evidence_status_counts = counts;
manifest.review_queue_schema_version = 2;
manifest.protocol_aliases = aliasEntries.length;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPage = path.join(root, "life-os/datasets/index.html");
let html = await readFile(datasetsPage, "utf8");
if (!html.includes("/life-os/datasets/evidence.json")) {
  html = html.replace(
    "</ul>",
    '<li><a href="/life-os/datasets/evidence.json">Evidence status index (JSON)</a></li><li><a href="/life-os/datasets/review-queue.json">Evidence review queue (JSON)</a></li></ul>',
  );
}
if (!html.includes("/life-os/datasets/aliases.json")) {
  html = html.replace(
    "</ul>",
    '<li><a href="/life-os/datasets/aliases.json">Protocol aliases (JSON)</a></li></ul>',
  );
}
await writeFile(datasetsPage, html);

console.log(`Evidence index generated: ${records.length} entries; ${queue.length} queued for review; ${aliasEntries.length} protocol alias(es) excluded from editorial triage.`);
