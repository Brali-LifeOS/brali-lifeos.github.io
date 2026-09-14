import {
  validateExactCoverage,
  validateLanguageRecords,
  validateLocalizedHtml,
  validateMachineEvidence,
  validateRouteGraph,
  validateSourceSnapshots,
} from "./lib/locale-quality.mjs";

function mustFail(name, fn, expected) {
  let failed = false;
  try {
    fn();
  } catch (error) {
    failed = true;
    if (!String(error.message).includes(expected)) throw new Error(`${name} failed for the wrong reason: ${error.message}`);
  }
  if (!failed) throw new Error(`${name} did not trip the quality gate`);
  console.log(`FAULT_OK ${name}`);
}

const canonical = ["alpha", "beta"];
const goodLocalized = [
  { slug: "alpha", title: "Первый шаг", subtitle: "Короткая проверка", description: "Достаточно длинное русское описание для проверки локализованного текста.", source: { title: "Alpha", subtitle: "A", description: "Alpha desc", updatedISO: "2026-09-01" } },
  { slug: "beta", title: "Второй шаг", subtitle: "Ещё одна проверка", description: "Ещё одно достаточно длинное русское описание для проверки локализованного текста.", source: { title: "Beta", subtitle: "B", description: "Beta desc", updatedISO: "2026-09-01" } },
];
const languageProfile = { locale: "ru", required_fields: ["title", "subtitle", "description"], discouraged_fragments: ["паттерн", "follow-up"], exceptions: [] };
const snapshot = (entry) => ({ title: entry.title, subtitle: entry.subtitle, description: entry.description, updatedISO: entry.updatedISO });
const canonicalBySlug = new Map([
  ["alpha", { slug: "alpha", title: "Alpha", subtitle: "A", description: "Alpha desc", updatedISO: "2026-09-01" }],
  ["beta", { slug: "beta", title: "Beta", subtitle: "B", description: "Beta desc", updatedISO: "2026-09-01" }],
]);

validateExactCoverage(canonical, goodLocalized);
validateLanguageRecords(goodLocalized, languageProfile);
validateSourceSnapshots(canonicalBySlug, goodLocalized, snapshot);

mustFail("missing-localized-slug", () => validateExactCoverage(canonical, [goodLocalized[0]]), "missing localized stable IDs");
mustFail("duplicate-localized-slug", () => validateExactCoverage(canonical, [goodLocalized[0], goodLocalized[0], goodLocalized[1]]), "duplicate localized stable ID");
mustFail("phantom-localized-slug", () => validateExactCoverage(canonical, [...goodLocalized, { ...goodLocalized[0], slug: "ghost" }]), "phantom/obsolete");
mustFail("build-time-addition-without-localization", () => validateExactCoverage([...canonical, "dynamic-gamma"], goodLocalized), "dynamic-gamma");
mustFail("english-only-title", () => validateLanguageRecords([{ ...goodLocalized[0], title: "English only" }], languageProfile), "lacks Russian copy");
mustFail("discouraged-calque", () => validateLanguageRecords([{ ...goodLocalized[0], description: "Этот паттерн выглядит как калька и должен быть пойман проверкой." }], languageProfile), "discouraged fragment");
mustFail("stale-source-snapshot", () => validateSourceSnapshots(canonicalBySlug, [{ ...goodLocalized[0], source: { ...goodLocalized[0].source, title: "Old Alpha" } }], snapshot), "stale source snapshot");

const evidence = new Map([["alpha", { status: "reviewed", sensitive: false }]]);
const goodMachine = [{ slug: "alpha", evidence_status: "reviewed", sensitive: false, recommendation_eligible: true, fallback_to_canonical_required: false }];
validateMachineEvidence(evidence, goodMachine, { requireEligibility: true });
mustFail("wrong-evidence-status", () => validateMachineEvidence(evidence, [{ ...goodMachine[0], evidence_status: "practical" }], { requireEligibility: true }), "evidence status drift");
mustFail("wrong-recommendation-eligibility", () => validateMachineEvidence(evidence, [{ ...goodMachine[0], recommendation_eligible: false }], { requireEligibility: true }), "recommendation eligibility drift");

const route = { path: "/ru/demo/", url: "https://brali-lifeos.github.io/ru/demo/", canonical_path: "/demo/", canonical_url: "https://brali-lifeos.github.io/demo/" };
const goodHtml = '<html lang="ru"><head><link rel="canonical" href="https://brali-lifeos.github.io/ru/demo/"><link rel="alternate" hreflang="ru" href="https://brali-lifeos.github.io/ru/demo/"><link rel="alternate" hreflang="en" href="https://brali-lifeos.github.io/demo/"><link rel="alternate" hreflang="x-default" href="https://brali-lifeos.github.io/demo/"><script type="application/ld+json">{"inLanguage":"ru"}</script></head></html>';
validateLocalizedHtml(goodHtml, route);
validateRouteGraph([route], [route.url]);
mustFail("wrong-canonical", () => validateLocalizedHtml(goodHtml.replace('/ru/demo/">', '/ru/wrong/">'), route), "wrong self canonical");
mustFail("wrong-hreflang", () => validateLocalizedHtml(goodHtml.replace('hreflang="en"', 'hreflang="de"'), route), "canonical-locale hreflang");
mustFail("missing-sitemap-route", () => validateRouteGraph([route], []), "sitemap missing manifest URL");

console.log("Localization fault injection passed: representative false-green states were rejected for the intended reason.");
