import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const writeJson = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

const ontology = read('data/knowledge-ontology.json');
const coverage = read('life-os/datasets/ontology-coverage.json');
const agenda = read('data/research-gap-questions.json');
const resolutions = read('data/research-gap-resolutions.json');
const queries = read('data/research-queries.json');
const candidates = read('data/research-candidates.json');
const decisions = read('data/evidence-decisions.json');
const protocols = read('life-os/datasets/protocols.json');

const topics = new Map((ontology.topics ?? []).map(item => [item.id, item]));
const domains = new Map((ontology.domains ?? []).map(item => [item.id, item]));
const resolutionByTopic = new Map((resolutions.entries ?? []).map(item => [item.topic_id, item]));
const coverageByTopic = new Map((coverage.topics ?? []).map(item => [item.id, item]));
const protocolTopics = protocol => new Set((protocol.ontology?.topics ?? []).map(item => item.id));
const stageMeta = {
  resolved: ['Resolved', 'Reviewed evidence has been translated into trusted Topic coverage and explicitly closed.'],
  'ready-for-resolution': ['Ready for resolution review', 'A reviewed Evidence Decision and trusted Topic protocol exist, but no explicit closure record exists yet.'],
  reviewed: ['Reviewed boundary', 'At least one candidate has a reviewed Evidence Decision, but trusted Topic coverage is not yet sufficient for closure.'],
  'candidate-found': ['Candidate found', 'Discovery has found candidate research, but it has not yet become a reviewed Evidence Decision.'],
  'discovery-ready': ['Discovery ready', 'A research question and search lens exist; no matching candidate is recorded yet.'],
  open: ['Open', 'The gap is named, but the research discovery path is incomplete.']
};

const records = (agenda.items ?? []).map(item => {
  const topic = topics.get(item.topic_id);
  if (!topic) throw new Error(`Research gap agenda references unknown Topic: ${item.topic_id}`);
  const topicQueries = (queries.queries ?? []).filter(query => query.topic_ids?.includes(item.topic_id));
  const topicCandidates = (candidates.candidates ?? []).filter(candidate => candidate.topic_ids?.includes(item.topic_id));
  const candidateIds = new Set(topicCandidates.map(candidate => candidate.id));
  const topicDecisions = (decisions.entries ?? []).filter(decision => candidateIds.has(decision.candidate_id));
  const topicProtocols = (protocols.entries ?? []).filter(protocol => protocolTopics(protocol).has(item.topic_id));
  const resolution = resolutionByTopic.get(item.topic_id) ?? null;
  let stage = 'open';
  if (resolution?.status === 'closed') stage = 'resolved';
  else if (topicDecisions.length && topicProtocols.length) stage = 'ready-for-resolution';
  else if (topicDecisions.length) stage = 'reviewed';
  else if (topicCandidates.length) stage = 'candidate-found';
  else if (topicQueries.length) stage = 'discovery-ready';

  return {
    schema_version: 1,
    topic_id: item.topic_id,
    topic_title: topic.title,
    domain_id: topic.domain_id,
    domain_title: domains.get(topic.domain_id)?.title ?? topic.domain_id,
    ontology_status: topic.status,
    baseline_status: 'growth-gap',
    question: item.question,
    evidence_target: item.evidence_target,
    guardrail: item.guardrail,
    stage,
    stage_label: stageMeta[stage][0],
    stage_summary: stageMeta[stage][1],
    canonical_url: `${BASE}/research/gaps/${item.topic_id}/`,
    research_queries: topicQueries.map(query => ({ id: query.id, query: query.query, risk_flags: query.risk_flags ?? [] })),
    candidates: topicCandidates.map(candidate => ({
      id: candidate.id,
      title: candidate.title,
      status: candidate.status,
      publication_date: candidate.publication_date ?? null,
      reference_url: candidate.reference_url ?? null
    })),
    evidence_decisions: topicDecisions.map(decision => ({
      id: decision.id,
      decision: decision.decision,
      reviewed_at: decision.reviewed_at,
      source_title: decision.source_title,
      ledger_url: `${BASE}/evidence/${decision.id}/`
    })),
    trusted_protocols: topicProtocols.map(protocol => ({
      slug: protocol.slug,
      title: protocol.title,
      url: protocol.url ?? `${BASE}/life-os/${protocol.slug}/`,
      evidence_status: protocol.evidence?.status ?? null
    })),
    resolution,
    coverage: coverageByTopic.get(item.topic_id) ?? null
  };
}).sort((a, b) => {
  const order = { open: 0, 'discovery-ready': 1, 'candidate-found': 2, reviewed: 3, 'ready-for-resolution': 4, resolved: 5 };
  return order[a.stage] - order[b.stage] || a.topic_title.localeCompare(b.topic_title);
});

