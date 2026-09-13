import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const sourceRoot = path.join(root, "data", "localization", "ru");
const batchRoot = path.join(sourceRoot, "library");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const fail = (message) => { throw new Error(`[ru-library] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const cyrillic = /[А-Яа-яЁё]/;

const [config, canonicalIndex, evidence, zonesRu, zonesEn, flagships, manifest, machine] = await Promise.all([
  readJson("data/localization/ru/library-manifest.json"),
  readJson("data/life-os-content/index.json"),
  readJson("life-os/datasets/evidence.json"),
  readJson("data/localization/ru/zones.json"),
  readJson("data/life-os-zones.json"),
  readJson("data/localization/ru/flagships.json"),
  readJson("ru/manifest.json"),
  readJson("ru/library.json"),
]);

assert(config.locale === "ru" && config.issue === 210, "library manifest must belong to the Russian full-corpus loop (#210)");
assert(["batched", "exact"].includes(config.coverage_mode), "coverage_mode must be batched or exact");
const allowedQuality = new Set(config.quality_states || []);
const qualityRank = { "localized-draft": 0, "language-reviewed": 1, "editorial-reviewed": 2 };
for (const state of Object.keys(qualityRank)) assert(allowedQuality.has(state), `quality state missing from contract: ${state}`);

const indexBySlug = new Map(canonicalIndex.map((entry) => [entry.slug, entry]));
const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));
const flagshipSlugs = new Set((flagships.entries || []).map((entry) => entry.slug));
assert(evidenceBySlug.size === canonicalIndex.length, "evidence dataset must cover the canonical corpus before localization is checked");

const canonicalZoneSlugs = zonesEn.map((entry) => entry.slug).sort();
const localizedZoneSlugs = (zonesRu.records || []).map((entry) => entry.slug).sort();
assert(JSON.stringify(canonicalZoneSlugs) === JSON.stringify(localizedZoneSlugs), "Russian zone membership must exactly match canonical zones");
for (const zone of zonesRu.records || []) {
  assert(cyrillic.test(zone.title) || ["ACT", "CBT", "DBT", "НЛП", "ТРИЗ"].includes(zone.title), `zone title is not localized: ${zone.slug}`);
  assert(cyrillic.test(zone.subtitle), `zone subtitle is not localized: ${zone.slug}`);
  assert(zone.title === zone.title.normalize("NFC") && zone.subtitle === zone.subtitle.normalize("NFC"), `zone text is not NFC: ${zone.slug}`);
}

let files = [];
try {
  files = (await readdir(batchRoot)).filter((name) => name.endsWith(".json")).sort();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const localized = new Map();
for (const name of files) {
  const batch = JSON.parse(await readFile(path.join(batchRoot, name), "utf8"));
  assert(batch.locale === "ru" && Array.isArray(batch.records), `invalid batch ${name}`);
  for (const record of batch.records) {
    assert(!flagshipSlugs.has(record.slug), `${record.slug} duplicates the flagship localization source`);
    assert(!localized.has(record.slug), `duplicate localized slug ${record.slug}`);
    const source = indexBySlug.get(record.slug);
    assert(source, `unknown canonical slug ${record.slug}`);
    const expectedSource = { title: source.title, subtitle: source.subtitle || "", description: source.description || "", updatedISO: source.updatedISO || "" };
    for (const [field, value] of Object.entries(expectedSource)) assert(record.source?.[field] === value, `stale source snapshot ${record.slug}.${field}`);
    assert(allowedQuality.has(record.quality_state), `invalid quality state ${record.slug}: ${record.quality_state}`);
    for (const field of ["title", "subtitle", "description"]) {
      assert(typeof record[field] === "string" && record[field].trim(), `${record.slug}.${field} is required`);
      assert(cyrillic.test(record[field]) || /\b(?:AI|QA|ACT|CBT|DBT|NLP|NSDR|HIIT|TRIZ|TED|SWOT|SMART|Pomodoro|Tabata)\b/i.test(record[field]), `${record.slug}.${field} does not look Russian`);
      assert(record[field] === record[field].normalize("NFC"), `${record.slug}.${field} is not NFC`);
      assert(record[field] !== expectedSource[field], `${record.slug}.${field} silently falls back to English`);
    }
    assert(record.description.length >= 45, `${record.slug}.description is too thin for a useful Russian semantic layer`);
    const trust = evidenceBySlug.get(record.slug);
    if (["reviewed", "practical"].includes(trust.status)) {
      assert(qualityRank[record.quality_state] >= qualityRank[config.trusted_minimum_quality], `trusted ${record.slug} needs at least ${config.trusted_minimum_quality} Russian quality`);
    }
    localized.set(record.slug, record);
  }
}

const unionSlugs = new Set([...flagshipSlugs, ...localized.keys()]);
if (config.coverage_mode === "exact") {
  assert(unionSlugs.size === canonicalIndex.length, `exact Russian coverage count mismatch ${unionSlugs.size}/${canonicalIndex.length}`);
  const missing = canonicalIndex.filter((entry) => !unionSlugs.has(entry.slug)).map((entry) => entry.slug);
  assert(missing.length === 0, `exact Russian coverage missing: ${missing.slice(0, 20).join(", ")}`);
}

assert(machine.locale === "ru" && machine.count === unionSlugs.size, "ru/library.json count must match localized source union");
assert(machine.canonical_count === canonicalIndex.length, "ru/library.json canonical count drift");
assert(machine.coverage_mode === config.coverage_mode, "ru/library.json coverage mode drift");
const machineBySlug = new Map(machine.entries.map((entry) => [entry.slug, entry]));
for (const slug of unionSlugs) {
  const item = machineBySlug.get(slug);
  assert(item, `ru/library.json missing ${slug}`);
  assert(item.evidence_status === evidenceBySlug.get(slug)?.status, `machine evidence status drift for ${slug}`);
  assert(allowedQuality.has(item.localization_quality), `machine quality state invalid for ${slug}`);
}

assert(manifest.coverage?.library_entries?.localized === unionSlugs.size, "generated manifest localized library count drift");
assert(manifest.coverage?.library_entries?.canonical === canonicalIndex.length, "generated manifest canonical library count drift");
assert(manifest.coverage?.library_entries?.mode === config.coverage_mode, "generated manifest coverage mode drift");
assert(manifest.coverage?.zones?.localized === zonesEn.length, "all canonical zones must have a Russian collection route");

const routeByPath = new Map(manifest.routes.map((route) => [route.path, route]));
const requiredPaths = ["/ru/life-os/", ...zonesEn.map((zone) => `/ru/life-os/${zone.slug}/`), ...[...unionSlugs].map((slug) => `/ru/life-os/${slug}/`)];
for (const ruPath of requiredPaths) {
  const route = routeByPath.get(ruPath);
  assert(route, `generated manifest missing ${ruPath}`);
  const relative = ruPath.replace(/^\/ru\//, "").replace(/\/$/, "");
  const file = path.join(root, "ru", relative, "index.html");
  const html = await readFile(file, "utf8");
  assert(/<html lang="ru">/i.test(html), `${ruPath} must render lang=ru`);
  assert(html.includes(`<link rel="canonical" href="${route.url}">`), `${ruPath} must self-canonicalize`);
  assert(html.includes(`hreflang="ru" href="${route.url}"`), `${ruPath} missing ru hreflang`);
  assert(html.includes(`hreflang="en" href="${route.canonical_url}"`), `${ruPath} missing en hreflang`);
  assert(html.includes('"inLanguage":"ru"'), `${ruPath} structured data missing inLanguage=ru`);
  assert(!html.includes(">Skip to content<") && !html.includes(">Explore<"), `${ruPath} leaked English shell UI`);
}

for (const slug of unionSlugs) {
  const enPath = `/life-os/${slug}/`;
  const file = path.join(root, "life-os", slug, "index.html");
  const html = await readFile(file, "utf8");
  const ruPath = `/ru/life-os/${slug}/`;
  assert(html.includes(`hreflang="ru" href="${base}${ruPath}"`), `${enPath} missing reciprocal ru hreflang`);
  assert(html.includes(`lang="ru" hreflang="ru" href="${ruPath}">Русский</a>`), `${enPath} missing Russian locale switch`);
}

const sitemap = await readFile(path.join(root, "ru", "sitemap.xml"), "utf8");
for (const ruPath of requiredPaths) assert(sitemap.includes(`<loc>${base}${ruPath}</loc>`), `Russian sitemap missing ${ruPath}`);

const llms = await readFile(path.join(root, "ru", "llms.txt"), "utf8");
assert(llms.includes(`${base}/ru/library.json`), "Russian llms.txt must expose the machine-readable localized library");
if (config.coverage_mode === "exact") {
  assert(llms.includes(`покрывает все ${canonicalIndex.length}`), "exact Russian llms.txt must state exact full-corpus coverage");
  assert(!llms.includes("Остальная библиотека НЕ считается локализованной"), "exact coverage cannot retain the old partial-coverage disclaimer");
}

console.log(`Russian full-corpus quality gate passed: ${unionSlugs.size}/${canonicalIndex.length} entries; ${zonesEn.length} zones; mode=${config.coverage_mode}.`);
