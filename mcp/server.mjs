import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(ROOT, 'api', 'v1');
const load = name => JSON.parse(fs.readFileSync(path.join(API, name), 'utf8'));
const items = name => load(name).items || [];
const asText = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const normalize = value => String(value || '').toLocaleLowerCase().normalize('NFKD');
const evidenceState = item => item.evidence_state || item.status || item.evidence?.status || 'unknown';
const safe = item => !['pending-review', 'restricted'].includes(evidenceState(item));

function findById(name, id) {
  const wanted = normalize(id);
  return items(name).find(item => [item.canonical_id, item.id, item.protocol_id, item.slug].filter(Boolean).some(value => normalize(value) === wanted));
}
function lexicalSearch(query, limit = 5, trustedOnly = true) {
  if (trustedOnly && /severe depression|suicid|self[- ]harm|diagnos|treat .* without/i.test(query)) return [];
  const terms = normalize(query).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(x => x.length > 2);
  return items('search.json').map(item => {
    if (trustedOnly && item.kind === 'protocol' && !safe(item)) return null;
    const hay = normalize(`${item.title || ''} ${item.search_text || ''}`);
    const score = terms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0);
    return score ? { ...item, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id))).slice(0, limit);
}

function createServer() {
  const server = new McpServer({ name: 'brali-knowledge', version: '1.0.0' });
  server.registerTool('search_knowledge', { description: 'Search Brali Topics and trusted Protocols. Evidence state is preserved; restricted/pending material is excluded by default.', inputSchema: z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(20).default(5), trusted_only: z.boolean().default(true) }) }, async ({ query, limit, trusted_only }) => asText({ query, trusted_only, results: lexicalSearch(query, limit, trusted_only) }));
  server.registerTool('get_hack', { description: 'Get one Brali Hack by canonical or legacy ID.', inputSchema: z.object({ id: z.string().min(1) }) }, async ({ id }) => { const item = findById('hacks.json', id); return item ? asText(item) : asText({ found: false, id }); });
  server.registerTool('get_protocol', { description: 'Get one Brali Protocol by canonical or legacy ID.', inputSchema: z.object({ id: z.string().min(1) }) }, async ({ id }) => { const item = findById('protocols.json', id); return item ? asText(item) : asText({ found: false, id }); });
  server.registerTool('get_evidence', { description: 'Get evidence metadata while preserving review state and provenance.', inputSchema: z.object({ id: z.string().min(1) }) }, async ({ id }) => { const item = findById('evidence.json', id); return item ? asText(item) : asText({ found: false, id }); });
  server.registerTool('list_topics', { description: 'List canonical Brali Topics, optionally filtered by Domain.', inputSchema: z.object({ domain_id: z.string().optional(), language: z.string().default('en') }) }, async ({ domain_id, language }) => { const all = items('topics.json').filter(x => !domain_id || x.domain_id === domain_id); return asText({ language, topics: all }); });
  server.registerTool('get_related', { description: 'Find trusted Protocols that share Topic IDs with a Protocol or Topic.', inputSchema: z.object({ id: z.string().min(1), limit: z.number().int().min(1).max(20).default(5) }) }, async ({ id, limit }) => {
    const protocol = findById('protocols.json', id); const topic = findById('topics.json', id);
    const topicIds = new Set(protocol?.ontology?.topic_ids || protocol?.topic_ids || (topic ? [topic.id] : []));
    if (!topicIds.size) return asText({ found: false, id, related: [] });
    const related = items('protocols.json').filter(x => x !== protocol && safe(x) && (x.ontology?.topic_ids || x.topic_ids || []).some(t => topicIds.has(t))).slice(0, limit);
    return asText({ id, topic_ids: [...topicIds], related });
  });
  return server;
}

void serveStdio(createServer);
console.error('Brali MCP server running on stdio');
