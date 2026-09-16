import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const MIN_LONGFORM_CHARS = 600;
const MIN_COVERAGE_RATIO = 0.5;

const stripHtml = (value = "") => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function sourceSubstantiveChars(article) {
  const markdown = typeof article.body?.markdown === "string" ? article.body.markdown.trim() : "";
  const sections = Array.isArray(article.body?.sections) ? article.body.sections : [];
  const sectionText = sections.map((section) => stripHtml(section.html || section.markdown || "")).join(" ");
  const intro = stripHtml(typeof article.body?.intro === "string" ? article.body.intro : article.body?.intro?.html || "");
  return Math.max(markdown.length, sectionText.length + intro.length);
}

let candidates = 0;
let visible = 0;
let restricted = 0;
let coverageChecked = 0;
let violations = 0;
const violationExamples = [];

function fail(slug, message) {
  violations += 1;
  if (violationExamples.length < 15) violationExamples.push(`${slug}: ${message}`);
}

for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const markdown = typeof article.body?.markdown === "string" ? article.body.markdown.trim() : "";
  const sections = Array.isArray(article.body?.sections) ? article.body.sections : [];
  const markdownCandidate = markdown.length >= MIN_LONGFORM_CHARS && sections.length === 0;
  if (markdownCandidate) candidates += 1;

  const record = evidenceBySlug.get(entry.slug);
  if (!record) {
    fail(entry.slug, "missing evidence record");
    continue;
  }
  const html = await readFile(path.join(root, "life-os", entry.slug, "index.html"), "utf8");
  const marker = html.includes('data-longform-source="body.markdown"');
  const revisions = html.includes('data-article-versions="true"');

  if (record.status === "restricted") {
    if (markdownCandidate) restricted += 1;
    if (marker) fail(entry.slug, "restricted page leaked restored markdown long-form");
    if (!html.includes('data-legacy-content-state="historical-source-only"')) fail(entry.slug, "restricted page lost historical-source-only boundary");
    continue;
  }

  if (!revisions) fail(entry.slug, "visible page lost its article versions");
  if (record.status === "pending-review" && !html.includes('data-legacy-content-state="review-pending-longform-visible"')) {
    fail(entry.slug, "pending-review page lost its review-pending long-form boundary");
  }

  if (markdownCandidate) {
    visible += 1;
    if (!marker) fail(entry.slug, "markdown-backed long-form article was not restored into the generated page");
  }

  // Corpus-level anti-shrinkage gate: a substantive canonical article must not
  // collapse into a thin generated page. Compares generated visible text against
  // the canonical source so intentional curated replacements stay possible while
  // "large article became a short card" regressions fail the build.
  const sourceChars = sourceSubstantiveChars(article);
  if (sourceChars >= MIN_LONGFORM_CHARS) {
    coverageChecked += 1;
    const main = html.match(/<main[\s\S]*<\/main>/);
    const outputChars = stripHtml(main ? main[0] : html).length;
    if (outputChars < Math.max(MIN_LONGFORM_CHARS, sourceChars * MIN_COVERAGE_RATIO)) {
      fail(entry.slug, `generated page retains only ${outputChars} of ${sourceChars} substantive source characters`);
    }
  }
}

if (violations) {
  throw new Error(`Long-form publication validation failed with ${violations} violation(s). Examples: ${violationExamples.join("; ")}`);
}
console.log(`Long-form publication verified: ${visible}/${candidates} markdown-backed articles visible; ${restricted} restricted article(s) intentionally withheld; ${coverageChecked} substantive articles pass source-coverage; revision history present on visible long-form pages.`);
