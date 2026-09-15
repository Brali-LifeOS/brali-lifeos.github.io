import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const site = "https://brali-lifeos.github.io";
const asOf = process.env.BRALI_AS_OF || new Date().toISOString().slice(0, 10);
const sitemapPath = path.join(root, "sitemap.xml");
const llmsPath = path.join(root, "llms.txt");
const markerStart = "<!-- brali-hack-lifecycle-discovery:start -->";
const markerEnd = "<!-- brali-hack-lifecycle-discovery:end -->";

const indexablePages = [
  { path: "/life-os/review-log/", file: path.join(root, "life-os", "review-log", "index.html") },
  { path: "/sponsorship/", file: path.join(root, "sponsorship", "index.html") },
  { path: "/ru/life-os/review-log/", file: path.join(root, "ru", "life-os", "review-log", "index.html") },
  { path: "/ru/sponsorship/", file: path.join(root, "ru", "sponsorship", "index.html") },
];
const watchlistPage = {
  path: "/research/review-watchlist/",
  file: path.join(root, "research", "review-watchlist", "index.html"),
};
const watchlistDataset = path.join(root, "life-os", "datasets", "research-lifecycle-watchlist.json");

function canonical(html) {
  const tag = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0] || "";
  return tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
}
function isNoindex(html) {
  return /name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html) || /content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html);
}

for (const page of indexablePages) {
  if (!fs.existsSync(page.file)) throw new Error(`Lifecycle discovery surface missing: ${page.file}`);
  const html = fs.readFileSync(page.file, "utf8");
  const expected = `${site}${page.path}`;
  if (canonical(html) !== expected) throw new Error(`Lifecycle discovery canonical mismatch for ${page.path}: ${canonical(html) || "missing"}`);
  if (isNoindex(html)) throw new Error(`Lifecycle discovery surface is noindex: ${page.path}`);
}

if (!fs.existsSync(watchlistPage.file)) throw new Error(`Research lifecycle watchlist page missing: ${watchlistPage.file}`);
const watchlistHtml = fs.readFileSync(watchlistPage.file, "utf8");
if (canonical(watchlistHtml) !== `${site}${watchlistPage.path}`) throw new Error(`Research lifecycle watchlist canonical mismatch: ${canonical(watchlistHtml) || "missing"}`);
if (!isNoindex(watchlistHtml)) throw new Error("Research lifecycle watchlist must remain noindex,follow because metadata discovery is not reviewed evidence");
if (!watchlistHtml.includes("Metadata is not a verdict")) throw new Error("Research lifecycle watchlist is missing its visible discovery/evidence boundary");
if (!fs.existsSync(watchlistDataset) || !fs.statSync(watchlistDataset).size) throw new Error("Research lifecycle watchlist dataset is missing");

let sitemap = fs.readFileSync(sitemapPath, "utf8");
if (!/<\/urlset>\s*$/i.test(sitemap)) throw new Error("sitemap.xml is not a supported urlset document");
let sitemapAdded = 0;
for (const page of indexablePages) {
  const loc = `${site}${page.path}`;
  if (sitemap.includes(`<loc>${loc}</loc>`)) continue;
  const block = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${asOf}</lastmod>\n  </url>\n`;
  sitemap = sitemap.replace(/<\/urlset>\s*$/i, `${block}</urlset>\n`);
  sitemapAdded += 1;
}
if (sitemap.includes(`<loc>${site}${watchlistPage.path}</loc>`)) {
  throw new Error("Noindex research lifecycle watchlist must not enter the canonical sitemap");
}
fs.writeFileSync(sitemapPath, sitemap);

const section = `${markerStart}\n## Hack lifecycle, research triage, localization and commercial independence\n\n- Human review ledger: ${site}/life-os/review-log/\n- Machine-readable lifecycle and linked reviewed Evidence Decisions: ${site}/life-os/datasets/reviews.json\n- Discovery-only research review watchlist (noindex): ${site}/research/review-watchlist/\n- Machine-readable research watchlist: ${site}/life-os/datasets/research-lifecycle-watchlist.json\n- Sponsorship and commercial-independence policy: ${site}/sponsorship/\n- Russian review ledger: ${site}/ru/life-os/review-log/\n- Russian commercial-independence policy: ${site}/ru/sponsorship/\n\nTreat lifecycle status as maintenance metadata layered on top of Brali's evidence state. Reviewed Evidence Decisions may be linked to a hack for provenance, but only an explicit append-only lifecycle event may materially change lifecycle status. Research Scout and provider metadata can create a review task, never an evidence verdict; the watchlist is intentionally noindex. A challenge, refutation, restoration or retirement stays in history rather than being silently overwritten. Implementation observations may trigger review but cannot change an evidence conclusion by themselves. Sponsorship must not change evidence, lifecycle status, retrieval, ranking, Agent Skill eligibility or review outcomes.\n${markerEnd}`;
let llms = fs.readFileSync(llmsPath, "utf8");
const existing = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g");
llms = existing.test(llms) ? llms.replace(existing, section) : `${llms.trimEnd()}\n\n${section}\n`;
fs.writeFileSync(llmsPath, llms);

console.log(`Hack lifecycle discovery finalized: sitemap_added=${sitemapAdded}, llms_surface=present, indexable_pages=${indexablePages.length}, watchlist_noindex=true.`);
