const TRUSTED = new Set(['reviewed', 'practical']);
const BASE = 'https://brali-lifeos.github.io';
const STOP = new Set(['a','an','the','to','of','and','or','for','in','on','at','is','are','am','i','my','me','it','this','that','can','how','what','do','does','with','without','from','instead','more','better','give','show','make','when','while','into','after','before','be','being','been','как','и','не','мне','я','это','что','лучше','можно','для','на','в','с','по']);

export const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const stem = token => {
  if (!/^[a-z]+$/.test(token) || token.length < 5) return token;
  if (token.endsWith('ies') && token.length > 5) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('es') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1);
  return token;
};
export const tokens = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean).filter(t => !STOP.has(t)).map(stem);
const tokenSet = value => new Set(tokens(value));
const intersectionCount = (a, b) => [...a].filter(x => b.has(x)).length;
export const isSafetyBoundary = query => /severe depression|suicid|self[- ]harm|diagnos|treat(?:ment)? .* without|instead of professional care|medication plan|prescription|kill myself|hurt myself|суицид|самоубий|навредить себе/i.test(String(query));
const BOUNDARY_CUE = /cause|proven|prove|always|everyone|best|optimal|interval|frequency|duration|prescrib|treat|guarantee|scientif|доказ|научн|причин/i;
const localTopicId = value => String(value || '').replace(/^brali:topic:/, '').replace(/^brali:/, '');
const protocolSlug = value => typeof value === 'string' ? value.replace(/^brali:protocol:/, '').replace(/^brali:/, '') : String(value?.slug || value?.protocol_id || value?.id || value?.canonical_id || '').replace(/^brali:protocol:/, '').replace(/^brali:/, '');
const evidenceState = item => item?.evidence?.status || item?.evidence_state || item?.status || 'unknown';
const topicIds = entry => {
  const values = entry?.ontology?.topics || entry?.ontology?.topic_ids || entry?.topic_ids || [];
  return [...new Set(values.map(value => typeof value === 'string' ? localTopicId(value) : localTopicId(value?.id || value?.slug || value?.topic_id || value?.title)).filter(Boolean))];
};
const decisionTargetSlugs = decision => (decision.target_protocol_ids || []).map(protocolSlug);

