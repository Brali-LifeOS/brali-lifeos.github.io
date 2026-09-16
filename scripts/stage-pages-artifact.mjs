import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const destinationArg = process.argv[2];
if (!destinationArg) throw new Error("Usage: node scripts/stage-pages-artifact.mjs <destination>");
const destination = path.resolve(destinationArg);
if (destination === root || destination.startsWith(`${root}${path.sep}`)) {
  throw new Error("Pages staging destination must be outside the repository root.");
}

const SITE = "https://brali-lifeos.github.io";
const REPOSITORY_SOURCE_BASE = "https://github.com/Brali-LifeOS/brali-lifeos.github.io/blob/main";
const INTERNAL_TOP_LEVEL = new Set([
  ".git",
  ".github",
  ".arwp",
  "node_modules",
  "scripts",
  "data",
  "artifacts",
  "agent-skills",
  "mcp",
  "distribution",
  "reports",
  "qa",
  "source",
  "sources",
]);
// `docs/` is intentionally mixed: /docs/ is a public Getting Started page, while
// the repository Markdown/runbook material beside it is build-only source.
const PUBLIC_MIXED_TREE_FILES = new Set([
  "docs/index.html",
]);
const ROOT_SOURCE_FILES = new Set([
  ".gitignore",
  "AGENTS.md",
  "AGENT_LOOP.md",
  "CITATION.cff",
  "CONTENT_QUALITY.md",
  "CONTRIBUTING.md",
  "EDITORIAL_VOICE.md",
  "HACK_LIFECYCLE.md",
  "README.md",
  "package.json",
  "package-lock.json",
]);
const EXPLICIT_PUBLIC_NOINDEX_ROUTES = new Set([
  "/research/review-watchlist/",
]);

const slash = (value) => value.split(path.sep).join("/");
const rel = (file) => slash(path.relative(root, file));
const topLevel = (relativePath) => relativePath.split("/")[0];
const decode = (value = "") => String(value).replaceAll("&amp;", "&").trim();

