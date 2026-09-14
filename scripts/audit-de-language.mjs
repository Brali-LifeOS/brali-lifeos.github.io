import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const locale = "de";
const sourceRoot = path.join(root, "data", "localization", locale);
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const fail = (message) => { throw new Error(`[de-language] ${message}`); };
const cyrillic = /[А-Яа-яЁё]/;
const englishFunctionWords = /\b(?:the|your|you|with|from|before|after|when|what|why|how|into|without|should|must|this|that|these|those|more|less|start|learn|choose|check|open|read)\b/i;

const allowlist = await readJson("data/localization/de/language-allowlist.json");
if (allowlist.locale !== locale || !Array.isArray(allowlist.terms)) fail("invalid language allowlist");
const allowedTerms = allowlist.terms.map((item) => item.term).filter(Boolean).sort((a, b) => b.length - a.length);

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

const [site, zones, flagships, primary] = await Promise.all([
  readJson("data/localization/de/site.json"),
  readJson("data/localization/de/zones.json"),
  readJson("data/localization/de/flagships.json"),
  readJson("data/localization/de/primary-pages.json"),
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
    for (const field of ["title", "subtitle", "description", "action", "check_in", "boundary", "alternative"]) {
      if (record[field]) checkText(`${name}:${record.slug}.${field}`, record[field]);
    }
  }
}

for (const page of primary.pages || []) {
  let html = await readFile(path.join(root, page.fragment), "utf8");
  html = html.replace(/<pre[\s\S]*?<\/pre>/gi, " ").replace(/<code[\s\S]*?<\/code>/gi, " ").replace(/<[^>]+>/g, " ");
  checkText(`fragment:${page.id}`, html);
}

console.log(`German language audit passed: ${recordCount} library batch records, ${(zones.records || []).length} zones, ${(flagships.entries || []).length} flagships, ${(primary.pages || []).length} primary pages.`);
