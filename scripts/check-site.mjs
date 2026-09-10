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
  "agents/index.html",
  "agents/contribute/index.html",
  "partners/index.html",
  "partners/integrations/index.html",
  "partners/research/index.html",
  "partners/licensing/index.html",
  "research/index.html",
  "research/habits-take-time/index.html",
  "research/rag-is-not-a-trust-button/index.html",
  "LICENSING.md",
  "life-os/index.html",
  "life-os/areas/index.html",
  "assets/images/brali-growth-zones.webp",
  "assets/images/brali-practical-hack.webp",
  "assets/images/brali-hack-focus-execution.webp",
  "assets/images/brali-hack-mind-resilience.webp",
  "assets/images/brali-hack-health-energy.webp",
  "assets/images/brali-hack-learning-thinking.webp",
  "assets/images/brali-hack-communication-relationships.webp",
  "assets/images/brali-hack-creativity-expression.webp",
  "assets/images/brali-hack-work-money-strategy.webp",
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
if (!homepage.includes("Brali: practical protocols for everyday life")) throw new Error("Homepage lost the canonical Brali search title.");
if (!homepage.includes('property="og:site_name" content="Brali"')) throw new Error("Homepage lost the Brali site-name declaration.");
if (!homepage.includes("Brali is a practical knowledge library for focus, stress, memory, sleep, habits, learning and movement")) throw new Error("Homepage lost the product-specific search description.");
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

const agents = await readFile(path.join(root, "agents/index.html"), "utf8");
if (!agents.includes('href="/agents/contribute/"')) throw new Error("Agent page does not expose the knowledge contribution path.");
const contributionPath = await readFile(path.join(root, "agents/contribute/index.html"), "utf8");
for (const marker of ["The review path", "knowledge-proposal.yml", "pending-review", "practical", "reviewed"]) {
  if (!contributionPath.includes(marker)) throw new Error(`Knowledge contribution page lacks ${marker}.`);
}

const partners = await readFile(path.join(root, "partners/index.html"), "utf8");
for (const pathname of ["/partners/integrations/", "/partners/research/", "/partners/licensing/"]) {
  if (!partners.includes(`href="${pathname}"`)) throw new Error(`Partnership index does not link to ${pathname}.`);
}
if (!partners.includes('href="/agents/contribute/"')) throw new Error("Partnership index does not expose the knowledge contribution path.");
const integrationPartners = await readFile(path.join(root, "partners/integrations/index.html"), "utf8");
if (!integrationPartners.includes("MCP is local today")) throw new Error("Integration partnership page overstates the current MCP boundary.");
const researchPartners = await readFile(path.join(root, "partners/research/index.html"), "utf8");
if (!researchPartners.includes("Research principles")) throw new Error("Research partnership page lacks collaboration principles.");
const licensingPartners = await readFile(path.join(root, "partners/licensing/index.html"), "utf8");
if (!licensingPartners.includes("Current public boundary")) throw new Error("Licensing partnership page lacks the public license boundary.");

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
for (const pathname of ["for-ai", "faq", "agents", "agents/contribute", "partners", "partners/integrations", "partners/research", "partners/licensing", "contact", "research", "research/habits-take-time", "research/rag-is-not-a-trust-button", "terms"]) {
  if (!sitemap.includes(`https://brali-lifeos.github.io/${pathname}/`)) throw new Error(`Sitemap lacks ${pathname}.`);
}
if (sitemap.includes("metalhatscats.com")) throw new Error("Sitemap still references MetalHatsCats.");

const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
if (!library.includes('href="/life-os/areas/"')) throw new Error("Growth Library does not link to life areas.");
if (!library.includes('href="/life-os/flagships/"')) throw new Error("Growth Library does not link to flagship protocols.");

console.log("Brali public site checks passed.");
