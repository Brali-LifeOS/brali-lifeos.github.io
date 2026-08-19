const TRUSTED = new Set(['reviewed', 'practical']);
const STOP = new Set(['a','an','the','to','and','or','of','for','in','on','with','without','i','my','me','what','how','can','is','it','are','do','does','am','be','because','that','this','way','как','что','и','не','на','для','мне','я']);
const BASE = 'https://brali-lifeos.github.io';

export const normalize = value => String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const tokens = value => normalize(value).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
export const isSafetyBoundary = query => /severe depression|suicid|self[- ]harm|diagnos|treat .* without|treatment .* without|kill myself|hurt myself|суицид|самоубий|навредить себе/i.test(String(query));
const isEvidenceIntent = query => /scientif|evidence|proven|prove|cause|causal|best interval|best break|optimal|always improve|research show|доказ|научн|причин/i.test(String(query));
const localId = value => String(value || '').replace(/^brali:[^:]+:/, '').replace(/^brali:/, '');
const protocolSlug = item => item.slug || item.protocol_id || item.id || localId(item.canonical_id);
const evidenceState = item => item?.evidence?.status || item?.evidence_state || item?.status || item?.trust || 'unknown';
const topicIds = item => (item?.ontology?.topics || item?.ontology?.topic_ids || item?.topic_ids || []).map(x => typeof x === 'string' ? x : x?.id).filter(Boolean).map(localId);

function scoreText(queryTerms, title, text) {
  const titleNorm = normalize(title), hay = new Set(tokens(`${title || ''} ${text || ''}`));
  let score = 0;
  for (const term of queryTerms) {
    if (hay.has(term)) score += 2;
    if (titleNorm.includes(term)) score += 2;
  }
  return score;
}
function topicScore(question, topic, aliases = []) {
  const q = normalize(question), qTokens = new Set(tokens(question));
  const phrases = [topic.title, topic.description, ...(topic.synonyms || []), ...aliases].filter(Boolean).map(normalize).filter(Boolean);
  let score = 0;
  for (const phrase of phrases) {
    if (phrase.length > 3 && q.includes(phrase)) score += 14;
    for (const term of tokens(phrase)) if (qTokens.has(term)) score += topic.title && normalize(topic.title).includes(term) ? 4 : 2;
  }
  return score;
}
function decisionTargets(decision) {
  return (decision.target_protocol_ids || []).map(localId);
}
function decisionPacket(decision) {
  return {
    canonical_id: decision.canonical_id || `brali:evidence-decision:${decision.id}`,
    id: decision.id,
    decision: decision.decision,
    supported_claim: decision.supported_claim,
    unsupported_or_overstated_claims: decision.unsupported_or_overstated_claims || [],
    limitations: decision.limitations || [],
    source_url: decision.source_url || null,
    citation_text: decision.citation_text || null
  };
}
function rankEvidenceDecisions(queryTerms, decisions) {
  return decisions.map(decision => {
    const text = [decision.source_title, decision.supported_claim, ...(decision.unsupported_or_overstated_claims || []), ...(decision.limitations || [])].join(' ');
    const score = scoreText(queryTerms, decision.source_title, text);
    return score > 0 ? { decision, score } : null;
  }).filter(Boolean).sort((a,b) => b.score - a.score || String(a.decision.id).localeCompare(String(b.decision.id)));
}

