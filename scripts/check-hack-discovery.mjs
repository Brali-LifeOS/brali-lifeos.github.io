import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const license = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const index = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(root, "robots.txt"), "utf8");
let invalid = 0;
let representative = 0;

const metaContent = (html, name, attribute = "name") => html.match(new RegExp(`<meta\\b[^>]*\\b${attribute}=["']${name}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`, "i"))?.[1] ?? null;
const imageUrl = (value) => typeof value === "string" ? value : value?.url ?? value?.contentUrl ?? null;
const isRepresentative = (url) => Boolean(url) && !/\/brali-logo\.png(?:[?#]|$)/i.test(url);

if (!/User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots)) invalid += 1;
if (!/User-agent:\s*GPTBot[\s\S]*?(?:Allow|Disallow):\s*\//i.test(robots)) invalid += 1;

const homepage = await readFile(path.join(root, "index.html"), "utf8");
if (!homepage.includes('data-brali-growth-identity="true"')) invalid += 1;
if (!/max-image-preview:large/i.test(homepage)) invalid += 1;

const updates = await readFile(path.join(root, "updates/index.html"), "utf8");
if (!updates.includes('data-brali-preferred-source="true"')) invalid += 1;
if (!updates.includes("google.com/preferences/source?q=brali-lifeos.github.io")) invalid += 1;

for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  const html = await readFile(pagePath, "utf8");
  const pathname = `/life-os/${entry.slug}/`;
  const ogImage = metaContent(html, "og:image", "property");
  const required = [
    'data-agent-reuse="true"',
    'data-agent-reuse-license="CC-BY-NC-SA-4.0"',
    'href="/for-ai/integrations/"',
    `href="${pathname}index.json"`,
    'href="/cite/"',
    'href="/terms/"',
    '<meta property="og:site_name" content="Brali">',
    `<link rel="license" href="${license}">`,
    'max-image-preview:large',
  ];
  if (required.some((marker) => !html.includes(marker))) invalid += 1;
  if ((html.match(/data-agent-reuse="true"/g) ?? []).length !== 1) invalid += 1;
  if (html.lastIndexOf('data-agent-reuse="true"') < html.lastIndexOf('data-related-protocols="true"')) invalid += 1;
  if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) invalid += 1;
  if (!sitemap.includes(`<loc>${base}${pathname}</loc>`)) invalid += 1;

  const schemaMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  try {
    const schema = JSON.parse(schemaMatch?.[1] ?? "null");
    const graph = schema?.["@graph"] ?? [];
    const article = graph.find((node) => node?.["@type"] === "Article");
    const webPage = graph.find((node) => node?.["@type"] === "WebPage");
    if (article?.license !== license || article?.usageInfo !== `${base}/terms/` || article?.isAccessibleForFree !== true) invalid += 1;
    if (article?.encoding?.contentUrl !== `${base}${pathname}index.json`) invalid += 1;
    if (webPage?.license !== license || webPage?.mainEntity?.["@id"] !== article?.["@id"]) invalid += 1;
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

if (!representative) invalid += 1;
if (invalid) throw new Error(`Hack discovery validation failed with ${invalid} contract violation(s).`);
console.log(`Hack discovery verified for ${index.length} pages: indexable, in sitemap, machine-readable, licensed, AI-linked; ${representative} expose representative large-image metadata.`);