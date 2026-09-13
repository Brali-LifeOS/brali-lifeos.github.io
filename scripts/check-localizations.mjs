import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const fail = (message) => { throw new Error(`[localization] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const [profile, glossary, debt, site, localized, canonical, manifest, libraryConfig] = await Promise.all([
  readJson(".arwp/localization.json"),
  readJson("data/localization/glossary.json"),
  readJson("data/localization/quality-debt.json"),
  readJson("data/localization/ru/site.json"),
  readJson("data/localization/ru/flagships.json"),
  readJson("life-os/datasets/flagships.json"),
  readJson("ru/manifest.json"),
  readJson("data/localization/ru/library-manifest.json"),
]);

assert(profile.version === "0.2", "ARWP localization profile must stay on executable schema version 0.2");
assert(profile.sourceLocale === "en" && profile.defaultLocale === "en", "English must remain canonical/default");
assert(Array.isArray(profile.markets) && profile.markets.length === 0, "Russian locale must not imply a country/market contract");
const ruProfile = profile.locales.find((entry) => entry.code === "ru");
assert(ruProfile?.role === "human-interface", "ru must be a human-interface locale");
assert(["reviewed-partial", "published"].includes(ruProfile?.status), "ru status must be an explicit governed release state");
assert(profile.fallbackPolicy.includes("no-silent"), "fallback policy must forbid silent human fallback");

const glossaryRu = glossary.locales?.ru;
assert(glossaryRu?.status === "reviewed-baseline", "Russian glossary must have a reviewed baseline");
const requiredConcepts = ["brali.protocol", "brali.evidence", "brali.evidence-state", "brali.reviewed", "brali.practical", "brali.pending-review", "brali.restricted", "brali.provenance", "brali.growth-library", "brali.next-move", "brali.flagship", "brali.ai-agent", "brali.dataset"];
const concepts = new Map((glossaryRu.concepts || []).map((entry) => [entry.id, entry]));
for (const id of requiredConcepts) {
  const concept = concepts.get(id);
  assert(concept?.preferred && concept.preferred !== concept.source, `Russian glossary concept ${id} needs a real preferred term`);
  assert(concept.preferred === concept.preferred.normalize("NFC"), `Russian glossary concept ${id} is not NFC`);
}

assert(debt.locale === "ru", "localization debt ledger must remain Russian");
assert(debt.items.some((item) => item.id === "ru-rendered-narrow-layout-review"), "rendered narrow-layout debt must remain explicit until observed");
assert(libraryConfig.issue === 210, "full-corpus expansion must stay linked to issue #210");

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => { result[key] = canonicalize(value[key]); return result; }, {});
};
const sourceShape = (entry) => ({
  life_area: { slug: entry.life_area.slug, title: entry.life_area.title, subtitle: entry.life_area.subtitle },
  slug: entry.slug,
  title: entry.title,
  description: entry.description,
  action: entry.action,
  check_in: entry.check_in,
  evidence_status: entry.evidence_status,
  reviewed_at: entry.reviewed_at,
});
const fingerprint = (entry) => createHash("sha256").update(JSON.stringify(canonicalize(sourceShape(entry)))).digest("hex");

assert(canonical.entries.length === 7 && localized.entries.length === 7, "Russian curated flagship set must remain exact 7/7");
const canonicalBySlug = new Map(canonical.entries.map((entry) => [entry.slug, entry]));
const localizedSlugs = localized.entries.map((entry) => entry.slug);
assert(JSON.stringify([...canonicalBySlug.keys()].sort()) === JSON.stringify([...localizedSlugs].sort()), "Russian flagship membership drift");
const cyrillic = /[А-Яа-яЁё]/;
for (const entry of localized.entries) {
  const source = canonicalBySlug.get(entry.slug);
  assert(entry.sourceFingerprint === fingerprint(source), `stale flagship source fingerprint for ${entry.slug}`);
  assert(entry.evidence_status === source.evidence_status, `flagship evidence state drift for ${entry.slug}`);
  assert(entry.reviewed_at === source.reviewed_at, `flagship review date drift for ${entry.slug}`);
  for (const field of ["title", "description", "action", "check_in", "boundary", "alternative", "evidence_label"]) {
    assert(typeof entry[field] === "string" && cyrillic.test(entry[field]), `${entry.slug}.${field} must be real Russian copy`);
    assert(entry[field] === entry[field].normalize("NFC"), `${entry.slug}.${field} is not NFC`);
  }
}

const baseRoutes = [
  { ru: "/ru/", en: "/", file: "ru/index.html" },
  { ru: "/ru/life-os/flagships/", en: "/life-os/flagships/", file: "ru/life-os/flagships/index.html" },
  { ru: "/ru/life-os/methodology/", en: "/life-os/methodology/", file: "ru/life-os/methodology/index.html" },
  ...localized.entries.map((entry) => ({ ru: `/ru/life-os/${entry.slug}/`, en: `/life-os/${entry.slug}/`, file: `ru/life-os/${entry.slug}/index.html` })),
];
const manifestByPath = new Map(manifest.routes.map((route) => [route.path, route]));
assert(manifest.locale === "ru" && manifest.role === "human-interface" && manifest.no_silent_fallback === true, "generated Russian manifest role/fallback contract drift");
assert(manifest.coverage?.flagship_protocols?.localized === 7 && manifest.coverage?.flagship_protocols?.canonical === 7, "generated manifest must retain exact 7/7 flagship coverage");
for (const route of baseRoutes) {
  const declared = manifestByPath.get(route.ru);
  assert(declared, `generated manifest missing base localized route ${route.ru}`);
  const html = await readFile(path.join(root, route.file), "utf8");
  assert(/<html lang="ru">/.test(html), `${route.ru} must render lang=ru`);
  assert(html.includes(`<link rel="canonical" href="${base}${route.ru}">`), `${route.ru} needs self canonical`);
  assert(html.includes(`hreflang="en" href="${base}${route.en}"`), `${route.ru} needs English hreflang`);
  assert(html.includes('"inLanguage":"ru"'), `${route.ru} structured data must declare Russian`);
  assert(html.includes(site.shell.skip) && !html.includes(">Skip to content<"), `${route.ru} must keep the Russian shell`);
}

const sitemap = await readFile(path.join(root, "ru", "sitemap.xml"), "utf8");
for (const route of baseRoutes) assert(sitemap.includes(`<loc>${base}${route.ru}</loc>`), `Russian sitemap missing base route ${route.ru}`);
const robots = await readFile(path.join(root, "robots.txt"), "utf8");
assert(robots.includes(`Sitemap: ${base}/ru/sitemap.xml`), "robots.txt must advertise Russian sitemap");
const llms = await readFile(path.join(root, "ru", "llms.txt"), "utf8");
for (const token of ["Locale: ru", "Role: human-interface", "Canonical locale: en", "No silent fallback: true"]) assert(llms.includes(token), `Russian llms.txt missing ${token}`);
if (libraryConfig.coverage_mode === "batched") assert(llms.includes("расширяется проверенными пакетами"), "batched coverage must be explicit in Russian llms.txt");

const baseRef = process.env.LOCALIZATION_BASE_REF;
if (baseRef) {
  let changed = [];
  try {
    changed = execFileSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], { encoding: "utf8" }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    fail(`could not evaluate localization impact against ${baseRef}: ${error.message}`);
  }
  const has = (values) => values.some((candidate) => changed.includes(candidate) || changed.some((name) => candidate.endsWith("/**") && name.startsWith(candidate.slice(0, -3))));
  if (has(["index.html", "homepage.js"]) && !has(["data/localization/ru/site.json", "data/localization/quality-debt.json"])) fail("core UI changed without a Russian localization/debt signal");
  if (has(["life-os/datasets/flagships.json", "scripts/build-flagship-collection.mjs"]) && !has(["data/localization/ru/flagships.json", "data/localization/quality-debt.json"])) fail("flagship source changed without a Russian localization/debt signal");
  if (has(["data/life-os-content/index.json", "data/life-os-zones.json"]) && !has(["data/localization/ru/library/**", "data/localization/ru/zones.json", "data/localization/quality-debt.json"])) fail("canonical library changed without a Russian full-corpus update signal");
}

console.log(`Russian localization base checks passed: 7/7 curated flagships; ${manifest.routes.length} declared RU routes; full-corpus mode=${libraryConfig.coverage_mode}.`);
