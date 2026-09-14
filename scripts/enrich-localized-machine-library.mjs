import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const localeArg = process.argv.find((arg) => arg.startsWith("--locale="));
const locale = localeArg?.split("=", 2)[1] || "ru";
const sourceLocale = "en";
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const [machine, evidence] = await Promise.all([
  readJson(path.join(root, locale, "library.json")),
  readJson(path.join(root, "life-os", "datasets", "evidence.json")),
]);

if (machine.locale !== locale || machine.source_locale !== sourceLocale) {
  throw new Error(`Machine localization identity drift for ${locale}`);
}
const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));

machine.canonical_locale = sourceLocale;
machine.locale_contract_version = 1;
machine.fallback_behavior = {
  human: "explicit-no-silent-fallback",
  machine: "preserve-canonical-id-and-canonical-url",
};
machine.recommendation_policy = {
  eligible_statuses: ["reviewed", "practical"],
  sensitive_records_eligible: false,
  note: "Localization quality does not upgrade canonical evidence or recommendation eligibility.",
};
machine.entries = (machine.entries || []).map((item) => {
  const trust = evidenceBySlug.get(item.slug);
  if (!trust) throw new Error(`Localized machine record has no canonical evidence state: ${item.slug}`);
  const eligible = ["reviewed", "practical"].includes(trust.status) && !Boolean(trust.sensitive);
  return {
    ...item,
    recommendation_eligible: eligible,
    fallback_to_canonical_required: false,
  };
});

await writeFile(path.join(root, locale, "library.json"), `${JSON.stringify(machine, null, 2)}\n`);
console.log(`Localized machine library enriched for ${locale}: ${machine.entries.length} records with explicit recommendation/fallback semantics.`);
