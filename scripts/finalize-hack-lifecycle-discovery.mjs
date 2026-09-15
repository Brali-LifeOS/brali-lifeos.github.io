import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const site = "https://brali-lifeos.github.io";
const sitemapPath = path.join(root, "sitemap.xml");
const llmsPath = path.join(root, "llms.txt");
const markerStart = "<!-- brali-hack-lifecycle-discovery:start -->";
const markerEnd = "<!-- brali-hack-lifecycle-discovery:end -->";
const generalDiscoveryStart = "<!-- brali-general-discovery:start -->";
const generalDiscoveryEnd = "<!-- brali-general-discovery:end -->";
const libraryDiscoveryStart = "<!-- brali-library-discovery:start -->";
const libraryDiscoveryEnd = "<!-- brali-library-discovery:end -->";

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
function routeFile(href) {
  const pathname = String(href).split(/[?#]/, 1)[0];
  if (!pathname.startsWith("/")) return null;
  if (pathname === "/") return path.join(root, "index.html");
  if (/\.[a-z0-9]+$/i.test(pathname)) return path.join(root, pathname.slice(1));
  return path.join(root, pathname.slice(1), "index.html");
}
function upsertBeforeMainEnd(rel, start, end, block) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`Discovery host missing: ${rel}`);
  let html = fs.readFileSync(file, "utf8");
  const existing = new RegExp(`${start}[\\s\\S]*?${end}`, "g");
  const section = `${start}${block}${end}`;
  html = existing.test(html) ? html.replace(existing, section) : html.replace("</main>", `${section}</main>`);
  fs.writeFileSync(file, html);
}
function walkHtml(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}
function demoteBrokenGeneratedBreadcrumbs() {
  let demoted = 0;
  for (const file of walkHtml(root)) {
    let html = fs.readFileSync(file, "utf8");
    const next = html.replace(/<nav\b[^>]*class=["'][^"']*breadcrumbs?[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi, breadcrumb => breadcrumb.replace(/<a\b([^>]*?)href=["'](\/[^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi, (match, before, href, after, label) => {
      const target = routeFile(href);
      if (!target || fs.existsSync(target)) return match;
      demoted += 1;
      return `<span data-brali-missing-parent>${label}</span>`;
    }));
    if (next !== html) fs.writeFileSync(file, next);
  }
  return demoted;
}
function ensureMcpAnchor() {
  const file = path.join(root, "for-ai", "integrations", "index.html");
  if (!fs.existsSync(file)) throw new Error("AI integrations page missing");
  let html = fs.readFileSync(file, "utf8");
  if (!/\bid=["']mcp["']/.test(html)) {
    html = html.replace('<div class="callout"><strong>MCP deployment:</strong>', '<div id="mcp" class="callout"><strong>MCP deployment:</strong>');
  }
  if (!/\bid=["']mcp["']/.test(html)) throw new Error("Could not materialize #mcp anchor on AI integrations page");
  fs.writeFileSync(file, html);
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
  // No lastmod is emitted here. These pages aggregate multiple governed sources
  // and the build date is not a truthful content-modification date.
  const block = `  <url>\n    <loc>${loc}</loc>\n  </url>\n`;
  sitemap = sitemap.replace(/<\/urlset>\s*$/i, `${block}</urlset>\n`);
  sitemapAdded += 1;
}
if (sitemap.includes(`<loc>${site}${watchlistPage.path}</loc>`)) throw new Error("Noindex research lifecycle watchlist must not enter the canonical sitemap");
fs.writeFileSync(sitemapPath, sitemap);

upsertBeforeMainEnd(
  "index.html",
  generalDiscoveryStart,
  generalDiscoveryEnd,
  `<section class="prose" data-brali-general-discovery><h2>Understand Brali before you go deeper</h2><p><a href="/how-it-works/">How Brali works</a> · <a href="/features/">Features</a> · <a href="/docs/">Getting started</a> · <a href="/faq/">FAQ</a> · <a href="/download/">Download</a> · <a href="/screenshots/">Product assets</a></p></section>`
);
upsertBeforeMainEnd(
  path.join("life-os", "index.html"),
  libraryDiscoveryStart,
  libraryDiscoveryEnd,
  `<section class="prose" data-brali-library-discovery><h2>Understand the library</h2><p><a href="/life-os/about/">About the Growth Library</a> · <a href="/life-os/catalog/">Catalog</a> · <a href="/life-os/category/">Categories</a> · <a href="/life-os/metrics/">Metrics</a> · <a href="/life-os/taxonomy/">Taxonomy</a> · <a href="/life-os/flagships/curated-100/">Curated 100</a></p></section>`
);
ensureMcpAnchor();
const demotedBreadcrumbs = demoteBrokenGeneratedBreadcrumbs();

const section = `${markerStart}\n## Hack lifecycle, research triage, localization and commercial independence\n\n- Human review ledger: ${site}/life-os/review-log/\n- Machine-readable lifecycle and linked reviewed Evidence Decisions: ${site}/life-os/datasets/reviews.json\n- Discovery-only research review watchlist (noindex): ${site}/research/review-watchlist/\n- Machine-readable research watchlist: ${site}/life-os/datasets/research-lifecycle-watchlist.json\n- Sponsorship and commercial-independence policy: ${site}/sponsorship/\n- Russian review ledger: ${site}/ru/life-os/review-log/\n- Russian commercial-independence policy: ${site}/ru/sponsorship/\n\nTreat lifecycle status as maintenance metadata layered on top of Brali's evidence state. Reviewed Evidence Decisions may be linked to a hack for provenance, but only an explicit append-only lifecycle event may materially change lifecycle status. Research Scout and provider metadata can create a review task, never an evidence verdict; the watchlist is intentionally noindex. A challenge, refutation, restoration or retirement stays in history rather than being silently overwritten. Implementation observations may trigger review but cannot change an evidence conclusion by themselves. Sponsorship must not change evidence, lifecycle status, retrieval, ranking, Agent Skill eligibility or review outcomes.\n${markerEnd}`;
let llms = fs.readFileSync(llmsPath, "utf8");
const existing = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g");
llms = existing.test(llms) ? llms.replace(existing, section) : `${llms.trimEnd()}\n\n${section}\n`;
fs.writeFileSync(llmsPath, llms);

console.log(`Hack lifecycle discovery finalized: sitemap_added=${sitemapAdded}, llms_surface=present, indexable_pages=${indexablePages.length}, watchlist_noindex=true, truthful_lastmod=omitted, breadcrumb_links_demoted=${demotedBreadcrumbs}, general_discovery=present, library_discovery=present, mcp_anchor=present.`);
