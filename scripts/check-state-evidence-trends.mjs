import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const growth = read('data/growth-surfaces.json');
const month = String(growth.updated_at).slice(0, 7);
const required = [
  'state/index.html',
  'state/index.json',
  'trends/evidence/index.html',
  'trends/evidence/index.json',
  `trends/evidence/${month}/index.html`,
  `trends/evidence/${month}/index.json`
];
for (const rel of required) if (!fs.existsSync(path.join(ROOT, rel))) throw new Error(`Missing state/evidence surface: ${rel}`);

const state = read('state/index.json');
const pulse = read(`trends/evidence/${month}/index.json`);
const evidence = read('life-os/datasets/evidence.json');
const protocols = read('life-os/datasets/protocols.json');
const suite = read('data/agent-evaluation-suite.json');
const total = (evidence.entries || []).length;
const counts = evidence.counts || {};
const trusted = Number(counts.reviewed || 0) + Number(counts.practical || 0);
if (state.metrics.library_entries !== total) throw new Error('State snapshot does not reconcile with evidence index size.');
if (state.metrics.trusted_or_practical !== trusted) throw new Error('State trusted/practical count does not reconcile with evidence index.');
if (state.metrics.trusted_protocols !== Number(protocols.count || 0)) throw new Error('State protocol count does not reconcile with Trusted Protocol Feed.');
if (state.metrics.agent_evaluation_cases !== (suite.cases || []).length) throw new Error('State evaluation-case count does not reconcile with the maintained suite.');
if (pulse.current_distribution.total !== total) throw new Error('Evidence pulse does not reconcile with evidence index size.');
if (pulse.period !== month) throw new Error('Evidence pulse period does not match the configured snapshot month.');
if (!Array.isArray(pulse.limitations) || pulse.limitations.length < 3) throw new Error('Evidence pulse lacks explicit interpretation limitations.');

const stateHtml = fs.readFileSync(path.join(ROOT, 'state/index.html'), 'utf8');
const trendsHtml = fs.readFileSync(path.join(ROOT, `trends/evidence/${month}/index.html`), 'utf8');
for (const [name, html] of [['state', stateHtml], ['evidence trends', trendsHtml]]) {
  if (!html.includes('application/ld+json')) throw new Error(`${name} page lacks structured data.`);
  if (!html.includes('rel="canonical"')) throw new Error(`${name} page lacks canonical metadata.`);
}
if (!stateHtml.includes('No traffic estimates')) throw new Error('State page lost its no-fabricated-metrics boundary.');
if (!trendsHtml.includes('first stored public evidence pulse')) throw new Error('Evidence trend page lost its baseline limitation.');

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const route of ['/state/', '/trends/evidence/', `/trends/evidence/${month}/`]) {
  if (!sitemap.includes(`<loc>${BASE}${route}</loc>`)) throw new Error(`Sitemap lacks ${route}`);
}
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!llms.includes(`${BASE}/state/`) || !llms.includes(`${BASE}/trends/evidence/`)) throw new Error('llms.txt does not expose state/evidence surfaces.');

console.log(`State/evidence surfaces verified: ${total} entries, ${trusted} reviewed/practical, period ${month}.`);
