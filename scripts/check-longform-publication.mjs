import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const MIN_LONGFORM_CHARS = 600;
let candidates = 0;
let visible = 0;
let restricted = 0;
let violations = 0;

for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const markdown = typeof article.body?.markdown === "string" ? article.body.markdown.trim() : "";
  const sections = Array.isArray(article.body?.sections) ? article.body.sections : [];
  if (markdown.length < MIN_LONGFORM_CHARS || sections.length > 0) continue;
  candidates += 1;

  const record = evidenceBySlug.get(entry.slug);
  if (!record) {
    violations += 1;
    continue;
  }
  const html = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  const marker = html.includes('data-longform-source="body.markdown"');
  const revisions = html.includes('data-article-versions="true"');

  if (record.status === "restricted") {
    restricted += 1;
    if (marker) violations += 1;
    if (!html.includes('data-legacy-content-state="historical-source-only"')) violations += 1;
    continue;
  }

  visible += 1;
  if (!marker || !revisions) violations += 1;
  if (record.status === "pending-review" && !html.includes('data-legacy-content-state="review-pending-longform-visible"')) violations += 1;
}

if (violations) throw new Error(`Long-form publication validation failed with ${violations} violation(s).`);
console.log(`Long-form publication verified: ${visible}/${candidates} markdown-backed articles visible; ${restricted} restricted article(s) intentionally withheld; revision history present on visible long-form pages.`);
