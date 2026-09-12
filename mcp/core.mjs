import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const asText = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const normalize = value => String(value || '').toLocaleLowerCase().normalize('NFKD');
const evidenceState = item => item?.evidence_state || item?.status || item?.evidence?.status || 'unknown';
const trusted = item => ['reviewed', 'practical'].includes(evidenceState(item));
const safetySensitive = query => /severe depression|suicid|self[- ]harm|diagnos|treat .* without/i.test(query);
const noAnswer = (id, reason = 'not_found_or_not_trusted') => ({
  found: false,
  no_answer: true,
  id,
  reason,
  trust_mode: 'trusted-only'
});

const compactProvenance = item => {
  if (!item) return null;
  const value = {
    canonical_id: item.canonical_id || item.id || item.protocol_id,
    canonical_url: item.canonical_url || item.url,
    evidence_state: evidenceState(item),
    source: item.source,
    sources: item.sources,
    source_url: item.source_url,
    source_urls: item.source_urls,
    citations: item.citations,
    references: item.references,
    provenance: item.provenance,
    last_reviewed: item.last_reviewed || item.reviewed_at || item.review_date
  };
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
};

export function createBraliServer({ loadItems }) {
  if (typeof loadItems !== 'function') throw new TypeError('createBraliServer requires loadItems(name).');
  const load = async name => {
    const value = await loadItems(name);
    return Array.isArray(value) ? value : (value?.items || []);
  };
  const findById = async (name, id) => {
    const wanted = normalize(id);
    return (await load(name)).find(item => [item.canonical_id, item.id, item.protocol_id, item.slug]
      .filter(Boolean)
      .some(value => normalize(value) === wanted));
  };
  const trustedLookup = async (name, id) => {
    const item = await findById(name, id);
    return item && trusted(item) ? item : null;
  };
  const lexicalSearch = async (query, limit = 5) => {
    if (safetySensitive(query)) return [];
    const terms = normalize(query).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(x => x.length > 2);
    return (await load('search.json')).map(item => {
      if (item.kind === 'protocol' && !trusted(item)) return null;
      if (item.kind === 'hack' && !trusted(item)) return null;
      const hay = normalize(`${item.title || ''} ${item.search_text || ''}`);
      const score = terms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0);
      return score ? { ...item, score } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id))).slice(0, limit);
  };

  const server = new McpServer(
    { name: 'brali-knowledge', version: '1.2.0' },
    { instructions: 'Brali MCP is read-only and trusted-only. Preserve canonical IDs, evidence state, provenance and explicit no-answer outcomes. Never invent a nearby answer when Brali has no trusted coverage.' }
  );

  server.registerTool('search_knowledge', {
    description: 'Search Brali Topics and trusted Protocols/Hacks. Pending-review and restricted material cannot be requested through this public tool.',
    inputSchema: z.object({ query: z.string().min(2).max(500), limit: z.number().int().min(1).max(20).default(5) })
  }, async ({ query, limit }) => {
    const results = await lexicalSearch(query, limit);
    return asText({ query, trust_mode: 'trusted-only', no_answer: results.length === 0, results });
  });

  server.registerTool('get_topic', {
    description: 'Get one canonical Brali Topic by canonical or legacy ID. Topics are taxonomy records, not recommendations.',
    inputSchema: z.object({ id: z.string().min(1).max(200) })
  }, async ({ id }) => {
    const item = await findById('topics.json', id);
    return asText(item || noAnswer(id, 'topic_not_found'));
  });

  server.registerTool('get_hack', {
    description: 'Get one trusted Brali Hack by canonical or legacy ID. Untrusted records return an explicit no-answer result.',
    inputSchema: z.object({ id: z.string().min(1).max(200) })
  }, async ({ id }) => {
    const item = await trustedLookup('hacks.json', id);
    return asText(item || noAnswer(id));
  });

  server.registerTool('get_protocol', {
    description: 'Get one trusted Brali Protocol by canonical or legacy ID. Untrusted records return an explicit no-answer result.',
    inputSchema: z.object({ id: z.string().min(1).max(200) })
  }, async ({ id }) => {
    const item = await trustedLookup('protocols.json', id);
    return asText(item || noAnswer(id));
  });

  server.registerTool('get_evidence', {
    description: 'Get Brali evidence metadata while preserving review state and provenance. Pending-review/restricted evidence is never presented as trusted evidence.',
    inputSchema: z.object({ id: z.string().min(1).max(200) })
  }, async ({ id }) => {
    const item = await findById('evidence.json', id);
    if (!item || ['pending-review', 'restricted'].includes(evidenceState(item))) return asText(noAnswer(id, 'evidence_not_found_or_not_trusted'));
    return asText(item);
  });

  server.registerTool('get_provenance', {
    description: 'Return the canonical identity, evidence state and source/provenance fields for a trusted Brali Protocol, Hack, or Evidence record.',
    inputSchema: z.object({ id: z.string().min(1).max(200) })
  }, async ({ id }) => {
    const protocol = await trustedLookup('protocols.json', id);
    const hack = protocol ? null : await trustedLookup('hacks.json', id);
    const evidence = protocol || hack ? null : await findById('evidence.json', id);
    const item = protocol || hack || (evidence && !['pending-review', 'restricted'].includes(evidenceState(evidence)) ? evidence : null);
    return asText(item ? { found: true, provenance: compactProvenance(item) } : noAnswer(id, 'provenance_not_found_or_not_trusted'));
  });

  server.registerTool('list_topics', {
    description: 'List canonical Brali Topics, optionally filtered by Domain. Topic records are taxonomy, not recommendations.',
    inputSchema: z.object({ domain_id: z.string().max(200).optional(), language: z.string().max(20).default('en') })
  }, async ({ domain_id, language }) => {
    const all = (await load('topics.json')).filter(x => !domain_id || x.domain_id === domain_id);
    return asText({ language, topics: all });
  });

  server.registerTool('get_related', {
    description: 'Find trusted Protocols that share Topic IDs with a trusted Protocol or a Topic.',
    inputSchema: z.object({ id: z.string().min(1).max(200), limit: z.number().int().min(1).max(20).default(5) })
  }, async ({ id, limit }) => {
    const protocol = await trustedLookup('protocols.json', id);
    const topic = await findById('topics.json', id);
    const topicIds = new Set(protocol?.ontology?.topic_ids || protocol?.topic_ids || (topic ? [topic.id || topic.canonical_id] : []));
    if (!topicIds.size) return asText(noAnswer(id, 'trusted_protocol_or_topic_not_found'));
    const related = (await load('protocols.json'))
      .filter(x => x !== protocol && trusted(x) && (x.ontology?.topic_ids || x.topic_ids || []).some(t => topicIds.has(t)))
      .slice(0, limit);
    return asText({ id, trust_mode: 'trusted-only', no_answer: related.length === 0, topic_ids: [...topicIds], related });
  });
  return server;
}
