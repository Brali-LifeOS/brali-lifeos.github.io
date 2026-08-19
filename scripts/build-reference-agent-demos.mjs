import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { answerWithBrali, buildMcpPlan } from '../examples/javascript/reference-agent-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const write = (rel, value) => { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));

const config = read('data/reference-agent-scenarios.json');
const apiIndex = read('api/v1/index.json');
const results = [];
for (const scenario of config.scenarios || []) {
  const packet = await answerWithBrali(scenario.question, { root: ROOT });
  results.push({ id: scenario.id, expectations: { expected_topic_ids: scenario.expected_topic_ids || [], expected_protocol_slugs: scenario.expected_protocol_slugs || [], expected_decision_ids: scenario.expected_decision_ids || [], expected_status: scenario.expected_status, safety_boundary: Boolean(scenario.safety_boundary) }, packet, mcp_plan: buildMcpPlan(packet) });
}
const dataset = {
  schema_version: 1,
  dataset_version: apiIndex.dataset_version,
  api_version: apiIndex.api_version,
  name: 'Brali Reference Agent Demos',
  description: 'Deterministic practical-agent examples generated from the same static API and trust rules external consumers can use.',
  canonical_url: `${BASE}/life-os/datasets/reference-agent-demos.json`,
  page_url: `${BASE}/for-ai/demos/`,
  scenarios: results
};
writeJson('life-os/datasets/reference-agent-demos.json', dataset);
writeJson('api/v1/demos.json', dataset);

const index = read('api/v1/index.json');
index.endpoints = [...new Set([...(index.endpoints || []), 'demos.json'])];
writeJson('api/v1/index.json', index);
const openapi = read('api/v1/openapi.json');
openapi.paths ||= {};
openapi.paths['/api/v1/demos.json'] = { get: { operationId: 'get_reference_agent_demos', summary: 'Get generated Brali reference agent scenarios and bounded answer packets', responses: { '200': { description: 'Reference agent demo collection', content: { 'application/json': { schema: { type: 'object' } } } } } } };
writeJson('api/v1/openapi.json', openapi);

