import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = 'https://brali-lifeos.github.io';
const UPDATES_URL = `${BASE}/updates/`;
const FEED_URL = `${BASE}/feed.xml`;

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function blogSchema(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const value = JSON.parse(match[1]);
      const candidates = Array.isArray(value) ? value : [value];
      const blog = candidates.find((entry) => entry?.['@type'] === 'Blog');
      if (blog) return blog;
    } catch {
      // Other JSON-LD blocks are allowed to be unrelated to the updates surface.
    }
  }
  throw new Error('Brali Updates must expose a valid Blog JSON-LD block.');
}

function publishedDate(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Invalid update date: ${raw || '(missing)'}`);
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid update date: ${raw}`);
  return parsed;
}

const updatesPath = path.join(ROOT, 'updates/index.html');
const updatesHtml = fs.readFileSync(updatesPath, 'utf8');
const schema = blogSchema(updatesHtml);
const posts = (Array.isArray(schema.blogPost) ? schema.blogPost : [])
  .filter((entry) => entry?.['@type'] === 'BlogPosting')
  .map((entry) => {
    const title = String(entry.headline ?? '').trim();
    const url = String(entry.url ?? '').trim();
    const date = publishedDate(entry.datePublished);
    if (!title) throw new Error('Every Brali update needs a headline before it can enter RSS.');
    if (!url.startsWith(`${UPDATES_URL}`)) throw new Error(`Update URL must stay under ${UPDATES_URL}: ${url}`);
    return { title, url, date };
  })
  .sort((a, b) => b.date - a.date || a.url.localeCompare(b.url));

if (!posts.length) throw new Error('Brali RSS cannot be generated without at least one published update.');

const items = posts.map((post) => `    <item>\n      <title>${escapeXml(post.title)}</title>\n      <link>${escapeXml(post.url)}</link>\n      <guid isPermaLink="true">${escapeXml(post.url)}</guid>\n      <pubDate>${post.date.toUTCString()}</pubDate>\n    </item>`).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Brali Updates</title>\n    <link>${UPDATES_URL}</link>\n    <description>Published Brali updates on practical knowledge, evidence, research, datasets, and agent-ready product changes.</description>\n    <language>en</language>\n    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;

fs.writeFileSync(path.join(ROOT, 'feed.xml'), xml);
console.log(`Generated RSS feed with ${posts.length} published Brali updates.`);
