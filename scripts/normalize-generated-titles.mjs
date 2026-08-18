import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const indexPath = path.join(contentRoot, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
const overrides = JSON.parse(await readFile(path.join(root, "data/title-overrides.json"), "utf8"));
const knownSlugs = new Set(index.map((entry) => entry.slug));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
const fragmentEnding = /(?:\b(?:and|or|whether|with|to|for|from|around|because|while|when|if|of|in|on|at|by|the|a|an)|[,;:—-])$/i;

for (const [slug, override] of Object.entries(overrides.entries ?? {})) {
  if (!knownSlugs.has(slug)) throw new Error(`Title override references unknown entry: ${slug}`);
  if (!clean(override.display_title)) throw new Error(`Title override for ${slug} must provide display_title.`);
  if (clean(override.display_title).length > 100) throw new Error(`Title override for ${slug} exceeds 100 characters.`);
}

function titleIssue(title) {
  const value = clean(title);
  if (value.length > 82) return "too-long";
  if (fragmentEnding.test(value)) return "fragment-ending";
  return null;
}

function displayTitle(entry) {
  const manual = clean(overrides.entries?.[entry.slug]?.display_title);
  if (manual) return { title: manual, reason: "manual" };

  const original = clean(entry.title);
  const subtitle = clean(entry.subtitle);
  const issue = titleIssue(original);
  const usableSubtitle = subtitle.length >= 6 && subtitle.length <= 72 && !fragmentEnding.test(subtitle);
  if (issue && usableSubtitle) return { title: subtitle, reason: issue };
  return { title: original, reason: issue ? `unresolved-${issue}` : "original" };
}

const changed = [];
const unresolved = [];
const displayBySlug = new Map();

for (const entry of index) {
  const result = displayTitle(entry);
  displayBySlug.set(entry.slug, result.title);
  if (result.title !== clean(entry.title)) changed.push({ slug: entry.slug, original: clean(entry.title), display: result.title, reason: result.reason });
  if (titleIssue(result.title)) unresolved.push({ slug: entry.slug, title: result.title, issue: titleIssue(result.title) });

  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  let html = await readFile(pagePath, "utf8");
  const originalEscaped = escapeHtml(clean(entry.title));
  const displayEscaped = escapeHtml(result.title);

  html = html
    .replace(`<title>${originalEscaped} — Brali LifeOS</title>`, `<title>${displayEscaped} — Brali LifeOS</title>`)
    .replace(`<meta property="og:title" content="${originalEscaped}">`, `<meta property="og:title" content="${displayEscaped}">`)
    .replace(`<h1>${originalEscaped}</h1>`, `<h1>${displayEscaped}</h1>`);

  if (result.title === clean(entry.subtitle) && entry.subtitle) {
    html = html.replace(`<p class="lead">${escapeHtml(clean(entry.subtitle))}</p>`, "");
  }

  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (whole, raw) => {
    try {
      const schema = JSON.parse(raw);
      if (schema?.["@type"] === "Article") {
        schema.headline = result.title;
        return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`;
      }
    } catch {
      return whole;
    }
    return whole;
  });

  await writeFile(pagePath, html);
}

for (const entry of index) {
  const display = displayBySlug.get(entry.slug);
  if (display === clean(entry.title)) continue;
  const zonePath = path.join(root, "life-os", entry.zone.slug, "index.html");
  let zoneHtml = await readFile(zonePath, "utf8");
  zoneHtml = zoneHtml.replace(
    `<a href="/life-os/${entry.slug}/">${escapeHtml(clean(entry.title))}</a>`,
    `<a href="/life-os/${entry.slug}/">${escapeHtml(display)}</a>`,
  );
  await writeFile(zonePath, zoneHtml);
}

const publicIndexPath = path.join(root, "life-os-index.json");
const publicIndex = JSON.parse(await readFile(publicIndexPath, "utf8"));
for (const item of publicIndex) item.displayTitle = displayBySlug.get(item.slug) ?? clean(item.title);
await writeFile(publicIndexPath, JSON.stringify(publicIndex, null, 2));

const reportPath = path.join(root, "life-os/datasets/title-quality.json");
await writeFile(reportPath, JSON.stringify({
  schema_version: 1,
  changed_count: changed.length,
  unresolved_count: unresolved.length,
  changed,
  unresolved,
}, null, 2));

const manifestPath = path.join(root, "life-os/datasets/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "title-quality.json"])];
manifest.title_quality = { changed: changed.length, unresolved: unresolved.length };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPage = path.join(root, "life-os/datasets/index.html");
let datasetsHtml = await readFile(datasetsPage, "utf8");
if (!datasetsHtml.includes("/life-os/datasets/title-quality.json")) {
  datasetsHtml = datasetsHtml.replace(
    "</ul>",
    '<li><a href="/life-os/datasets/title-quality.json">Display-title quality report (JSON)</a></li></ul>',
  );
  await writeFile(datasetsPage, datasetsHtml);
}

console.log(`Title quality normalized: ${changed.length} display titles changed; ${unresolved.length} unresolved title issues remain.`);