function robots(html) {
  const tag = html.match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i)?.[0] || "";
  return decode(tag.match(/\bcontent=["']([^"']+)["']/i)?.[1] || "").toLowerCase();
}
function robotsDirectives(html) {
  return new Set(robots(html).split(/[\s,]+/u).filter(Boolean));
}
function isPublicNoindexFollow(html) {
  const directives = robotsDirectives(html);
  return directives.has("noindex")
    && directives.has("follow")
    && !directives.has("nofollow")
    && !directives.has("none");
}
function routeFromRelative(relativePath) {
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}
function relativeHtmlForPathname(pathname) {
  if (pathname === "/") return "index.html";
  const clean = pathname.replace(/^\/+/, "");
  return pathname.endsWith(".html") ? clean : `${clean.replace(/\/+$/, "")}/index.html`;
}
function isInternalPath(relativePath) {
  return INTERNAL_TOP_LEVEL.has(topLevel(relativePath));
}
function isBuildOnlySourcePath(relativePath) {
  if (!relativePath) return false;
  if (isInternalPath(relativePath)) return true;
  if (relativePath === "docs") return false; // allow cp() to traverse the mixed tree
  if (relativePath.startsWith("docs/") && !PUBLIC_MIXED_TREE_FILES.has(relativePath)) return true;
  return false;
}
function relativePathFromRootHref(href) {
  const pathname = href.split(/[?#]/u, 1)[0];
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  const clean = pathname.replace(/^\/+/, "");
  if (!clean) return "index.html";
  return clean.endsWith("/") ? `${clean}index.html` : clean;
}
function isBuildOnlySourceHref(href) {
  const relativePath = relativePathFromRootHref(href);
  return relativePath ? isBuildOnlySourcePath(relativePath) : false;
}
async function collectFiles(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(file, found);
    else if (entry.isFile()) found.push(file);
  }
  return found;
}

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
const publishedRoutes = new Set();
const publishedHtml = new Set();
for (const value of sitemapUrls) {
  const url = new URL(value);
  if (url.origin !== SITE) continue;
  const relativePath = relativeHtmlForPathname(url.pathname);
  if (isBuildOnlySourcePath(relativePath)) {
    throw new Error(`pages_stage: sitemap references build-only/internal HTML: ${relativePath}`);
  }
  publishedRoutes.add(url.pathname);
  publishedHtml.add(relativePath);
}

// A noindex page is retained only when it is a declared human route, not merely
// because it happens to live under a public-looking top-level directory. This
// keeps restricted/reference translations available to users while preventing
// QA reports or source fragments inside life-os/ru/de from surviving packaging.
const intentionalNoindexRoutes = new Set(EXPLICIT_PUBLIC_NOINDEX_ROUTES);
const cluster = JSON.parse(await readFile(path.join(root, "localization-cluster.json"), "utf8"));
for (const row of cluster.routes ?? []) {
  if (typeof row.canonical_path === "string" && row.canonical_path.startsWith("/")) {
    intentionalNoindexRoutes.add(row.canonical_path);
  }
  for (const href of Object.values(row.alternates ?? {})) {
    if (typeof href !== "string") continue;
    const url = new URL(href, SITE);
    if (url.origin === SITE) intentionalNoindexRoutes.add(url.pathname);
  }
}

const allFiles = await collectFiles(root);
const allowedHtml = new Set();
const prunedHtml = [];
for (const file of allFiles) {
  const relativePath = rel(file);
  if (!relativePath.endsWith(".html")) continue;
  const route = routeFromRelative(relativePath);
  if (isBuildOnlySourcePath(relativePath)) {
    prunedHtml.push({ path: relativePath, route, reason: "build-only/internal-html" });
    continue;
  }
  if (publishedHtml.has(relativePath) || relativePath === "404.html") {
    allowedHtml.add(relativePath);
    continue;
  }
  const html = await readFile(file, "utf8");
  if (intentionalNoindexRoutes.has(route)) {
    if (!isPublicNoindexFollow(html)) {
      throw new Error(`pages_stage: declared public noindex route must use exact noindex,follow policy: ${relativePath} (robots=${robots(html) || "missing"})`);
    }
    allowedHtml.add(relativePath);
    continue;
  }
  const directives = robotsDirectives(html);
  prunedHtml.push({
    path: relativePath,
    route,
    reason: directives.has("noindex") || directives.has("none")
      ? "undeclared-noindex-html"
      : "off-sitemap-html",
  });
}

function includeSource(source) {
  const relativePath = rel(source);
  if (!relativePath) return true;
  if (isBuildOnlySourcePath(relativePath)) return false;
  if (!relativePath.includes("/") && ROOT_SOURCE_FILES.has(relativePath)) return false;
  if (!relativePath.includes("/") && /^\..+\.json$/i.test(relativePath)) return false;
  if (relativePath.endsWith(".html") && !allowedHtml.has(relativePath)) return false;
  return true;
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(root, destination, { recursive: true, filter: includeSource, preserveTimestamps: true });

for (const expected of publishedHtml) {
  try {
    await access(path.join(destination, expected));
  } catch {
    throw new Error(`pages_stage: sitemap HTML missing from staged artifact: ${expected}`);
  }
}
for (const forbidden of INTERNAL_TOP_LEVEL) {
  try {
    await access(path.join(destination, forbidden));
    throw new Error(`pages_stage: internal source tree leaked into artifact: ${forbidden}/`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
for (const sourceFile of ROOT_SOURCE_FILES) {
  try {
    await access(path.join(destination, sourceFile));
    throw new Error(`pages_stage: root source file leaked into artifact: ${sourceFile}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

let stagedFiles = await collectFiles(destination);
let sourceLinkRewrites = 0;
for (const file of stagedFiles) {
  if (!file.endsWith(".html")) continue;
  const html = await readFile(file, "utf8");
  const rewritten = html.replace(/\bhref=(["'])(\/(?!\/)[^"']+)\1/gi, (whole, quote, href) => {
    if (!isBuildOnlySourceHref(href)) return whole;
    const [pathname, suffix = ""] = href.split(/(?=[?#])/u, 2);
    const relativePath = pathname.replace(/^\//, "");
    sourceLinkRewrites += 1;
    return `href=${quote}${REPOSITORY_SOURCE_BASE}/${relativePath}${suffix}${quote}`;
  });
  if (rewritten !== html) await writeFile(file, rewritten);
}

stagedFiles = await collectFiles(destination);
const stagedRelative = new Set(stagedFiles.map((file) => slash(path.relative(destination, file))));
for (const relativePath of stagedRelative) {
  if (relativePath.startsWith("docs/") && !PUBLIC_MIXED_TREE_FILES.has(relativePath)) {
    throw new Error(`pages_stage: build-only docs source leaked into artifact: ${relativePath}`);
  }
}
let stagedHtmlCount = 0;
const dependencyExtensions = /\.(?:css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|json|webmanifest|woff2?|ttf)(?:$|[?#])/i;
for (const file of stagedFiles) {
  const relativePath = slash(path.relative(destination, file));
  if (!relativePath.endsWith(".html")) continue;
  if (isBuildOnlySourcePath(relativePath)) {
    throw new Error(`pages_stage: build-only/internal HTML survived staging: ${relativePath}`);
  }
  stagedHtmlCount += 1;
  const html = await readFile(file, "utf8");
  const route = routeFromRelative(relativePath);
  if (!publishedRoutes.has(route) && relativePath !== "404.html") {
    if (!isPublicNoindexFollow(html)) {
      throw new Error(`pages_stage: staged off-sitemap public HTML must use noindex,follow: ${relativePath}`);
    }
    if (!intentionalNoindexRoutes.has(route)) {
      throw new Error(`pages_stage: undeclared noindex HTML survived staging: ${relativePath}`);
    }
  }
  for (const match of html.matchAll(/\bhref=["']([^"']+)["']/gi)) {
    const href = decode(match[1]);
    if (isBuildOnlySourceHref(href)) {
      throw new Error(`pages_stage: ${relativePath} still references an omitted build-only source: ${href}`);
    }
  }
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const ref = decode(match[1]);
    if (!ref.startsWith("/") || ref.startsWith("//") || !dependencyExtensions.test(ref)) continue;
    const clean = ref.slice(1).split(/[?#]/, 1)[0];
    if (!clean || stagedRelative.has(clean)) continue;
    throw new Error(`pages_stage: ${relativePath} references missing local dependency ${ref}`);
  }
}

const optimizedManifest = "assets/images/optimized/manifest.json";
if (!stagedRelative.has(optimizedManifest)) throw new Error(`pages_stage: missing ${optimizedManifest}`);
const manifest = JSON.parse(await readFile(path.join(destination, optimizedManifest), "utf8"));
if (!(manifest.webp_ratio > 0 && manifest.webp_ratio < 0.5) || !(manifest.avif_ratio > 0 && manifest.avif_ratio < 0.5)) {
  throw new Error("pages_stage: optimized homepage image manifest failed compression contract");
}

let bytes = 0;
for (const file of stagedFiles) bytes += (await stat(file)).size;
console.log(`Pages artifact staged: ${stagedFiles.length} files; ${stagedHtmlCount} HTML; ${(bytes / 1024 / 1024).toFixed(2)} MiB; ${prunedHtml.length} off-sitemap/build-only HTML file(s) physically omitted; ${intentionalNoindexRoutes.size} declared human/noindex,follow route(s) allowlisted; ${sourceLinkRewrites} build-only source link(s) rewritten to GitHub.`);
for (const item of prunedHtml) console.log(`- pruned ${item.path} -> ${item.route} (${item.reason})`);
