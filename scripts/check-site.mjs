import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "index.html",
  "homepage.css",
  "library-search.js",
  "library-search.css",
  "features/index.html",
  "how-it-works/index.html",
  "screenshots/index.html",
  "docs/index.html",
  "download/index.html",
  "privacy/index.html",
  "terms/index.html",
  "support/index.html",
  "changelog/index.html",
  "faq/index.html",
  "for-ai/index.html",
  "partners/index.html",
  "research/index.html",
  "research/habits-take-time/index.html",
  "research/rag-is-not-a-trust-button/index.html",
  "LICENSING.md",
  "life-os/index.html",
  "life-os/areas/index.html",
  "ontology/index.html",
  "ontology/coverage/index.html",
  "life-os/datasets/ontology.json",
  "life-os/datasets/ontology-coverage.json",
  "life-os/datasets/evidence.json",
  "life-os/datasets/review-queue.json",
  "life-os/datasets/claim-debt.json",
  "life-os/datasets/title-quality.json",
  "life-os/datasets/indexing.json",
  "life-os/datasets/protocols.json",
  "life-os/datasets/editorial-normalizations.json",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "product-facts.json",
  "redirect-map.md",
];

for (const file of required) await access(path.join(root, file));

const homepage = await readFile(path.join(root, "index.html"), "utf8");
if (!homepage.includes('class="protocol-demo"')) throw new Error("Homepage lacks the protocol example.");
if (!homepage.includes('href="/life-os/areas/"')) throw new Error("Homepage does not provide a Life Areas entry point.");
if (!homepage.includes('href="/for-ai/"')) throw new Error("Homepage does not expose the AI/developer entry point.");
if (!homepage.includes('href="/research/"')) throw new Error("Homepage does not expose the research entry point.");
if (!homepage.includes('href="/partners/"')) throw new Error("Homepage does not expose the partnership entry point.");
if (!homepage.includes("Useful ideas, made easier to trust and use.")) throw new Error("Homepage lost the simple knowledge-library positioning.");
if (/class="app-card"/.test(homepage)) throw new Error("Homepage still uses the logo-only hero card.");
if (/protocols\.jsonl|protocols\.schema\.json/.test(homepage)) throw new Error("Homepage advertises an unpublished protocol interface.");

const docs = await readFile(path.join(root, "docs/index.html"), "utf8");
if (!docs.includes("Run one small experiment first.")) throw new Error("Getting-started page is not experiment-first.");
if (!docs.includes('href="/life-os/flagships/"')) throw new Error("Getting-started page does not link to flagship protocols.");
if (!docs.includes("Choose → Practice → Check in → Review → Keep or change.")) throw new Error("Getting-started page does not explain the Brali review loop.");

const forAi = await readFile(path.join(root, "for-ai/index.html"), "utf8");
if (!forAi.includes('/life-os/datasets/protocols.json')) throw new Error("AI/developer page does not expose the Trusted Protocol Feed.");
if (!forAi.includes('/life-os/datasets/ontology-coverage.json')) throw new Error("AI/developer page does not expose ontology coverage.");
if (!forAi.includes("Do not erase uncertainty")) throw new Error("AI/developer page does not explain evidence-state preservation.");
if (/protocols\.jsonl|protocols\.schema\.json/.test(forAi)) throw new Error("AI/developer page advertises an unpublished interface.");

const faq = await readFile(path.join(root, "faq/index.html"), "utf8");
if (!faq.includes('"@type":"FAQPage"')) throw new Error("FAQ page lacks FAQ structured data.");
if (!faq.includes("Is the mobile app still the main product?")) throw new Error("FAQ does not explain the project pivot.");

const partners = await readFile(path.join(root, "partners/index.html"), "utf8");
if (!partners.includes("Commercial dataset licensing")) throw new Error("Partnership page lacks a commercial data model.");
if (!partners.includes("AI and agent integrations")) throw new Error("Partnership page lacks the agent integration path.");

const research = await readFile(path.join(root, "research/index.html"), "utf8");
for (const section of ["Evidence notes", "Trend notes", "Open questions"]) {
  if (!research.includes(section)) throw new Error(`Research page lacks ${section}.`);
}
for (const pathname of ["/research/habits-take-time/", "/research/rag-is-not-a-trust-button/"]) {
  if (!research.includes(`href="${pathname}"`)) throw new Error(`Research index does not link to ${pathname}.`);
}
const habitResearch = await readFile(path.join(root, "research/habits-take-time/index.html"), "utf8");
const ragResearch = await readFile(path.join(root, "research/rag-is-not-a-trust-button/index.html"), "utf8");
for (const [name, html] of [["habit research", habitResearch], ["RAG research", ragResearch]]) {
  if (!html.includes('"@type":"Article"')) throw new Error(`${name} lacks Article structured data.`);
  if (!html.includes("<h2>Sources</h2>")) throw new Error(`${name} lacks visible sources.`);
  if (!html.includes("<h2>What this changes in Brali</h2>")) throw new Error(`${name} does not connect evidence to product decisions.`);
}

const llms = await readFile(path.join(root, "llms.txt"), "utf8");
if (!llms.startsWith("# Brali\n")) throw new Error("llms.txt still uses the old app-first project identity.");
if (!llms.includes("For AI & developers")) throw new Error("llms.txt does not expose the AI/developer entry point.");
if (!llms.includes("Ontology coverage")) throw new Error("llms.txt does not expose ontology coverage.");

