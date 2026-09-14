import { expectLocalizationFailure, validateLocalizedRecordSet } from "./lib/localization-contract.mjs";
import { scanRussianText } from "./lib/ru-language-audit.mjs";

const canonical = [
  { slug: "alpha", title: "Alpha", subtitle: "A", description: "Canonical alpha", updatedISO: "2026-09-14T00:00:00.000Z" },
  { slug: "beta", title: "Beta", subtitle: "B", description: "Canonical beta", updatedISO: "2026-09-14T00:00:00.000Z" },
];
const snapshot = (record) => ({
  title: record.title,
  subtitle: record.subtitle,
  description: record.description,
  updatedISO: record.updatedISO,
});
const localized = canonical.map((record, index) => ({
  slug: record.slug,
  source: snapshot(record),
  title: index === 0 ? "Альфа" : "Бета",
  subtitle: index === 0 ? "Первый пример" : "Второй пример",
  description: index === 0 ? "Русское описание первого примера." : "Русское описание второго примера.",
  quality_state: "language-reviewed",
  _authority: "canonical",
}));
const allowedQualityStates = new Set(["localized-draft", "language-reviewed", "editorial-reviewed"]);
const languageCheck = (record) => {
  const problems = [];
  for (const field of ["title", "subtitle", "description"]) {
    const result = scanRussianText(record[field], { location: `${record.slug}.${field}`, allowlist: [] });
    problems.push(...result.blocking, ...result.review);
  }
  return problems;
};
const validate = (records, overrides = {}) => validateLocalizedRecordSet({
  locale: "ru",
  canonicalRecords: overrides.canonicalRecords || canonical,
  localizedRecords: records,
  allowedQualityStates,
  requiredTextFields: ["title", "subtitle", "description"],
  sourceSnapshot: snapshot,
  isAuthoritative: (record) => record._authority === "canonical",
  languageCheck,
  exact: true,
});

validate(structuredClone(localized));

const faults = [
  ["missing RU slug", () => validate(structuredClone(localized).slice(0, 1)), /coverage missing/],
  ["empty title", () => { const records = structuredClone(localized); records[0].title = ""; validate(records); }, /title is required/],
  ["duplicate slug", () => { const records = structuredClone(localized); records.push(structuredClone(records[0])); validate(records); }, /duplicate localized slug/],
  ["invalid quality value", () => { const records = structuredClone(localized); records[0].quality_state = "green-because-ci"; validate(records); }, /invalid quality state/],
  ["non-authoritative record", () => { const records = structuredClone(localized); records[0]._authority = "secondary"; validate(records); }, /non-authoritative/],
  ["unknown source ID", () => { const records = structuredClone(localized); records[0].slug = "unknown-source"; validate(records); }, /unknown canonical slug/],
  ["null required field", () => { const records = structuredClone(localized); records[0].description = null; validate(records); }, /description is required/],
  ["source mismatch", () => { const records = structuredClone(localized); records[0].source.title = "Wrong source"; validate(records); }, /source mismatch/],
  ["English leakage", () => { const records = structuredClone(localized); records[0].description = "Сделайте follow-up после разговора."; validate(records); }, /language check/],
];

for (const [label, fn, pattern] of faults) expectLocalizationFailure(label, fn, pattern);
console.log(`Localization adversarial fault injection passed: ${faults.length}/${faults.length} required faults rejected.`);