const stageCounts = records.reduce((acc, item) => {
  acc[item.stage] = (acc[item.stage] ?? 0) + 1;
  return acc;
}, {});
const resolved = records.filter(item => item.stage === 'resolved');
const open = records.filter(item => item.stage !== 'resolved');
const report = {
  schema_version: 1,
  baseline_date: agenda.baseline_date,
  baseline_growth_gap_count: agenda.baseline_growth_gap_count,
  current_open_gap_count: open.length,
  resolved_gap_count: resolved.length,
  stage_counts: stageCounts,
  definition: 'A research gap is resolved only through an explicit resolution record that can be traced to reviewed Evidence Decisions and trusted Topic protocols.',
  pipeline: ['open question', 'discovery query', 'research candidate', 'Evidence Decision', 'trusted protocol', 'explicit resolution', 'Evidence Trends'],
  entries: records
};

writeJson('research/gaps/index.json', report);
writeJson('life-os/datasets/research-gaps.json', report);

const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/problems/">Problems</a><a href="/topics/">Topics</a><a href="/research/">Research</a><a href="/evidence/">Evidence</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · practical knowledge with a visible research backlog</small><div class="footer-links"><a href="/research/gaps/">Research gaps</a><a href="/evidence/">Evidence Ledger</a><a href="/trends/evidence/">Evidence Trends</a></div></div></footer>`;
const head = ({ title, description, canonical, schema }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${BASE}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`;
const linksList = values => values.length ? `<ul>${values.join('')}</ul>` : '<p>None recorded yet.</p>';

for (const record of records) {
  writeJson(`research/gaps/${record.topic_id}/index.json`, record);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Research gap: ${record.topic_title}`,
    description: record.question,
    url: record.canonical_url,
    dateModified: record.resolution?.resolved_at ?? agenda.baseline_date,
    publisher: { '@type': 'Organization', name: 'Brali', url: BASE },
    about: { '@type': 'Thing', name: record.topic_title }
  };
  const queryItems = record.research_queries.map(query => `<li><code>${esc(query.query)}</code>${query.risk_flags.length ? ` <small>Guardrails: ${esc(query.risk_flags.join(', '))}</small>` : ''}</li>`);
  const candidateItems = record.candidates.map(candidate => `<li>${candidate.reference_url ? `<a href="${esc(candidate.reference_url)}" rel="noopener">${esc(candidate.title)}</a>` : esc(candidate.title)} · ${esc(candidate.status)}${candidate.publication_date ? ` · ${esc(candidate.publication_date)}` : ''}</li>`);
  const decisionItems = record.evidence_decisions.map(decision => `<li><a href="/evidence/${esc(decision.id)}/">${esc(decision.source_title)}</a> · ${esc(decision.decision)} · reviewed ${esc(decision.reviewed_at)}</li>`);
  const protocolItems = record.trusted_protocols.map(protocol => `<li><a href="/life-os/${esc(protocol.slug)}/">${esc(protocol.title)}</a> · ${esc(protocol.evidence_status ?? 'trusted')}</li>`);
  const resolution = record.resolution ? `<div class="callout"><strong>Resolved ${esc(record.resolution.resolved_at)}.</strong> ${esc(record.resolution.rationale)}</div>` : `<div class="callout"><strong>Still open.</strong> ${esc(record.stage_summary)}</div>`;
  write(`research/gaps/${record.topic_id}/index.html`, `${head({ title: `Research gap: ${record.topic_title} | Brali`, description: record.question, canonical: record.canonical_url, schema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Research Gap · ${esc(record.domain_title)} · ${esc(record.stage_label)}</p><h1>${esc(record.question)}</h1><p class="lead">${esc(record.evidence_target)}</p>${resolution}<section class="prose"><h2>Evidence boundary</h2><p>${esc(record.guardrail)}</p><h2>Discovery queries</h2>${linksList(queryItems)}<h2>Research candidates</h2>${linksList(candidateItems)}<h2>Reviewed Evidence Decisions</h2>${linksList(decisionItems)}<h2>Trusted Topic protocols</h2>${linksList(protocolItems)}<h2>Closure rule</h2><p>Brali does not close this gap because a paper exists or because a protocol sounds plausible. Closure requires an explicit resolution whose reviewed Evidence Decisions map to this Topic and whose referenced protocols are present in the trusted protocol feed for the same Topic.</p><p><a href="/research/gaps/${esc(record.topic_id)}/index.json">Machine-readable gap record →</a> · <a href="/research/gaps/">All research gaps →</a></p></section></main>${footer}</body></html>\n`);
}

