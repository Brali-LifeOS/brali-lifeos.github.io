import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const site = "https://brali-lifeos.github.io";
const asOf = process.env.BRALI_AS_OF || new Date().toISOString().slice(0, 10);
const sitemapPath = path.join(root, "sitemap.xml");
const llmsPath = path.join(root, "llms.txt");
const markerStart = "<!-- brali-hack-lifecycle-discovery:start -->";
const markerEnd = "<!-- brali-hack-lifecycle-discovery:end -->";

const pages = [
  {
    path: "/life-os/review-log/",
    file: path.join(root, "life-os", "review-log", "index.html"),
  },
  {
    path: "/sponsorship/",
    file: path.join(root, "sponsorship", "index.html"),
  },
];

function canonical(html) {
  const tag = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0] || "";
  return tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
}

for (const page of pages) {
  if (!fs.existsSync(page.file)) throw new Error(`Lifecycle discovery surface missing: ${page.file}`);
  const html = fs.readFileSync(page.file, "utf8");
  const expected = `${site}${page.path}`;
  if (canonical(html) !== expected) throw new Error(`Lifecycle discovery canonical mismatch for ${page.path}: ${canonical(html) || "missing"}`);
  if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html) || /content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html)) {
    throw new Error(`Lifecycle discovery surface is noindex: ${page.path}`);
  }
}

let sitemap = fs.readFileSync(sitemapPath, "utf8");
if (!/<\/urlset>\s*$/i.test(sitemap)) throw new Error("sitemap.xml is not a supported urlset document");
let sitemapAdded = 0;
for (const page of pages) {
  const loc = `${site}${page.path}`;
  if (sitemap.includes(`<loc>${loc}</loc>`)) continue;
  const block = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${asOf}</lastmod>\n  </url>\n`;
  sitemap = sitemap.replace(/<\/urlset>\s*$/i, `${block}</urlset>\n`);
  sitemapAdded += 1;
}
fs.writeFileSync(sitemapPath, sitemap);

const section = `${markerStart}\n## Hack lifecycle, corrections and commercial independence\n\n- Human review ledger: ${site}/life-os/review-log/\n- Machine-readable lifecycle and review history: ${site}/life-os/datasets/reviews.json\n- Sponsorship and commercial-independence policy: ${site}/sponsorship/\n\nTreat the lifecycle status as maintenance metadata layered on top of Brali's evidence state. A lifecycle challenge, refutation, restoration or retirement is preserved as history rather than silently overwritten. Implementation observations may trigger review but cannot change an evidence conclusion by themselves. Sponsorship must not change evidence, lifecycle status, retrieval, ranking, Agent Skill eligibility or review outcomes.\n${markerEnd}`;
let llms = fs.readFileSync(llmsPath, "utf8");
const existing = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g");
llms = existing.test(llms) ? llms.replace(existing, section) : `${llms.trimEnd()}\n\n${section}\n`;
fs.writeFileSync(llmsPath, llms);

console.log(`Hack lifecycle discovery finalized: sitemap_added=${sitemapAdded}, llms_surface=present, pages=${pages.length}.`);
