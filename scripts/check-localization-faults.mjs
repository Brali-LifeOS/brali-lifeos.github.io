import { expectLocalizationFailure, validateLocalizedRecordSet } from "./lib/localization-contract.mjs";
import { scanGermanText } from "./lib/de-language-audit.mjs";
import { scanRussianText } from "./lib/ru-language-audit.mjs";

const canonical = [
  { slug: "alpha", title: "Alpha", subtitle: "First example", description: "Canonical alpha description", updatedISO: "2026-09-14T00:00:00.000Z" },
  { slug: "beta", title: "Beta", subtitle: "Second example", description: "Canonical beta description", updatedISO: "2026-09-14T00:00:00.000Z" },
];
const snapshot = (record) => ({
  title: record.title,
  subtitle: record.subtitle,
  description: record.description,
  updatedISO: record.updatedISO,
});
const allowedQualityStates = new Set(["localized-draft", "language-reviewed", "editorial-reviewed"]);

const russian = canonical.map((record, index) => ({
  slug: record.slug,
  source: snapshot(record),
  title: index === 0 ? "Альфа" : "Бета",
  subtitle: index === 0 ? "Первый пример" : "Второй пример",
  description: index === 0 ? "Русское описание первого примера." : "Русское описание второго примера.",
  quality_state: "language-reviewed",
  _authority: "canonical",
}));

const german = canonical.map((record, index) => ({
  slug: record.slug,
  source: snapshot(record),
  title: index === 0 ? "Alfa-Beispiel" : "Beta-Beispiel",
  subtitle: index === 0 ? "Erstes Beispiel" : "Zweites Beispiel",
  description: index === 0 ? "Deutsche Beschreibung des ersten Beispiels." : "Deutsche Beschreibung des zweiten Beispiels.",
  quality_state: "language-reviewed",
  _authority: "canonical",
}));

const russianLanguageCheck = (record) => {
  const problems = [];
  for (const field of ["title", "subtitle", "description"]) {
    const result = scanRussianText(record[field], { location: `${record.slug}.${field}`, allowlist: [] });
    problems.push(...result.blocking, ...result.review);
  }
  return problems;
};

const germanLanguageCheck = (record) => {
  const problems = [];
  for (const field of ["title", "subtitle", "description"]) {
    const result = scanGermanText(record[field], { source: record.source?.[field], field });
    problems.push(...result.blocking, ...result.review);
  }
  return problems;
};

const validate = (locale, records, languageCheck, overrides = {}) => validateLocalizedRecordSet({
  locale,
  canonicalRecords: overrides.canonicalRecords || canonical,
  localizedRecords: records,
  allowedQualityStates,
  requiredTextFields: ["title", "subtitle", "description"],
  sourceSnapshot: snapshot,
  isAuthoritative: (record) => record._authority === "canonical",
  languageCheck,
  exact: true,
});
const validateRussian = (records, overrides = {}) => validate("ru", records, russianLanguageCheck, overrides);
const validateGerman = (records, overrides = {}) => validate("de", records, germanLanguageCheck, overrides);

validateRussian(structuredClone(russian));
validateGerman(structuredClone(german));

const faults = [
  ["missing localized slug", () => validateRussian(structuredClone(russian).slice(0, 1)), /coverage missing/],
  ["empty title", () => { const records = structuredClone(russian); records[0].title = ""; validateRussian(records); }, /title is required/],
  ["duplicate slug", () => { const records = structuredClone(russian); records.push(structuredClone(records[0])); validateRussian(records); }, /duplicate localized slug/],
  ["invalid quality value", () => { const records = structuredClone(russian); records[0].quality_state = "green-because-ci"; validateRussian(records); }, /invalid quality state/],
  ["non-authoritative record", () => { const records = structuredClone(russian); records[0]._authority = "secondary"; validateRussian(records); }, /non-authoritative/],
  ["unknown source ID", () => { const records = structuredClone(russian); records[0].slug = "unknown-source"; validateRussian(records); }, /unknown canonical slug/],
  ["null required field", () => { const records = structuredClone(russian); records[0].description = null; validateRussian(records); }, /description is required/],
  ["source mismatch", () => { const records = structuredClone(russian); records[0].source.title = "Wrong source"; validateRussian(records); }, /source mismatch/],
  ["Russian English leakage", () => { const records = structuredClone(russian); records[0].description = "Сделайте follow-up после разговора."; validateRussian(records); }, /language check/],
  ["German source-language fallback", () => { const records = structuredClone(german); records[0].description = records[0].source.description; validateGerman(records); }, /language check/],
  ["German English prose leakage", () => { const records = structuredClone(german); records[0].description = "Use this method to improve your focus before you start the task."; validateGerman(records); }, /language check/],
  ["German Cyrillic leakage", () => { const records = structuredClone(german); records[0].title = "Альфа"; validateGerman(records); }, /language check/],
];

for (const [label, fn, pattern] of faults) expectLocalizationFailure(label, fn, pattern);
console.log(`Localization adversarial fault injection passed: ${faults.length}/${faults.length} required faults rejected across RU and DE.`);
