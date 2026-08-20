import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

await import('./build-growth-surfaces.mjs');
await import('./build-state-evidence-trends.mjs');
await import('./build-problem-collections.mjs');
await import('./build-evidence-ledger.mjs');
await import('./build-research-gaps.mjs');
await import('./sync-research-gap-manifest.mjs');
await import('./build-zone-coverage-backlog.mjs');
await import('./sync-zone-coverage-backlog-manifest.mjs');

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const sitemapPath = path.join(root, "sitemap.xml");
const growth = JSON.parse(await readFile(path.join(root, "data/growth-surfaces.json"), "utf8"));
const problems = JSON.parse(await readFile(path.join(root, "data/problem-collections.json"), "utf8"));
const decisions = JSON.parse(await readFile(path.join(root, "data/evidence-decisions.json"), "utf8"));
const researchGaps = JSON.parse(await readFile(path.join(root, "data/research-gap-questions.json"), "utf8"));
const reportRoutes = (growth.reports ?? []).map(report => `/updates/${report.slug}/`);
const problemRoutes = (problems.collections ?? []).map(collection => `/problems/${collection.slug}/`);
const decisionRoutes = (decisions.entries ?? []).map(decision => `/evidence/${decision.id}/`);
const researchGapRoutes = (researchGaps.items ?? []).map(item => `/research/gaps/${item.topic_id}/`);
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
  "/cite/",
  "/agents/",
  "/faq/",
  "/partners/",
  "/terms/",
  "/questions/",
  "/problems/",
  "/evidence/",
  "/updates/",
  "/state/",
  "/state/quality/",
  "/trends/evidence/",
  `/trends/evidence/${evidenceMonth}/`,
  ...researchGapRoutes,
  ...problemRoutes,
  ...decisionRoutes,
  ...reportRoutes
];

let xml = await readFile(sitemapPath, "utf8");
const missing = routes.filter(route => !xml.includes(`<loc>${base}${route}</loc>`));
if (missing.length) {
  const additions = missing.map(route => `  <url><loc>${base}${route}</loc></url>`).join("\n");
  xml = xml.replace("</urlset>", `${additions}\n</urlset>`);
  await writeFile(sitemapPath, xml);
}

console.log(`Sitemap static routes: ${routes.length - missing.length} already present, ${missing.length} added.`);

await import('./run-sitewide-quality-loop.mjs');
await import('./finalize-zone-quality-views.mjs');
await import('./check-growth-surfaces.mjs');
await import('./check-state-evidence-trends.mjs');
await import('./check-problem-collections.mjs');
await import('./check-evidence-ledger.mjs');
await import('./check-research-gaps.mjs');
await import('./check-zone-coverage-backlog.mjs');
await import('./check-sitewide-quality-loop.mjs');
