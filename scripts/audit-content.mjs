import { readFile } from "node:fs/promises";
import path from "node:path";
import { classifyEvidence } from "./lib/content-trust.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/evidence-overrides.json"), "utf8"));
const evidenceIndex = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const strict = process.argv.includes("--strict");

const counts = { reviewed: 0, practical: 0, "pending-review": 0, restricted: 0 };
let legacySourceEntries = 0;
let legacyGeneratedPages = 0;
let restrictedStillIndexable = 0;
let missingProtocolSummaries = 0;
let evidenceStatusMismatches = 0;
let quantitativeQueue = 0;
const examples = [];

const evidenceBySlug = new Map((evidenceIndex.entries ?? []).map((record) => [record.slug, record]));

for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const sourceText = JSON.stringify(article);
  const evidence = classifyEvidence(article, entry, overrides);
  counts[evidence.status] = (counts[evidence.status] ?? 0) + 1;
  if (evidence.claims.quantitative && evidence.status !== "reviewed") quantitativeQueue += 1;
  if (/metalhatscats/i.test(sourceText)) legacySourceEntries += 1;

  const generatedPath = path.join(root, "life-os", entry.slug, "index.html");
  const generated = await readFile(generatedPath, "utf8");
  if (/metalhatscats/i.test(generated)) legacyGeneratedPages += 1;
  if (!generated.includes('data-protocol-summary="true"')) missingProtocolSummaries += 1;
  if (!generated.includes(`data-evidence-status="${evidence.status}"`)) evidenceStatusMismatches += 1;
  if (!evidence.indexable && !/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(generated)) {
    restrictedStillIndexable += 1;
  }

  const indexed = evidenceBySlug.get(entry.slug);
  if (!indexed || indexed.status !== evidence.status || indexed.reason !== evidence.reason) {
    evidenceStatusMismatches += 1;
  }

  if ((evidence.status === "restricted" || evidence.status === "pending-review") && examples.length < 12) {
    examples.push(`${entry.slug}:${evidence.status}`);
  }
}

console.log("Brali Growth Library content audit");
console.log(`- Entries: ${index.length}`);
console.log(`- Reviewed: ${counts.reviewed}`);
console.log(`- Practical: ${counts.practical}`);
console.log(`- Pending review: ${counts["pending-review"]}`);
console.log(`- Restricted: ${counts.restricted}`);
console.log(`- Quantitative claims not reviewed: ${quantitativeQueue}`);
console.log(`- Source records containing legacy MetalHatsCats branding: ${legacySourceEntries}`);
console.log(`- Generated pages containing legacy branding: ${legacyGeneratedPages}`);
console.log(`- Generated pages missing protocol summaries: ${missingProtocolSummaries}`);
console.log(`- Restricted pages still indexable: ${restrictedStillIndexable}`);
console.log(`- Evidence status/index mismatches: ${evidenceStatusMismatches}`);
if (examples.length) console.log(`- Review queue examples: ${examples.join(", ")}`);

const blockingProblems = legacyGeneratedPages + restrictedStillIndexable + missingProtocolSummaries + evidenceStatusMismatches;
if (strict && blockingProblems > 0) {
  console.error(`Content trust audit failed with ${blockingProblems} blocking problem(s).`);
  process.exit(1);
}

if (counts["pending-review"] + counts.restricted > 0) {
  console.warn("Evidence review queue remains. Use data/evidence-overrides.json to record editorial decisions after reviewing sources and wording.");
}