export function queryBrali(question, data, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 3), 5));
  const topics = data?.topics?.items || data?.topics || [];
  const identity = data?.identity || {};
  const protocols = data?.protocols?.items || data?.protocols || [];
  const decisions = data?.decisions?.items || data?.decisions?.entries || data?.decisions || [];
  const datasetVersion = data?.protocols?.dataset_version || data?.topics?.dataset_version || null;

  if (!String(question || '').trim()) return { schema_version: 1, question: '', status: 'empty-query', dataset_version: datasetVersion, route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: false } };
  if (isSafetyBoundary(question)) return { schema_version: 1, question, status: 'no-trusted-answer', dataset_version: datasetVersion, route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: true, reason: 'Safety-sensitive diagnosis/treatment or self-harm requests are outside normal Brali trusted retrieval.' } };

  const qTerms = new Set(tokens(question));
  const aliasesByTopic = new Map();
  for (const alias of identity.aliases || []) {
    if (alias.kind !== 'topic') continue;
    const id = localId(alias.canonical_id);
    if (!aliasesByTopic.has(id)) aliasesByTopic.set(id, []);
    aliasesByTopic.get(id).push(alias.value);
  }
  const topicRanked = topics
    .map(topic => ({ topic, score: topicScore(question, topic, aliasesByTopic.get(localId(topic.id || topic.canonical_id)) || []) }))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score || String(a.topic.id).localeCompare(String(b.topic.id)));
  const bestTopicScore = topicRanked[0]?.score || 0;
  const routedTopics = topicRanked.filter(x => x.score >= Math.max(2, bestTopicScore * 0.65)).slice(0, 3).map(x => x.topic);
  const routedIds = new Set(routedTopics.map(topic => localId(topic.id || topic.canonical_id)));

  const ranked = routedIds.size ? protocols
    .filter(protocol => TRUSTED.has(evidenceState(protocol)))
    .map(protocol => {
      const pTopics = topicIds(protocol);
      const overlap = pTopics.filter(id => routedIds.has(id)).length;
      if (!overlap) return null;
      const body = [protocol.description, protocol.summary, protocol.action, protocol.check_in, protocol.problem].filter(Boolean).join(' ');
      const lexical = scoreText(qTerms, protocol.title || protocol.canonical_name, body);
      const score = overlap * 100 + lexical + (evidenceState(protocol) === 'reviewed' ? 18 : 0) + (protocol.evidence?.source_url || protocol.source_url ? 8 : 0) + (protocol.check_in ? 3 : 0);
      return { protocol, score };
    })
    .filter(Boolean)
    .sort((a,b) => b.score - a.score || String(protocolSlug(a.protocol)).localeCompare(String(protocolSlug(b.protocol))))
    .slice(0, limit) : [];

  let recommendations = ranked.map(({ protocol }) => {
    const slug = protocolSlug(protocol);
    const canonicalId = protocol.canonical_id || `brali:protocol:${slug}`;
    const recordUrl = protocol.url ? new URL(protocol.url, BASE).href : `${BASE}/life-os/${slug}/`;
    return {
      canonical_id: canonicalId,
      slug,
      title: protocol.title || protocol.canonical_name || slug,
      action: protocol.action || protocol.summary || protocol.description || null,
      check_in: protocol.check_in || null,
      topic_ids: topicIds(protocol),
      evidence_state: evidenceState(protocol),
      provenance: {
        record_url: recordUrl,
        source_url: protocol.evidence?.source_url || protocol.source_url || null,
        kind: protocol.evidence?.source_url || protocol.source_url ? 'reviewed-source' : 'brali-record'
      }
    };
  });

  const selectedSlugs = new Set(recommendations.map(x => x.slug));
  const targeted = decisions.filter(decision => decisionTargets(decision).some(slug => selectedSlugs.has(slug))).map(decisionPacket);
  const evidenceRanked = rankEvidenceDecisions(qTerms, decisions);
  const strongest = evidenceRanked[0];
  const evidenceOnly = isEvidenceIntent(question) && strongest && strongest.score >= 6 && decisionTargets(strongest.decision).length === 0 && ['watch','reject','challenge-existing'].includes(strongest.decision.decision);
  let evidenceBoundaries = targeted;
  if (evidenceOnly) {
    recommendations = [];
    evidenceBoundaries = [decisionPacket(strongest.decision)];
  } else if (isEvidenceIntent(question) && strongest && strongest.score >= 8 && !evidenceBoundaries.some(x => x.id === strongest.decision.id)) {
    evidenceBoundaries = [...evidenceBoundaries, decisionPacket(strongest.decision)];
  }

  return {
    schema_version: 1,
    question,
    status: recommendations.length ? 'trusted-answer' : (evidenceBoundaries.length ? 'boundary-only' : 'no-trusted-answer'),
    dataset_version: datasetVersion,
    route: { topics: routedTopics.map(topic => ({ canonical_id: topic.canonical_id || `brali:topic:${localId(topic.id)}`, id: localId(topic.id || topic.canonical_id), title: topic.title })) },
    recommendations,
    evidence_boundaries: evidenceBoundaries,
    safety: { blocked: false }
  };
}

export function buildAgentContext(packet) {
  if (packet.status === 'no-trusted-answer' || packet.status === 'empty-query') return `Brali found no trusted normal recommendation for: ${packet.question}. Do not invent Brali coverage.`;
  const lines = [`Brali knowledge context for: ${packet.question}`];
  if (packet.status === 'boundary-only') lines.push('Brali returned an evidence boundary only. Do not convert it into a practical recommendation.');
  for (const item of packet.recommendations) {
    lines.push(`- ${item.title} [${item.evidence_state}] (${item.canonical_id})`);
    if (item.action) lines.push(`  Action: ${item.action}`);
    if (item.check_in) lines.push(`  Check-in: ${item.check_in}`);
    lines.push(`  Brali: ${item.provenance.record_url}`);
    if (item.provenance.source_url) lines.push(`  Reviewed source: ${item.provenance.source_url}`);
  }
  for (const boundary of packet.evidence_boundaries) {
    lines.push(`Evidence boundary: ${boundary.supported_claim || boundary.decision}`);
    if (boundary.unsupported_or_overstated_claims?.length) lines.push(`Do not claim: ${boundary.unsupported_or_overstated_claims.join('; ')}`);
    if (boundary.limitations?.length) lines.push(`Limitations: ${boundary.limitations.join('; ')}`);
    if (boundary.source_url) lines.push(`Reviewed evidence source: ${boundary.source_url}`);
  }
  lines.push('Preserve evidence state and uncertainty. Cite Brali when this context materially informs the answer.');
  return lines.join('\n');
}

export function buildCitation(packet) {
  const item = packet.recommendations?.[0];
  if (item) return `Source: Brali — ${item.title} (${item.canonical_id}), ${item.provenance.record_url}. Evidence: ${item.evidence_state}.`;
  const boundary = packet.evidence_boundaries?.[0];
  if (boundary) return `Source: Brali Evidence Decision — ${boundary.canonical_id}. Reviewed source: ${boundary.source_url || 'see Brali decision record'}.`;
  return 'Brali: no trusted recommendation returned for this query.';
}
