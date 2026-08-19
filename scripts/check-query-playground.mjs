import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

for (const rel of ['for-ai/query/index.html','for-ai/query/app.js','for-ai/query/retrieval.mjs']) assert(fs.existsSync(path.join(ROOT, rel)), `Missing ${rel}`);
const html = read('for-ai/query/index.html');
const app = read('for-ai/query/app.js');
assert(html.includes('https://brali-lifeos.github.io/for-ai/query/'), 'Query page canonical URL missing');
assert(html.includes('Copy agent context') && html.includes('Copy citation') && html.includes('Copy JSON packet'), 'Query copy actions missing');
assert(html.includes('processed in your browser'), 'Privacy boundary missing from query page');
assert(!/google-analytics|gtag\(|plausible|segment\.com/i.test(`${html}\n${app}`), 'Query playground must remain analytics-free');
for (const endpoint of ['topics.json','identity.json','protocols.json','evidence-decisions.json']) assert(app.includes(endpoint), `Query app must load ${endpoint}`);
assert(app.includes("searchParams.set('q', q)"), 'Shareable ?q= state is not wired');

const { queryBrali, buildAgentContext, buildCitation } = await import(pathToFileURL(path.join(ROOT, 'for-ai/query/retrieval.mjs')).href);
const data = {
  topics: json('api/v1/topics.json'),
  identity: json('api/v1/identity.json'),
  protocols: json('api/v1/protocols.json'),
  decisions: json('api/v1/evidence-decisions.json')
};

const cases = [
  { id: 'memory', query: 'How can I remember what I study?', status: 'trusted-answer', topic: 'memory' },
  { id: 'sleep', query: 'How can I sleep better?', status: 'trusted-answer', topic: 'sleep-circadian' },
  { id: 'task-initiation', query: 'How do I start a difficult task?', status: 'trusted-answer', topic: 'task-initiation' }
];
for (const test of cases) {
  const packet = queryBrali(test.query, data);
  assert(packet.status === test.status, `${test.id}: expected ${test.status}, got ${packet.status}`);
  assert(packet.route.topics.some(topic => topic.id === test.topic), `${test.id}: expected Topic ${test.topic}`);
  assert(packet.recommendations.length > 0, `${test.id}: expected trusted recommendation`);
  assert(packet.recommendations.every(item => ['reviewed','practical'].includes(item.evidence_state)), `${test.id}: untrusted recommendation leaked`);
  assert(packet.recommendations.every(item => item.canonical_id?.startsWith('brali:protocol:')), `${test.id}: canonical Protocol ID missing`);
  assert(packet.recommendations.every(item => item.provenance?.record_url?.startsWith('https://brali-lifeos.github.io/')), `${test.id}: Brali provenance URL missing`);
  assert(buildAgentContext(packet).includes('Preserve evidence state'), `${test.id}: agent context trust instruction missing`);
  assert(buildCitation(packet).startsWith('Source: Brali'), `${test.id}: citation output missing`);
}
const safety = queryBrali('How do I treat severe depression without a doctor?', data);
assert(safety.status === 'no-trusted-answer', 'Safety query must return no-trusted-answer');
assert(safety.safety?.blocked === true, 'Safety query must be explicitly blocked from normal retrieval');
assert(safety.recommendations.length === 0, 'Safety query leaked a recommendation');

const forAi = read('for-ai/index.html');
const llms = read('llms.txt');
const readme = read('README.md');
const sitemap = read('sitemap.xml');
for (const [name, text] of [['for-ai',forAi],['llms.txt',llms],['README',readme]]) assert(text.includes('/for-ai/query/'), `${name} does not link to query playground`);
assert(sitemap.includes('https://brali-lifeos.github.io/for-ai/query/'), 'Sitemap does not include query playground');

console.log(`Query playground verified: ${cases.length} trusted cases + 1 safety no-answer; canonical Topic/alias routing, shareable URL, copy packet, citation, provenance, privacy and discovery links passed.`);
