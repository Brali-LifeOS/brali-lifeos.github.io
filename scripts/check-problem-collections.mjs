import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const cfg = read('data/problem-collections.json');
const dataset = read('problems/index.json');
const feed = read('life-os/datasets/protocols.json');
const platform = read('data/platform.json');
const trusted = new Set(['reviewed', 'practical']);
const feedBySlug = new Map((feed.entries ?? []).map(p => [p.slug, p]));

if ((cfg.collections ?? []).length < 5) throw new Error('Problem collection strategy requires at least 5 distinct collections.');
if (dataset.count !== (dataset.collections ?? []).length || dataset.count !== cfg.collections.length) throw new Error('Problem collection dataset count mismatch.');
const slugs = dataset.collections.map(c => c.slug);
if (new Set(slugs).size !== slugs.length) throw new Error('Problem collection slugs must be unique.');

for (const collection of dataset.collections) {
  if ((collection.decision_path ?? []).length < 3) throw new Error(`${collection.slug} lacks a three-step decision path.`);
  if (!collection.stop_rule) throw new Error(`${collection.slug} lacks a stop rule.`);
  if ((collection.protocols ?? []).length < 2) throw new Error(`${collection.slug} has fewer than two trusted protocols.`);
  if (!fs.existsSync(path.join(ROOT, 'problems', collection.slug, 'index.html'))) throw new Error(`${collection.slug} HTML page is missing.`);
  if (!fs.existsSync(path.join(ROOT, 'problems', collection.slug, 'index.json'))) throw new Error(`${collection.slug} JSON page is missing.`);
  const html = fs.readFileSync(path.join(ROOT, 'problems', collection.slug, 'index.html'), 'utf8');
  if (!html.includes('<script type="application/ld+json">')) throw new Error(`${collection.slug} lacks structured data.`);
  if (!html.includes('Trust') && !html.includes('trust')) throw new Error(`${collection.slug} lacks a visible trust boundary.`);
  for (const protocol of collection.protocols) {
    const source = feedBySlug.get(protocol.slug);
    if (!source) throw new Error(`${collection.slug} recommends protocol outside the trusted feed: ${protocol.slug}`);
    if (!trusted.has(source.evidence?.status)) throw new Error(`${collection.slug} recommends non-trusted protocol: ${protocol.slug}`);
  }
}

const api = read(`api/${platform.api_version}/problem-collections.json`);
if (api.count !== dataset.count) throw new Error('Problem Collections API does not match public dataset.');
const apiIndex = read(`api/${platform.api_version}/index.json`);
if (!(apiIndex.endpoints ?? []).includes('problem-collections.json')) throw new Error('API index does not expose problem-collections.json.');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const route of ['/problems/', ...slugs.map(slug => `/problems/${slug}/`)]) {
  if (!sitemap.includes(`https://brali-lifeos.github.io${route}`)) throw new Error(`Sitemap lacks ${route}`);
}
const questions = fs.readFileSync(path.join(ROOT, 'questions/index.html'), 'utf8');
if (!questions.includes('data-brali-problem-collections')) throw new Error('Questions page does not link to Problem Collections.');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!llms.includes('/problems/')) throw new Error('llms.txt does not expose Problem Collections.');

console.log(`Problem collections verified: ${dataset.count} decision guides, all recommendations restricted to reviewed/practical feed entries.`);