function lexicalScore(query, text) {
  const q = tokenSet(query), d = tokenSet(text);
  if (!q.size || !d.size) return 0;
  const overlap = intersectionCount(q, d);
  const phraseBonus = normalize(text).includes(normalize(query)) ? 10 : 0;
  return overlap * 3 + phraseBonus;
}
function provenance(entry) {
  const slug = protocolSlug(entry);
  const recordUrl = entry.url ? new URL(entry.url, BASE).href : `${BASE}/life-os/${slug}/`;
  return {
    kind: entry.evidence?.source_url ? 'reviewed-source' : 'brali-reviewed-record',
    source_url: entry.evidence?.source_url || null,
    record_url: recordUrl
  };
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

function topicSearch(query, topics, identity, k = 3) {
  const aliasesByTopic = new Map();
  for (const alias of identity?.aliases || []) {
    if (alias.kind !== 'topic') continue;
    const id = localTopicId(alias.canonical_id);
    if (!aliasesByTopic.has(id)) aliasesByTopic.set(id, []);
    aliasesByTopic.get(id).push(alias.value);
  }
  const qNorm = normalize(query), qTokens = tokenSet(query);
  return topics.map(topic => {
    const id = localTopicId(topic.id || topic.canonical_id);
    const aliases = aliasesByTopic.get(id) || [];
    const titleNorm = normalize(topic.title);
    let score = 0;
    if (titleNorm && qNorm.includes(titleNorm)) score += 16;
    for (const alias of aliases) {
      const a = normalize(alias);
      if (a && qNorm.includes(a)) score += 14;
    }
    score += intersectionCount(qTokens, tokenSet(topic.title)) * 6;
    score += intersectionCount(qTokens, tokenSet(topic.description)) * 2;
    for (const alias of aliases) score += intersectionCount(qTokens, tokenSet(alias)) * 4;
    return score > 0 ? { topic, id, score } : null;
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}
function decisionSearch(query, decisions) {
  const q = tokenSet(query), qNorm = normalize(query);
  return decisions.map(decision => {
    const fields = [decision.source_title, decision.supported_claim, ...(decision.unsupported_or_overstated_claims || []), ...(decision.limitations || []), decision.notes].filter(Boolean);
    const doc = fields.join(' ');
    let score = intersectionCount(q, tokenSet(doc)) * 3;
    if (decision.source_title && qNorm.includes(normalize(decision.source_title))) score += 15;
    for (const phrase of decision.unsupported_or_overstated_claims || []) {
      const p = normalize(phrase);
      if (p && qNorm.includes(p.slice(0, Math.min(p.length, 24)))) score += 4;
    }
    return score > 0 ? { decision, score } : null;
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.decision.id.localeCompare(b.decision.id));
}
function rankEvidenceBoundaries(decisionCandidates, selected, limit = 3) {
  const selectedRank = new Map(selected.map((item, index) => [protocolSlug(item.entry), index]));
  const direct = decisionCandidates.map(item => {
    const ranks = decisionTargetSlugs(item.decision)
      .map(slug => selectedRank.get(slug))
      .filter(rank => Number.isInteger(rank));
    return ranks.length ? { ...item, selected_protocol_rank: Math.min(...ranks) } : null;
  }).filter(Boolean).sort((a, b) =>
    a.selected_protocol_rank - b.selected_protocol_rank ||
    b.score - a.score ||
    a.decision.id.localeCompare(b.decision.id)
  );
  const strongRelated = decisionCandidates.filter(item => item.score >= 9);
  const ranked = [];
  const seen = new Set();
  for (const item of [...direct, ...strongRelated]) {
    if (seen.has(item.decision.id)) continue;
    seen.add(item.decision.id);
    ranked.push(item);
    if (ranked.length >= limit) break;
  }
  return ranked;
}

export function queryBrali(question, data, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 5));
  const topics = data?.topics?.items || data?.topics || [];
  const identity = data?.identity || {};
  const flagships = data?.flagships?.entries || data?.flagships?.items || data?.flagships || [];
  const decisions = data?.decisions?.items || data?.decisions?.entries || data?.decisions || [];
  const datasetVersion = data?.flagships?.dataset_version || data?.topics?.dataset_version || null;

  if (!String(question || '').trim()) return { schema_version: 1, question: '', status: 'empty-query', dataset_version: datasetVersion, route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: false } };
  if (isSafetyBoundary(question)) return { schema_version: 1, question, status: 'no-trusted-answer', dataset_version: datasetVersion, route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: true, reason: 'Safety-sensitive diagnosis/treatment or self-harm requests are outside normal Brali trusted retrieval.' } };

  const matchedTopics = topicSearch(question, topics, identity, 3);
  const decisionCandidates = decisionSearch(question, decisions);
  const strongDecisions = decisionCandidates.filter(item => item.score >= 9);
  const bestTopicScore = matchedTopics[0]?.score || 0;
  const bestDecisionScore = strongDecisions[0]?.score || 0;
  if (bestTopicScore < 4 && bestDecisionScore < 9) return { schema_version: 1, question, status: 'no-trusted-answer', dataset_version: datasetVersion, route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: false } };

  const topicRank = new Map(matchedTopics.map((item, index) => [item.id, matchedTopics.length - index]));
  let ranked = flagships
    .filter(entry => TRUSTED.has(evidenceState(entry)))
    .map(entry => {
      const ids = topicIds(entry);
      const semantic = ids.reduce((sum, id) => sum + (topicRank.get(id) || 0), 0);
      const lexical = lexicalScore(question, [entry.title, entry.description, entry.action, entry.check_in].filter(Boolean).join(' '));
      if (semantic === 0 && lexical === 0) return null;
      const score = semantic * 20 + lexical * 3 + Number(entry.quality_score || 0) / 20 + (evidenceState(entry) === 'reviewed' ? 4 : 0);
      return { entry, semantic_score: semantic, lexical_score: lexical, retrieval_score: Number(score.toFixed(3)) };
    })
    .filter(Boolean)
    .sort((a,b) => b.retrieval_score - a.retrieval_score || protocolSlug(a.entry).localeCompare(protocolSlug(b.entry)));
  if (matchedTopics.length) {
    const semantic = ranked.filter(item => item.semantic_score > 0);
    const strongLexical = ranked.filter(item => item.lexical_score >= 6);
    const keep = new Set([...semantic, ...strongLexical].map(item => protocolSlug(item.entry)));
    if (keep.size) ranked = ranked.filter(item => keep.has(protocolSlug(item.entry)));
  }

  const topDecision = strongDecisions[0];
  const boundaryOnly = Boolean(topDecision?.decision?.decision === 'watch' && BOUNDARY_CUE.test(question));
  const selected = boundaryOnly ? [] : ranked.slice(0, limit);
  const recommendations = selected.map(({ entry }) => {
    const slug = protocolSlug(entry);
    return {
      canonical_id: entry.canonical_id || `brali:protocol:${slug}`,
      slug,
      title: entry.title,
      action: entry.action,
      check_in: entry.check_in || null,
      topic_ids: topicIds(entry),
      evidence_state: evidenceState(entry),
      provenance: provenance(entry)
    };
  });
  const evidenceBoundaries = rankEvidenceBoundaries(decisionCandidates, selected, 3).map(({ decision }) => decisionPacket(decision));

  return {
    schema_version: 1,
    question,
    status: recommendations.length ? 'trusted-answer' : (evidenceBoundaries.length ? 'boundary-only' : 'no-trusted-answer'),
    dataset_version: datasetVersion,
    route: { topics: matchedTopics.map(({ topic, id }) => ({ canonical_id: topic.canonical_id || `brali:topic:${id}`, id, title: topic.title })) },
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
