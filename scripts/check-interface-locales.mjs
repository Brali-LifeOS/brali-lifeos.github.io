import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from "./lib/localization-source.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const profile = await readJson(".arwp/localization.json");
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && entry.generator === "generic-v1");
const fail = (locale, message) => { throw new Error(`[${locale}-localization] ${message}`); };
const assert = (locale, condition, message) => { if (!condition) fail(locale, message); };

const canonicalIndex = await readJson("data/life-os-content/index.json");
const authoringIndex = await loadLocalizationAuthoringIndex(root);
const evidence = await readJson("life-os/datasets/evidence.json");
const canonicalZones = await readJson("data/life-os-zones.json");
const canonicalBySlug = new Map(canonicalIndex.map((entry) => [entry.slug, entry]));
const authoringBySlug = new Map(authoringIndex.map((entry) => [entry.slug, entry]));
const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));
const qualityRank = { "localized-draft": 0, "language-reviewed": 1, "editorial-reviewed": 2 };

for (const localeEntry of locales) {
  const locale = localeEntry.code;
  const sourceRoot = `data/localization/${locale}`;
  const [config, site, zones, flagships, primary, manifest, machine] = await Promise.all([
    readJson(`${sourceRoot}/library-manifest.json`),
    readJson(`${sourceRoot}/site.json`),
    readJson(`${sourceRoot}/zones.json`),
    readJson(`${sourceRoot}/flagships.json`),
    readJson(`${sourceRoot}/primary-pages.json`),
    readJson(`${locale}/manifest.json`),
    readJson(`${locale}/library.json`),
  ]);
  assert(locale, config.locale === locale && site.locale === locale && zones.locale === locale && flagships.locale === locale && primary.locale === locale, "source locale declarations disagree");
  assert(locale, ["batched", "exact"].includes(config.coverage_mode), "coverage_mode must be batched or exact");
  const allowedQuality = new Set(config.quality_states || []);
  for (const state of Object.keys(qualityRank)) assert(locale, allowedQuality.has(state), `quality state missing: ${state}`);

  const zoneSlugs = canonicalZones.map((entry) => entry.slug).sort();
  const localizedZoneSlugs = (zones.records || []).map((entry) => entry.slug).sort();
  assert(locale, JSON.stringify(zoneSlugs) === JSON.stringify(localizedZoneSlugs), "Growth Zone membership must be exact");
  for (const zone of zones.records || []) {
    assert(locale, typeof zone.title === "string" && zone.title.trim(), `zone title missing: ${zone.slug}`);
    assert(locale, typeof zone.subtitle === "string" && zone.subtitle.trim(), `zone subtitle missing: ${zone.slug}`);
    assert(locale, zone.title === zone.title.normalize("NFC") && zone.subtitle === zone.subtitle.normalize("NFC"), `zone text not NFC: ${zone.slug}`);
  }

  const flagshipSlugs = new Set((flagships.entries || []).map((entry) => entry.slug));
  assert(locale, flagshipSlugs.size === 7, "curated flagship set must contain seven entries");
  const localized = new Map();
  for (const entry of flagships.entries || []) {
    const source = canonicalBySlug.get(entry.slug);
    assert(locale, source, `flagship not present in canonical corpus: ${entry.slug}`);
    localized.set(entry.slug, {
      slug: entry.slug,
      title: entry.title,
      subtitle: entry.life_area?.subtitle || entry.description,
      description: entry.description,
      quality_state: "editorial-reviewed",
      zone_slug: source.zone.slug,
    });
  }

  let files = [];
  try {
    files = (await readdir(path.join(root, sourceRoot, "library"))).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const name of files) {
    const batch = JSON.parse(await readFile(path.join(root, sourceRoot, "library", name), "utf8"));
    assert(locale, batch.locale === locale && Array.isArray(batch.records), `invalid batch ${name}`);
    for (const record of batch.records) {
      assert(locale, !localized.has(record.slug), `duplicate localized slug ${record.slug}`);
      const source = canonicalBySlug.get(record.slug);
      assert(locale, source, `unknown canonical slug ${record.slug}`);
      const expected = localizationSourceSnapshot(authoringBySlug.get(record.slug) || source);
      for (const [field, value] of Object.entries(expected)) assert(locale, record.source?.[field] === value, `stale source snapshot ${record.slug}.${field}`);
      assert(locale, allowedQuality.has(record.quality_state), `invalid quality state ${record.slug}: ${record.quality_state}`);
      const localizedRecord = record.localized && typeof record.localized === "object"
        ? { ...record, ...record.localized }
        : record;
      for (const field of ["title", "subtitle", "description"]) {
        assert(locale, typeof localizedRecord[field] === "string" && localizedRecord[field].trim(), `${record.slug}.${field} is required`);
        assert(locale, localizedRecord[field] === localizedRecord[field].normalize("NFC"), `${record.slug}.${field} is not NFC`);
        assert(locale, localizedRecord[field] !== expected[field], `${record.slug}.${field} silently falls back to English`);
      }
      assert(locale, localizedRecord.description.length >= 45, `${record.slug}.description is too thin for a useful semantic layer`);
      const trust = evidenceBySlug.get(record.slug);
      assert(locale, trust, `evidence entry missing ${record.slug}`);
      if (["reviewed", "practical"].includes(trust.status)) {
        assert(locale, qualityRank[record.quality_state] >= qualityRank[config.trusted_minimum_quality], `trusted ${record.slug} needs at least ${config.trusted_minimum_quality}`);
      }
      localized.set(record.slug, { ...localizedRecord, zone_slug: source.zone.slug });
    }
  }

  if (config.coverage_mode === "exact") {
    assert(locale, localized.size === canonicalIndex.length, `exact coverage count mismatch ${localized.size}/${canonicalIndex.length}`);
    const missing = canonicalIndex.filter((entry) => !localized.has(entry.slug)).map((entry) => entry.slug);
    assert(locale, missing.length === 0, `exact coverage missing: ${missing.slice(0, 20).join(", ")}`);
  }

  assert(locale, machine.locale === locale && machine.count === localized.size, `${locale}/library.json count drift`);
  assert(locale, machine.canonical_count === canonicalIndex.length, `${locale}/library.json canonical count drift`);
  assert(locale, machine.coverage_mode === config.coverage_mode, `${locale}/library.json coverage mode drift`);
  const machineBySlug = new Map((machine.entries || []).map((entry) => [entry.slug, entry]));
  for (const [slug, item] of localized) {
    const machineItem = machineBySlug.get(slug);
    assert(locale, machineItem, `${locale}/library.json missing ${slug}`);
    assert(locale, machineItem.evidence_status === evidenceBySlug.get(slug)?.status, `machine evidence status drift ${slug}`);
    assert(locale, machineItem.localization_quality === item.quality_state, `machine localization quality drift ${slug}`);
  }

  assert(locale, manifest.locale === locale && manifest.language_tag === localeEntry.languageTag, "generated manifest locale drift");
  assert(locale, manifest.coverage?.library_entries?.localized === localized.size, "manifest localized library count drift");
  assert(locale, manifest.coverage?.library_entries?.canonical === canonicalIndex.length, "manifest canonical library count drift");
  assert(locale, manifest.coverage?.library_entries?.mode === config.coverage_mode, "manifest coverage mode drift");
  assert(locale, manifest.coverage?.zones?.localized === canonicalZones.length, "all Growth Zones must be localized");
  assert(locale, manifest.coverage?.primary_pages?.localized === (primary.pages || []).length, "primary hub count drift");

  const routeByPath = new Map((manifest.routes || []).map((route) => [route.path, route]));
  const requiredPaths = [
    `/${locale}/`,
    `/${locale}/life-os/`,
    `/${locale}/life-os/flagships/`,
    `/${locale}/life-os/methodology/`,
    ...(zones.records || []).map((zone) => `/${locale}/life-os/${zone.slug}/`),
    ...[...localized.keys()].map((slug) => `/${locale}/life-os/${slug}/`),
    ...(primary.pages || []).map((page) => page.route),
  ];
  for (const localizedPath of requiredPaths) {
    const route = routeByPath.get(localizedPath);
    assert(locale, route, `generated manifest missing ${localizedPath}`);
    const relative = localizedPath === `/${locale}/` ? "" : localizedPath.replace(new RegExp(`^/${locale}/`), "").replace(/\/$/, "");
    const file = path.join(root, locale, relative, "index.html");
    const html = await readFile(file, "utf8");
    assert(locale, new RegExp(`<html lang="${localeEntry.languageTag}">`, "i").test(html), `${localizedPath} must render lang=${localeEntry.languageTag}`);
    assert(locale, html.includes(`<link rel="canonical" href="${route.url}">`), `${localizedPath} must self-canonicalize`);
    assert(locale, html.includes(`hreflang="${localeEntry.languageTag}" href="${route.url}"`), `${localizedPath} missing self hreflang`);
    assert(locale, html.includes(`hreflang="en" href="${route.canonical_url}"`), `${localizedPath} missing English hreflang`);
    assert(locale, html.includes(`"inLanguage":"${localeEntry.languageTag}"`), `${localizedPath} structured data language drift`);
    assert(locale, !html.includes(">Skip to content<") && !html.includes(">Explore<") && !html.includes(">Read more<"), `${localizedPath} leaked English shell UI`);
  }

  for (const route of manifest.routes || []) {
    const canonicalPath = route.canonical_path;
    const file = canonicalPath === "/" ? path.join(root, "index.html") : path.join(root, canonicalPath.replace(/^\//, "").replace(/\/$/, ""), "index.html");
    const html = await readFile(file, "utf8");
    assert(locale, html.includes(`hreflang="${localeEntry.languageTag}" href="${route.url}"`), `${canonicalPath} missing reciprocal ${locale} hreflang`);
    assert(locale, html.includes(`lang="${localeEntry.languageTag}" hreflang="${localeEntry.languageTag}" href="${route.path}">${localeEntry.label}</a>`), `${canonicalPath} missing ${localeEntry.label} locale switch`);
  }

  for (const page of primary.pages || []) {
    const source = await readFile(path.join(root, page.source_path), "utf8");
    for (const marker of page.source_markers || []) assert(locale, source.includes(marker), `primary source drift ${page.id}: ${marker}`);
  }

  const sitemap = await readFile(path.join(root, locale, "sitemap.xml"), "utf8");
  for (const localizedPath of requiredPaths) assert(locale, sitemap.includes(`<loc>${base}${localizedPath}</loc>`), `sitemap missing ${localizedPath}`);
  const llms = await readFile(path.join(root, locale, "llms.txt"), "utf8");
  assert(locale, llms.includes(`Locale: ${locale}`) && llms.includes("Canonical locale: en") && llms.includes("No silent fallback: true"), "llms.txt locale contract missing");
  assert(locale, llms.includes(`${base}/${locale}/library.json`), "llms.txt must expose localized library.json");
  if (config.coverage_mode === "exact") assert(locale, llms.includes(`alle ${canonicalIndex.length} kanonischen`), "exact llms.txt must declare full coverage");

  console.log(`${localeEntry.label} localization gate passed: ${localized.size}/${canonicalIndex.length} entries; ${canonicalZones.length} zones; mode=${config.coverage_mode}.`);
}