const productFacts = JSON.parse(await readFile(path.join(root, "product-facts.json"), "utf8"));
if (productFacts.project_center !== "Public knowledge layer for humans and machines") throw new Error("product-facts.json lost the knowledge-platform center.");
if (productFacts.core_unit !== "protocol") throw new Error("product-facts.json does not declare the protocol as the core unit.");

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/")) throw new Error("Sitemap lacks migrated Life OS pages.");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/areas/")) throw new Error("Sitemap lacks life area navigation pages.");
if (!sitemap.includes("https://brali-lifeos.github.io/ontology/coverage/")) throw new Error("Sitemap lacks ontology coverage.");
for (const pathname of ["for-ai", "faq", "partners", "research", "research/habits-take-time", "research/rag-is-not-a-trust-button", "terms"]) {
  if (!sitemap.includes(`https://brali-lifeos.github.io/${pathname}/`)) throw new Error(`Sitemap lacks ${pathname}.`);
}
if (sitemap.includes("metalhatscats.com")) throw new Error("Sitemap still references MetalHatsCats.");

const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
if (!library.includes('href="/life-os/areas/"')) throw new Error("Growth Library does not link to life areas.");

const datasetsPage = await readFile(path.join(root, "life-os/datasets/index.html"), "utf8");
for (const dataset of ["ontology.json", "ontology-coverage.json", "evidence.json", "review-queue.json", "claim-debt.json", "title-quality.json", "indexing.json", "protocols.json", "editorial-normalizations.json"]) {
  if (!datasetsPage.includes(`/life-os/datasets/${dataset}`)) throw new Error(`Dataset page does not expose ${dataset}.`);
}
if (!datasetsPage.includes('"@type":"DataCatalog"')) throw new Error("Dataset page lacks DataCatalog structured data.");
if (!datasetsPage.includes('href="/for-ai/"')) throw new Error("Dataset page does not link to AI/developer integration guidance.");

const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const publicIndex = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));
const evidenceIndex = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const reviewQueue = JSON.parse(await readFile(path.join(root, "life-os/datasets/review-queue.json"), "utf8"));
const claimDebt = JSON.parse(await readFile(path.join(root, "life-os/datasets/claim-debt.json"), "utf8"));
const titleQuality = JSON.parse(await readFile(path.join(root, "life-os/datasets/title-quality.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const coverage = JSON.parse(await readFile(path.join(root, "life-os/datasets/ontology-coverage.json"), "utf8"));
const normalizations = JSON.parse(await readFile(path.join(root, "life-os/datasets/editorial-normalizations.json"), "utf8"));

if (evidenceIndex.schema_version !== 2) throw new Error("Evidence index is not ontology-aware schema v2.");
if ((evidenceIndex.entries ?? []).length !== sourceIndex.length) throw new Error("Evidence index does not cover every Growth Library entry.");
if (!(evidenceIndex.entries ?? []).every((record) => record.ontology?.domains?.length)) throw new Error("Evidence index contains a record without Domain classification.");
if (!(reviewQueue.entries ?? []).every((record) => ["pending-review", "restricted"].includes(record.status))) {
  throw new Error("Evidence review queue contains a non-review status.");
}
if (reviewQueue.schema_version !== 3 || reviewQueue.priority_model?.version !== 3) {
  throw new Error("Evidence review queue does not expose the claim-aware ontology editorial priority model.");
}
for (const record of reviewQueue.entries ?? []) {
  if (!Number.isInteger(record.editorial_priority?.score) || !Array.isArray(record.editorial_priority?.factors) || !record.editorial_priority.factors.length) {
    throw new Error(`Evidence review queue entry lacks editorial priority metadata: ${record.slug}`);
  }
  if (!record.ontology?.domains?.length) throw new Error(`Evidence review queue entry lacks ontology metadata: ${record.slug}`);
}
for (let index = 1; index < (reviewQueue.entries ?? []).length; index += 1) {
  const previous = reviewQueue.entries[index - 1];
  const current = reviewQueue.entries[index];
  if (previous.editorial_priority.score < current.editorial_priority.score) {
    throw new Error(`Evidence review queue is not sorted by editorial priority: ${previous.slug} before ${current.slug}.`);
  }
}
if (claimDebt.schema_version !== 1 || claimDebt.name !== "Brali public claim debt report") {
  throw new Error("Claim-debt report identity or schema drift.");
}
if (claimDebt.counts?.records_checked !== sourceIndex.length || claimDebt.counts?.records_with_markers !== (claimDebt.entries ?? []).length) {
  throw new Error("Claim-debt report does not reconcile with the source library.");
}
if (publicIndex.length !== sourceIndex.length || !publicIndex.every((entry) => typeof entry.displayTitle === "string" && entry.displayTitle.trim())) {
  throw new Error("Public Life OS index lacks normalized display titles.");
}
if (!Number.isInteger(titleQuality.changed_count) || !Number.isInteger(titleQuality.unresolved_count)) {
  throw new Error("Title quality report is malformed.");
}
if (!Number.isInteger(protocols.count) || protocols.count !== (protocols.entries ?? []).length) {
  throw new Error("Protocol feed is malformed.");
}
if (protocols.schema_version !== 3 || protocols.canonical_language !== "en") {
  throw new Error("Protocol feed lacks ontology-aware identity/language metadata.");
}
if (!(protocols.entries ?? []).every((record) => record.ontology?.domains?.length)) throw new Error("Protocol feed contains a record without Domain classification.");
if (coverage.summary?.library_entries !== sourceIndex.length) throw new Error("Ontology coverage does not reconcile with the library size.");
if (!Array.isArray(normalizations.rules)) throw new Error("Editorial normalization register is malformed.");

console.log(`Static site verified: ${required.length} core files, ontology/claim-aware protocol and evidence surfaces, public coverage reporting, source provenance, ${evidenceIndex.entries.length} evidence records, and ${claimDebt.counts.debt_entries} claim-debt entries.`);
