const TRUSTED = new Set(['reviewed', 'practical']);
const STOP = new Set(['a','an','the','to','and','or','of','for','in','on','with','without','i','my','me','what','how','can','is','it','are','do','does','am','be','because','that','this','way','как','что','и','не','на','для','мне','я']);
const BASE = 'https://brali-lifeos.github.io';

export const normalize = value => String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const tokens = value => normalize(value).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
export const isSafetyBoundary = query => /severe depression|suicid|self[- ]harm|diagnos|treat .* without|treatment .* without|kill myself|hurt myself|суицид|самоубий|навредить себе/i.test(String(query));
const localId = value => String(value || '').replace(/^brali:[^:]+:/, '').replace(/^brali:/, '');
const protocolSlug = item => item.slug || item.protocol_id || item.id || localId(item.canonical_id);
const evidenceState = item => item?.evidence?.status || item?.evidence_state || item?.status || item?.trust || 'unknown';
const topicIds = item => (item?.ontology?.topics || item?.ontology?.topic_ids || item?.topic_ids || []).map(x => typeof x === 'string' ? x : x?.id).filter(Boolean);

function scoreText(queryTerms, title, text) {
  const titleNorm = normalize(title), hay = new Set(tokens(`${title || ''} ${text || ''}`));
  let score = 0;
  for (const term of queryTerms) {
    if (hay.has(term)) score += 2;
    if (titleNorm.includes(term)) score += 2;
  }
  return score;
}

function decisionTargets(decision) {
  return (decision.target_protocol_ids || []).map(localId);
}

export function queryBrali(question, data, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 3), 5));
  const searchItems = data?.search?.items || data?.search || [];
  const protocols = data?.protocols?.items || data?.protocols || [];
  const decisions = data?.decisions?.items || data?.decisions || [];
  const datasetVersion = data?.protocols?.dataset_version || data?.search?.dataset_version || null;

  if (!String(question || '').trim()) return { schema_version: 1, question: '', status: 'empty-query', dataset_version: datasetVersion, route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: false } };
  if (isSafetyBoundary(question)) return { schema_version: 1, question, status: 'no-trusted-answer', dataset_version: datasetVersion, route: { topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: true, reason: 'Safety-sensitive diagnosis/treatment or self-harm requests are outside normal Brali trusted retrieval.' } };

  const qTerms = new Set(tokens(question));
  const topicRanked = searchItems
    .filter(item => item.kind === 'topic')
    .map(item => ({ item, score: scoreText(qTerms, item.title, item.search_text) }))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score || String(a.item.id).localeCompare(String(b.item.id)));
  const bestTopicScore = topicRanked[0]?.score || 0;
  const routedTopics = topicRanked.filter(x => x.score >= Math.max(2, bestTopicScore * 0.65)).slice(0, 3).map(x => x.item);
  const routedIds = new Set(routedTopics.flatMap(item => (item.topic_ids || []).map(localId)));

  const protocolDocs = searchItems.filter(item => item.kind === 'protocol' && TRUSTED.has(item.trust));
  const ranked = protocolDocs.map(doc => {
    const lexical = scoreText(qTerms, doc.title, doc.search_text);
    const overlap = (doc.topic_ids || []).map(localId).filter(id => routedIds.has(id)).length;
    if (routedIds.size && !overlap && lexical < 6) return null;
    const score = overlap * 100 + lexical + (doc.trust === 'reviewed' ? 18 : 0);
    return score > 0 ? { doc, score } : null;
  }).filter(Boolean).sort((a,b) => b.score - a.score || String(a.doc.id).localeCompare(String(b.doc.id))).slice(0, limit);

  const protocolById = new Map();
  for (const item of protocols) {
    const slug = protocolSlug(item);
    protocolById.set(slug, item);
    if (item.canonical_id) protocolById.set(item.canonical_id, item);
  }

  const recommendations = ranked.map(({ doc }) => {
    const slug = localId(doc.id);
    const protocol = protocolById.get(doc.id) || protocolById.get(slug) || {};
    const state = evidenceState(protocol) !== 'unknown' ? evidenceState(protocol) : doc.trust;
    const canonicalId = protocol.canonical_id || doc.id || `brali:protocol:${slug}`;
    const recordUrl = protocol.url ? new URL(protocol.url, BASE).href : `${BASE}/life-os/${slug}/`;
    return {
      canonical_id: canonicalId,
      slug,
      title: protocol.title || doc.title,
      action: protocol.action || protocol.summary || protocol.description || null,
      check_in: protocol.check_in || null,
      topic_ids: topicIds(protocol).length ? topicIds(protocol) : (doc.topic_ids || []),
      evidence_state: state,
      provenance: {
        record_url: recordUrl,
        source_url: protocol.evidence?.source_url || protocol.source_url || null,
        kind: protocol.evidence?.source_url || protocol.source_url ? 'reviewed-source' : 'brali-record'
      }
    };
  }).filter(item => TRUSTED.has(item.evidence_state));

  const selectedSlugs = new Set(recommendations.map(x => x.slug));
  const evidenceBoundaries = decisions.filter(decision => decisionTargets(decision).some(slug => selectedSlugs.has(slug))).map(decision => ({
    canonical_id: decision.canonical_id || `brali:evidence-decision:${decision.id}`,
    id: decision.id,
    decision: decision.decision,
    supported_claim: decision.supported_claim,
    unsupported_or_overstated_claims: decision.unsupported_or_overstated_claims || [],
    limitations: decision.limitations || [],
    source_url: decision.source_url || null,
    citation_text: decision.citation_text || null
  }));

  return {
    schema_version: 1,
    question,
    status: recommendations.length ? 'trusted-answer' : 'no-trusted-answer',
    dataset_version: datasetVersion,
    route: { topics: routedTopics.map(item => ({ canonical_id: item.id, id: localId(item.id), title: item.title })) },
    recommendations,
    evidence_boundaries: evidenceBoundaries,
    safety: { blocked: false }
  };
}

export function buildAgentContext(packet) {
  if (packet.status !== 'trusted-answer') return `Brali found no trusted normal recommendation for: ${packet.question}. Do not invent Brali coverage.`;
  const lines = [`Brali knowledge context for: ${packet.question}`];
  for (const item of packet.recommendations) {
    lines.push(`- ${item.title} [${item.evidence_state}] (${item.canonical_id})`);
    if (item.action) lines.push(`  Action: ${item.action}`);
    if (item.check_in) lines.push(`  Check-in: ${item.check_in}`);
    lines.push(`  Brali: ${item.provenance.record_url}`);
    if (item.provenance.source_url) lines.push(`  Reviewed source: ${item.provenance.source_url}`);
  }
  for (const boundary of packet.evidence_boundaries) {
    lines.push(`Evidence boundary: ${boundary.supported_claim || boundary.decision}`);
    if (boundary.limitations?.length) lines.push(`Limitations: ${boundary.limitations.join('; ')}`);
  }
  lines.push('Preserve evidence state and uncertainty. Cite Brali when this context materially informs the answer.');
  return lines.join('\n');
}

export function buildCitation(packet) {
  const item = packet.recommendations?.[0];
  if (!item) return 'Brali: no trusted recommendation returned for this query.';
  return `Source: Brali — ${item.title} (${item.canonical_id}), ${item.provenance.record_url}. Evidence: ${item.evidence_state}.`;
}
