import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const trustedStates = new Set(["reviewed", "practical"]);
const isTrusted = record => record.indexable === true && trustedStates.has(record.status);
const isReference = record => record.status === "pending-review" && record.sensitive !== true;
const isSearchIndexable = record => isTrusted(record) || isReference(record);
const expectedDisplayState = record => isTrusted(record)
  ? "current-guidance-visible"
  : record.status === "pending-review"
    ? "review-pending-longform-visible"
    : "historical-source-only";
const expectedRole = record => isTrusted(record)
  ? "trusted-current-guidance"
  : isReference(record)
    ? "pending-review-longform"
    : "withheld-review-required";
let violations = 0;
let searchIndexableCount = 0;
let referenceCount = 0;
let trustedCount = 0;
let withheldCount = 0;
let reviewRequiredCount = 0;

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  const trusted = isTrusted(record);
  const reference = isReference(record);
  const searchIndexable = trusted || reference;
  const inSitemap = sitemap.includes(`<loc>${url}</loc>`);
  const html = await readFile(path.join(root, "life-os", record.slug, "index.html"), "utf8");
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
  const machine = JSON.parse(await readFile(path.join(root, "life-os", record.slug, "index.json"), "utf8"));
  const machineIndexable = machine?.discovery?.search_indexable ?? machine?.evidence?.search_indexable;
  const machineCurrentGuidance = machine?.content?.current_guidance;
  const machineLongformVisible = machine?.content?.longform_visible;
  const machineDisplayState = machine?.content?.display_state;
  const displayState = expectedDisplayState(record);
  const role = expectedRole(record);

  if (searchIndexable) {
    searchIndexableCount += 1;
    if (!inSitemap || noindex || canonical !== url || machineIndexable !== true) violations += 1;
  } else {
    withheldCount += 1;
    if (inSitemap || !noindex || canonical !== url || machineIndexable === true) violations += 1;
  }
  if (trusted) trustedCount += 1;
  if (reference) referenceCount += 1;
  if (!trusted) reviewRequiredCount += 1;

  if (machine?.evidence?.indexable !== (record.indexable === true)) violations += 1;
  if (machineCurrentGuidance !== trusted || machineLongformVisible !== (record.status !== "restricted") || machineDisplayState !== displayState) violations += 1;
  if (machine?.content?.search_role !== role || machine?.discovery?.search_role !== role) violations += 1;
  if (machine?.discovery?.recommendation_eligible !== trusted || machine?.discovery?.trusted_protocol_feed !== trusted || machine?.discovery?.agent_skill_eligible !== trusted) violations += 1;
  const expectedSourceRole = record.status === "restricted" ? "provenance-only-not-current-guidance" : "canonical-source-record";
  if (!machine?.content?.historical_source_url || machine?.content?.historical_source_role !== expectedSourceRole) violations += 1;

  if (record.status === "pending-review") {
    if (!html.includes('data-legacy-content-state="review-pending-longform-visible"')) violations += 1;
    if (!html.includes('<div class="prose"')) violations += 1;
    if (!html.includes('data-article-versions="true"')) violations += 1;
    if (html.includes("Review record:")) violations += 1;
    if (html.includes("Try it, then review.")) violations += 1;
  }
  if (record.status === "restricted") {
    if (!noindex) violations += 1;
    if (!html.includes("Restricted review record:") || !html.includes('data-legacy-content-state="historical-source-only"')) violations += 1;
    if (html.includes('data-longform-source="body.markdown"')) violations += 1;
  }
  if (record.status !== "restricted" && !html.includes('data-article-versions="true"')) violations += 1;
}

const expectedSearchIndexable = (evidence.entries ?? []).filter(isSearchIndexable).map(record => record.slug).sort();
const expectedReference = (evidence.entries ?? []).filter(isReference).map(record => record.slug).sort();
const expectedWithheld = (evidence.entries ?? []).filter(record => !isSearchIndexable(record)).map(record => record.slug).sort();
const expectedTrusted = (evidence.entries ?? []).filter(isTrusted).map(record => record.slug).sort();
const expectedReviewRequired = (evidence.entries ?? []).filter(record => !isTrusted(record)).map(record => record.slug).sort();
const actualSearchIndexable = [...(indexing.indexable ?? [])].sort();
const actualReference = [...(indexing.reference_indexable ?? [])].sort();
const actualWithheld = [...(indexing.withheld ?? [])].sort();
const actualTrusted = [...(indexing.trusted_recommendations ?? [])].sort();
const actualReviewRequired = [...(indexing.review_required ?? [])].sort();

if (indexing.schema_version !== 6) violations += 1;
if (!indexing.content_display_rule?.includes("long-form")) violations += 1;
if (indexing.indexable_count !== expectedSearchIndexable.length || indexing.reference_indexable_count !== expectedReference.length || indexing.withheld_count !== expectedWithheld.length) violations += 1;
if (indexing.trusted_recommendation_count !== expectedTrusted.length || indexing.review_required_count !== expectedReviewRequired.length) violations += 1;
if (JSON.stringify(actualSearchIndexable) !== JSON.stringify(expectedSearchIndexable)) violations += 1;
if (JSON.stringify(actualReference) !== JSON.stringify(expectedReference)) violations += 1;
if (JSON.stringify(actualWithheld) !== JSON.stringify(expectedWithheld)) violations += 1;
if (JSON.stringify(actualTrusted) !== JSON.stringify(expectedTrusted)) violations += 1;
if (JSON.stringify(actualReviewRequired) !== JSON.stringify(expectedReviewRequired)) violations += 1;
if (searchIndexableCount !== expectedSearchIndexable.length || referenceCount !== expectedReference.length || trustedCount !== expectedTrusted.length || withheldCount !== expectedWithheld.length || reviewRequiredCount !== expectedReviewRequired.length) violations += 1;

if (violations) throw new Error(`Indexing policy validation failed with ${violations} search/trust/content parity violation(s).`);
console.log(`Indexing policy verified: ${searchIndexableCount} entry pages search-indexable (${trustedCount} trusted guidance + ${referenceCount} pending-review long-form articles); ${withheldCount} review-required/restricted entries withheld from search; trusted recommendations remain ${trustedCount}.`);
