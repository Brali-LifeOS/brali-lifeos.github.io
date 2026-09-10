import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const fail = message => { throw new Error(message); };

const growth = json('data/growth-surfaces.json');
const index = json('questions/index.json');
const sitemap = read('sitemap.xml');
const indexHtml = read('questions/index.html');
const llms = read('llms.txt');
const sourceQuestions = (growth.question_groups ?? []).flatMap(group => group.questions ?? []);
const pages = index.pages ?? [];

if (pages.length !== sourceQuestions.length) fail(`Expected ${sourceQuestions.length} standalone question pages, found ${pages.length}.`);
if (index.page_count !== pages.length) fail('questions/index.json page_count mismatch.');
if (index.indexable_page_count !== pages.filter(page => page.indexable).length) fail('questions/index.json indexable_page_count mismatch.');
if (new Set(pages.map(page => page.slug)).size !== pages.length) fail('Standalone question page slugs must be unique.');
if (new Set(pages.map(page => page.question.toLowerCase())).size !== pages.length) fail('Standalone question wording must be unique.');
if (!indexHtml.includes('data-brali-search-question-pages')) fail('Questions index does not expose the standalone search-page layer.');
if (!llms.includes('## Search-ready question pages')) fail('llms.txt does not expose standalone search question pages.');

for (const page of pages) {
  const htmlPath = `questions/${page.slug}/index.html`;
  const jsonPath = `questions/${page.slug}/index.json`;
  if (!fs.existsSync(path.join(ROOT, htmlPath))) fail(`Missing ${htmlPath}.`);
  if (!fs.existsSync(path.join(ROOT, jsonPath))) fail(`Missing ${jsonPath}.`);
  const html = read(htmlPath);
  const packet = json(jsonPath);
  const loc = `<loc>${BASE}/questions/${page.slug}/</loc>`;

  if (packet.question !== page.question || packet.slug !== page.slug) fail(`${page.slug} JSON packet does not match the catalog.`);
  if (packet.search_status !== page.search_status || packet.indexable !== page.indexable) fail(`${page.slug} search status does not match the catalog.`);
  if (!html.includes('data-brali-search-question-page')) fail(`${page.slug} lacks the generated-page marker.`);
  if (!html.includes('<script type="application/ld+json">')) fail(`${page.slug} lacks structured data.`);
  if (!html.includes(`rel="canonical" href="${BASE}/questions/${page.slug}/"`)) fail(`${page.slug} has the wrong canonical URL.`);
  if (!indexHtml.includes(`/questions/${page.slug}/`)) fail(`${page.slug} is not internally linked from /questions/.`);
  if (!html.toLowerCase().includes('trust boundary')) fail(`${page.slug} lacks a visible trust boundary.`);

  const recommendationCount = (packet.recommendations ?? []).length;
  const boundaryCount = (packet.evidence_boundaries ?? []).length;
  if (recommendationCount !== page.recommendation_count || boundaryCount !== page.evidence_boundary_count) fail(`${page.slug} count metadata does not match its packet.`);

  if (page.indexable) {
    if (page.search_status !== 'trusted-answer' && page.search_status !== 'boundary-only') fail(`${page.slug} is indexable with unsupported status ${page.search_status}.`);
    if (recommendationCount + boundaryCount < 1) fail(`${page.slug} is indexable without trusted recommendations or a reviewed boundary.`);
    if (html.includes('content="noindex,follow"')) fail(`${page.slug} is indexable but marked noindex.`);
    if (!sitemap.includes(loc)) fail(`Sitemap lacks indexable question page ${page.slug}.`);
  } else {
    if (!html.includes('content="noindex,follow"')) fail(`${page.slug} lacks noindex while trusted coverage is pending.`);
    if (sitemap.includes(loc)) fail(`Sitemap contains coverage-pending question page ${page.slug}.`);
  }
}

console.log(`Search question pages verified: ${pages.length} total, ${pages.filter(page => page.indexable).length} indexable, ${pages.filter(page => !page.indexable).length} noindex coverage-pending.`);
