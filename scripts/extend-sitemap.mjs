import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

await import('./build-growth-surfaces.mjs');
await import('./build-search-question-pages.mjs');
await import('./build-state-evidence-trends.mjs');
await import('./build-problem-collections.mjs');
await import('./build-evidence-ledger.mjs');
await import('./build-research-gaps.mjs');
await import('./sync-research-gap-manifest.mjs');
await import('./build-zone-coverage-backlog.mjs');
await import('./build-legacy-sensitive-state.mjs');
await import('./sync-zone-coverage-backlog-manifest.mjs');
await import('./sync-legacy-sensitive-manifest.mjs');
await import('./build-outcome-review-queue.mjs');
await import('./build-skill-packs.mjs');

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const sitemapPath = path.join(root, "sitemap.xml");
const growth = JSON.parse(await readFile(path.join(root, "data/growth-surfaces.json"), "utf8"));
const problems = JSON.parse(await readFile(path.join(root, "data/problem-collections.json"), "utf8"));
const decisions = JSON.parse(await readFile(path.join(root, "data/evidence-decisions.json"), "utf8"));
const researchGaps = JSON.parse(await readFile(path.join(root, "data/research-gap-questions.json"), "utf8"));
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const skillCatalog = JSON.parse(await readFile(path.join(root, "skill-packs/catalog.json"), "utf8"));
const reportRoutes = (growth.reports ?? []).map(report => `/updates/${report.slug}/`);
const problemRoutes = (problems.collections ?? []).map(collection => `/problems/${collection.slug}/`);
const decisionRoutes = (decisions.entries ?? []).map(decision => `/evidence/${decision.id}/`);
const researchGapRoutes = (researchGaps.items ?? []).map(item => `/research/gaps/${item.topic_id}/`);
const skillRoutes = (skillCatalog.entries ?? []).map(skill => `/skill-packs/${skill.slug}/`);
const evidenceMonth = String(growth.updated_at).slice(0, 7);
const routes = [
  "/research/",
  "/research/gaps/",
  "/research/habits-take-time/",
  "/research/rag-is-not-a-trust-button/",
  "/research/sleep-regularity-signal-not-prescription/",
  "/research/retrieval-practice-memory-is-not-application/",
  "/for-ai/",
  "/for-ai/query/",
  "/for-ai/integrations/",
  "/for-ai/integrations/report/",
  "/skill-packs/",
  "/run/",
  "/cite/",
  "/trust/",
  "/crawler-matrix/",
  "/evidence/claims/",
  "/observatory/",
  "/media/",
  "/agents/",
  "/agents/contribute/",
  "/faq/",
  "/partners/",
  "/partners/integrations/",
  "/partners/research/",
  "/partners/licensing/",
  "/contact/",
  "/terms/",
  "/questions/",
  "/problems/",
  "/evidence/",
  "/updates/",
  "/state/",
  "/state/quality/",
  "/state/legacy-sensitive/",
  "/trends/evidence/",
  `/trends/evidence/${evidenceMonth}/`,
  ...researchGapRoutes,
  ...problemRoutes,
  ...decisionRoutes,
  ...reportRoutes,
  ...skillRoutes,
];

let xml = await readFile(sitemapPath, "utf8");
const missing = routes.filter(route => !xml.includes(`<loc>${base}${route}</loc>`));
if (missing.length) {
  const additions = missing.map(route => `  <url><loc>${base}${route}</loc></url>`).join("\n");
  xml = xml.replace("</urlset>", `${additions}\n</urlset>`);
  await writeFile(sitemapPath, xml);
}

const integrationPath = path.join(root, 'for-ai/integrations/index.html');
let integrationHtml = await readFile(integrationPath, 'utf8');
if (!integrationHtml.includes('/for-ai/integrations/report/')) {
  const callout = '<aside class="callout" data-brali-integration-outcome><h2>Did you actually use an integration?</h2><p>Prepare a privacy-light integration outcome event. No prompt, API key, email, or user identity is required, and nothing is sent automatically.</p><a class="button" href="/for-ai/integrations/report/">Report an integration outcome</a></aside>';
  integrationHtml = integrationHtml.replace('</main>', `${callout}</main>`);
  await writeFile(integrationPath, integrationHtml);
}

console.log(`Sitemap static routes: ${routes.length - missing.length} already present, ${missing.length} added (${skillRoutes.length} skill routes declared).`);

// The structural site-wide loop predates evidence-gated search indexing and still
// validates the full generated corpus as one temporary crawlable set. Restore the
// complete entry set only for that structural pass; apply-indexing-policy.mjs runs
// again immediately afterwards and deterministically removes review-gated entries,
// restores noindex,follow, and finalizes machine/search parity before checks.
let structuralSitemap = await readFile(sitemapPath, "utf8");
const structuralMissing = sourceIndex
  .map(entry => `/life-os/${entry.slug}/`)
  .filter(route => !structuralSitemap.includes(`<loc>${base}${route}</loc>`));
if (structuralMissing.length) {
  const additions = structuralMissing.map(route => `  <url><loc>${base}${route}</loc></url>`).join("\n");
  structuralSitemap = structuralSitemap.replace("</urlset>", `${additions}\n</urlset>`);
  await writeFile(sitemapPath, structuralSitemap);
}
console.log(`Structural quality preflight: ${structuralMissing.length} review-gated entry route(s) temporarily restored before final trusted indexing is reapplied.`);

await import('./prepare-sitewide-quality-loop.mjs');
await import('./run-sitewide-quality-loop.mjs');
await import('./finalize-zone-quality-views.mjs');
await import('./apply-legacy-sensitive-zone-banners.mjs');
await import('./apply-indexing-policy.mjs');
await import('./finalize-sitewide-quality-trust.mjs');
await import('./check-growth-surfaces.mjs');
await import('./check-search-question-pages.mjs');
await import('./check-state-evidence-trends.mjs');
await import('./check-problem-collections.mjs');
await import('./check-evidence-ledger.mjs');
await import('./check-research-gaps.mjs');
await import('./check-zone-coverage-backlog.mjs');
await import('./check-legacy-sensitive-state.mjs');
await import('./check-sitewide-quality-loop.mjs');
await import('./check-outcome-loop-extensions.mjs');
await import('./check-skill-packs.mjs');
