import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const agenda = read('data/research-gap-questions.json');
const resolutions = read('data/research-gap-resolutions.json');
const ontology = read('data/knowledge-ontology.json');
const queries = read('data/research-queries.json');
const candidates = read('data/research-candidates.json');
const decisions = read('data/evidence-decisions.json');
const protocols = read('life-os/datasets/protocols.json');
const coverage = read('life-os/datasets/ontology-coverage.json');
const generated = read('research/gaps/index.json');

const topics = new Map((ontology.topics ?? []).map(item => [item.id, item]));
const queryList = queries.queries ?? [];
const candidateById = new Map((candidates.candidates ?? []).map(item => [item.id, item]));
const decisionById = new Map((decisions.entries ?? []).map(item => [item.id, item]));
const protocolBySlug = new Map((protocols.entries ?? []).map(item => [item.slug, item]));
const resolutionByTopic = new Map((resolutions.entries ?? []).map(item => [item.topic_id, item]));
const protocolTopics = protocol => new Set((protocol.ontology?.topics ?? []).map(item => item.id));
const failures = [];
const agendaIds = (agenda.items ?? []).map(item => item.topic_id);
const uniqueAgenda = new Set(agendaIds);

if (agenda.baseline_growth_gap_count !== 24 || agendaIds.length !== 24 || uniqueAgenda.size !== 24) failures.push('research gap agenda must preserve the 24-topic baseline');
for (const item of agenda.items ?? []) {
  const topic = topics.get(item.topic_id);
  if (!topic) failures.push(`${item.topic_id}: missing ontology Topic`);
  if (!item.question || !item.evidence_target || !item.guardrail) failures.push(`${item.topic_id}: incomplete research question contract`);
  if (!queryList.some(query => query.topic_ids?.includes(item.topic_id))) failures.push(`${item.topic_id}: no research discovery query`);
  const resolution = resolutionByTopic.get(item.topic_id);
  if (!resolution && topic?.status !== 'growth-gap') failures.push(`${item.topic_id}: unresolved agenda item must remain growth-gap`);
  if (resolution && topic?.status !== 'active') failures.push(`${item.topic_id}: resolved agenda item must be active`);
}
for (const resolution of resolutions.entries ?? []) {
  if (resolution.status !== 'closed') failures.push(`${resolution.topic_id}: unsupported resolution status`);
  if (!agendaIds.includes(resolution.topic_id)) failures.push(`${resolution.topic_id}: resolution is not part of the baseline agenda`);
  if (!resolution.evidence_decision_ids?.length || !resolution.protocol_slugs?.length || !resolution.rationale) failures.push(`${resolution.topic_id}: incomplete resolution evidence`);
  for (const id of resolution.evidence_decision_ids ?? []) {
    const decision = decisionById.get(id);
    if (!decision) { failures.push(`${resolution.topic_id}: unknown Evidence Decision ${id}`); continue; }
    const candidate = candidateById.get(decision.candidate_id);
    if (!candidate?.topic_ids?.includes(resolution.topic_id)) failures.push(`${resolution.topic_id}: Evidence Decision ${id} does not map to Topic`);
  }
  for (const slug of resolution.protocol_slugs ?? []) {
    const protocol = protocolBySlug.get(slug);
    if (!protocol) { failures.push(`${resolution.topic_id}: trusted protocol ${slug} not found`); continue; }
    if (!protocolTopics(protocol).has(resolution.topic_id)) failures.push(`${resolution.topic_id}: trusted protocol ${slug} does not map to Topic`);
  }
}

if (generated.baseline_growth_gap_count !== 24 || generated.entries?.length !== 24) failures.push('generated research gap report does not preserve baseline');
const expectedResolved = (resolutions.entries ?? []).filter(item => item.status === 'closed').length;
const expectedOpen = 24 - expectedResolved;
if (generated.resolved_gap_count !== expectedResolved || generated.current_open_gap_count !== expectedOpen) failures.push('generated open/resolved counts do not match resolution registry');
if (coverage.summary?.growth_gap_topics !== expectedOpen) failures.push(`ontology coverage should report ${expectedOpen} current growth gaps, got ${coverage.summary?.growth_gap_topics}`);
for (const item of generated.entries ?? []) {
  const htmlPath = path.join(ROOT, `research/gaps/${item.topic_id}/index.html`);
  const jsonPath = path.join(ROOT, `research/gaps/${item.topic_id}/index.json`);
  if (!fs.existsSync(htmlPath) || !fs.existsSync(jsonPath)) failures.push(`${item.topic_id}: generated page or JSON missing`);
  if (resolutionByTopic.has(item.topic_id) && item.stage !== 'resolved') failures.push(`${item.topic_id}: resolved item not rendered as resolved`);
}

const trendIndex = read('trends/evidence/index.json');
const pulse = read(`trends/evidence/${trendIndex.latest_period}/index.json`);
if (pulse.research_gap_pipeline?.baseline_gaps !== 24 || pulse.research_gap_pipeline?.open_gaps !== expectedOpen || pulse.research_gap_pipeline?.resolved_gaps !== expectedResolved) failures.push('Evidence Trends does not include the research-gap pipeline');
const trendHtml = fs.readFileSync(path.join(ROOT, `trends/evidence/${trendIndex.latest_period}/index.html`), 'utf8');
if (!trendHtml.includes('data-brali-research-gap-pipeline')) failures.push('Evidence Trends HTML missing research-gap section');
const researchHtml = fs.readFileSync(path.join(ROOT, 'research/index.html'), 'utf8');
if (!researchHtml.includes('data-brali-research-gaps')) failures.push('Research hub missing research-gap discovery link');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!llms.includes('Research Gaps: https://brali-lifeos.github.io/research/gaps/')) failures.push('llms.txt does not expose Research Gaps');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const topicId of agendaIds) if (!sitemap.includes(`<loc>https://brali-lifeos.github.io/research/gaps/${topicId}/</loc>`)) failures.push(`${topicId}: sitemap route missing`);
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/research/gaps/</loc>')) failures.push('research gaps index missing from sitemap');
if (!fs.existsSync(path.join(ROOT, 'life-os/datasets/research-gaps.json'))) failures.push('research gaps dataset copy missing');

if (failures.length) throw new Error(`Research gap pipeline validation failed with ${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
console.log(`Research gap pipeline verified: 24 baseline gaps; ${expectedOpen} open; ${expectedResolved} resolved; all 24 have discovery queries and closure provenance is enforced.`);
