const TRUSTED = new Set(['reviewed', 'practical']);
const BASE = 'https://brali-lifeos.github.io';
const PROBLEM_MATCH_THRESHOLD = 12;
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
export const isSafetyBoundary = query => /severe depression|suicid|self[- ]harm|diagnos|treat(?:ment)? .* without|instead of professional care|medication plan|prescription (?:drug|medication|medicine|dose|dosage|plan)|prescrib(?:e|ed|ing)?\b[^.!?]{0,40}\b(?:drug|medication|medicine)|kill myself|hurt myself|суицид|самоубий|навредить себе/i.test(String(query));
const BOUNDARY_CUE = /cause|proven|prove|always|everyone|best|optimal|interval|frequency|duration|prescrib|treat|guarantee|scientif|доказ|научн|причин/i;
const localTopicId = value => String(value || '').replace(/^brali:topic:/, '').replace(/^brali:/, '');
const protocolSlug = value => typeof value === 'string' ? value.replace(/^brali:protocol:/, '').replace(/^brali:/, '') : String(value?.slug || value?.protocol_id || value?.id || value?.canonical_id || '').replace(/^brali:protocol:/, '').replace(/^brali:/, '');
const evidenceState = item => item?.evidence?.status || item?.evidence_state || item?.status || 'unknown';
const topicIds = entry => {
  const values = entry?.ontology?.topics || entry?.ontology?.topic_ids || entry?.topic_ids || [];
  return [...new Set(values.map(value => typeof value === 'string' ? localTopicId(value) : localTopicId(value?.id || value?.slug || value?.topic_id || value?.title)).filter(Boolean))];
};
const decisionTargetSlugs = decision => (decision.target_protocol_ids || []).map(protocolSlug);
const problemEdges = problem => problem?.protocols || problem?.protocol_edges || [];

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

