import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = 'https://brali-lifeos.github.io';
const FEED_URL = `${BASE}/feed.xml`;

function fail(message) {
  throw new Error(`RSS contract: ${message}`);
}

function blogPosts(html) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      const values = Array.isArray(value) ? value : [value];
      const blog = values.find((entry) => entry?.['@type'] === 'Blog');
      if (blog) return (blog.blogPost ?? []).filter((entry) => entry?.['@type'] === 'BlogPosting');
    } catch {
      // Ignore unrelated malformed JSON-LD here; other repository checks own that surface.
    }
  }
  return [];
}

const feedPath = path.join(ROOT, 'feed.xml');
if (!fs.existsSync(feedPath)) fail('feed.xml is missing.');
const feed = fs.readFileSync(feedPath, 'utf8');
if (!/<rss\b[^>]*version="2\.0"/.test(feed)) fail('feed.xml is not RSS 2.0.');
if (!feed.includes(`<atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"`)) fail('self-discovery atom:link is missing or incorrect.');
if (!feed.includes('<title>Brali Updates</title>')) fail('channel title is missing.');
if (!feed.includes(`<link>${BASE}/updates/</link>`)) fail('channel link must point to /updates/.');

const sourcePosts = blogPosts(fs.readFileSync(path.join(ROOT, 'updates/index.html'), 'utf8'));
if (!sourcePosts.length) fail('updates/index.html exposes no BlogPosting records.');
const itemBlocks = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
if (itemBlocks.length !== sourcePosts.length) fail(`expected ${sourcePosts.length} items, found ${itemBlocks.length}.`);

const seen = new Set();
for (const post of sourcePosts) {
  const url = String(post.url ?? '').trim();
  const date = String(post.datePublished ?? '').trim();
  if (!url || seen.has(url)) fail(`duplicate or missing canonical update URL: ${url || '(missing)'}.`);
  seen.add(url);
  const block = itemBlocks.find((item) => item.includes(`<link>${url}</link>`));
  if (!block) fail(`published update missing from feed: ${url}.`);
  if (!block.includes(`<guid isPermaLink="true">${url}</guid>`)) fail(`stable permalink GUID missing for ${url}.`);
  const expectedDate = new Date(`${date}T00:00:00Z`).toUTCString();
  if (!block.includes(`<pubDate>${expectedDate}</pubDate>`)) fail(`source-derived pubDate mismatch for ${url}.`);
}

for (const rel of ['index.html', 'updates/index.html', 'life-os/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!html.includes('rel="alternate" type="application/rss+xml"') || !html.includes('href="/feed.xml"')) {
    fail(`RSS autodiscovery missing from ${rel}.`);
  }
}

console.log(`RSS contract passed: ${itemBlocks.length} canonical updates and autodiscovery on key surfaces.`);
