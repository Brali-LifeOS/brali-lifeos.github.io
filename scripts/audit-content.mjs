import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const strict = process.argv.includes("--strict");

const sensitiveZones = new Set([
  "no-depression",
  "no-fears",
  "be-healthy",
  "fit-life",
  "cardio-doc",
  "psychodynamic",
  "metacognitive",
  "cognitive-analytic",
  "positive-psychotherapy",
  "body-oriented",
  "ericksonian",
  "gestalt",
  "exposure",
  "dbt",
  "act",
  "cbt",
]);

const claimPattern = /\b(?:research|studies?|trial|pilot|participants?|randomi[sz]ed|systematic review|meta-analysis)\b|\b\d{1,3}(?:\.\d+)?%\b|\bn\s*=\s*\d+\b/i;

function hasSource(article) {
  const original = article.lifeOsSource ?? {};
  const directSources = [original.reference, original.sourceUrl, article.reference, article.sourceUrl].filter(Boolean);
  const sourceLists = [article.references, article.sources, article.citations]
    .filter(Array.isArray)
    .flat()
    .filter(Boolean);
  return directSources.length > 0 || sourceLists.length > 0;
}

let sensitive = 0;
let sensitiveUnsourced = 0;
let suspiciousUnsourced = 0;
let legacySourceEntries = 0;
let legacyGeneratedPages = 0;
let unprotectedSensitivePages = 0;
const examples = [];

for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const sourceText = JSON.stringify(article);
  const sourced = hasSource(article);
  const isSensitive = sensitiveZones.has(entry.zone?.slug);

  if (isSensitive) sensitive += 1;
  if (isSensitive && !sourced) sensitiveUnsourced += 1;
  if (!sourced && claimPattern.test(sourceText)) {
    suspiciousUnsourced += 1;
    if (examples.length < 12) examples.push(entry.slug);
  }
  if (/metalhatscats/i.test(sourceText)) legacySourceEntries += 1;

  const generatedPath = path.join(root, "life-os", entry.slug, "index.html");
  const generated = await readFile(generatedPath, "utf8");
  if (/metalhatscats/i.test(generated)) legacyGeneratedPages += 1;
  if (isSensitive && !sourced && !/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(generated)) {
    unprotectedSensitivePages += 1;
  }
}

console.log("Brali Growth Library content audit");
console.log(`- Entries: ${index.length}`);
console.log(`- Sensitive entries: ${sensitive}`);
console.log(`- Sensitive entries without explicit sources: ${sensitiveUnsourced}`);
console.log(`- Unsourced entries with evidence-like claims: ${suspiciousUnsourced}`);
console.log(`- Source records containing legacy MetalHatsCats branding: ${legacySourceEntries}`);
console.log(`- Generated pages containing legacy branding: ${legacyGeneratedPages}`);
console.log(`- Unsourced sensitive pages still indexable: ${unprotectedSensitivePages}`);
if (examples.length) console.log(`- Claim-review examples: ${examples.join(", ")}`);

const blockingProblems = legacyGeneratedPages + unprotectedSensitivePages;
if (strict && blockingProblems > 0) {
  console.error(`Content trust audit failed with ${blockingProblems} blocking problem(s).`);
  process.exit(1);
}

if (suspiciousUnsourced > 0) {
  console.warn("Review queue created: evidence-like claims without explicit sources remain in the source dataset.");
}
