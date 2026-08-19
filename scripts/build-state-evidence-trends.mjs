import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = (rel, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch (error) { if (fallback !== null) return fallback; throw error; }
};
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const json = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const list = (doc, key) => Array.isArray(doc) ? doc : Array.isArray(doc?.[key]) ? doc[key] : Array.isArray(doc?.entries) ? doc.entries : [];
const pct = (n, d) => d ? Number(((n / d) * 100).toFixed(1)) : 0;

const growth = read('data/growth-surfaces.json');
const evidence = read('life-os/datasets/evidence.json');
const protocols = read('life-os/datasets/protocols.json');
const ontology = read('data/knowledge-ontology.json');
const zones = read('data/life-os-zones.json');
const candidates = read('data/research-candidates.json', { candidates: [] });
const decisions = read('data/evidence-decisions.json', { entries: [] });
const overrides = read('data/evidence-overrides.json', { entries: {} });
const evalSuite = read('data/agent-evaluation-suite.json', { cases: [] });
const flagships = read('life-os/datasets/flagship-100.json', { entries: [] });
const hubs = read('life-os/datasets/topic-hubs.json', { hubs: [] });

const snapshotDate = growth.updated_at || '2026-08-19';
const month = snapshotDate.slice(0, 7);
const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const evidenceEntries = list(evidence, 'entries');
const counts = evidence.counts ?? {};
const total = evidenceEntries.length;
const reviewed = Number(counts.reviewed || 0);
const practical = Number(counts.practical || 0);
const pending = Number(counts['pending-review'] || 0);
const restricted = Number(counts.restricted || 0);
const trusted = reviewed + practical;
const topicMapped = Number(evidence.ontology_coverage?.topic_mapped || 0);
const sourceRecorded = evidenceEntries.filter(item => item.source?.recorded).length;
const sensitive = evidenceEntries.filter(item => item.sensitive).length;
const quantitative = evidenceEntries.filter(item => item.claims?.quantitative).length;
const protocolCount = Number(protocols.count ?? list(protocols, 'entries').length);
const topicCount = list(ontology, 'topics').length;
const zoneCount = Array.isArray(zones) ? zones.length : list(zones, 'zones').length;
const flagshipCount = Number(flagships.count ?? list(flagships, 'entries').length);
const hubCount = list(hubs, 'hubs').length;
const candidateCount = list(candidates, 'candidates').length;
const decisionCount = list(decisions, 'entries').length;
const evaluationCases = list(evalSuite, 'cases').length;

const state = {
  schema_version: 1,
  snapshot_date: snapshotDate,
  title: 'State of Practical Knowledge',
  scope: 'Current measurable state of the Brali knowledge library and its quality/integration layers.',
  metrics: {
    library_entries: total,
    evidence_reviewed: reviewed,
    practical_editorial: practical,
    trusted_or_practical: trusted,
    trusted_or_practical_share_percent: pct(trusted, total),
    pending_review: pending,
    restricted: restricted,
    topic_mapped: topicMapped,
    topic_mapped_share_percent: pct(topicMapped, total),
    source_recorded: sourceRecorded,
    source_recorded_share_percent: pct(sourceRecorded, total),
    trusted_protocols: protocolCount,
    flagship_protocols: flagshipCount,
    canonical_topics: topicCount,
    growth_zones: zoneCount,
    topic_hubs: hubCount,
    research_candidates: candidateCount,
    evidence_decisions: decisionCount,
    agent_evaluation_cases: evaluationCases
  },
  interpretation: {
    trusted_or_practical: 'Reviewed + practical are Brali publication states. They do not mean every protocol has the same scientific evidence strength.',
    pending_review: 'Accessible source material that has not passed the current public quality bar.',
    restricted: 'Material withheld from normal trusted discovery because content or evidence risk requires more care.',
    topic_mapped: 'Entries mapped to at least one canonical Brali Topic. Mapping coverage is a taxonomy metric, not an effectiveness metric.'
  },
  canonical_url: `${BASE}/state/`,
  evidence_trends_url: `${BASE}/trends/evidence/${month}/`
};
json('state/index.json', state);

