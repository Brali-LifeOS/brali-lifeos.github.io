import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  invariant,
  validateExactCoverage,
  validateLanguageRecords,
  validateLocalizedHtml,
  validateMachineEvidence,
  validateRouteGraph,
  validateSourceSnapshots,
} from "./lib/locale-quality.mjs";
import { loadRussianLocalizationAuthoringIndex, localizationSourceSnapshot } from "./lib/ru-localization-source.mjs";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));

const [contract, readiness, profile, languageProfile, config, canonical, authoring, flagships, evidence, manifest, machine, debt] = await Promise.all([
  readJson("data/localization/locale-contract.json"),
  readJson("data/localization/ru/readiness.json"),
  readJson(".arwp/localization.json"),
  readJson("data/localization/ru/language-quality.json"),
  readJson("data/localization/ru/library-manifest.json"),
  readJson("data/life-os-content/index.json"),
  loadRussianLocalizationAuthoringIndex(root),
  readJson("data/localization/ru/flagships.json"),
  readJson("life-os/datasets/evidence.json"),
  readJson("ru/manifest.json"),
  readJson("ru/library.json"),
  readJson("data/localization/quality-debt.json"),
]);

invariant(contract.schema_version === 1 && contract.canonical_locale === "en", "locale contract identity drift");
invariant(contract.reference_locale === "ru", "Russian locale must remain the first reference implementation until another locale passes the same contract");
const dimensionKeys = Object.keys(contract.maturity_dimensions || {});
invariant(JSON.stringify(dimensionKeys) === JSON.stringify(["A", "B", "C", "D", "E", "F", "G", "H", "I"]), "locale contract must define maturity dimensions A-I");
invariant(readiness.contract_version === contract.schema_version && readiness.locale === "ru", "Russian readiness record does not implement current locale contract");
invariant(readiness.core_release_state === "reference-core-complete", "Russian reference core must have an explicit release state independent from whole-site fallback debt");
for (const key of dimensionKeys) {
  invariant(readiness.dimensions?.[key]?.id === contract.maturity_dimensions[key].id, `Russian readiness dimension ${key} drift`);
  invariant(Boolean(readiness.dimensions?.[key]?.state), `Russian readiness dimension ${key} needs an explicit state`);
}

const ruProfile = (profile.locales || []).find((entry) => entry.code === "ru");
invariant(ruProfile?.role === "human-interface", "Russian profile role drift");
invariant(profile.fallbackPolicy?.includes("no-silent"), "human fallback must remain explicit");
const librarySurface = (profile.surfaces || []).find((surface) => surface.id === "library-content");
invariant(librarySurface?.membership === "exact", "reference locale profile must declare exact library membership");
invariant((librarySurface?.checks || []).includes("effective-corpus-parity"), "reference locale profile must gate effective-corpus parity");
const additionsImpact = (profile.impactRules || []).some((rule) =>
  (rule.paths || []).includes("data/life-os-content-additions.json") && (rule.surfaces || []).includes("library-content")
);
invariant(additionsImpact, "build-time content additions must trigger the library localization surface");
invariant(config.coverage_mode === "exact" && config.target === "exact-canonical-public-corpus", "reference locale must measure exact effective-corpus coverage");
invariant(config.minimum_public_quality === "language-reviewed", "reference locale cannot claim completion with draft public copy");

const batchDir = path.join(root, "data", "localization", "ru", "library");
const batchFiles = (await readdir(batchDir)).filter((name) => name.endsWith(".json")).sort();
const records = [];
for (const name of batchFiles) {
  const batch = JSON.parse(await readFile(path.join(batchDir, name), "utf8"));
  invariant(batch.locale === "ru", `wrong locale in ${name}`);
  records.push(...(batch.records || []));
}
const localizedRecords = [...(flagships.entries || []).map((entry) => ({ slug: entry.slug })), ...records];
validateExactCoverage(canonical.map((entry) => entry.slug), localizedRecords);
validateLanguageRecords(records, languageProfile);
const authoringBySlug = new Map(authoring.map((entry) => [entry.slug, entry]));
validateSourceSnapshots(authoringBySlug, records, localizationSourceSnapshot);

const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));
invariant(evidenceBySlug.size === canonical.length, "evidence coverage must match effective canonical corpus");
validateMachineEvidence(evidenceBySlug, machine.entries || [], { requireEligibility: true });
invariant(machine.count === canonical.length && machine.canonical_count === canonical.length, "machine library count must match effective canonical corpus");
invariant(machine.canonical_locale === "en" && machine.locale_contract_version === contract.schema_version, "machine library lacks canonical locale/contract identity");
invariant(machine.fallback_behavior?.human === "explicit-no-silent-fallback", "machine library must state human fallback semantics");
invariant(Array.isArray(machine.recommendation_policy?.eligible_statuses), "machine library must state recommendation policy");

const sitemap = await readFile(path.join(root, "ru", "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
validateRouteGraph(manifest.routes || [], sitemapUrls, base);
invariant(manifest.coverage?.library_entries?.localized === canonical.length, "manifest localized coverage count drift");
invariant(manifest.coverage?.library_entries?.canonical === canonical.length, "manifest canonical coverage count drift");

const generatedTitles = new Map();
for (const route of manifest.routes || []) {
  invariant(route.locale === "ru", `manifest route locale drift: ${route.path}`);
  invariant(route.canonical_path && route.canonical_url, `manifest route lacks canonical identity: ${route.path}`);
  const relative = route.path.replace(/^\//, "").replace(/\/$/, "");
  const file = path.join(root, relative, "index.html");
  const html = await readFile(file, "utf8");
  validateLocalizedHtml(html, route, base);
  invariant(!/>Skip to content</i.test(html) && !/>Explore</i.test(html) && !/>Evidence</i.test(html), `English shell leakage: ${route.path}`);
  invariant(!/aria-label="Main navigation"/i.test(html), `English accessible-name leakage: ${route.path}`);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1]?.trim();
  invariant(title && /[А-Яа-яЁё]/.test(title), `Russian SEO title missing/English-only: ${route.path}`);
  invariant(description && /[А-Яа-яЁё]/.test(description), `Russian meta description missing/English-only: ${route.path}`);
  const titleKey = title.normalize("NFC").toLocaleLowerCase("ru");
  const previous = generatedTitles.get(titleKey);
  invariant(!previous || previous === route.path, `generated Russian title collision: ${previous} and ${route.path}`);
  generatedTitles.set(titleKey, route.path);
}

const completedDebt = new Set((debt.items || []).filter((item) => item.state === "closed-verified").map((item) => item.id));
invariant(completedDebt.has("ru-long-form-library-expansion"), "completed exact-corpus localization must not remain active debt");
invariant(completedDebt.has("ru-primary-product-hubs"), "live-verified primary hubs must not remain active debt");
invariant((debt.items || []).some((item) => item.id === "ru-rendered-narrow-layout-review" && item.state === "requires-rendered-review"), "non-automatable rendered narrow-layout review must remain explicit");

const analyticsSource = await readFile(path.join(root, "scripts", "inject-consent-analytics.mjs"), "utf8");
invariant(/ignored\s*=\s*new Set\(\[[^\]]*"data"/s.test(analyticsSource), "analytics injector must exclude localization/source data trees from deployable-HTML transformations");

console.log(`Mature locale readiness passed for ru: ${canonical.length}/${canonical.length} effective records; ${manifest.routes.length} human routes; ${dimensionKeys.length}/9 maturity dimensions explicitly governed.`);
