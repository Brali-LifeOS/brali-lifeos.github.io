import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const sourceAliases = JSON.parse(await readFile(path.join(root, "data/protocol-aliases.json"), "utf8"));
const publishedAliases = JSON.parse(await readFile(path.join(root, "life-os/datasets/aliases.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const reviewQueue = JSON.parse(await readFile(path.join(root, "life-os/datasets/review-queue.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const datasetsPage = await readFile(path.join(root, "life-os/datasets/index.html"), "utf8");

const known = new Set(sourceIndex.map((entry) => entry.slug));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const queueSlugs = new Set((reviewQueue.entries ?? []).map((entry) => entry.slug));
const feedSlugs = new Set((protocols.entries ?? []).map((entry) => entry.slug));
const publishedBySlug = new Map((publishedAliases.entries ?? []).map((entry) => [entry.slug, entry]));
let failures = 0;

for (const [slug, alias] of Object.entries(sourceAliases.entries ?? {})) {
  const target = alias.canonical_slug;
  if (!known.has(slug) || !known.has(target) || slug === target) failures += 1;
  if (sourceAliases.entries?.[target]) failures += 1;

  const published = publishedBySlug.get(slug);
  if (!published || published.canonical_slug !== target) failures += 1;
  if (evidenceBySlug.get(slug)?.alias_of !== target) failures += 1;
  if (queueSlugs.has(slug)) failures += 1;
  if (feedSlugs.has(slug)) failures += 1;
  if (!feedSlugs.has(target)) failures += 1;

  const oldUrl = `${base}/life-os/${slug}/`;
  const canonicalUrl = `${base}/life-os/${target}/`;
  if (sitemap.includes(`<loc>${oldUrl}</loc>`)) failures += 1;

  const page = await readFile(path.join(root, "life-os", slug, "index.html"), "utf8");
  if (!page.includes('name="robots" content="noindex,follow"')) failures += 1;
  if (!page.includes(`<link rel="canonical" href="${canonicalUrl}">`)) failures += 1;
  if (!page.includes(`http-equiv="refresh" content="0; url=/life-os/${target}/"`)) failures += 1;
  if (!page.includes(`href="/life-os/${target}/"`)) failures += 1;
}

if (publishedAliases.count !== Object.keys(sourceAliases.entries ?? {}).length) failures += 1;
if (!datasetsPage.includes('/life-os/datasets/aliases.json')) failures += 1;

if (failures) throw new Error(`Protocol alias validation failed with ${failures} problem(s).`);
console.log(`Protocol aliases verified: ${publishedAliases.count} old URL(s) route to canonical trusted protocols and stay out of search, review queue, and protocol feed.`);
