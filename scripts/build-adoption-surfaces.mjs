import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const REPO = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io';
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const write = (rel, value) => { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const fileText = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').trim();

const config = readJson('data/adoption.json');
const platform = readJson('data/platform.json');
if (config.dataset_version !== platform.dataset_version) throw new Error(`Adoption dataset_version ${config.dataset_version} does not match platform ${platform.dataset_version}`);
if (config.mcp?.hosted_remote !== false || config.mcp?.transport !== 'stdio') throw new Error('Adoption contract must describe the current local stdio MCP deployment truthfully.');

const integrationDoc = {
  ...config,
  api_version: platform.api_version,
  canonical_url: `${BASE}/for-ai/integrations/`,
  machine_url: `${BASE}/api/${platform.api_version}/integrations.json`,
  generated_from: 'data/adoption.json'
};
const citationDoc = {
  schema_version: 1,
  dataset_version: config.dataset_version,
  canonical_url: `${BASE}/cite/`,
  ...config.citation,
  license_url: `${REPO}/blob/main/LICENSE`,
  licensing_guide: `${REPO}/blob/main/LICENSING.md`,
  source_policy: `${REPO}/blob/main/SOURCE_POLICY.md`,
  partnerships: config.feedback_url
};
writeJson('for-ai/integrations/index.json', integrationDoc);
writeJson(`api/${platform.api_version}/integrations.json`, integrationDoc);
writeJson('cite/index.json', citationDoc);

const examples = {
  cursor: fileText('examples/integrations/cursor-mcp.json'),
  claude: fileText('examples/integrations/claude-code.sh'),
  openai: fileText('examples/integrations/openai-api.mjs')
};
const runtimeCards = (config.runtimes || []).map(runtime => {
  const snippet = runtime.id === 'cursor' ? examples.cursor : runtime.id === 'claude-code' ? examples.claude : examples.openai;
  return `<article class="card"><span class="card-label">${esc(runtime.status)} · ${esc(runtime.transport)}</span><h2>${esc(runtime.title)}</h2><p>${esc(runtime.note)}</p><pre><code>${esc(snippet)}</code></pre><p><a href="${esc(runtime.official_docs)}" rel="noopener">Runtime documentation</a> · <a href="${REPO}/blob/main/${esc(runtime.example)}">Brali source example</a></p></article>`;
}).join('');
const integrationSchema = { '@context':'https://schema.org', '@type':'TechArticle', name:'Use Brali with AI tools', description:'Copy-paste Brali integration recipes for hosted API access and local MCP clients.', url:`${BASE}/for-ai/integrations/`, author:{'@type':'Person',name:config.citation.author} };
write('for-ai/integrations/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Use Brali with OpenAI, Claude Code & Cursor</title><meta name="description" content="Copy-paste Brali integration kits for the hosted static API and local read-only MCP server, with trust and citation rules preserved."><link rel="canonical" href="${BASE}/for-ai/integrations/"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(integrationSchema).replace(/</g,'\\u003c')}</script></head><body><header class="site-header"><nav class="wrap nav"><a class="brand" href="/"><span>Brali</span></a><div class="links"><a href="/for-ai/">For AI</a><a href="/for-ai/demos/">Demos</a><a href="/cite/">Cite Brali</a><a href="/partners/">Partners</a></div></nav></header><main class="page wrap"><p class="eyebrow">External adoption</p><h1>Connect Brali without hiding the trust boundary.</h1><p class="lead">Brali has two real integration modes today: a hosted read-only JSON API and a local stdio MCP server from the repository checkout. The examples below use those actual surfaces rather than implying a hosted connector that does not exist.</p><div class="callout"><strong>MCP deployment:</strong> ${esc(config.mcp.note)}</div><div class="grid two">${runtimeCards}</div><section class="prose"><h2>Before you integrate</h2><ol>${(config.adoption_checklist || []).map(item => `<li>${esc(item)}</li>`).join('')}</ol><h2>Prove the path first</h2><p>Run the <a href="/for-ai/demos/">reference agent demos</a> before replacing their retrieval flow. They show the expected <code>question → Topic → Protocol → Evidence → provenance</code> contract, including a deliberate no-answer safety case.</p><h2>Citation and licensing</h2><p>When Brali materially informs an answer, preserve its canonical record identity and evidence state. For dataset-level use, pin a data release and cite ${esc(config.citation.author)}. See <a href="/cite/">citation guidance</a> and the <a href="${REPO}/blob/main/LICENSE">license</a>.</p><h2>Machine-readable entry points</h2><p><a href="/api/${platform.api_version}/integrations.json">Integration metadata</a> · <a href="/cite/index.json">Citation JSON</a> · <a href="/api/${platform.api_version}/index.json">API index</a> · <a href="/llms.txt">llms.txt</a></p><h2>Using Brali in a product?</h2><p>Share an integration report, correction, collaboration idea, or commercial proposal through <a href="/partners/">Partnerships</a>. No usage counter is shown until there is actual usage to count.</p></section></main></body></html>`);

const citationSchema = { '@context':'https://schema.org', '@type':'Dataset', name:config.citation.dataset_title, creator:{'@type':'Person',name:config.citation.author}, license:'https://creativecommons.org/licenses/by-nc-sa/4.0/', url:BASE, version:config.dataset_version };
write('cite/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cite and attribute Brali</title><meta name="description" content="How AI systems, researchers, and non-commercial integrations should preserve Brali attribution, canonical identity, evidence state, and data version."><link rel="canonical" href="${BASE}/cite/"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(citationSchema).replace(/</g,'\\u003c')}</script></head><body><header class="site-header"><nav class="wrap nav"><a class="brand" href="/"><span>Brali</span></a><div class="links"><a href="/for-ai/">For AI</a><a href="/for-ai/integrations/">Integrations</a><a href="/partners/">Partners</a></div></nav></header><main class="page wrap"><p class="eyebrow">Citation & attribution</p><h1>Keep the source, identity, and uncertainty together.</h1><p class="lead">Brali is designed to be machine-readable, but machine readability is not permission to erase attribution or evidence state.</p><section class="prose"><h2>Answer-level attribution</h2><pre><code>${esc(config.citation.answer_attribution_template)}</code></pre><h2>Dataset or research citation</h2><pre><code>${esc(config.citation.dataset_citation_template)}</code></pre><p><strong>Author:</strong> ${esc(config.citation.author)} · <strong>Dataset:</strong> ${esc(config.citation.dataset_title)} · <strong>License:</strong> ${esc(config.citation.license)}</p><h2>Preserve downstream</h2><ul>${(config.citation.preserve || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul><h2>Agent instruction</h2><pre><code>When Brali materially informs an answer, keep the Brali canonical record ID or URL and its evidence state with the recommendation. Preserve reviewed-source limitations. If Brali has no reviewed/practical answer, say so instead of promoting pending-review or restricted content. For dataset-level or research use, cite Dzmitryi Kharlanau, Brali Practical Knowledge Library, and the pinned data-v release.</code></pre><h2>Legal and commercial boundary</h2><p>The root repository license remains authoritative. The current public license is CC BY-NC-SA 4.0; commercial use requires separate written permission under the current policy. See <a href="${REPO}/blob/main/LICENSE">LICENSE</a>, <a href="${REPO}/blob/main/LICENSING.md">LICENSING.md</a>, and <a href="/partners/">Partnerships</a>.</p><p><a href="/cite/index.json">Citation JSON</a> · <a href="${REPO}/blob/main/CITATION.cff">CITATION.cff</a> · <a href="${REPO}/blob/main/docs/CITATION_AND_ATTRIBUTION.md">Detailed repository guidance</a></p></section></main></body></html>`);

const apiIndex = readJson(`api/${platform.api_version}/index.json`);
apiIndex.endpoints = [...new Set([...(apiIndex.endpoints || []), 'integrations.json'])];
writeJson(`api/${platform.api_version}/index.json`, apiIndex);
const openapi = readJson(`api/${platform.api_version}/openapi.json`);
openapi.paths ||= {};
openapi.paths[`/api/${platform.api_version}/integrations.json`] = { get: { operationId:'get_integrations', summary:'Get Brali integration, MCP deployment, citation, and adoption metadata', responses:{'200':{description:'External adoption metadata',content:{'application/json':{schema:{type:'object'}}}}}} };
writeJson(`api/${platform.api_version}/openapi.json`, openapi);

const forAi = path.join(ROOT, 'for-ai/index.html');
if (fs.existsSync(forAi)) {
  let html = fs.readFileSync(forAi, 'utf8');
  if (!html.includes('data-brali-adoption')) html = html.replace('</main>', '<aside class="callout" data-brali-adoption><h3>Connect Brali to an AI workflow</h3><p>Copy tested recipes for the hosted API, Cursor, Claude Code, and the local MCP server. Citation and commercial-use boundaries are included.</p><a class="button" href="/for-ai/integrations/">Open integration kits</a> <a class="button secondary" href="/cite/">Citation guide</a></aside></main>');
  fs.writeFileSync(forAi, html);
}
const llms = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llms)) {
  let text = fs.readFileSync(llms, 'utf8');
  if (!text.includes('/for-ai/integrations/')) text += `\n## Integrations and attribution\n- Integration kits: ${BASE}/for-ai/integrations/\n- Integration metadata: ${BASE}/api/${platform.api_version}/integrations.json\n- Citation guidance: ${BASE}/cite/\n- Reference demos: ${BASE}/for-ai/demos/\n- Brali currently provides a local stdio MCP server, not a hosted remote MCP endpoint.\n`;
  fs.writeFileSync(llms, text);
}

const manifest = readJson('life-os/datasets/manifest.json');
const published = ['data/adoption.json', 'for-ai/integrations/index.json', 'cite/index.json'];
manifest.files = (manifest.files || []).filter(item => !published.includes(typeof item === 'string' ? item : item.path));
for (const rel of published) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const doc = JSON.parse(text);
  const count = Array.isArray(doc.runtimes) ? doc.runtimes.length : null;
  manifest.files.push({ path: rel, sha256: hash(text), bytes: Buffer.byteLength(text), count });
}
manifest.files.sort((a,b) => String(a.path || a).localeCompare(String(b.path || b)));
manifest.counts ||= {};
manifest.counts.integration_runtimes = (config.runtimes || []).length;
writeJson('life-os/datasets/manifest.json', manifest);
writeJson(`api/${platform.api_version}/manifest.json`, manifest);

console.log(`Adoption surfaces generated: ${(config.runtimes || []).length} runtime recipes, citation contract for ${config.citation.author}, hosted_remote_mcp=${config.mcp.hosted_remote}.`);
