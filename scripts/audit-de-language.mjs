import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const locale = "de";
const sourceRoot = path.join(root, "data", "localization", locale);
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const findings = [];
const fail = (message) => { findings.push(message); };
const cyrillic = /[А-Яа-яЁё]/;
// Keep this detector to English function words that are not normal standalone German vocabulary.
// Common German borrowings and homographs such as “Start”, “Check” and the noun “These” are
// reviewed by normal editorial passes instead of this lightweight leakage detector.
const englishFunctionWords = /\b(?:the|your|you|with|from|before|after|when|what|why|how|into|without|should|must|this|that|those|more|less|learn|choose|open|read)\b/i;

const allowlist = await readJson("data/localization/de/language-allowlist.json");
if (allowlist.locale !== locale || !Array.isArray(allowlist.terms)) fail("invalid language allowlist");
const allowedTerms = Array.isArray(allowlist.terms)
  ? allowlist.terms.map((item) => item.term).filter(Boolean).sort((a, b) => b.length - a.length)
  : [];

function normalizeVisible(value) {
  let result = String(value || "");
  for (const term of allowedTerms) result = result.split(term).join(" ");
  return result.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
}

function checkText(label, value, { functionWords = true } = {}) {
  if (typeof value !== "string") return;
  if (value !== value.normalize("NFC")) fail(`${label} is not NFC`);
  if (cyrillic.test(value)) fail(`${label} contains Cyrillic leakage`);
  const visible = normalizeVisible(value);
  if (functionWords && englishFunctionWords.test(visible)) {
    fail(`${label} contains suspicious unreviewed English: ${visible.match(englishFunctionWords)?.[0]}`);
  }
}

function walkJson(value, label) {
  if (typeof value === "string") return checkText(label, value);
  if (Array.isArray(value)) return value.forEach((item, index) => walkJson(item, `${label}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (["slug", "source", "source_locale", "source_dataset", "sourceFingerprint", "reviewed_at", "evidence_status", "quality_state", "route", "source_route", "source_path", "fragment", "schema_type", "id", "kind", "code", "languageTag"].includes(key)) continue;
    walkJson(item, `${label}.${key}`);
  }
}

const [site, zones, flagships, primary, problems] = await Promise.all([
  readJson("data/localization/de/site.json"),
  readJson("data/localization/de/zones.json"),
  readJson("data/localization/de/flagships.json"),
  readJson("data/localization/de/primary-pages.json"),
  readJson("data/localization/de/problem-collections.json"),
]);
walkJson(site, "site");
walkJson(zones.records || [], "zones");
walkJson((flagships.entries || []).map((entry) => ({
  life_area: entry.life_area,
  title: entry.title,
  description: entry.description,
  action: entry.action,
  check_in: entry.check_in,
  boundary: entry.boundary,
  alternative: entry.alternative,
  evidence_label: entry.evidence_label,
  search: entry.search,
})), "flagships");
walkJson((primary.pages || []).map((page) => ({ title: page.title, description: page.description })), "primary-pages");
walkJson(problems.labels || {}, "problem-collections.labels");
walkJson(problems.collections || [], "problem-collections.collections");

let batchFiles = [];
try {
  batchFiles = (await readdir(path.join(sourceRoot, "library"))).filter((name) => name.endsWith(".json")).sort();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let recordCount = 0;
for (const name of batchFiles) {
  const batch = JSON.parse(await readFile(path.join(sourceRoot, "library", name), "utf8"));
  for (const record of batch.records || []) {
    recordCount += 1;
    const localized = record.localized && typeof record.localized === "object" ? record.localized : record;
    for (const field of ["title", "subtitle", "description", "action", "check_in", "boundary", "alternative"]) {
      if (localized[field]) checkText(`${name}:${record.slug}.${field}`, localized[field]);
    }
  }
}

for (const page of primary.pages || []) {
  let html = await readFile(path.join(root, page.fragment), "utf8");
  html = html.replace(/<pre[\s\S]*?<\/pre>/gi, " ").replace(/<code[\s\S]*?<\/code>/gi, " ").replace(/<[^>]+>/g, " ");
  checkText(`fragment:${page.id}`, html);
}

if (findings.length) {
  console.error(`[de-language] ${findings.length} finding(s)`);
  for (const finding of findings.slice(0, 300)) console.error(`  ${finding}`);
  if (findings.length > 300) console.error(`  ... ${findings.length - 300} more`);
  throw new Error(`German language audit found ${findings.length} issue(s).`);
}

console.log(`German language audit passed: ${recordCount} library batch records, ${(zones.records || []).length} zones, ${(flagships.entries || []).length} flagships, ${(primary.pages || []).length} primary pages, ${(problems.collections || []).length} problem guides.`);
