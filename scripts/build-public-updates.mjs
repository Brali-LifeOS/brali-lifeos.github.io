#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'data/public-updates.json');
const args = new Set(process.argv.slice(2));
const CHECK_FRESHNESS = args.has('--check-freshness');

function fail(message) {
  console.error(`public-updates: ${message}`);
  process.exit(1);
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isoDate(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) fail(`${field} must be YYYY-MM-DD`);
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) fail(`${field} is invalid`);
  return date;
}

function rfc822(value) {
  return isoDate(value, 'date').toUTCString();
}

function readSource() {
  if (!fs.existsSync(SOURCE)) fail('missing data/public-updates.json');
  const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  if (data.schema_version !== 1) fail('unsupported schema_version');
  if (!data.title || !data.description || !data.home_page_url) fail('title, description, and home_page_url are required');
  if (!data.feeds?.rss || !data.feeds?.json || !data.feeds?.api || !data.feeds?.sitemap) fail('all feed URLs are required');
  if (!Array.isArray(data.items) || data.items.length === 0) fail('at least one update item is required');

  const ids = new Set();
  const urls = new Set();
  for (const item of data.items) {
    if (!item.id || ids.has(item.id)) fail(`duplicate or missing item id: ${item.id || '<empty>'}`);
    if (!['weekly', 'monthly'].includes(item.kind)) fail(`${item.id}: kind must be weekly or monthly`);
    if (!item.title || !item.summary || !item.url) fail(`${item.id}: title, summary, and url are required`);
    if (!item.url.startsWith('https://brali-lifeos.github.io/updates/')) fail(`${item.id}: URL must be under /updates/`);
    isoDate(item.date_published, `${item.id}.date_published`);
    isoDate(item.date_modified, `${item.id}.date_modified`);
    if (urls.has(item.url)) fail(`duplicate URL: ${item.url}`);
    ids.add(item.id);
    urls.add(item.url);
  }

  data.items.sort((a, b) => b.date_published.localeCompare(a.date_published));
  return data;
}

function checkFreshness(data) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekly = data.items.filter((item) => item.kind === 'weekly').sort((a, b) => b.date_published.localeCompare(a.date_published))[0];
  if (!weekly) fail('no weekly update exists');
  const weeklyDate = new Date(`${weekly.date_published}T00:00:00Z`);
  const weeklyAgeDays = Math.floor((today - weeklyDate) / 86400000);
  if (weeklyAgeDays > 10) fail(`latest weekly update is ${weeklyAgeDays} days old (${weekly.date_published})`);

  const day = today.getUTCDate();
  if (day >= 8) {
    const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const key = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthly = data.items.some((item) => item.kind === 'monthly' && item.url.endsWith(`/updates/${key}/`));
    if (!monthly) fail(`monthly update for ${key} is missing after the 7-day publication window`);
  }

  console.log(`public-updates: fresh (weekly ${weekly.date_published})`);
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function write(file, content) {
  ensureParent(file);
  fs.writeFileSync(file, `${content.trim()}\n`, 'utf8');
  console.log(`public-updates: wrote ${path.relative(ROOT, file)}`);
}

function buildRss(data) {
  const items = data.items.map((item) => `    <item>\n      <title>${xml(item.title)}</title>\n      <link>${xml(item.url)}</link>\n      <guid isPermaLink="true">${xml(item.url)}</guid>\n      <pubDate>${rfc822(item.date_published)}</pubDate>\n      <category>${xml(item.kind)}</category>\n      <description>${xml(item.summary)}</description>\n    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${xml(data.title)}</title>\n    <link>${xml(data.home_page_url)}</link>\n    <description>${xml(data.description)}</description>\n    <language>en</language>\n    <lastBuildDate>${rfc822(data.updated_at)}</lastBuildDate>\n    <atom:link href="${xml(data.feeds.rss)}" rel="self" type="application/rss+xml"/>\n${items}\n  </channel>\n</rss>`;
}

function buildJsonFeed(data) {
  return JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: data.title,
    home_page_url: data.home_page_url,
    feed_url: data.feeds.json,
    description: data.description,
    language: 'en',
    items: data.items.map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      content_text: item.summary,
      summary: item.summary,
      date_published: `${item.date_published}T12:00:00Z`,
      date_modified: `${item.date_modified}T12:00:00Z`,
      tags: [item.kind]
    }))
  }, null, 2);
}

function buildApi(data) {
  return JSON.stringify({
    schema_version: 1,
    updated_at: data.updated_at,
    title: data.title,
    description: data.description,
    canonical_url: data.home_page_url,
    subscription: data.feeds,
    items: data.items
  }, null, 2);
}

function buildSitemap(data) {
  const latest = data.items[0].date_modified;
  const urls = [
    { loc: data.home_page_url, lastmod: latest },
    ...data.items.map((item) => ({ loc: item.url, lastmod: item.date_modified }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => `  <url>\n    <loc>${xml(entry.loc)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`).join('\n')}\n</urlset>`;
}

const data = readSource();
if (CHECK_FRESHNESS) {
  checkFreshness(data);
  process.exit(0);
}

write(path.join(ROOT, 'feed.xml'), buildRss(data));
write(path.join(ROOT, 'feed.json'), buildJsonFeed(data));
write(path.join(ROOT, 'api/v1/updates.json'), buildApi(data));
write(path.join(ROOT, 'sitemap-updates.xml'), buildSitemap(data));
