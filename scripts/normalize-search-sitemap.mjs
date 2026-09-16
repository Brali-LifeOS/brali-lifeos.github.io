import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const SITE = "https://brali-lifeos.github.io";
const sitemapPath = join(root, "sitemap.xml");
const sitemap = await readFile(sitemapPath, "utf8");
const blocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => `<url>${match[1]}</url>`);

function decode(value = "") {
  return String(value).replaceAll("&amp;", "&").trim();
}
function canonical(html) {
  const tag = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0] || "";
  return decode(tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || "");
}
function robots(html) {
  const tag = html.match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i)?.[0] || "";
  return decode(tag.match(/\bcontent=["']([^"']+)["']/i)?.[1] || "").toLowerCase();
}
function htmlPath(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== SITE) return null;
  if (url.pathname === "/") return join(root, "index.html");
  if (url.pathname.endsWith(".html")) return join(root, url.pathname.slice(1));
  return join(root, url.pathname.slice(1), "index.html");
}
function routeFromFile(file) {
  const rel = relative(root, file).split(sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"index.html".length)}`;
  return `/${rel}`;
}
function setNoindex(html) {
  const pattern = /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i;
  const existing = pattern.test(html) ? robots(html).split(",").map((item) => item.trim()).filter(Boolean) : [];
  const directives = existing.filter((item) => !/^(?:index|all|none|noindex|follow|nofollow)$/i.test(item));
  directives.unshift("noindex", "follow");
  const replacement = `<meta name="robots" content="${[...new Set(directives)].join(", ")}">`;
  if (pattern.test(html)) return html.replace(pattern, replacement);
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${replacement}</head>`);
  throw new Error("Cannot apply noindex to HTML without a closing head tag");
}
async function collectHtml(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await collectHtml(file, found);
    else if (entry.isFile() && entry.name.endsWith(".html")) found.push(file);
  }
  return found;
}

const kept = [];
const removed = [];
for (const block of blocks) {
  const loc = decode(block.match(/<loc>([^<]+)<\/loc>/)?.[1] || "");
  if (!loc) continue;
  const file = htmlPath(loc);
  if (!file) {
    removed.push({ loc, reason: "wrong-host" });
    continue;
  }
  let html;
  try {
    html = await readFile(file, "utf8");
  } catch {
    kept.push(block);
    continue;
  }
  const pageRobots = robots(html);
  const pageCanonical = canonical(html);
  if (/\b(?:noindex|none)\b/.test(pageRobots)) {
    removed.push({ loc, reason: "noindex" });
    continue;
  }
  if (pageCanonical && pageCanonical !== loc) {
    removed.push({ loc, reason: `alias->${pageCanonical}` });
    continue;
  }
  kept.push(block);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${kept.map((block) => `  ${block}`).join("\n")}\n</urlset>\n`;
await writeFile(sitemapPath, xml);

// The normalized root sitemap is the authoritative public search inventory.
// Any other shipped HTML must explicitly opt out, so QA fragments, aliases and
// secondary artifacts cannot become accidental search results merely because
// GitHub Pages serves the repository tree.
const publishedPaths = new Set(kept.map((block) => new URL(decode(block.match(/<loc>([^<]+)<\/loc>/)?.[1] || "")).pathname));
let noindexApplied = 0;
for (const file of await collectHtml(root)) {
  const route = routeFromFile(file);
  if (publishedPaths.has(route)) continue;
  const html = await readFile(file, "utf8");
  if (/\b(?:noindex|none)\b/.test(robots(html))) continue;
  await writeFile(file, setNoindex(html));
  noindexApplied += 1;
}

console.log(`Final sitemap normalized: kept ${kept.length}; removed ${removed.length}; applied noindex to ${noindexApplied} off-sitemap HTML file(s).`);
for (const item of removed.slice(0, 30)) console.log(`- ${item.loc} (${item.reason})`);
if (removed.length > 30) console.log(`- ... ${removed.length - 30} more removed entries`);

// The normalized root sitemap is the final search publication set. Re-derive and
// validate the multilingual graph from that exact state before later release
// enrichment can be uploaded.
await import("./build-indexability-registry.mjs");
await import("./check-indexability-contract.mjs");
