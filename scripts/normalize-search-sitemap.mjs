import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

console.log(`Final sitemap normalized: kept ${kept.length}; removed ${removed.length}.`);
for (const item of removed.slice(0, 30)) console.log(`- ${item.loc} (${item.reason})`);
if (removed.length > 30) console.log(`- ... ${removed.length - 30} more removed entries`);
