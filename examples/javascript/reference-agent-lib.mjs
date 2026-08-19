import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://brali-lifeos.github.io';
const TRUSTED = new Set(['reviewed', 'practical']);
const STOP = new Set(['a','an','the','to','and','or','of','for','in','on','with','without','i','my','me','what','how','can','is','it','are','do','does','am','be','because','that','this','way','как','что','и','не','на','для','мне','я']);
const normalize = value => String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = value => normalize(value).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
const topicIds = protocol => (protocol.ontology?.topics || protocol.ontology?.topic_ids || protocol.topic_ids || []).map(x => typeof x === 'string' ? x : x?.id).filter(Boolean);
const evidenceState = protocol => protocol.evidence?.status || protocol.evidence_state || protocol.status || 'unknown';
const protocolSlug = value => String(value || '').replace(/^brali:protocol:/, '').replace(/^brali:/, '');
const decisionTargetSlugs = decision => (decision.target_protocol_ids || []).map(protocolSlug);
const isSafetyBoundary = query => /severe depression|suicid|self[- ]harm|diagnos|treat .* without|treatment .* without/i.test(String(query));

async function loadJson({ root, apiBase }, name) {
  if (apiBase) {
    const response = await fetch(`${String(apiBase).replace(/\/$/, '')}/${name}`);
    if (!response.ok) throw new Error(`Brali API ${name} returned ${response.status}`);
    return response.json();
  }
  const file = path.join(root, 'api', 'v1', name);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function loadReferenceApi(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const apiBase = options.apiBase || null;
  const [index, topics, protocols, decisions, identity] = await Promise.all([
    loadJson({ root, apiBase }, 'index.json'),
    loadJson({ root, apiBase }, 'topics.json'),
    loadJson({ root, apiBase }, 'protocols.json'),
    loadJson({ root, apiBase }, 'evidence-decisions.json'),
    loadJson({ root, apiBase }, 'identity.json')
  ]);
  return { root, apiBase, index, topics: topics.items || [], protocols: protocols.items || [], decisions: decisions.items || [], identity };
}

function topicScore(query, topic, aliases) {
  const q = normalize(query), qTokens = new Set(tokens(query));
  const phrases = [topic.title, topic.description, ...aliases].filter(Boolean).map(normalize).filter(Boolean);
  let score = 0;
  for (const phrase of phrases) {
    if (phrase.length > 3 && q.includes(phrase)) score += 14;
    for (const term of tokens(phrase)) if (qTokens.has(term)) score += topic.title && normalize(topic.title).includes(term) ? 4 : 2;
  }
  return score;
}

function protocolScore(query, protocol, routedTopics) {
  const pTopics = topicIds(protocol), topicMatches = pTopics.filter(id => routedTopics.has(id)).length;
  if (!topicMatches) return -1;
  const q = normalize(query), qTokens = new Set(tokens(query));
  const hay = normalize([protocol.title, protocol.description, protocol.action, protocol.check_in].filter(Boolean).join(' '));
  let lexical = 0;
  for (const term of qTokens) if (hay.includes(term)) lexical += 2;
  if (protocol.title && q.includes(normalize(protocol.title))) lexical += 12;
  return topicMatches * 100 + lexical + (evidenceState(protocol) === 'reviewed' ? 18 : 0) + (protocol.evidence?.source_url ? 8 : 0) + (protocol.check_in ? 3 : 0);
}

function provenance(protocol) {
  const recordUrl = protocol.url ? new URL(protocol.url, BASE).href : `${BASE}/life-os/${protocol.slug}/`;
  if (protocol.evidence?.source_url) return { kind: 'reviewed-source', source_url: protocol.evidence.source_url, record_url: recordUrl };
  return { kind: 'brali-reviewed-record', source_url: null, record_url: recordUrl };
}

export function buildMcpPlan(packet) {
  const steps = [{ tool: 'search_knowledge', arguments: { query: packet.question, limit: 5, trusted_only: true } }];
  for (const item of packet.recommendations || []) {
    steps.push({ tool: 'get_protocol', arguments: { id: item.canonical_id } });
    steps.push({ tool: 'get_evidence', arguments: { id: item.slug } });
  }
  return { schema_version: 1, question: packet.question, expected_status: packet.status, steps, note: 'Run these calls through any MCP client connected to mcp/server.mjs. Preserve evidence state and source/boundary fields in downstream answers.' };
}

export async function answerWithBrali(question, options = {}) {
  const api = options.api || await loadReferenceApi(options);
  const contract = { api_version: api.index.api_version || 'v1', dataset_version: api.index.dataset_version, static_api: api.index.static_api === true };
  if (isSafetyBoundary(question)) return { schema_version: 1, contract, question, status: 'no-trusted-answer', route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked_from_normal_recommendation: true, reason: 'Safety-sensitive treatment/diagnosis request is outside normal Brali trusted retrieval.' } };

  const aliasesByTopic = new Map();
  for (const alias of api.identity.aliases || []) {
    if (alias.kind !== 'topic') continue;
    const local = String(alias.canonical_id || '').replace(/^brali:topic:/, '');
    if (!aliasesByTopic.has(local)) aliasesByTopic.set(local, []);
    aliasesByTopic.get(local).push(alias.value);
  }
  const rankedTopics = api.topics.map(topic => ({ topic, score: topicScore(question, topic, aliasesByTopic.get(topic.id) || []) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.topic.id.localeCompare(b.topic.id));
  const best = rankedTopics[0]?.score || 0;
  const routed = rankedTopics.filter(x => x.score >= Math.max(2, best * 0.65)).slice(0, 3).map(x => x.topic);
  const routedIds = new Set(routed.map(x => x.id));

  const rankedProtocols = api.protocols
    .filter(protocol => TRUSTED.has(evidenceState(protocol)))
    .map(protocol => ({ protocol, score: protocolScore(question, protocol, routedIds) }))
    .filter(x => x.score >= 0).sort((a, b) => b.score - a.score || String(a.protocol.slug).localeCompare(String(b.protocol.slug))).slice(0, 3);
  const recommendations = rankedProtocols.map(({ protocol }) => ({
    canonical_id: protocol.canonical_id || `brali:protocol:${protocol.slug}`,
    slug: protocol.slug,
    title: protocol.title,
    action: protocol.action,
    check_in: protocol.check_in || null,
    topic_ids: topicIds(protocol),
    evidence_state: evidenceState(protocol),
    provenance: provenance(protocol)
  }));

  const selectedSlugs = new Set(recommendations.map(x => x.slug));
  const evidenceBoundaries = api.decisions.filter(decision => decisionTargetSlugs(decision).some(slug => selectedSlugs.has(slug))).map(decision => ({
    canonical_id: decision.canonical_id || `brali:evidence-decision:${decision.id}`,
    id: decision.id,
    decision: decision.decision,
    supported_claim: decision.supported_claim,
    limitations: decision.limitations || [],
    unsupported_or_overstated_claims: decision.unsupported_or_overstated_claims || [],
    source_url: decision.source_url,
    citation_text: decision.citation_text || null
  }));
  return {
    schema_version: 1,
    contract,
    question,
    status: recommendations.length ? 'trusted-answer' : (evidenceBoundaries.length ? 'boundary-only' : 'no-trusted-answer'),
    route: { topics: routed.map(topic => ({ canonical_id: topic.canonical_id || `brali:topic:${topic.id}`, id: topic.id, title: topic.title })) },
    recommendations,
    evidence_boundaries: evidenceBoundaries,
    safety: { blocked_from_normal_recommendation: false }
  };
}