const cards = results.map(({ id, packet }) => {
  const topics = (packet.route?.topics || []).map(x => `<code>${esc(x.canonical_id)}</code>`).join(' · ') || 'No normal Topic route';
  const recs = (packet.recommendations || []).map(x => `<li><a href="${esc(x.provenance.record_url)}">${esc(x.title)}</a> <code>${esc(x.canonical_id)}</code> · <strong>${esc(x.evidence_state)}</strong><br>${esc(x.action)}${x.provenance.source_url ? `<br><a href="${esc(x.provenance.source_url)}" rel="noopener">Reviewed source</a>` : ''}</li>`).join('') || '<li>No trusted protocol recommendation.</li>';
  const boundaries = (packet.evidence_boundaries || []).map(x => `<li><code>${esc(x.canonical_id)}</code> · ${esc(x.decision)}<br>${esc(x.supported_claim)}<br><a href="${esc(x.source_url)}" rel="noopener">Reviewed source</a></li>`).join('') || '<li>No reviewed Evidence Decision attached to this answer.</li>';
  return `<article class="card"><span class="card-label">${esc(packet.status)}</span><h2>${esc(id)}</h2><p><strong>Question:</strong> ${esc(packet.question)}</p><p><strong>Route:</strong> ${topics}</p><h3>Trusted recommendations</h3><ul>${recs}</ul><h3>Evidence boundaries</h3><ul>${boundaries}</ul></article>`;
}).join('');
const schema = { '@context':'https://schema.org', '@type':'TechArticle', name:'Brali Reference Agent Demos', description:dataset.description, url:dataset.page_url, about:['AI agents','retrieval','evidence-aware practical knowledge'] };
write('for-ai/demos/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reference agent demos | Brali</title><meta name="description" content="Runnable Brali API and MCP reference scenarios showing Topic routing, trusted Protocols, Evidence Decisions, provenance, and safe no-answer behavior."><link rel="canonical" href="${dataset.page_url}"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head><body><header class="site-header"><nav class="wrap nav"><a class="brand" href="/"><span>Brali</span></a><div class="links"><a href="/for-ai/">For AI</a><a href="/topics/">Topics</a><a href="/life-os/datasets/">Datasets</a></div></nav></header><main class="page wrap"><p class="eyebrow">Reference integration</p><h1>Question → Topic → Protocol → Evidence → provenance</h1><p class="lead">These examples are generated during the Brali build from the same API files an external agent reads. They are regression fixtures, not hand-authored success screenshots.</p><div class="callout"><strong>Contract:</strong> API ${esc(dataset.api_version)} · dataset ${esc(dataset.dataset_version)}. Normal recommendations are limited to <code>reviewed</code>/<code>practical</code> content. The safety scenario intentionally returns no trusted answer.</div><div class="grid two">${cards}</div><section class="prose"><h2>Run it</h2><pre><code>npm run build
node examples/javascript/reference-agent.mjs --scenario sleep
node examples/javascript/reference-agent.mjs --scenario memory
node examples/javascript/reference-agent.mjs --scenario task-initiation
node examples/javascript/reference-agent.mjs --scenario safety-boundary
node examples/javascript/reference-mcp-plan.mjs --scenario memory</code></pre><p><a href="/api/v1/demos.json">Generated API output</a> · <a href="/life-os/datasets/reference-agent-demos.json">Canonical demo dataset</a> · <a href="/docs/REFERENCE_AGENT_DEMOS.md">Methodology in the repository</a></p></section></main></body></html>`);

for (const rel of ['for-ai/index.html', 'life-os/datasets/index.html']) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('data-reference-agent-demos')) html = html.replace('</main>', '<aside class="callout" data-reference-agent-demos><h3>Runnable reference agent demos</h3><p>See generated Sleep, Memory, Task Initiation, and safety-boundary examples using API v1 and MCP-compatible tool plans.</p><a class="button" href="/for-ai/demos/">Open demos</a></aside></main>');
  fs.writeFileSync(file, html);
}
const llms = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llms)) {
  let text = fs.readFileSync(llms, 'utf8');
  if (!text.includes('/for-ai/demos/')) text += `\n## Reference Agent Demos\n- Human-readable: ${BASE}/for-ai/demos/\n- Machine-readable: ${BASE}/api/v1/demos.json\n`;
  fs.writeFileSync(llms, text);
}
const sitemap = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemap)) {
  let text = fs.readFileSync(sitemap, 'utf8');
  if (!text.includes(`${BASE}/for-ai/demos/`)) text = text.replace('</urlset>', `  <url><loc>${BASE}/for-ai/demos/</loc></url>\n</urlset>`);
  fs.writeFileSync(sitemap, text);
}

const manifest = read('life-os/datasets/manifest.json');
const published = ['data/reference-agent-scenarios.json', 'life-os/datasets/reference-agent-demos.json'];
manifest.files = (manifest.files || []).filter(x => !published.includes(typeof x === 'string' ? x : x.path));
for (const rel of published) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const doc = JSON.parse(text);
  const count = Array.isArray(doc.scenarios) ? doc.scenarios.length : null;
  manifest.files.push({ path: rel, sha256: hash(text), bytes: Buffer.byteLength(text), count });
}
manifest.files.sort((a,b) => String(a.path || a).localeCompare(String(b.path || b)));
manifest.counts ||= {};
manifest.counts.reference_agent_scenarios = results.length;
writeJson('life-os/datasets/manifest.json', manifest);
writeJson('api/v1/manifest.json', manifest);
console.log(`Reference agent demos generated: ${results.length} scenarios; ${results.filter(x=>x.packet.status==='trusted-answer').length} trusted answers; ${results.filter(x=>x.packet.status==='no-trusted-answer').length} safe no-answer(s).`);
