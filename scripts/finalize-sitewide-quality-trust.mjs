import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const trustedStates = new Set(["reviewed", "practical"]);
const trusted = (evidence.entries ?? []).filter((record) => record.indexable === true && trustedStates.has(record.status));
const withheld = (evidence.entries ?? []).filter((record) => !(record.indexable === true && trustedStates.has(record.status)));

const reportPath = path.join(root, "state/quality/index.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
report.coverage.indexable_entry_pages = trusted.length;
report.coverage.withheld_entry_pages = withheld.length;
report.coverage.trusted_recommendation_entries = trusted.length;
report.coverage.review_required_entry_pages = withheld.length;
report.final_search_policy = {
  policy: "trusted-evidence-gated",
  indexable_entry_pages: trusted.length,
  withheld_entry_pages: withheld.length,
  rule: "Reviewed and eligible practical entries are index,follow and included in sitemap. Pending-review and restricted entries remain accessible but are noindex,follow and omitted from sitemap.",
  validation: "Final robots, sitemap and machine search_indexable parity are enforced by check-indexing-policy.mjs and check-sitewide-quality-loop.mjs after this report is finalized."
};
report.rules = (report.rules ?? []).filter((rule) => !rule.startsWith("All public entries and zones are crawlable"));
report.rules.push("Trusted entry pages are indexable and included in sitemap; review-gated entry pages are noindex,follow and withheld from sitemap. Growth Zone pages remain indexable.");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const qualityPath = path.join(root, "state/quality/index.html");
let qualityHtml = await readFile(qualityPath, "utf8");
qualityHtml = qualityHtml.replace(
  /(<span class="card-label">Search-visible entries<\/span><h2>)[^<]+(<\/h2><p>)[\s\S]*?(<\/p><\/article>)/,
  `$1${trusted.length}$2Trusted reviewed/practical entry pages are in sitemap; ${withheld.length} review-gated pages remain accessible but noindex.$3`,
);
await writeFile(qualityPath, qualityHtml);

const statePath = path.join(root, "state/index.html");
let stateHtml = await readFile(statePath, "utf8");
stateHtml = stateHtml.replace(
  "keeps all public pages crawlable, and separately gates trusted recommendations by evidence state.",
  `keeps ${trusted.length} trusted entry pages search-visible while ${withheld.length} review-gated pages remain accessible but noindex, with recommendations aligned to the same evidence gate.`,
);
await writeFile(statePath, stateHtml);

console.log(`Site-wide quality final search state: ${trusted.length} trusted entry page(s) indexable; ${withheld.length} review-gated entry page(s) accessible but withheld from search.`);
