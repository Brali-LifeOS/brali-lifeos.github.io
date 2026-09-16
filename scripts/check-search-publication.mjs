import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const site = "https://brali-lifeos.github.io";
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
const failures = [];
const warnings = [];
const indexable = new Set(urls);
const intendedNonPublic = ["reports/", "life-os/taxonomy/status/", "life-os/taxonomy/seo/", "life-os/taxonomy/mini-app/"];

const decode = (value = "") => String(value).replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").trim();
function htmlPath(urlValue) {
  const url = new URL(urlValue);
  if (url.origin !== site) return null;
  if (url.pathname === "/") return path.join(root, "index.html");
  if (url.pathname.endsWith(".html")) return path.join(root, url.pathname.slice(1));
  return path.join(root, url.pathname.slice(1), "index.html");
}
function attrValue(tag = "", name = "") {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return decode(match?.[2] || "");
}
function canonical(html) {
  const tag = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0] || "";
  return attrValue(tag, "href");
}
function metaContent(html, key, value) {
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*\\b${key}=["']${value}["'])[^>]*>`, "i"))?.[0] || "";
  return attrValue(tag, "content");
}
function malformedTitle(title) {
  const value = decode(title).replace(/\s+/g, " ");
  const pairs = [["(", ")"], ["[", "]"], ["{", "}"]];
  if (pairs.some(([a,b]) => value.split(a).length !== value.split(b).length)) return "unbalanced-delimiter";
  if (/\((?:e|i|ex|e\.g\.?)?\s*(?:[—|]\s+Brali(?: LifeOS)?)?$/i.test(value)) return "truncated-parenthetical";
  return null;
}
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

for (const url of urls) {
  const file = htmlPath(url);
  if (!file) { failures.push(`${url}: wrong host`); continue; }
  let html;
  try { html = await readFile(file, "utf8"); } catch { failures.push(`${url}: missing HTML`); continue; }
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = metaContent(html, "name", "description");
  const robots = metaContent(html, "name", "robots").toLowerCase();
  const pageCanonical = canonical(html);
  // npm run check executes before the final sitemap-normalization step. Legacy aliases
  // and deliberate noindex transition rows can still be present at this stage; the
  // exact final artifact is gated later by check-search-release/indexability.
  if (pageCanonical !== url || /\bnoindex\b/.test(robots)) continue;
  if (!title) failures.push(`${url}: missing title`);
  if (!description) failures.push(`${url}: missing meta description`);
  const malformed = malformedTitle(title);
  if (malformed) failures.push(`${url}: malformed title (${malformed}) -> ${title}`);
  if (!metaContent(html, "name", "twitter:card")) failures.push(`${url}: missing twitter:card`);
  if (!metaContent(html, "name", "twitter:title")) failures.push(`${url}: missing twitter:title`);
  if (!metaContent(html, "name", "twitter:description")) failures.push(`${url}: missing twitter:description`);
  if (title.length > 90) warnings.push(`${url}: long title (${title.length})`);
  if (description.length > 200) warnings.push(`${url}: long description (${description.length})`);
}

for (const file of await walk(root)) {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const html = await readFile(file, "utf8");
  if (!/<html\b/i.test(html) || !/<head\b/i.test(html)) continue;
  const pageCanonical = canonical(html);
  if (!pageCanonical || indexable.has(pageCanonical)) continue;
  const robots = metaContent(html, "name", "robots").toLowerCase();
  if (intendedNonPublic.some((prefix) => rel.startsWith(prefix))) {
    if (!/\bnoindex\b/.test(robots)) failures.push(`${rel}: non-public HTML lacks noindex`);
    continue;
  }
  if (!/\bnoindex\b/.test(robots)) failures.push(`${rel}: self-canonical HTML is neither in sitemap nor noindex (${pageCanonical})`);
}

if (failures.length) {
  console.error(`Search publication check failed with ${failures.length} issue(s):`);
  for (const failure of failures.slice(0, 100)) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Search publication verified: ${urls.length} sitemap URL(s), complete title/description/canonical/Twitter metadata, no malformed titles, and explicit noindex for non-public full HTML. Advisory length warnings: ${warnings.length}.`);
