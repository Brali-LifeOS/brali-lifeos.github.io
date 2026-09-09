import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const license = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const index = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((record) => [record.slug, record]));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(root, "robots.txt"), "utf8");
const skillPackHtml = await readFile(path.join(root, "skill-packs/index.html"), "utf8");
const skillPackApp = await readFile(path.join(root, "skill-packs/app.js"), "utf8");
let invalid = 0;
let representative = 0;
let skillAvailable = 0;
let reviewGated = 0;

const metaContent = (html, name, attribute = "name") => html.match(new RegExp(`<meta\\b[^>]*\\b${attribute}=["']${name}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`, "i"))?.[1] ?? null;
const imageUrl = (value) => typeof value === "string" ? value : value?.url ?? value?.contentUrl ?? null;
const isRepresentative = (url) => Boolean(url) && !/\/brali-logo\.png(?:[?#]|$)/i.test(url);
const isTrusted = (record) => record?.indexable === true && ["reviewed", "practical"].includes(record?.status);

if (!/User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots)) invalid += 1;
if (!/User-agent:\s*GPTBot[\s\S]*?(?:Allow|Disallow):\s*\//i.test(robots)) invalid += 1;

const homepage = await readFile(path.join(root, "index.html"), "utf8");
if (!homepage.includes('data-brali-growth-identity="true"')) invalid += 1;
if (!/max-image-preview:large/i.test(homepage)) invalid += 1;

const updates = await readFile(path.join(root, "updates/index.html"), "utf8");
if (!updates.includes('data-brali-preferred-source="true"')) invalid += 1;
if (!updates.includes("google.com/preferences/source?q=brali-lifeos.github.io")) invalid += 1;

// Validate capabilities/contract markers rather than exact presentation casing.
// Copy changes such as “portable” vs “Portable” must not break a semantic gate.
const skillPageRequirements = [
  '<link rel="canonical" href="https://brali-lifeos.github.io/skill-packs/">',
  '/life-os/datasets/protocols.json',
  'SKILL.md',
  'reviewed',
  'practical',
  'not a ranking shortcut',
];
if (skillPageRequirements.some((marker) => !skillPackHtml.includes(marker))) invalid += 1;
try { new Function(skillPackApp); } catch { invalid += 1; }
if (!skillPackApp.includes('trustedStates = new Set(["reviewed", "practical"])')) invalid += 1;
if (!skillPackApp.includes("Brali does not package review-gated records as skills")) invalid += 1;
if (!sitemap.includes(`<loc>${base}/skill-packs/</loc>`)) invalid += 1;

for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  const html = await readFile(pagePath, "utf8");
  const pathname = `/life-os/${entry.slug}/`;
  const ogImage = metaContent(html, "og:image", "property");
  const evidenceRecord = evidenceBySlug.get(entry.slug);
  const trusted = isTrusted(evidenceRecord);
  const inSitemap = sitemap.includes(`<loc>${base}${pathname}</loc>`);
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  const required = [
    'data-agent-reuse="true"',
    'data-agent-reuse-license="CC-BY-NC-SA-4.0"',
    `href="${pathname}index.json"`,
    'href="/cite/"',
    '<meta property="og:site_name" content="Brali">',
    `<link rel="license" href="${license}">`,
  ];
  if (required.some((marker) => !html.includes(marker))) invalid += 1;
  if ((html.match(/data-agent-reuse="true"/g) ?? []).length !== 1) invalid += 1;
  if (html.lastIndexOf('data-agent-reuse="true"') < html.lastIndexOf('data-related-protocols="true"')) invalid += 1;

  if (trusted) {
    skillAvailable += 1;
    if (!html.includes('data-agent-skill="available"')) invalid += 1;
    if (!html.includes(`href="/skill-packs/?hack=${entry.slug}"`)) invalid += 1;
    if (!html.includes('href="/for-ai/integrations/"')) invalid += 1;
    if (noindex || !inSitemap || !/max-image-preview:large/i.test(html)) invalid += 1;
  } else {
    reviewGated += 1;
    if (!html.includes('data-agent-skill="review-gated"')) invalid += 1;
    if (html.includes(`href="/skill-packs/?hack=${entry.slug}"`)) invalid += 1;
    if (!noindex || inSitemap) invalid += 1;
  }

  const schemaMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  try {
    const schema = JSON.parse(schemaMatch?.[1] ?? "null");
    const graph = schema?.["@graph"] ?? [];
    const article = graph.find((node) => node?.["@type"] === "Article");
    const webPage = graph.find((node) => node?.["@type"] === "WebPage");
    if (article?.license !== license || article?.usageInfo !== `${base}/terms/` || article?.isAccessibleForFree !== true) invalid += 1;
    if (article?.encoding?.contentUrl !== `${base}${pathname}index.json`) invalid += 1;
    if (webPage?.license !== license || webPage?.mainEntity?.["@id"] !== article?.["@id"]) invalid += 1;
    const actionTarget = article?.potentialAction?.target;
    if (trusted && actionTarget !== `${base}/skill-packs/?hack=${encodeURIComponent(entry.slug)}`) invalid += 1;
    if (!trusted && actionTarget) invalid += 1;
    if (isRepresentative(ogImage)) {
      representative += 1;
      if (metaContent(html, "twitter:card") !== "summary_large_image") invalid += 1;
      if (metaContent(html, "twitter:image") !== ogImage) invalid += 1;
      if (imageUrl(article?.image) !== ogImage) invalid += 1;
      if (imageUrl(webPage?.primaryImageOfPage) !== ogImage) invalid += 1;
    }
  } catch {
    invalid += 1;
  }
}

if (!representative || !skillAvailable || !reviewGated) invalid += 1;
if (invalid) throw new Error(`Hack discovery validation failed with ${invalid} contract violation(s).`);
console.log(`Hack discovery verified for ${index.length} pages: ${skillAvailable} trusted skill-enabled, ${reviewGated} review-gated; ${representative} expose representative large-image metadata.`);