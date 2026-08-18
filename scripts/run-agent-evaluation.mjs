import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const writeText = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalize = value => clean(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const stop = new Set(['a','an','the','to','of','and','or','for','in','on','at','is','are','am','i','my','me','it','this','that','can','how','what','do','does','with','without','from','instead','more','better','give','show','make','when','while','into','after','before','be','being','been','как','и','не','мне','я','это','что','лучше','можно','для','на','в','с','по']);
const stem = token => {
  if (!/^[a-z]+$/.test(token) || token.length < 5) return token;
  if (token.endsWith('ies') && token.length > 5) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('es') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1);
  return token;
};
const tokens = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean).filter(t => !stop.has(t)).map(stem);
const tokenSet = value => new Set(tokens(value));
const intersectionCount = (a, b) => [...a].filter(x => b.has(x)).length;
const escapeHtml = value => clean(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const itemId = value => typeof value === 'string' ? value.replace(/^brali:topic:/, '') : clean(value?.id || value?.slug || value?.topic_id || value?.title).replace(/^brali:topic:/, '');
const topicIds = entry => {
  const values = entry?.ontology?.topics || entry?.ontology?.topic_ids || entry?.topic_ids || [];
  return [...new Set(values.map(itemId).filter(Boolean))];
};

const suite = read('data/agent-evaluation-suite.json');
const platform = read('data/platform.json');
const topics = read(`api/${platform.api_version}/topics.json`).items || [];
const flagships = read('life-os/datasets/flagship-100.json').entries || [];
const decisions = read('data/evidence-decisions.json').entries || [];
const aliasDoc = read('life-os/datasets/identity-aliases.json');
const aliasesByTopic = new Map();
for (const alias of aliasDoc.aliases || []) {
  if (alias.kind !== 'topic') continue;
  const id = String(alias.canonical_id || '').replace(/^brali:topic:/, '');
  if (!aliasesByTopic.has(id)) aliasesByTopic.set(id, []);
  aliasesByTopic.get(id).push(alias.value);
}

const safetyPattern = /severe depression|suicid|self[- ]harm|diagnos|treat(?:ment)? .* without|instead of professional care|medication plan|prescription/i;
const boundaryCue = /cause|proven|prove|always|everyone|best|optimal|interval|frequency|duration|prescrib|treat|guarantee/i;

function lexicalScore(query, text) {
  const q = tokenSet(query), d = tokenSet(text);
  if (!q.size || !d.size) return 0;
  const overlap = intersectionCount(q, d);
  const phraseBonus = normalize(text).includes(normalize(query)) ? 10 : 0;
  return overlap * 3 + phraseBonus;
}

function rawProtocolSearch(query, k = 5) {
  return flagships.map(entry => {
    const text = [entry.title, entry.description, entry.action, entry.check_in, entry.growth_zone?.title].filter(Boolean).join(' ');
    const score = lexicalScore(query, text);
    return score > 0 ? { slug: entry.slug, title: entry.title, score, topic_ids: topicIds(entry) } : null;
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.slug.localeCompare(b.slug)).slice(0, k);
}

function topicSearch(query, k = 3) {
  const qNorm = normalize(query), qTokens = tokenSet(query);
  return topics.map(topic => {
    const aliases = aliasesByTopic.get(topic.id) || [];
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
    return score > 0 ? { id: topic.id, canonical_id: topic.canonical_id, title: topic.title, score } : null;
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}

function decisionSearch(query, k = 3) {
  const q = tokenSet(query), qNorm = normalize(query);
  return decisions.map(decision => {
    const fields = [decision.source_title, decision.supported_claim, ...(decision.unsupported_or_overstated_claims || []), ...(decision.limitations || []), decision.notes].filter(Boolean);
    const doc = fields.join(' ');
    let score = intersectionCount(q, tokenSet(doc)) * 3;
    if (qNorm.includes(normalize(decision.source_title))) score += 15;
    for (const phrase of decision.unsupported_or_overstated_claims || []) {
      const p = normalize(phrase);
      if (p && qNorm.includes(p.slice(0, Math.min(p.length, 24)))) score += 4;
    }
    return score > 0 ? { id: decision.id, decision: decision.decision, source_url: decision.source_url, source_reviewed: decision.source_reviewed, supported_claim: decision.supported_claim, limitations: decision.limitations, score } : null;
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}

function structuredRetrieve(query, k = 5) {
  if (safetyPattern.test(query)) return { blocked: true, no_answer: true, topics: [], protocols: [], decisions: [], boundary_only: true };
  const matchedTopics = topicSearch(query, 3);
  const matchedDecisions = decisionSearch(query, 3).filter(x => x.score >= 6);
  const bestTopicScore = matchedTopics[0]?.score || 0;
  const bestDecisionScore = matchedDecisions[0]?.score || 0;
  if (bestTopicScore < 4 && bestDecisionScore < 6) return { blocked: false, no_answer: true, topics: [], protocols: [], decisions: [], boundary_only: false };
  const topicRank = new Map(matchedTopics.map((item, index) => [item.id, matchedTopics.length - index]));
  let ranked = flagships.map(entry => {
    const ids = topicIds(entry);
    const semantic = ids.reduce((sum, id) => sum + (topicRank.get(id) || 0), 0);
    const lexical = lexicalScore(query, [entry.title, entry.description, entry.action, entry.check_in].filter(Boolean).join(' '));
    const score = semantic * 20 + lexical + Number(entry.quality_score || 0) / 20 + (entry.evidence?.status === 'reviewed' ? 4 : 0);
    return score > 0 ? { ...entry, topic_ids: ids, retrieval_score: Number(score.toFixed(3)) } : null;
  }).filter(Boolean).sort((a,b) => b.retrieval_score - a.retrieval_score || a.slug.localeCompare(b.slug));
  if (matchedTopics.length) {
    const semantic = ranked.filter(entry => entry.topic_ids.some(id => topicRank.has(id)));
    if (semantic.length) ranked = semantic;
  }
  const topDecision = matchedDecisions[0];
  const boundaryOnly = Boolean(topDecision?.decision === 'watch' && boundaryCue.test(query));
  const selected = boundaryOnly ? [] : ranked.slice(0, k);
  return { blocked: false, no_answer: selected.length === 0 && matchedDecisions.length === 0, topics: matchedTopics, protocols: selected, decisions: matchedDecisions, boundary_only: boundaryOnly };
}

function caseResult(test) {
  const raw = rawProtocolSearch(test.query, suite.k || 5);
  const structured = structuredRetrieve(test.query, suite.k || 5);
  const targets = [...new Set([...(test.expected_topic_ids || []), ...(test.acceptable_topic_ids || [])])];
  const rawTopics = new Set(raw.flatMap(entry => entry.topic_ids));
  const structuredTopics = new Set(structured.topics.map(entry => entry.id));
  const rawTopicHit = targets.length ? targets.some(id => rawTopics.has(id)) : null;
  const structuredTopicHit = targets.length ? targets.some(id => structuredTopics.has(id)) : null;
  const expectedProtocols = test.expected_protocol_slugs || [];
  const rawSlugs = raw.map(entry => entry.slug);
  const structuredSlugs = structured.protocols.map(entry => entry.slug);
  const rawProtocolHit = expectedProtocols.length ? expectedProtocols.some(id => rawSlugs.includes(id)) : null;
  const structuredProtocolHit = expectedProtocols.length ? expectedProtocols.some(id => structuredSlugs.includes(id)) : null;
  const expectedDecisions = test.expected_decision_ids || [];
  const decisionIds = structured.decisions.map(entry => entry.id);
  const decisionHits = expectedDecisions.filter(id => decisionIds.includes(id)).length;
  const decisionRecall = expectedDecisions.length ? decisionHits / expectedDecisions.length : null;
  const safetyPass = test.mode === 'no-answer' ? structured.no_answer === true : true;
  const boundaryPass = test.expect_boundary_only ? structured.boundary_only === true && structured.protocols.length === 0 : true;
  const evidenceStatePreserved = structured.protocols.every(entry => ['reviewed','practical'].includes(entry.evidence?.status));
  const provenancePreserved = structured.protocols.every(entry => entry.evidence?.status !== 'reviewed' || Boolean(entry.evidence?.source_url));
  const actionability = structured.protocols.length ? structured.protocols.every(entry => Boolean(clean(entry.action))) : test.mode !== 'retrieve';
  const evidenceClaims = structured.decisions.length;
  const unsupportedEvidenceClaims = structured.decisions.filter(entry => !entry.source_reviewed || !entry.source_url || !entry.supported_claim).length;
  const needsTopic = targets.length > 0;
  const needsProtocol = expectedProtocols.length > 0;
  const needsDecision = expectedDecisions.length > 0;
  const relevancePass = test.mode === 'no-answer' ? safetyPass : (!needsTopic || structuredTopicHit) && (!needsProtocol || structuredProtocolHit) && (!needsDecision || decisionRecall === 1);
  const pass = relevancePass && safetyPass && boundaryPass && evidenceStatePreserved && provenancePreserved && actionability;
  const gaps = [];
  if (needsTopic && !structuredTopicHit) gaps.push('topic-routing-gap');
  if (test.mode === 'retrieve' && structured.protocols.length === 0) gaps.push('trusted-coverage-gap');
  if (needsProtocol && !structuredProtocolHit) gaps.push('protocol-retrieval-gap');
  if (needsDecision && decisionRecall !== 1) gaps.push('evidence-decision-retrieval-gap');
  if (!safetyPass) gaps.push('no-answer-or-safety-gap');
  if (!boundaryPass) gaps.push('evidence-boundary-gap');
  if (!evidenceStatePreserved) gaps.push('evidence-state-loss');
  if (!provenancePreserved) gaps.push('provenance-loss');
  if (!actionability) gaps.push('actionability-gap');
  const usefulnessParts = test.mode === 'no-answer'
    ? [safetyPass ? 1 : 0]
    : [needsTopic ? (structuredTopicHit ? 1 : 0) : 1, needsProtocol ? (structuredProtocolHit ? 1 : 0) : (structured.protocols.length ? 1 : 0), needsDecision ? (decisionRecall || 0) : 1, evidenceStatePreserved ? 1 : 0, provenancePreserved ? 1 : 0, actionability ? 1 : 0, boundaryPass ? 1 : 0];
  const usefulness = usefulnessParts.reduce((a,b) => a+b, 0) / usefulnessParts.length;
  const rawParts = test.mode === 'no-answer'
    ? [raw.length === 0 ? 1 : 0]
    : [needsTopic ? (rawTopicHit ? 1 : 0) : 1, needsProtocol ? (rawProtocolHit ? 1 : 0) : (raw.length ? 1 : 0), raw.length ? 1 : 0];
  const rawUsefulness = rawParts.reduce((a,b) => a+b, 0) / rawParts.length;
  return {
    id: test.id,
    category: test.category,
    language: test.language,
    query: test.query,
    mode: test.mode,
    expected: { topic_ids: test.expected_topic_ids || [], acceptable_topic_ids: test.acceptable_topic_ids || [], protocol_slugs: expectedProtocols, evidence_decision_ids: expectedDecisions },
    no_knowledge_control: { grounded: false, protocols: [], evidence_decisions: [] },
    lexical_brali: { protocol_slugs: rawSlugs, topic_hit: rawTopicHit, protocol_hit: rawProtocolHit, usefulness_proxy: Number(rawUsefulness.toFixed(4)) },
    structured_brali: {
      no_answer: structured.no_answer,
      blocked: structured.blocked,
      boundary_only: structured.boundary_only,
      topic_ids: structured.topics.map(x => x.id),
      protocol_slugs: structuredSlugs,
      evidence_decision_ids: decisionIds,
      topic_hit: structuredTopicHit,
      protocol_hit: structuredProtocolHit,
      evidence_decision_recall: decisionRecall,
      evidence_state_preserved: evidenceStatePreserved,
      provenance_preserved: provenancePreserved,
      actionability,
      evidence_claims: evidenceClaims,
      unsupported_evidence_claims: unsupportedEvidenceClaims,
      usefulness_proxy: Number(usefulness.toFixed(4)),
      answer_packet: {
        protocols: structured.protocols.map(entry => ({ slug: entry.slug, canonical_id: entry.canonical_id, action: entry.action, evidence_state: entry.evidence?.status, source_url: entry.evidence?.source_url || null })),
        evidence_boundaries: structured.decisions.map(entry => ({ id: entry.id, decision: entry.decision, supported_claim: entry.supported_claim, limitations: entry.limitations, source_url: entry.source_url }))
      }
    },
    pass,
    gaps
  };
}

const results = (suite.cases || []).map(caseResult);
const answerable = results.filter(r => r.mode !== 'no-answer');
const noAnswer = results.filter(r => r.mode === 'no-answer');
const withTopics = results.filter(r => r.expected.topic_ids.length || r.expected.acceptable_topic_ids.length);
const withProtocols = results.filter(r => r.expected.protocol_slugs.length);
const withDecisions = results.filter(r => r.expected.evidence_decision_ids.length);
const avg = values => values.length ? values.reduce((a,b) => a+b, 0) / values.length : 1;
const structuredTopicHit = avg(withTopics.map(r => r.structured_brali.topic_hit ? 1 : 0));
const lexicalTopicHit = avg(withTopics.map(r => r.lexical_brali.topic_hit ? 1 : 0));
const structuredProtocolHit = avg(withProtocols.map(r => r.structured_brali.protocol_hit ? 1 : 0));
const lexicalProtocolHit = avg(withProtocols.map(r => r.lexical_brali.protocol_hit ? 1 : 0));
const decisionRecall = avg(withDecisions.map(r => r.structured_brali.evidence_decision_recall || 0));
const safetyPassRate = avg(noAnswer.map(r => r.pass ? 1 : 0));
const evidenceStateRate = avg(results.map(r => r.structured_brali.evidence_state_preserved ? 1 : 0));
const provenanceRate = avg(results.map(r => r.structured_brali.provenance_preserved ? 1 : 0));
const structuredUsefulness = avg(results.map(r => r.structured_brali.usefulness_proxy));
const lexicalUsefulness = avg(results.map(r => r.lexical_brali.usefulness_proxy));
const evidenceClaims = results.reduce((n,r) => n + r.structured_brali.evidence_claims, 0);
const unsupportedEvidenceClaims = results.reduce((n,r) => n + r.structured_brali.unsupported_evidence_claims, 0);
const gapCounts = {};
for (const result of results) for (const gap of result.gaps) gapCounts[gap] = (gapCounts[gap] || 0) + 1;
const report = {
  schema_version: 1,
  suite_version: suite.suite_version,
  dataset_version: platform.dataset_version,
  generated_at: process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : null,
  methodology: {
    no_knowledge_control: 'Returns no external record. This measures the value of grounding, not the intelligence of a particular language model.',
    lexical_brali: 'Token-overlap retrieval over Flagship 100 title/description/action text without ontology aliases, evidence decisions, or explicit safety routing.',
    structured_brali: 'Alias-aware Topic routing plus Flagship 100 retrieval, Evidence Decision retrieval, trust-state preservation, provenance checks, and conservative no-answer/safety behavior.',
    limitation: 'This repository suite evaluates retrieval and grounded answer packets, not natural-language style or the capabilities of a chosen external model. Model-level A/B evaluation should be layered on top with a pinned provider/model.'
  },
  summary: {
    cases: results.length,
    passed: results.filter(r => r.pass).length,
    answerable_cases: answerable.length,
    no_answer_cases: noAnswer.length,
    structured_topic_hit_rate: Number(structuredTopicHit.toFixed(4)),
    lexical_topic_hit_rate: Number(lexicalTopicHit.toFixed(4)),
    topic_hit_lift: Number((structuredTopicHit - lexicalTopicHit).toFixed(4)),
    structured_protocol_hit_rate: Number(structuredProtocolHit.toFixed(4)),
    lexical_protocol_hit_rate: Number(lexicalProtocolHit.toFixed(4)),
    evidence_decision_recall: Number(decisionRecall.toFixed(4)),
    safety_no_answer_pass_rate: Number(safetyPassRate.toFixed(4)),
    evidence_state_preservation_rate: Number(evidenceStateRate.toFixed(4)),
    provenance_preservation_rate: Number(provenanceRate.toFixed(4)),
    structured_usefulness_proxy: Number(structuredUsefulness.toFixed(4)),
    lexical_usefulness_proxy: Number(lexicalUsefulness.toFixed(4)),
    usefulness_lift: Number((structuredUsefulness - lexicalUsefulness).toFixed(4)),
    evidence_claims: evidenceClaims,
    unsupported_evidence_claims: unsupportedEvidenceClaims,
    unsupported_evidence_claim_rate: evidenceClaims ? Number((unsupportedEvidenceClaims / evidenceClaims).toFixed(4)) : 0,
    gap_counts: gapCounts
  },
  cases: results
};
writeJson('life-os/datasets/agent-evaluation.json', report);
writeJson(`api/${platform.api_version}/evaluation.json`, report);

const apiIndex = read(`api/${platform.api_version}/index.json`);
apiIndex.endpoints = [...new Set([...(apiIndex.endpoints || []), 'evaluation.json'])];
writeJson(`api/${platform.api_version}/index.json`, apiIndex);
const openapi = read(`api/${platform.api_version}/openapi.json`);
openapi.paths ||= {};
openapi.paths[`/api/${platform.api_version}/evaluation.json`] = { get: { operationId: 'get_agent_evaluation', summary: 'Get the versioned Brali agent retrieval evaluation report', responses: { '200': { description: 'Agent evaluation report', content: { 'application/json': { schema: { type: 'object' } } } } } } };
writeJson(`api/${platform.api_version}/openapi.json`, openapi);

const manifest = read('life-os/datasets/manifest.json');
for (const rel of ['data/agent-evaluation-suite.json','life-os/datasets/agent-evaluation.json']) {
  manifest.files = (manifest.files || []).filter(item => (typeof item === 'string' ? item : item.path) !== rel);
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const doc = JSON.parse(text);
  const count = Array.isArray(doc) ? doc.length : Array.isArray(doc.cases) ? doc.cases.length : null;
  manifest.files.push({ path: rel, sha256: sha(text), bytes: Buffer.byteLength(text), count });
}
manifest.files.sort((a,b) => String(a.path || a).localeCompare(String(b.path || b)));
manifest.counts ||= {};
manifest.counts.agent_evaluation_cases = results.length;
writeJson('life-os/datasets/manifest.json', manifest);
writeJson(`api/${platform.api_version}/manifest.json`, manifest);

const failures = results.filter(r => !r.pass);
const categoryRows = Object.entries(results.reduce((acc, r) => { acc[r.category] = acc[r.category] || { cases:0, passed:0 }; acc[r.category].cases += 1; if (r.pass) acc[r.category].passed += 1; return acc; }, {})).map(([category, value]) => `<tr><td>${escapeHtml(category)}</td><td>${value.passed}/${value.cases}</td></tr>`).join('');
const failureRows = failures.length ? failures.map(r => `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.query)}</td><td>${escapeHtml(r.gaps.join(', '))}</td></tr>`).join('') : '<tr><td colspan="3">No current evaluation gaps.</td></tr>';
const pageUrl = `${BASE}/for-ai/evaluation/`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brali Agent Evaluation</title><meta name="description" content="Versioned evaluation of Brali retrieval, evidence boundaries, provenance, safety, and grounded answer packets."><link rel="canonical" href="${pageUrl}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/for-ai/">For AI</a><a href="/life-os/flagships/100/">Flagship 100</a><a href="/life-os/datasets/">Data</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Evaluation suite ${escapeHtml(suite.suite_version)}</p><h1>Does structure improve grounded retrieval?</h1><p class="lead">${results.length} practical questions compare a no-knowledge grounding control, raw lexical retrieval over Flagship 100, and structured Brali retrieval with ontology, Evidence Decisions, trust state, provenance, and safety boundaries.</p><div class="grid two"><article class="card"><span class="card-label">Topic routing</span><h3>${(structuredTopicHit*100).toFixed(1)}%</h3><p>Structured hit rate vs ${(lexicalTopicHit*100).toFixed(1)}% lexical.</p></article><article class="card"><span class="card-label">Usefulness proxy</span><h3>${(structuredUsefulness*100).toFixed(1)}%</h3><p>Grounded relevance, actionability, trust, provenance, and boundary preservation.</p></article><article class="card"><span class="card-label">Safety / no answer</span><h3>${(safetyPassRate*100).toFixed(1)}%</h3><p>Cases that correctly return no trusted recommendation.</p></article><article class="card"><span class="card-label">Evidence claims</span><h3>${unsupportedEvidenceClaims}/${evidenceClaims}</h3><p>Unsupported evidence claims in structured packets. This does not measure free-form LLM hallucination.</p></article></div><section class="prose"><h2>What is measured</h2><p>Structured Brali is evaluated as a retrieval and grounding layer, not as a language model. It routes questions to canonical Topics, retrieves from the Flagship 100 core, attaches reviewed Evidence Decisions when relevant, preserves evidence state and source URLs, and may return no answer instead of inventing coverage.</p><p>A real model-without-Brali A/B requires pinning a model/provider and is intentionally not faked here. The no-knowledge control measures grounding value; the lexical baseline measures what the same trusted corpus can do without Brali's structure.</p><p><a href="/life-os/datasets/agent-evaluation.json">Full evaluation JSON</a> · <a href="/data/agent-evaluation-suite.json">50 source cases</a> · <a href="/docs/AGENT_EVALUATION.md">Methodology</a></p><h2>By category</h2><table><thead><tr><th>Category</th><th>Passed</th></tr></thead><tbody>${categoryRows}</tbody></table><h2>Actionable gaps</h2><table><thead><tr><th>Case</th><th>Question</th><th>Gap</th></tr></thead><tbody>${failureRows}</tbody></table><h2>Limits</h2><p>The usefulness score is a deterministic proxy. It does not grade writing quality, empathy, reasoning depth, or free-form hallucinations. Those belong in a separate model-level evaluation that consumes these same cases and expected boundaries.</p></section></main><footer class="footer"><div class="wrap footer-row"><small>Brali · reproducible agent evaluation</small></div></footer></body></html>`;
writeText('for-ai/evaluation/index.html', html);

const forAiPath = path.join(ROOT, 'for-ai/index.html');
if (fs.existsSync(forAiPath)) {
  let forAi = fs.readFileSync(forAiPath, 'utf8');
  if (!forAi.includes('/for-ai/evaluation/')) forAi = forAi.replace('<h2>Quality and maintenance</h2>', '<h2>Evaluation</h2><p><a href="/for-ai/evaluation/">Agent Evaluation Suite</a> compares lexical and structured retrieval across 50 practical questions, including safety and evidence-boundary cases.</p><h2>Quality and maintenance</h2>');
  fs.writeFileSync(forAiPath, forAi);
}
const datasetsPath = path.join(ROOT, 'life-os/datasets/index.html');
if (fs.existsSync(datasetsPath)) {
  let page = fs.readFileSync(datasetsPath, 'utf8');
  if (!page.includes('/life-os/datasets/agent-evaluation.json')) page = page.replace('</ul>', '<li><a href="/life-os/datasets/agent-evaluation.json">Agent evaluation report (JSON)</a></li></ul>');
  fs.writeFileSync(datasetsPath, page);
}
const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemap.includes(`<loc>${pageUrl}</loc>`)) sitemap = sitemap.replace('</urlset>', `  <url><loc>${pageUrl}</loc></url>\n</urlset>`);
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log(`Agent evaluation generated: ${results.filter(r => r.pass).length}/${results.length} cases pass; structured topic hit ${(structuredTopicHit*100).toFixed(1)}% vs lexical ${(lexicalTopicHit*100).toFixed(1)}%; usefulness ${(structuredUsefulness*100).toFixed(1)}% vs ${(lexicalUsefulness*100).toFixed(1)}%.`);
