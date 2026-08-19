import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

await import('./build-growth-surfaces.mjs');
await import('./build-state-evidence-trends.mjs');

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const sitemapPath = path.join(root, "sitemap.xml");
const growth = JSON.parse(await readFile(path.join(root, "data/growth-surfaces.json"), "utf8"));
const reportRoutes = (growth.reports ?? []).map(report => `/updates/${report.slug}/`);
const evidenceMonth = String(growth.updated_at).slice(0, 7);
const routes = [
  "/research/",
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
  "/updates/",
  "/state/",
  "/trends/evidence/",
  `/trends/evidence/${evidenceMonth}/`,
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

await import('./check-growth-surfaces.mjs');
await import('./check-state-evidence-trends.mjs');
