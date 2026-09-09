import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const indexing = JSON.parse(await readFile(path.join(root, "life-os/datasets/indexing.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const trustedStates = new Set(["reviewed", "practical"]);
let violations = 0;
let trustedCount = 0;
let withheldCount = 0;

for (const record of evidence.entries ?? []) {
  const url = `${base}/life-os/${record.slug}/`;
  const trusted = record.indexable === true && trustedStates.has(record.status);
  const inSitemap = sitemap.includes(`<loc>${url}</loc>`);
  const html = await readFile(path.join(root, "life-os", record.slug, "index.html"), "utf8");
  const noindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i)?.[1] ?? null;
  const machine = JSON.parse(await readFile(path.join(root, "life-os", record.slug, "index.json"), "utf8"));
  const machineIndexable = machine?.discovery?.search_indexable ?? machine?.evidence?.search_indexable;
  const machineCurrentGuidance = machine?.content?.current_guidance;
  const machineDisplayState = machine?.content?.display_state;
  const expectedDisplayState = trusted ? "current-guidance-visible" : "historical-source-only";

  if (trusted) {
    trustedCount += 1;
    if (!inSitemap || noindex || canonical !== url || machineIndexable !== true) violations += 1;
  } else {
    withheldCount += 1;
    if (inSitemap || !noindex || canonical !== url || machineIndexable === true) violations += 1;
  }

  if (machineCurrentGuidance !== trusted || machineDisplayState !== expectedDisplayState) violations += 1;
  if (machine?.discovery?.recommendation_eligible !== trusted || machine?.discovery?.trusted_protocol_feed !== trusted) violations += 1;
  if (!machine?.content?.historical_source_url || machine?.content?.historical_source_role !== "provenance-only-not-current-guidance") violations += 1;
}

const expectedTrusted = (evidence.entries ?? []).filter((record) => record.indexable === true && trustedStates.has(record.status)).map((record) => record.slug).sort();
const expectedWithheld = (evidence.entries ?? []).filter((record) => !(record.indexable === true && trustedStates.has(record.status))).map((record) => record.slug).sort();
const actualTrusted = [...(indexing.indexable ?? [])].sort();
const actualWithheld = [...(indexing.withheld ?? [])].sort();

if (indexing.schema_version !== 4) violations += 1;
if (!indexing.content_display_rule?.includes("Pending-review/restricted")) violations += 1;
if (indexing.indexable_count !== expectedTrusted.length || indexing.withheld_count !== expectedWithheld.length) violations += 1;
if (indexing.trusted_recommendation_count !== expectedTrusted.length || indexing.review_required_count !== expectedWithheld.length) violations += 1;
if (JSON.stringify(actualTrusted) !== JSON.stringify(expectedTrusted)) violations += 1;
if (JSON.stringify(actualWithheld) !== JSON.stringify(expectedWithheld)) violations += 1;
if (trustedCount !== expectedTrusted.length || withheldCount !== expectedWithheld.length) violations += 1;

if (violations) throw new Error(`Indexing policy validation failed with ${violations} trust/search/content parity violation(s).`);
console.log(`Indexing policy verified: ${trustedCount} trusted entries expose current guidance and remain indexable; ${withheldCount} review-gated entries are historical-source-only, noindex and withheld.`);