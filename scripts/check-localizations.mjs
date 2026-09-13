import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const fail = (message) => { throw new Error(`[localization] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const [profile, glossary, debt, site, localized, canonical, manifest] = await Promise.all([
  readJson(".arwp/localization.json"),
  readJson("data/localization/glossary.json"),
  readJson("data/localization/quality-debt.json"),
  readJson("data/localization/ru/site.json"),
  readJson("data/localization/ru/flagships.json"),
  readJson("life-os/datasets/flagships.json"),
  readJson("ru/manifest.json"),
]);

assert(profile.version === "0.2", "ARWP localization profile must stay on executable schema version 0.2");
assert(profile.sourceLocale === "en" && profile.defaultLocale === "en", "English must remain the canonical/default locale");
assert(Array.isArray(profile.markets) && profile.markets.length === 0, "Locale must not invent a country/market contract");
const ruProfile = profile.locales.find((entry) => entry.code === "ru");
assert(ruProfile?.role === "human-interface", "ru must be declared as a human-interface locale");
assert(ruProfile?.status === "reviewed-partial", "ru must remain reviewed-partial until declared debt is closed");
assert(ruProfile?.searchPublication === "limited", "partial Russian release must use limited search publication");
assert(profile.fallbackPolicy.includes("no-silent"), "fallback policy must explicitly forbid silent human fallback");

const glossaryRu = glossary.locales?.ru;
assert(glossaryRu?.status === "reviewed-baseline", "Russian glossary must have a reviewed baseline");
const requiredConcepts = [
  "brali.protocol", "brali.evidence", "brali.evidence-state", "brali.reviewed", "brali.practical",
  "brali.pending-review", "brali.restricted", "brali.provenance", "brali.growth-library", "brali.next-move",
  "brali.flagship", "brali.ai-agent", "brali.dataset",
];
const concepts = new Map((glossaryRu.concepts || []).map((entry) => [entry.id, entry]));
for (const id of requiredConcepts) {
  const concept = concepts.get(id);
  assert(concept, `Missing Russian glossary concept ${id}`);
  assert(concept.preferred && concept.preferred !== concept.source, `Glossary concept ${id} needs a real Russian preferred term`);
  assert(concept.preferred === concept.preferred.normalize("NFC"), `Glossary concept ${id} is not NFC-normalized`);
}
assert(new Set(concepts.keys()).size === concepts.size, "Russian glossary concept IDs must be unique");

assert(debt.locale === "ru" && debt.status === "reviewed-partial", "Localization debt ledger must match Russian release state");
assert(debt.items.some((item) => item.id === "ru-long-form-library-expansion"), "Partial long-form coverage must remain explicit debt");
assert(debt.items.some((item) => item.id === "ru-rendered-narrow-layout-review"), "Rendered narrow-layout review debt must stay visible");

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
};
const flagshipSourceShape = (entry) => ({
  life_area: { slug: entry.life_area.slug, title: entry.life_area.title, subtitle: entry.life_area.subtitle },
  slug: entry.slug,
  title: entry.title,
  description: entry.description,
  action: entry.action,
  check_in: entry.check_in,
  evidence_status: entry.evidence_status,
  reviewed_at: entry.reviewed_at,
});
const fingerprint = (entry) => createHash("sha256")
  .update(JSON.stringify(canonicalize(flagshipSourceShape(entry))))
  .digest("hex");

assert(canonical.count === 7 && canonical.entries.length === 7, "Canonical flagship set changed; review Russian scope before release");
assert(localized.coverage?.kind === "exact-flagship-set", "Russian flagship set must declare exact flagship coverage");
assert(localized.entries.length === canonical.entries.length, "Russian flagship count must exactly match canonical flagships");
const canonicalBySlug = new Map(canonical.entries.map((entry) => [entry.slug, entry]));
const localizedSlugs = localized.entries.map((entry) => entry.slug);
assert(new Set(localizedSlugs).size === localizedSlugs.length, "Russian flagship slugs must be unique");
assert(JSON.stringify([...canonicalBySlug.keys()].sort()) === JSON.stringify([...localizedSlugs].sort()), "Russian flagship membership drift");

const cyrillic = /[А-Яа-яЁё]/;
const requiredTextFields = ["title", "description", "action", "check_in", "boundary", "alternative", "evidence_label"];
for (const entry of localized.entries) {
  const source = canonicalBySlug.get(entry.slug);
  assert(entry.sourceFingerprint === fingerprint(source), `Stale source fingerprint for ${entry.slug}`);
  assert(entry.evidence_status === source.evidence_status, `Evidence status changed in translation for ${entry.slug}`);
  assert(entry.reviewed_at === source.reviewed_at, `Review date changed in translation for ${entry.slug}`);
  assert(entry.life_area?.slug === source.life_area.slug, `Life Area identity changed for ${entry.slug}`);
  for (const field of requiredTextFields) {
    assert(typeof entry[field] === "string" && entry[field].trim(), `${entry.slug}.${field} is required`);
    assert(cyrillic.test(entry[field]), `${entry.slug}.${field} does not look localized to Russian`);
    assert(entry[field] === entry[field].normalize("NFC"), `${entry.slug}.${field} is not NFC-normalized`);
  }
  assert(cyrillic.test(entry.life_area.title) && cyrillic.test(entry.life_area.subtitle), `Life Area copy is not localized for ${entry.slug}`);
  assert(cyrillic.test(entry.search?.title || "") && cyrillic.test(entry.search?.description || ""), `Search metadata is not localized for ${entry.slug}`);
  assert(entry.title !== source.title && entry.description !== source.description, `Silent source-language fallback detected for ${entry.slug}`);
}

const expectedRoutes = [
  { ru: "/ru/", en: "/", file: "ru/index.html" },
  { ru: "/ru/life-os/flagships/", en: "/life-os/flagships/", file: "ru/life-os/flagships/index.html" },
  { ru: "/ru/life-os/methodology/", en: "/life-os/methodology/", file: "ru/life-os/methodology/index.html" },
  ...localized.entries.map((entry) => ({
    ru: `/ru/life-os/${entry.slug}/`,
    en: `/life-os/${entry.slug}/`,
    file: `ru/life-os/${entry.slug}/index.html`,
  })),
];
assert(manifest.locale === "ru" && manifest.role === "human-interface" && manifest.status === "reviewed-partial", "Generated locale manifest has the wrong role/state");
assert(manifest.no_silent_fallback === true, "Generated locale manifest must forbid silent fallback");
assert(manifest.coverage?.flagship_protocols?.localized === 7 && manifest.coverage?.flagship_protocols?.canonical === 7, "Generated manifest must expose exact flagship coverage");
assert(manifest.coverage?.long_form_library === "partial", "Generated manifest must not claim full long-form coverage");
assert(manifest.coverage?.rendered_narrow_layout_review === "not-assessed", "Rendered UI limitation must remain explicit until actually reviewed");
assert(manifest.routes.length === expectedRoutes.length, "Generated route manifest count drift");

const englishFile = (enPath) => enPath === "/"
  ? path.join(root, "index.html")
  : path.join(root, enPath.replace(/^\//, "").replace(/\/$/, ""), "index.html");

for (const route of expectedRoutes) {
  const html = await readFile(path.join(root, route.file), "utf8");
  const ruUrl = `${base}${route.ru}`;
  const enUrl = `${base}${route.en}`;
  assert(/<html lang="ru">/.test(html), `${route.ru} must render html lang=ru`);
  assert(html.includes(`<link rel="canonical" href="${ruUrl}">`), `${route.ru} needs a self canonical`);
  assert(html.includes(`hreflang="ru" href="${ruUrl}"`), `${route.ru} needs ru hreflang`);
  assert(html.includes(`hreflang="en" href="${enUrl}"`), `${route.ru} needs en hreflang`);
  assert(html.includes(`hreflang="x-default" href="${enUrl}"`), `${route.ru} needs x-default to canonical English`);
  assert(html.includes('"inLanguage":"ru"'), `${route.ru} structured data must declare Russian`);
  assert(html.includes(site.shell.skip), `${route.ru} skip link must be localized`);
  assert(!html.includes(">Skip to content<"), `${route.ru} leaked English skip-link UI`);
  assert(!html.includes(">Explore<") && !html.includes(">Evidence<"), `${route.ru} leaked English navigation UI`);

  const enHtml = await readFile(englishFile(route.en), "utf8");
  assert(enHtml.includes(`hreflang="ru" href="${ruUrl}"`), `${route.en} must reciprocate Russian hreflang`);
  assert(enHtml.includes(`lang="ru" hreflang="ru" href="${route.ru}">Русский</a>`), `${route.en} must expose the Russian locale switch`);
}

const sitemap = await readFile(path.join(root, "ru", "sitemap.xml"), "utf8");
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(sitemapLocs.length === expectedRoutes.length, "Russian sitemap must contain exactly the declared localized human pages");
for (const route of expectedRoutes) assert(sitemapLocs.includes(`${base}${route.ru}`), `Russian sitemap missing ${route.ru}`);

const robots = await readFile(path.join(root, "robots.txt"), "utf8");
assert(robots.includes(`Sitemap: ${base}/ru/sitemap.xml`), "robots.txt must advertise the Russian sitemap");

const llms = await readFile(path.join(root, "ru", "llms.txt"), "utf8");
for (const token of ["Locale: ru", "Role: human-interface", "Status: reviewed-partial", "Canonical locale: en", "No silent fallback: true"]) {
  assert(llms.includes(token), `Russian llms.txt missing token: ${token}`);
}
assert(llms.includes("Остальная библиотека НЕ считается локализованной"), "Russian llms.txt must state the coverage boundary plainly");

const baseRef = process.env.LOCALIZATION_BASE_REF;
if (baseRef) {
  let changed = [];
  try {
    changed = execFileSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], { encoding: "utf8" })
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    fail(`Could not evaluate localization impact against ${baseRef}: ${error.message}`);
  }
  const hasSignal = (paths) => paths.some((candidate) => changed.includes(candidate));
  const rules = [
    {
      watched: ["index.html", "homepage.js"],
      signals: ["data/localization/ru/site.json", ".arwp/localization.json", "data/localization/quality-debt.json"],
      label: "core Russian UI",
    },
    {
      watched: ["life-os/datasets/flagships.json", "scripts/build-flagship-collection.mjs", "scripts/build-protocol-feed.mjs"],
      signals: ["data/localization/ru/flagships.json", "data/localization/quality-debt.json"],
      label: "Russian flagship content",
    },
    {
      watched: ["scripts/build-content-methodology.mjs"],
      signals: ["data/localization/ru/site.json", "data/localization/quality-debt.json"],
      label: "Russian methodology",
    },
  ];
  for (const rule of rules) {
    if (hasSignal(rule.watched) && !hasSignal(rule.signals)) {
      fail(`Localization-impact gate: canonical change affects ${rule.label} but the PR has no Russian update signal or debt update`);
    }
  }
}

console.log(`Russian localization checks passed: ${expectedRoutes.length} human pages, 7/7 flagships, explicit partial coverage.`);
