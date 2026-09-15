import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = 'https://brali-lifeos.github.io';
const UPDATES_URL = `${BASE}/updates/`;
const FEED_URL = `${BASE}/feed.xml`;
const SOURCE_PATH = path.join(ROOT, 'updates/feed.json');

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sourceDate(value, label) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Invalid ${label}: ${raw || '(missing)'}`);
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${label}: ${raw}`);
  return parsed;
}

const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
const reports = (Array.isArray(source.reports) ? source.reports : []).map((report) => {
  const slug = String(report.slug ?? '').trim();
  const title = String(report.title ?? '').trim();
  const summary = String(report.summary ?? '').trim();
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid update slug: ${slug || '(missing)'}`);
  if (!title) throw new Error(`Update ${slug} needs a title before it can enter RSS.`);
  if (!summary) throw new Error(`Update ${slug} needs a summary before it can enter RSS.`);
  return {
    slug,
    title,
    summary,
    url: `${UPDATES_URL}${slug}/`,
    date: sourceDate(report.period_end, `period_end for ${slug}`),
  };
}).sort((a, b) => b.date - a.date || a.slug.localeCompare(b.slug));

if (!reports.length) throw new Error('Brali RSS cannot be generated without at least one release/update report.');

const updatedAt = sourceDate(source.updated_at, 'updates.feed updated_at');
const latestReportDate = reports.reduce((latest, report) => report.date > latest ? report.date : latest, reports[0].date);
if (updatedAt < latestReportDate) {
  throw new Error(`updates/feed.json updated_at (${source.updated_at}) predates the latest report (${latestReportDate.toISOString().slice(0, 10)}).`);
}

const items = reports.map((report) => `    <item>\n      <title>${escapeXml(report.title)}</title>\n      <link>${escapeXml(report.url)}</link>\n      <guid isPermaLink="true">${escapeXml(report.url)}</guid>\n      <pubDate>${report.date.toUTCString()}</pubDate>\n      <description>${escapeXml(report.summary)}</description>\n    </item>`).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Brali Updates</title>\n    <link>${UPDATES_URL}</link>\n    <description>Published Brali updates on practical knowledge, evidence, research, datasets, and agent-ready product changes.</description>\n    <language>en</language>\n    <lastBuildDate>${updatedAt.toUTCString()}</lastBuildDate>\n    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;

fs.writeFileSync(path.join(ROOT, 'feed.xml'), xml);
console.log(`Generated RSS feed from updates/feed.json with ${reports.length} release/update reports.`);