const cards = records.map(record => `<article class="card"><span class="card-label">${esc(record.domain_title)} · ${esc(record.stage_label)}</span><h2><a href="/research/gaps/${esc(record.topic_id)}/">${esc(record.topic_title)}</a></h2><p>${esc(record.question)}</p><p><strong>${record.research_queries.length}</strong> discovery quer${record.research_queries.length === 1 ? 'y' : 'ies'} · <strong>${record.candidates.length}</strong> candidates · <strong>${record.evidence_decisions.length}</strong> decisions · <strong>${record.trusted_protocols.length}</strong> trusted protocols</p></article>`).join('');
const summaryCards = [
  ['Baseline gaps', agenda.baseline_growth_gap_count, `Named on ${agenda.baseline_date}. Resolved items remain visible in the agenda.`],
  ['Open now', open.length, 'Still require research, evidence review, protocol work, or an explicit resolution.'],
  ['Resolved', resolved.length, 'Passed the full decision-to-trusted-protocol closure contract.'],
  ['Discovery coverage', records.filter(item => item.research_queries.length).length, 'Baseline gaps with at least one machine-runnable research query.']
].map(([label, value, detail]) => `<article class="card"><span class="card-label">${esc(label)}</span><h2>${esc(value)}</h2><p>${esc(detail)}</p></article>`).join('');
const indexSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Brali Research Gaps',
  description: 'Open research questions and resolved evidence gaps across the Brali knowledge ontology.',
  url: `${BASE}/research/gaps/`,
  hasPart: records.map(record => ({ '@type': 'Article', name: record.topic_title, url: record.canonical_url }))
};
write('research/gaps/index.html', `${head({ title: 'Research Gaps: open questions and resolved evidence work | Brali', description: 'Track the 24-topic Brali research agenda from open question through discovery, Evidence Decision, trusted protocol, and explicit resolution.', canonical: `${BASE}/research/gaps/`, schema: indexSchema })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Brali Research Agenda · baseline ${esc(agenda.baseline_date)}</p><h1>Keep the unknowns visible.</h1><p class="lead">Brali started this agenda with ${agenda.baseline_growth_gap_count} deliberate ontology gaps. A gap stays visible until evidence is reviewed, practical guidance is updated, and an explicit resolution can be verified.</p><div class="grid two">${summaryCards}</div><div class="callout"><strong>Pipeline:</strong> ${report.pipeline.map(esc).join(' → ')}. Candidate metadata is discovery only; it never counts as reviewed evidence.</div><section><h2>Open and resolved research questions</h2><div class="grid two">${cards}</div></section><section class="prose"><h2>Machine-readable research backlog</h2><p><a href="/research/gaps/index.json">Research gaps JSON</a> · <a href="/life-os/datasets/research-gaps.json">Dataset copy</a> · <a href="/evidence/">Evidence Ledger</a> · <a href="/trends/evidence/">Evidence Trends</a></p></section></main>${footer}</body></html>\n`);

