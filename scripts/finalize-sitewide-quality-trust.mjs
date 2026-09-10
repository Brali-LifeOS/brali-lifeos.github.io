import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const trustedStates = new Set(["reviewed", "practical"]);
const isTrusted = record => record.indexable === true && trustedStates.has(record.status);
const isReference = record => record.status === "pending-review" && record.sensitive !== true;
const trusted = (evidence.entries ?? []).filter(isTrusted);
const referenceIndexable = (evidence.entries ?? []).filter(isReference);
const searchIndexable = (evidence.entries ?? []).filter(record => isTrusted(record) || isReference(record));
const withheld = (evidence.entries ?? []).filter(record => !isTrusted(record) && !isReference(record));
const reviewRequired = (evidence.entries ?? []).filter(record => !isTrusted(record));

const reportPath = path.join(root, "state/quality/index.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
report.coverage.indexable_entry_pages = searchIndexable.length;
report.coverage.reference_indexable_entry_pages = referenceIndexable.length;
report.coverage.withheld_entry_pages = withheld.length;
report.coverage.trusted_recommendation_entries = trusted.length;
report.coverage.review_required_entry_pages = reviewRequired.length;
report.final_search_policy = {
  policy: "search-visibility-separated-from-trust",
  indexable_entry_pages: searchIndexable.length,
  trusted_guidance_pages: trusted.length,
  pending_review_reference_pages: referenceIndexable.length,
  withheld_entry_pages: withheld.length,
  rule: "Reviewed/practical entries are indexable current guidance. Non-sensitive pending-review entries are indexable only as neutral review/reference records after inherited guidance is contained. Restricted entries remain noindex and outside sitemap. Recommendation and Agent Skill eligibility remain limited to trusted guidance.",
  validation: "Final robots, sitemap, review-record containment and machine search/recommendation parity are enforced by check-indexing-policy.mjs, check-sitewide-quality-loop.mjs and the strict content audit."
};
report.rules = (report.rules ?? []).filter(rule =>
  !rule.startsWith("All public entries and zones are crawlable") &&
  !rule.startsWith("Trusted entry pages are indexable") &&
  !rule.startsWith("Search visibility and recommendation eligibility")
);
report.rules.push("Search visibility and recommendation eligibility are separate: trusted guidance and neutral pending-review reference records may be indexed, while only trusted guidance may be recommended or packaged as Agent Skills; restricted records remain search-withheld.");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const qualityPath = path.join(root, "state/quality/index.html");
let qualityHtml = await readFile(qualityPath, "utf8");
qualityHtml = qualityHtml.replace(
  /(<span class="card-label">Search-visible entries<\/span><h2>)[^<]+(<\/h2><p>)[\s\S]*?(<\/p><\/article>)/,
  `$1${searchIndexable.length}$2${trusted.length} trusted current-guidance pages plus ${referenceIndexable.length} neutral pending-review review records are in sitemap; ${withheld.length} restricted pages remain noindex.$3`,
);
await writeFile(qualityPath, qualityHtml);

const statePath = path.join(root, "state/index.html");
let stateHtml = await readFile(statePath, "utf8");
const stateCopy = `keeps ${searchIndexable.length} entry pages search-visible: ${trusted.length} trusted current-guidance pages plus ${referenceIndexable.length} neutral pending-review reference records. ${withheld.length} restricted pages remain noindex, and normal recommendations stay limited to the ${trusted.length} trusted entries.`;
stateHtml = stateHtml
  .replace("keeps all public pages crawlable, and separately gates trusted recommendations by evidence state.", stateCopy)
  .replace(/keeps \d+ trusted entry pages search-visible while \d+ review-gated pages remain accessible but noindex, with recommendations aligned to the same evidence gate\./, stateCopy);
await writeFile(statePath, stateHtml);

console.log(`Site-wide quality final search state: ${searchIndexable.length} entry page(s) indexable (${trusted.length} trusted + ${referenceIndexable.length} pending-review references); ${withheld.length} restricted page(s) withheld; ${trusted.length} trusted recommendation entries.`);
