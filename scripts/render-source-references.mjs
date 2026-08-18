import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const isExternalUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value) && !/brali-lifeos\.github\.io\/life-os/i.test(value);

function normalizeSource(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return isExternalUrl(value) ? { title: value, url: value } : { title: value, url: null };
  }
  if (typeof value !== "object") return null;
  const url = value.url || value.source_url || value.sourceUrl || value.reference_url || null;
  const title = value.title || value.name || value.reference || url || "Source";
  return {
    title,
    url: isExternalUrl(url) ? url : null,
    doi: value.doi || null,
    source_type: value.source_type || value.type || null,
    claim_scope: value.claim_scope || null,
  };
}

function articleSources(article) {
  const values = [];
  const original = article.lifeOsSource ?? {};
  if (original.sourceUrl || original.reference) {
    values.push({ title: original.reference || original.sourceUrl, url: original.sourceUrl || null });
  }
  for (const list of [article.references, article.sources, article.citations]) {
    if (Array.isArray(list)) values.push(...list);
  }
  const deduped = new Map();
  for (const value of values) {
    const source = normalizeSource(value);
    if (!source) continue;
    const key = source.url || `${source.title}|${source.doi || ""}`;
    if (!deduped.has(key)) deduped.set(key, source);
  }
  return [...deduped.values()];
}

function sourceItem(source) {
  const title = escapeHtml(source.title || source.url || "Source");
  const linkedTitle = source.url
    ? `<a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${title}</a>`
    : title;
  const metadata = [];
  if (source.doi) metadata.push(`DOI: ${escapeHtml(source.doi)}`);
  if (source.source_type) metadata.push(escapeHtml(String(source.source_type).replaceAll("-", " ")));
  const meta = metadata.length ? ` <small>(${metadata.join(" · ")})</small>` : "";
  const scope = source.claim_scope ? `<br><small>Supports: ${escapeHtml(source.claim_scope)}</small>` : "";
  return `<li>${linkedTitle}${meta}${scope}</li>`;
}

let pagesWithSources = 0;
let linkedSources = 0;
for (const entry of index) {
  const articlePath = path.join(contentRoot, `${entry.slug}.json`);
  const article = JSON.parse(await readFile(articlePath, "utf8"));
  const sources = articleSources(article);
  if (!sources.length) continue;

  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  let html = await readFile(pagePath, "utf8");
  if (html.includes('data-brali-sources="true"')) continue;

  const evidenceState = article.editorialCuration?.evidenceStatus;
  const stateLine = evidenceState
    ? `<p><small>Evidence state: ${escapeHtml(evidenceState)}. Sources are provided so the underlying material can be inspected directly.</small></p>`
    : `<p><small>Sources are provided so the underlying material can be inspected directly.</small></p>`;
  const block = `<section class="prose" data-brali-sources="true"><h2>Sources</h2>${stateLine}<ul>${sources.map(sourceItem).join("")}</ul></section>`;
  const marker = '<aside class="callout">';
  if (!html.includes(marker)) throw new Error(`Cannot render sources for ${entry.slug}: callout marker not found`);
  html = html.replace(marker, `${block}${marker}`);
  await writeFile(pagePath, html);
  pagesWithSources += 1;
  linkedSources += sources.filter((source) => source.url).length;
}

console.log(`Rendered public source blocks on ${pagesWithSources} page(s), including ${linkedSources} direct source link(s).`);
