import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));
const MIN_LONGFORM_CHARS = 600;

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]);

function renderInline(value = "") {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

function renderMarkdown(markdown = "") {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join(" ").trim())}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };
  const flushCode = () => {
    if (!code.length) return;
    output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^```/.test(line.trim())) {
      flushParagraph();
      closeList();
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(rawLine);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(4, Math.max(2, heading[1].length + 1));
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const desired = ordered ? "ol" : "ul";
      if (listType && listType !== desired) closeList();
      if (!listType) {
        listType = desired;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${renderInline((ordered || unordered)[1])}</li>`);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      output.push(`<blockquote><p>${renderInline(quote[1])}</p></blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (inCode) flushCode();
  return output.join("\n");
}

function hasStructuredBody(article) {
  const sections = Array.isArray(article.body?.sections) ? article.body.sections : [];
  return sections.length > 0;
}

function markdownLongform(article) {
  const markdown = typeof article.body?.markdown === "string" ? article.body.markdown.trim() : "";
  if (markdown.length < MIN_LONGFORM_CHARS || hasStructuredBody(article)) return null;
  return markdown;
}

// Migrated markdown often opens with a plain line that simply repeats the page
// title (optionally with a legacy brand suffix). Drop that echo so the rendered
// article does not start with a duplicate of the visible h1.
function dropLeadingTitleEcho(markdown, article) {
  const normalize = (value = "") => String(value).toLowerCase().replace(/[—–-].*$/s, "").replace(/[^a-z0-9]+/g, " ").trim();
  const title = normalize(article.title);
  if (!title) return markdown;
  const lines = markdown.split("\n");
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex < 0) return markdown;
  const first = lines[firstIndex].trim();
  if (/^#|^\s*[-*+>]/.test(first)) return markdown;
  const candidate = normalize(first);
  if (candidate && (candidate === title || candidate.startsWith(title) || title.startsWith(candidate))) {
    lines.splice(firstIndex, 1);
    return lines.join("\n").trim();
  }
  return markdown;
}

function injectLongform(html, slug, rendered) {
  const marker = 'data-longform-source="body.markdown"';
  const replacement = `<div class="prose" data-longform-source="body.markdown">${rendered}</div>`;
  const existing = html.match(/<div class="prose" data-longform-source="body\.markdown">[\s\S]*?<\/div>/);
  if (existing) {
    // The renderer never emits nested divs, so the restored block is replaceable
    // as a unit and rebuilds stay idempotent when the canonical markdown changes.
    return html.replace(existing[0], replacement);
  }

  const coverMatch = html.match(/<figure class="hack-cover"[\s\S]*?<\/figure>/);
  if (!coverMatch || coverMatch.index == null) throw new Error(`${slug}: cannot locate hack cover for long-form restoration.`);
  const afterCoverIndex = coverMatch.index + coverMatch[0].length;
  const before = html.slice(0, afterCoverIndex);
  let after = html.slice(afterCoverIndex);
  const firstProse = after.match(/^<div class="prose">[\s\S]*?<\/div>/);

  if (firstProse) after = `${replacement}${after.slice(firstProse[0].length)}`;
  else after = `${replacement}${after}`;
  return `${before}${after}`;
}

const restored = [];
for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), "utf8"));
  const markdown = markdownLongform(article);
  if (!markdown) continue;

  const htmlPath = path.join(root, "life-os", entry.slug, "index.html");
  const before = await readFile(htmlPath, "utf8");
  const rendered = renderMarkdown(dropLeadingTitleEcho(markdown, article));
  const after = injectLongform(before, entry.slug, rendered);
  if (after !== before) await writeFile(htmlPath, after);
  restored.push({
    slug: entry.slug,
    source: `data/life-os-content/${entry.slug}.json#body.markdown`,
    source_characters: markdown.length,
    rendered: true,
  });
}

await writeFile(
  path.join(root, "life-os/datasets/longform-publication.json"),
  `${JSON.stringify({
    schema_version: 1,
    rule: `Canonical body.markdown content with at least ${MIN_LONGFORM_CHARS} characters and no curated body.sections is rendered as the human long-form article before evidence-state publication rules are applied.`,
    restored_count: restored.length,
    entries: restored,
  }, null, 2)}\n`,
);

console.log(`Long-form publication restored for ${restored.length} markdown-backed article(s).`);