const inject = (rel, marker, block) => {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(marker)) return false;
  html = html.replace('</main>', `${block}</main>`);
  fs.writeFileSync(file, html);
  return true;
};
inject('research/index.html', 'data-brali-research-gaps', `<aside class="callout" data-brali-research-gaps><h3>Research gaps</h3><p>Track ${open.length} open questions and ${resolved.length} resolved gap from discovery through Evidence Decision and trusted protocol.</p><a class="button" href="/research/gaps/">Open the research agenda</a></aside>`);

const trendIndexPath = path.join(ROOT, 'trends/evidence/index.json');
if (fs.existsSync(trendIndexPath)) {
  const trendIndex = JSON.parse(fs.readFileSync(trendIndexPath, 'utf8'));
  const period = trendIndex.latest_period;
  const pulsePath = path.join(ROOT, `trends/evidence/${period}/index.json`);
  if (period && fs.existsSync(pulsePath)) {
    const pulse = JSON.parse(fs.readFileSync(pulsePath, 'utf8'));
    const resolvedThisPeriod = resolved.filter(item => String(item.resolution?.resolved_at ?? '').startsWith(period));
    pulse.research_gap_pipeline = {
      baseline_gaps: agenda.baseline_growth_gap_count,
      open_gaps: open.length,
      resolved_gaps: resolved.length,
      stage_counts: stageCounts,
      resolved_this_period: resolvedThisPeriod.map(item => ({
        topic_id: item.topic_id,
        topic_title: item.topic_title,
        resolved_at: item.resolution.resolved_at,
        evidence_decision_ids: item.resolution.evidence_decision_ids,
        protocol_slugs: item.resolution.protocol_slugs
      })),
      agenda_url: `${BASE}/research/gaps/`
    };
    fs.writeFileSync(pulsePath, `${JSON.stringify(pulse, null, 2)}\n`);
    inject(`trends/evidence/${period}/index.html`, 'data-brali-research-gap-pipeline', `<section class="prose" data-brali-research-gap-pipeline><h2>Research gap pipeline</h2><p>The baseline agenda contains ${agenda.baseline_growth_gap_count} gaps. ${open.length} remain open and ${resolved.length} ${resolved.length === 1 ? 'is' : 'are'} explicitly resolved. ${resolvedThisPeriod.length ? `${resolvedThisPeriod.length} closure was recorded this period.` : 'No closure was recorded this period.'}</p><p><a href="/research/gaps/">Open Research Gaps →</a></p></section>`);
  }
}

const manifestPath = path.join(ROOT, 'life-os/datasets/manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files = [...new Set([...(manifest.files ?? []), 'research-gaps.json'])];
  manifest.research_gaps = { baseline: agenda.baseline_growth_gap_count, open: open.length, resolved: resolved.length };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
const datasetsPage = path.join(ROOT, 'life-os/datasets/index.html');
if (fs.existsSync(datasetsPage)) {
  let html = fs.readFileSync(datasetsPage, 'utf8');
  if (!html.includes('research-gaps.json')) {
    html = html.replace('</ul>', '<li><a href="/life-os/datasets/research-gaps.json">Research gaps and resolution pipeline (JSON)</a></li></ul>');
    fs.writeFileSync(datasetsPage, html);
  }
}

const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('Research Gaps:')) llms += `\n- Research Gaps: ${BASE}/research/gaps/\n- Research Gaps JSON: ${BASE}/research/gaps/index.json\n`;
  fs.writeFileSync(llmsPath, llms);
}

console.log(`Research gaps built: baseline=${agenda.baseline_growth_gap_count}; open=${open.length}; resolved=${resolved.length}; discovery-covered=${records.filter(item => item.research_queries.length).length}.`);
