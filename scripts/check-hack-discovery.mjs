import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const license = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const index = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
let invalid = 0;

for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  const html = await readFile(pagePath, "utf8");
  const pathname = `/life-os/${entry.slug}/`;
  const required = [
    'data-agent-reuse="true"',
    'data-agent-reuse-license="CC-BY-NC-SA-4.0"',
    'href="/for-ai/integrations/"',
    `href="${pathname}index.json"`,
    'href="/cite/"',
    'href="/terms/"',
    '<meta property="og:site_name" content="Brali">',
    '<meta name="twitter:card" content="summary">',
    `<link rel="license" href="${license}">`,
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
  } catch {
    invalid += 1;
  }
}

if (invalid) throw new Error(`Hack discovery validation failed with ${invalid} contract violation(s).`);
console.log(`Hack discovery verified for ${index.length} pages: all indexable, in sitemap, machine-readable, licensed, and linked to AI integration instructions.`);
