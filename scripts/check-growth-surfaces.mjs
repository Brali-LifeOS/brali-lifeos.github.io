import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const fail = message => { throw new Error(message); };

const data = json('data/growth-surfaces.json');
const groups = data.question_groups ?? [];
const reports = data.reports ?? [];
const questions = groups.flatMap(group => group.questions ?? []);

if (groups.length < 6) fail(`Expected at least 6 question groups, found ${groups.length}.`);
if (questions.length < 20) fail(`Expected at least 20 practical questions, found ${questions.length}.`);
if (new Set(questions.map(item => item.toLowerCase())).size !== questions.length) fail('Practical questions must be unique.');
if (!groups.every(group => group.primary_url?.startsWith('/'))) fail('Every question group needs a canonical internal primary_url.');
if (!reports.some(report => report.cadence === 'weekly')) fail('A weekly report is required.');
if (!reports.some(report => report.cadence === 'monthly')) fail('A monthly report is required.');
if (!reports.every(report => report.period_start && report.period_end && report.summary && (report.highlights ?? []).length)) fail('Every report needs a period, summary, and highlights.');

const questionHtml = read('questions/index.html');
const questionJson = json('questions/index.json');
if (!questionHtml.includes(`${BASE}/questions/`) || !questionHtml.includes('Question-led discovery')) fail('Question landing page is incomplete.');
if ((questionJson.groups ?? []).length !== groups.length) fail('Question JSON does not match the source model.');

const updatesHtml = read('updates/index.html');
const feed = json('updates/feed.json');
if (!updatesHtml.includes('Brali Updates') || !updatesHtml.includes('Metrics rule')) fail('Updates index is incomplete.');
if ((feed.reports ?? []).length !== reports.length) fail('Updates feed does not match the source model.');
for (const report of reports) {
  const html = read(`updates/${report.slug}/index.html`);
  if (!html.includes(report.title) || !html.includes(report.period_end)) fail(`Report ${report.slug} is incomplete.`);
  if (!html.includes('application/ld+json')) fail(`Report ${report.slug} is missing structured data.`);
}

const changelog = read('changelog/index.html');
if (!changelog.includes('content="noindex,follow"') || !changelog.includes(`rel="canonical" href="${BASE}/updates/"`)) fail('Legacy changelog must consolidate to Brali Updates.');
for (const relative of ['index.html', 'life-os/index.html', 'research/index.html']) {
  if (!read(relative).includes('data-brali-growth-surfaces')) fail(`${relative} is missing growth-surface internal links.`);
}

const sitemap = read('sitemap.xml');
const requiredRoutes = ['/questions/', '/updates/', ...reports.map(report => `/updates/${report.slug}/`)];
for (const route of requiredRoutes) {
  if (!sitemap.includes(`<loc>${BASE}${route}</loc>`)) fail(`Sitemap is missing ${route}.`);
}

console.log(`Growth surfaces verified: ${groups.length} groups, ${questions.length} questions, ${reports.length} reports, ${requiredRoutes.length} sitemap routes.`);
