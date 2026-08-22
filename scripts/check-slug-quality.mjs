import { readFile, access, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const entries = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));

if (!Array.isArray(entries) || entries.length === 0) {
  throw new Error("Slug quality check requires a non-empty life-os-index.json array.");
}

const seen = new Set();
const failures = [];
const longReview = [];
const numericLeading = [];
const shape = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const technicalId = /^(?:hack|idea|item|entry|article|page|post|protocol|record|content|id)-?\d+$/i;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{12,}$/i;

async function htmlFiles(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isDirectory() && new Set(["node_modules", ".git", "reports"]).has(item.name)) continue;
    const fullPath = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...await htmlFiles(fullPath));
    else if (item.isFile() && item.name === "index.html") result.push(fullPath);
  }
  return result;
}

for (const entry of entries) {
  const slug = String(entry.slug ?? "").trim();
  const title = String(entry.displayTitle ?? entry.title ?? "").trim();
  const reasons = [];

  if (!slug) reasons.push("missing");
  if (seen.has(slug)) reasons.push("duplicate");
  seen.add(slug);
  if (slug && !shape.test(slug)) reasons.push("invalid-shape");
  if (/^\d+$/.test(slug)) reasons.push("numeric-only");
  if (technicalId.test(slug)) reasons.push("technical-id");
  if (uuid.test(slug) || hash.test(slug)) reasons.push("uuid-or-hash");
  if (slug.length > 80) reasons.push("over-80-characters");
  if (!/[a-z]{3}/.test(slug)) reasons.push("no-readable-word");
  if (!title) reasons.push("missing-title");

  if (slug.length > 60) longReview.push({ slug, title, length: slug.length });
  if (/^\d/.test(slug)) numericLeading.push(slug);

  try {
    await access(path.join(root, "life-os", slug, "index.html"));
  } catch {
    reasons.push("missing-public-page");
  }

  if (reasons.length) failures.push({ slug, title, reasons });
}

if (failures.length) {
  throw new Error(`Slug quality failed for ${failures.length} entries:\n${JSON.stringify(failures.slice(0, 30), null, 2)}`);
}

const publicRouteFailures = [];
let canonicalPages = 0;
for (const file of await htmlFiles(root)) {
  const html = await readFile(file, "utf8");
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (!canonical) continue;
  canonicalPages += 1;
  const pathname = new URL(canonical, "https://brali-lifeos.github.io").pathname;
  const terminal = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const reasons = [];
  if (/^\d+$/.test(terminal)) reasons.push("numeric-only-canonical");
  if (technicalId.test(terminal)) reasons.push("technical-id-canonical");
  if (uuid.test(terminal) || hash.test(terminal)) reasons.push("uuid-or-hash-canonical");
  if (reasons.length) publicRouteFailures.push({ file: path.relative(root, file), canonical, reasons });
}

if (publicRouteFailures.length) {
  throw new Error(`Public canonical slug quality failed:\n${JSON.stringify(publicRouteFailures, null, 2)}`);
}

const lengths = entries.map(entry => entry.slug.length).sort((a, b) => a - b);
const percentile = value => lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * value))];

console.log(
  `Slug quality verified: ${entries.length} unique human-readable slugs; ` +
  `numeric-only=0; technical IDs=0; UUID/hash=0; invalid=0; ` +
  `median=${percentile(0.5)} chars; p95=${percentile(0.95)} chars; max=${lengths.at(-1)} chars; ` +
  `semantic numeric-leading=${numericLeading.length}; long-review=${longReview.length}; ` +
  `public canonicals=${canonicalPages} with no numeric-only or technical terminal IDs.`
);

if (longReview.length) {
  console.log(`Slug editorial review (over 60 chars): ${longReview.map(item => `${item.slug} (${item.length})`).join(", ")}`);
}
