import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadProtocolOverrides } from "./lib/protocol-overrides.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const indexPath = path.join(contentRoot, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
const registry = await loadProtocolOverrides(root);
const known = new Set(index.map((entry) => entry.slug));
const indexBySlug = new Map(index.map((entry) => [entry.slug, entry]));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const applied = [];
let indexChanged = false;

for (const [slug, override] of Object.entries(registry.entries ?? {})) {
  if (!known.has(slug)) throw new Error(`Protocol content override references unknown entry: ${slug}`);
  if (!override.reviewed_at || !override.reviewed_by || !override.reason || !override.body?.sections?.length) {
    throw new Error(`Protocol content override is incomplete: ${slug}`);
  }

  const file = path.join(contentRoot, `${slug}.json`);
  const article = JSON.parse(await readFile(file, "utf8"));
  const indexEntry = indexBySlug.get(slug);

  for (const field of ["title", "subtitle", "description"]) {
    if (typeof override[field] === "string" && override[field].trim()) {
      article[field] = override[field].trim();
      indexEntry[field] = override[field].trim();
      indexChanged = true;
    }
  }

  article.lifeOsSource = { ...(article.lifeOsSource ?? {}), ...(override.lifeOsSource ?? {}) };
  if (Array.isArray(override.references)) article.references = override.references;
  if (Array.isArray(override.faq)) {
    article.faq = override.faq.map((item) => ({
      ...item,
      answerHtml: item.answerHtml || `<p>${escapeHtml(item.answer ?? "")}</p>`,
    }));
  }
  article.body = override.body;
  article.editorialCuration = {
    status: "curated",
    evidenceStatus: override.evidence_status ?? "practical",
    reviewedAt: override.reviewed_at,
    reviewedBy: override.reviewed_by,
    reason: override.reason,
    registry: registry.sources?.[slug] ?? null,
  };
  await writeFile(file, `${JSON.stringify(article, null, 2)}\n`);
  applied.push({
    slug,
    evidence_status: override.evidence_status ?? "practical",
    reviewed_at: override.reviewed_at,
    reviewed_by: override.reviewed_by,
    reason: override.reason,
    registry: registry.sources?.[slug] ?? null,
  });
}

if (indexChanged) await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
await writeFile(path.join(root, ".protocol-content-overrides-applied.json"), JSON.stringify({ schema_version: 1, registry_files: registry.files, entries: applied }, null, 2));
console.log(`Curated protocol content applied: ${applied.length} entry override(s) from ${registry.files.length} registry file(s).`);