const monthReviews = Object.entries(overrides.entries ?? {})
  .filter(([, item]) => String(item.reviewed_at || '').startsWith(month))
  .map(([slug, item]) => ({ slug, status: item.status, reviewed_at: item.reviewed_at, reviewed_by: item.reviewed_by, note: item.note }));
const monthDecisions = list(decisions, 'entries').filter(item => String(item.reviewed_at || '').startsWith(month));
const reviewStatusCounts = monthReviews.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
const decisionTypeCounts = monthDecisions.reduce((acc, item) => { const key = item.decision || 'unspecified'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
const candidateStatusCounts = list(candidates, 'candidates').reduce((acc, item) => { const key = item.status || 'unspecified'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});

const pulse = {
  schema_version: 1,
  period: month,
  period_label: monthLabel,
  snapshot_date: snapshotDate,
  title: `${monthLabel} evidence pulse`,
  current_distribution: { total, reviewed, practical, pending_review: pending, restricted, trusted_or_practical_share_percent: pct(trusted, total) },
  current_claim_profile: { source_recorded: sourceRecorded, sensitive, quantitative_claims: quantitative },
  month_to_date_activity: {
    manual_reviews: monthReviews.length,
    review_status_counts: reviewStatusCounts,
    evidence_decisions: monthDecisions.length,
    evidence_decision_types: decisionTypeCounts
  },
  research_queue: { candidates: candidateCount, status_counts: candidateStatusCounts },
  reviews: monthReviews,
  evidence_decisions: monthDecisions.map(item => ({ id: item.id, decision: item.decision, reviewed_at: item.reviewed_at, source_title: item.source_title, supported_claim: item.supported_claim, limitations: item.limitations || [] })),
  limitations: [
    'This is a curation and coverage report for Brali, not a meta-analysis of scientific effects.',
    'Month-to-date review activity is based on dated Brali review records. It does not measure search demand, user outcomes, or research-field popularity.',
    'A true month-over-month trend requires comparable stored snapshots; the current report establishes the baseline for future comparisons.'
  ],
  canonical_url: `${BASE}/trends/evidence/${month}/`
};
json(`trends/evidence/${month}/index.json`, pulse);
json('trends/evidence/index.json', { schema_version: 1, latest_period: month, latest_url: pulse.canonical_url, reports: [{ period: month, label: monthLabel, url: pulse.canonical_url }] });

const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/questions/">Questions</a><a href="/state/">State</a><a href="/research/">Research</a><a href="/updates/">Updates</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · practical knowledge for people and machines</small><div class="footer-links"><a href="/state/">State</a><a href="/trends/evidence/">Evidence trends</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a></div></div></footer>`;
const head = ({title, description, canonical, schema}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${BASE}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head>`;
const metricCard = (label, value, detail) => `<article class="card"><span class="card-label">${esc(label)}</span><h2>${esc(value)}</h2><p>${esc(detail)}</p></article>`;

const stateSchema = {'@context':'https://schema.org','@type':'Dataset',name:'Brali State of Practical Knowledge',description:state.scope,url:state.canonical_url,dateModified:snapshotDate,measurementTechnique:'Deterministic counts from Brali generated datasets and registries'};
const stateCards = [
  ['Library entries', total, `${trusted} reviewed or practical; ${pending} pending review; ${restricted} restricted.`],
  ['Trusted/practical share', `${pct(trusted,total)}%`, 'Publication-state coverage, not a claim that all entries have equal scientific support.'],
  ['Canonical Topic coverage', `${pct(topicMapped,total)}%`, `${topicMapped} of ${total} entries map to at least one canonical Topic.`],
  ['Trusted protocols', protocolCount, `${flagshipCount} are in the current Flagship core.`],
  ['Knowledge structure', `${topicCount} Topics · ${zoneCount} Zones`, `${hubCount} problem-first Topic Hubs are currently published.`],
  ['Research layer', `${candidateCount} candidates`, `${decisionCount} reviewed Evidence Decisions are recorded.`],
  ['Agent evaluation', `${evaluationCases} cases`, 'Maintained retrieval, evidence-boundary, multilingual, safety and no-answer scenarios.'],
  ['Source coverage', `${pct(sourceRecorded,total)}%`, `${sourceRecorded} library entries have a recorded usable source in the evidence index.`]
].map(args => metricCard(...args)).join('');
write('state/index.html', `${head({title:'State of Practical Knowledge 2026 | Brali',description:'A measurable snapshot of the Brali practical knowledge library: entries, evidence states, Topic coverage, protocols, research decisions, and agent evaluation.',canonical:state.canonical_url,schema:stateSchema})}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">State of Practical Knowledge · ${esc(snapshotDate)}</p><h1>How large, reviewed, structured, and machine-usable is Brali?</h1><p class="lead">A reproducible snapshot built from the same datasets that power the public library. No traffic estimates, fake popularity scores, or decorative “AI confidence” numbers have been smuggled in.</p><div class="grid two">${stateCards}</div><section class="prose"><h2>How to read these numbers</h2><p><strong>Reviewed</strong> and <strong>practical</strong> are Brali publication states. They describe editorial trust handling, not one universal level of scientific proof. <strong>Topic coverage</strong> measures taxonomy mapping. <strong>Source coverage</strong> measures whether a usable source is recorded in the evidence index.</p><h2>What changes over time</h2><p>The <a href="/trends/evidence/">Evidence Trends</a> report tracks review activity and the evidence-state distribution. <a href="/updates/">Brali Updates</a> covers broader project changes, while <a href="/research/">Research & trends</a> explains individual evidence corrections and new findings.</p><h2>Machine-readable snapshot</h2><p><a href="/state/index.json">State snapshot JSON</a> · <a href="/life-os/datasets/evidence.json">Evidence index</a> · <a href="/life-os/datasets/protocols.json">Trusted Protocol Feed</a> · <a href="/for-ai/">AI integration guide</a></p></section></main>${footer}</body></html>\n`);

const pulseSchema = {'@context':'https://schema.org','@type':'Report',name:pulse.title,description:'Monthly Brali evidence curation pulse: current evidence-state distribution, review activity, Evidence Decisions, and research queue.',url:pulse.canonical_url,dateModified:snapshotDate,isPartOf:{'@type':'CollectionPage',name:'Brali Evidence Trends',url:`${BASE}/trends/evidence/`}};
const activityCards = [
  ['Reviewed', reviewed, 'Entries in the current reviewed evidence state.'],
  ['Practical', practical, 'Low-risk practical entries with evidence-like claims removed or bounded.'],
  ['Pending review', pending, 'Entries that have not passed the current trusted publication bar.'],
  ['Restricted', restricted, 'Entries withheld from normal trusted discovery.'],
  ['Reviews this month', monthReviews.length, `${Object.entries(reviewStatusCounts).map(([k,v])=>`${v} ${k}`).join(' · ') || 'No dated review records.'}`],
  ['Evidence Decisions this month', monthDecisions.length, `${Object.entries(decisionTypeCounts).map(([k,v])=>`${v} ${k}`).join(' · ') || 'No dated decisions.'}`]
].map(args => metricCard(...args)).join('');
const decisionList = monthDecisions.length ? monthDecisions.slice(0,12).map(item => `<li><strong>${esc(item.source_title || item.id)}</strong> · ${esc(item.decision || 'decision')}<br><small>${esc(item.supported_claim || '')}</small></li>`).join('') : '<li>No dated Evidence Decisions in this period.</li>';
write(`trends/evidence/${month}/index.html`, `${head({title:`${monthLabel} evidence trends | Brali`,description:`Brali's ${monthLabel} evidence pulse: current evidence-state distribution, month-to-date review activity, Evidence Decisions, and research queue.`,canonical:pulse.canonical_url,schema:pulseSchema})}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Evidence Trends · ${esc(monthLabel)}</p><h1>What changed in Brali's evidence layer this month?</h1><p class="lead">This report describes Brali's curation activity and current evidence-state mix. It does not pretend that repository activity is the same thing as a scientific trend.</p><div class="grid two">${activityCards}</div><section class="prose"><h2>Reviewed Evidence Decisions</h2><ul>${decisionList}</ul><h2>Current claim profile</h2><p>${sourceRecorded} of ${total} entries have a recorded usable source. ${sensitive} entries are classified as sensitive, and ${quantitative} contain quantitative-claim signals that require careful review.</p><h2>Research queue</h2><p>${candidateCount} research candidates are currently recorded. Candidate metadata is discovery material, not reviewed evidence.</p><h2>Baseline limitation</h2><p>This is the first stored public evidence pulse in this series. A real month-over-month trend needs comparable snapshots, so this report establishes the baseline rather than fabricating a delta.</p><p><a href="/trends/evidence/${month}/index.json">Report JSON</a> · <a href="/state/">State of Practical Knowledge</a> · <a href="/research/">Research notes</a></p></section></main>${footer}</body></html>\n`);
write('trends/evidence/index.html', `${head({title:'Evidence Trends | Brali',description:'Monthly evidence curation reports for Brali: review activity, evidence-state distribution, Evidence Decisions, and research-queue boundaries.',canonical:`${BASE}/trends/evidence/`,schema:{'@context':'https://schema.org','@type':'CollectionPage',name:'Brali Evidence Trends',url:`${BASE}/trends/evidence/`,hasPart:[{'@type':'Report',name:pulse.title,url:pulse.canonical_url}]}})}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Evidence Trends</p><h1>A monthly audit trail for what Brali trusts, reviews, and keeps uncertain.</h1><p class="lead">Evidence reports turn the library's review system into something visible and comparable instead of burying it in JSON files and commit history.</p><div class="grid two"><article class="card"><span class="card-label">Latest · ${esc(monthLabel)}</span><h2><a href="/trends/evidence/${month}/">${esc(pulse.title)}</a></h2><p>${monthReviews.length} dated review records and ${monthDecisions.length} Evidence Decisions this month; ${trusted} of ${total} entries are currently reviewed or practical.</p></article><article class="card"><span class="card-label">Baseline</span><h2>Future reports can show real deltas</h2><p>The first report establishes comparable definitions. Later months can report changes in review states, source coverage, Topic coverage, and decision counts without retroactively inventing history.</p></article></div><section class="prose"><h2>Related</h2><p><a href="/state/">State of Practical Knowledge</a> · <a href="/research/">Research & trends</a> · <a href="/updates/">Brali Updates</a> · <a href="/life-os/datasets/">Datasets</a></p></section></main>${footer}</body></html>\n`);

const inject = (rel, marker, block) => {
  const file = path.join(ROOT, rel); if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8'); if (html.includes(marker)) return false;
  html = html.replace('</main>', `${block}</main>`); fs.writeFileSync(file, html); return true;
};
inject('research/index.html','data-brali-evidence-trends','<aside class="callout" data-brali-evidence-trends><h3>Evidence pulse</h3><p>See the monthly distribution of reviewed, practical, pending, and restricted material, plus dated review activity.</p><p><a href="/trends/evidence/">Evidence Trends →</a></p></aside>');
inject('updates/index.html','data-brali-state-snapshot','<aside class="callout" data-brali-state-snapshot><h3>State of Practical Knowledge</h3><p>A reproducible snapshot of library size, evidence states, Topic coverage, research decisions, and agent evaluation.</p><p><a href="/state/">Open the current state →</a></p></aside>');

const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes(`${BASE}/state/`)) llms += `\n## Project state and evidence trends\n- State of Practical Knowledge: ${BASE}/state/\n- Evidence Trends: ${BASE}/trends/evidence/\n- Project Updates: ${BASE}/updates/\n`;
  fs.writeFileSync(llmsPath, llms);
}

console.log(`State/evidence surfaces built: ${total} entries, ${trusted} reviewed/practical, ${protocolCount} trusted protocols, ${monthReviews.length} reviews in ${month}, ${monthDecisions.length} Evidence Decisions in ${month}.`);
