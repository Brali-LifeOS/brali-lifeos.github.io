import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = 'https://brali-lifeos.github.io';
const FEED_URL = `${BASE}/feed.xml`;
const UPDATES_URL = `${BASE}/updates/`;

function fail(message) {
  throw new Error(`RSS contract: ${message}`);
}

function sourceDate(value, label) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) fail(`invalid ${label}: ${raw || '(missing)'}.`);
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) fail(`invalid ${label}: ${raw}.`);
  return parsed;
}

const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'updates/feed.json'), 'utf8'));
const reports = Array.isArray(source.reports) ? source.reports : [];
if (!reports.length) fail('updates/feed.json has no release/update reports.');

const feedPath = path.join(ROOT, 'feed.xml');
if (!fs.existsSync(feedPath)) fail('feed.xml is missing; run the RSS generator first.');
const feed = fs.readFileSync(feedPath, 'utf8');
if (!/<rss\b[^>]*version="2\.0"/.test(feed)) fail('feed.xml is not RSS 2.0.');
if (!feed.includes(`<atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"`)) fail('self-discovery atom:link is missing or incorrect.');
if (!feed.includes('<title>Brali Updates</title>')) fail('channel title is missing.');
if (!feed.includes(`<link>${UPDATES_URL}</link>`)) fail('channel link must point to /updates/.');

const expectedLastBuildDate = sourceDate(source.updated_at, 'updates.feed updated_at').toUTCString();
if (!feed.includes(`<lastBuildDate>${expectedLastBuildDate}</lastBuildDate>`)) {
  fail('lastBuildDate must come from updates/feed.json updated_at, never from the build clock.');
}

const itemBlocks = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
if (itemBlocks.length !== reports.length) fail(`expected ${reports.length} items, found ${itemBlocks.length}.`);

const seen = new Set();
for (const report of reports) {
  const slug = String(report.slug ?? '').trim();
  const title = String(report.title ?? '').trim();
  const summary = String(report.summary ?? '').trim();
  const url = `${UPDATES_URL}${slug}/`;
  if (!slug || seen.has(slug)) fail(`duplicate or missing source slug: ${slug || '(missing)'}.`);
  seen.add(slug);
  const block = itemBlocks.find((item) => item.includes(`<link>${url}</link>`));
  if (!block) fail(`release/update report missing from feed: ${slug}.`);
  if (!block.includes(`<guid isPermaLink="true">${url}</guid>`)) fail(`stable permalink GUID missing for ${slug}.`);
  if (!block.includes(`<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</title>`)) fail(`title mismatch for ${slug}.`);
  const expectedDate = sourceDate(report.period_end, `period_end for ${slug}`).toUTCString();
  if (!block.includes(`<pubDate>${expectedDate}</pubDate>`)) fail(`source-derived pubDate mismatch for ${slug}.`);
  if (!summary) fail(`source summary missing for ${slug}.`);
}

for (const rel of ['index.html', 'updates/index.html', 'life-os/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('rel="alternate" type="application/rss+xml"') || !html.includes('href="/feed.xml"')) {
    fail(`RSS autodiscovery missing from ${rel}.`);
  }
}

console.log(`RSS contract passed: ${itemBlocks.length} source-backed updates, deterministic dates, and autodiscovery on key surfaces.`);