export function matchProblems(query, source, k = 3) {
  const problems = source?.collections || source || [];
  const qNorm = normalize(query);
  const qTokens = tokenSet(query);
  return problems.map(problem => {
    const aliases = problem.aliases || [];
    let score = 0;
    const title = normalize(problem.title);
    const question = normalize(problem.question);
    const seedQuery = normalize(problem.query);
    if (title && qNorm.includes(title)) score += 30;
    if (question && qNorm.includes(question)) score += 28;
    if (seedQuery && qNorm.includes(seedQuery)) score += 24;
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      if (normalizedAlias && qNorm.includes(normalizedAlias)) score += 24;
    }
    score += intersectionCount(qTokens, tokenSet(problem.title)) * 5;
    score += intersectionCount(qTokens, tokenSet(problem.question)) * 4;
    score += intersectionCount(qTokens, tokenSet(problem.summary)) * 2;
    score += intersectionCount(qTokens, tokenSet(problem.query)) * 3;
    let bestAliasOverlap = 0;
    for (const alias of aliases) bestAliasOverlap = Math.max(bestAliasOverlap, intersectionCount(qTokens, tokenSet(alias)));
    score += bestAliasOverlap * 6;
    return score > 0 ? { problem, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || String(a.problem.slug).localeCompare(String(b.problem.slug))).slice(0, Math.max(1, k));
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
    b.score - a.score ||
    a.selected_protocol_rank - b.selected_protocol_rank ||
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
  const problems = data?.problems?.collections || data?.problems || [];
  const datasetVersion = data?.flagships?.dataset_version || data?.topics?.dataset_version || null;

  if (!String(question || '').trim()) return { schema_version: 1, question: '', status: 'empty-query', dataset_version: datasetVersion, route: { problem: null, topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: false } };
  if (isSafetyBoundary(question)) return { schema_version: 1, question, status: 'no-trusted-answer', dataset_version: datasetVersion, route: { problem: null, topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: true, reason: 'Safety-sensitive diagnosis/treatment or self-harm requests are outside normal Brali trusted retrieval.' } };

  const matchedProblems = matchProblems(question, problems, 3);
  const problemMatch = matchedProblems[0]?.score >= PROBLEM_MATCH_THRESHOLD ? matchedProblems[0] : null;
  const matchedTopics = topicSearch(question, topics, identity, 3);
  const decisionCandidates = decisionSearch(question, decisions);
  const strongDecisions = decisionCandidates.filter(item => item.score >= 9);
  const bestTopicScore = matchedTopics[0]?.score || 0;
  const bestDecisionScore = strongDecisions[0]?.score || 0;
  if (!problemMatch && bestTopicScore < 4 && bestDecisionScore < 9) return { schema_version: 1, question, status: 'no-trusted-answer', dataset_version: datasetVersion, route: { problem: null, topics: [] }, recommendations: [], evidence_boundaries: [], safety: { blocked: false } };

  const topicRank = new Map(matchedTopics.map((item, index) => [item.id, matchedTopics.length - index]));
  const graphEdges = problemMatch ? problemEdges(problemMatch.problem) : [];
  const graphBySlug = new Map(graphEdges.map((edge, index) => [protocolSlug(edge), { edge, weight: edge.fit === 'best-fit' ? 8 : Math.max(2, 6 - index) }]));
  let ranked = flagships
    .filter(entry => TRUSTED.has(evidenceState(entry)))
    .map(entry => {
      const slug = protocolSlug(entry);
      const ids = topicIds(entry);
      const semantic = ids.reduce((best, id) => Math.max(best, topicRank.get(id) || 0), 0);
      const lexical = lexicalScore(question, [entry.title, entry.description, entry.action, entry.check_in].filter(Boolean).join(' '));
      const graph = graphBySlug.get(slug);
      const graphWeight = graph?.weight || 0;
      if (semantic === 0 && lexical === 0 && graphWeight === 0) return null;
      const score = semantic * 20 + lexical * 3 + graphWeight * 24 + Number(entry.quality_score || 0) / 20 + (evidenceState(entry) === 'reviewed' ? 4 : 0);
      return { entry, semantic_score: semantic, lexical_score: lexical, graph_weight: graphWeight, graph_edge: graph?.edge || null, retrieval_score: Number(score.toFixed(3)) };
    })
    .filter(Boolean)
    .sort((a,b) => b.retrieval_score - a.retrieval_score || protocolSlug(a.entry).localeCompare(protocolSlug(b.entry)));
  if (matchedTopics.length || problemMatch) {
    const semantic = ranked.filter(item => item.semantic_score > 0);
    const strongLexical = ranked.filter(item => item.lexical_score >= 6);
    const graph = ranked.filter(item => item.graph_weight > 0);
    const keep = new Set([...graph, ...semantic, ...strongLexical].map(item => protocolSlug(item.entry)));
    if (keep.size) ranked = ranked.filter(item => keep.has(protocolSlug(item.entry)));
  }

  const topDecision = strongDecisions[0];
  const boundaryOnly = Boolean(topDecision?.decision?.decision === 'watch' && BOUNDARY_CUE.test(question));
  const selected = boundaryOnly ? [] : ranked.slice(0, limit);
  const recommendations = selected.map(({ entry, graph_edge }) => {
    const slug = protocolSlug(entry);
    return {
      canonical_id: entry.canonical_id || `brali:protocol:${slug}`,
      slug,
      title: entry.title,
      action: entry.action,
      check_in: entry.check_in || null,
      topic_ids: topicIds(entry),
      evidence_state: evidenceState(entry),
      problem_fit: graph_edge ? {
        problem_id: `brali:problem:${problemMatch.problem.slug}`,
        fit: graph_edge.fit,
        when: graph_edge.when,
        why: graph_edge.why,
        caveat: graph_edge.caveat
      } : null,
      provenance: provenance(entry)
    };
  });
  const evidenceBoundaries = rankEvidenceBoundaries(decisionCandidates, selected, 3).map(({ decision }) => decisionPacket(decision));
  const problemRoute = problemMatch ? {
    canonical_id: problemMatch.problem.canonical_id || `brali:problem:${problemMatch.problem.slug}`,
    slug: problemMatch.problem.slug,
    title: problemMatch.problem.title,
    score: problemMatch.score,
    url: problemMatch.problem.canonical_url || `${BASE}/problems/${problemMatch.problem.slug}/`
  } : null;

  return {
    schema_version: 1,
    question,
    status: recommendations.length ? 'trusted-answer' : (evidenceBoundaries.length ? 'boundary-only' : 'no-trusted-answer'),
    dataset_version: datasetVersion,
    route: { problem: problemRoute, topics: matchedTopics.map(({ topic, id }) => ({ canonical_id: topic.canonical_id || `brali:topic:${id}`, id, title: topic.title })) },
    recommendations,
    evidence_boundaries: evidenceBoundaries,
    safety: { blocked: false }
  };
}

export function buildAgentContext(packet) {
  if (packet.status === 'no-trusted-answer' || packet.status === 'empty-query') return `Brali found no trusted normal recommendation for: ${packet.question}. Do not invent Brali coverage.`;
  const lines = [`Brali knowledge context for: ${packet.question}`];
  if (packet.route?.problem) lines.push(`Canonical problem: ${packet.route.problem.title} (${packet.route.problem.canonical_id}) ${packet.route.problem.url}`);
  if (packet.status === 'boundary-only') lines.push('Brali returned an evidence boundary only. Do not convert it into a practical recommendation.');
  for (const item of packet.recommendations) {
    lines.push(`- ${item.title} [${item.evidence_state}] (${item.canonical_id})`);
    if (item.problem_fit) {
      lines.push(`  Fit: ${item.problem_fit.fit}. ${item.problem_fit.when}`);
      lines.push(`  Why: ${item.problem_fit.why}`);
      lines.push(`  Caveat: ${item.problem_fit.caveat}`);
    }
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
