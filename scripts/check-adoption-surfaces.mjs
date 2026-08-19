import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const config = json('data/adoption.json');
const platform = json('data/platform.json');
assert(config.schema_version === 1, 'data/adoption.json schema_version must be 1');
assert(config.dataset_version === platform.dataset_version, 'Adoption dataset version must match platform dataset version');
assert(config.mcp?.transport === 'stdio', 'Brali MCP adoption contract must remain stdio until a remote server is actually deployed');
assert(config.mcp?.hosted_remote === false, 'Do not claim Brali hosts remote MCP before such an endpoint exists');

const runtimeIds = new Set((config.runtimes || []).map(x => x.id));
for (const id of ['cursor', 'claude-code', 'openai-api']) assert(runtimeIds.has(id), `Missing adoption runtime ${id}`);
assert(runtimeIds.size === 3, `Expected exactly 3 maintained runtime recipes, found ${runtimeIds.size}`);
for (const runtime of config.runtimes || []) {
  assert(/^https:\/\//.test(runtime.official_docs || ''), `${runtime.id} must link to runtime documentation`);
  assert(fs.existsSync(path.join(ROOT, runtime.example)), `${runtime.id} example missing: ${runtime.example}`);
}

const cursor = json('examples/integrations/cursor-mcp.json');
const cursorBrali = cursor.mcpServers?.brali;
assert(cursorBrali?.command === 'node', 'Cursor example must launch Brali with node');
assert((cursorBrali?.args || []).some(x => String(x).endsWith('/mcp/server.mjs')), 'Cursor example must point to mcp/server.mjs');

const claude = read('examples/integrations/claude-code.sh');
assert(claude.includes('claude mcp add brali'), 'Claude Code example must register a Brali MCP server');
assert(claude.includes('--scope user'), 'Claude Code example should explicitly document its chosen scope');
assert(claude.includes('mcp/server.mjs'), 'Claude Code example must point to mcp/server.mjs');

const openai = read('examples/integrations/openai-api.mjs');
assert(openai.includes('answerWithBrali'), 'OpenAI example must reuse the Brali reference answer packet');
assert(openai.includes('https://brali-lifeos.github.io/api/v1'), 'OpenAI example must default to the hosted Brali API');
assert(openai.includes('https://api.openai.com/v1/responses'), 'OpenAI example must target the Responses API');
assert(!openai.includes('server_url:') && !openai.includes('"type": "mcp"'), 'OpenAI example must not pretend Brali exposes hosted remote MCP');

const integrations = json('for-ai/integrations/index.json');
const apiIntegrations = json(`api/${platform.api_version}/integrations.json`);
assert(integrations.dataset_version === config.dataset_version, 'Public integration JSON version mismatch');
assert(JSON.stringify(integrations) === JSON.stringify(apiIntegrations), 'Public and API integration metadata must be identical');
assert(integrations.mcp.hosted_remote === false, 'Published integration metadata must preserve remote MCP limitation');

const integrationHtml = read('for-ai/integrations/index.html');
for (const required of ['Cursor', 'Claude Code', 'OpenAI API', '/for-ai/demos/', '/cite/', '/partners/']) assert(integrationHtml.includes(required), `Integration page missing ${required}`);
assert(integrationHtml.includes('does not exist') || integrationHtml.includes('does not currently'), 'Integration page must state the hosted remote MCP limitation');

const citation = json('cite/index.json');
const citationHtml = read('cite/index.html');
const cff = read('CITATION.cff');
assert(citation.author === 'Dzmitryi Kharlanau', 'Citation JSON author drifted');
assert(citation.dataset_title === 'Brali Practical Knowledge Library', 'Citation dataset title drifted');
assert(citation.license === 'CC-BY-NC-SA-4.0', 'Citation JSON license drifted');
assert(cff.includes('family-names: Kharlanau') && cff.includes('given-names: Dzmitryi'), 'CITATION.cff author does not match public citation guidance');
assert(cff.includes('license: CC-BY-NC-SA-4.0'), 'CITATION.cff license does not match public citation guidance');
for (const required of ['Dzmitryi Kharlanau', 'Brali Practical Knowledge Library', 'CC-BY-NC-SA-4.0', 'canonical', 'evidence state', '/partners/']) assert(citationHtml.includes(required), `Citation page missing ${required}`);

const forAi = read('for-ai/index.html');
assert(forAi.includes('data-brali-adoption') && forAi.includes('/for-ai/integrations/') && forAi.includes('/cite/'), 'For-AI page must expose integrations and citation entry points');
const llms = read('llms.txt');
for (const required of ['/for-ai/integrations/', `/api/${platform.api_version}/integrations.json`, '/cite/', 'local stdio MCP server']) assert(llms.includes(required), `llms.txt missing adoption entry ${required}`);
const readme = read('README.md');
for (const required of ['/for-ai/integrations/', '/cite/', 'examples/integrations/']) assert(readme.includes(required), `README missing adoption entry ${required}`);

const apiIndex = json(`api/${platform.api_version}/index.json`);
assert((apiIndex.endpoints || []).includes('integrations.json'), 'API index missing integrations.json');
const openapi = json(`api/${platform.api_version}/openapi.json`);
assert(openapi.paths?.[`/api/${platform.api_version}/integrations.json`], 'OpenAPI missing integrations endpoint');
const sitemap = read('sitemap.xml');
for (const url of ['https://brali-lifeos.github.io/for-ai/integrations/', 'https://brali-lifeos.github.io/cite/']) assert(sitemap.includes(`<loc>${url}</loc>`), `Sitemap missing ${url}`);

const manifest = json('life-os/datasets/manifest.json');
const manifestPaths = new Set((manifest.files || []).map(x => typeof x === 'string' ? x : x.path));
for (const rel of ['data/adoption.json', 'for-ai/integrations/index.json', 'cite/index.json']) assert(manifestPaths.has(rel), `Manifest missing ${rel}`);
assert(manifest.counts?.integration_runtimes === 3, 'Manifest integration runtime count must be 3');

const licensing = read('LICENSING.md');
assert(licensing.includes('CC BY-NC-SA 4.0') && licensing.includes('Commercial use requires separate written permission'), 'Public adoption guidance must remain aligned with licensing policy');

console.log('Adoption surfaces verified: 3 runtime kits, truthful local-MCP boundary, citation/attribution contract, API metadata, sitemap and AI discovery links.');
