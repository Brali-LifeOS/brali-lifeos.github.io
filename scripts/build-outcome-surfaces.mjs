import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const base = 'https://brali-lifeos.github.io';
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const schema = await readJson('contracts/outcome-event.schema.json');
const policy = await readJson('data/outcome-policy.json');
const registry = await readJson('data/outcome-observations.json');
const manifest = await readJson('life-os/datasets/manifest.json');

const eventTypes = schema.properties?.event_type?.enum ?? [];
const clientCategories = schema.properties?.client?.properties?.category?.enum ?? [];
const shareChannels = schema.properties?.consent?.properties?.channel?.enum ?? [];
const queryEvents = new Set(['query_submitted', 'trusted_match_returned', 'no_trusted_answer', 'helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'context_packet_copied']);
const protocolEvents = new Set(['protocol_opened', 'protocol_started', 'protocol_completed', 'source_opened']);
const feedbackEvents = new Set(['helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'integration_reported']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const protocolPattern = /^brali:protocol:[a-z0-9][a-z0-9-]*$/;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/;

function fail(message) {
  throw new Error(`Outcome surface build failed: ${message}`);
}

function validateEvent(event, index) {
  const prefix = `observation ${index}`;
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail(`${prefix}: event must be an object`);
  if (event.schema_version !== 1) fail(`${prefix}: unsupported event schema`);
  if (!uuidPattern.test(event.event_id ?? '')) fail(`${prefix}: invalid event_id`);
  if (!eventTypes.includes(event.event_type)) fail(`${prefix}: unknown event_type ${event.event_type}`);
  if (!Number.isFinite(Date.parse(event.occurred_at))) fail(`${prefix}: invalid occurred_at`);
  if (!clientCategories.includes(event.client?.category)) fail(`${prefix}: invalid client category`);
  if (!versionPattern.test(event.dataset?.version ?? '')) fail(`${prefix}: invalid dataset version`);
  if (event.dataset?.manifest_sha256 != null && !/^[a-f0-9]{64}$/.test(event.dataset.manifest_sha256)) fail(`${prefix}: invalid manifest SHA-256`);
  if (event.consent?.explicit !== true || !shareChannels.includes(event.consent?.channel)) fail(`${prefix}: explicit consent and supported channel are required`);
  if (event.privacy?.raw_query_included !== false) fail(`${prefix}: raw query is forbidden`);
  if (event.privacy?.personal_data_included !== false) fail(`${prefix}: personal data is forbidden`);
  if (event.privacy?.user_identifier_included !== false) fail(`${prefix}: user identifiers are forbidden`);
  if ('query' in event || 'raw_query' in event || 'user_id' in event) fail(`${prefix}: prohibited top-level field`);
  if (queryEvents.has(event.event_type)) {
    if (!uuidPattern.test(event.query_id ?? '')) fail(`${prefix}: query event requires query_id`);
    if (!['trusted_match', 'no_trusted_answer', 'not_applicable'].includes(event.result?.state)) fail(`${prefix}: query event requires result state`);
  }
  if (protocolEvents.has(event.event_type)) {
    if (!uuidPattern.test(event.run_id ?? '')) fail(`${prefix}: protocol event requires run_id`);
    if (!protocolPattern.test(event.protocol_id ?? '')) fail(`${prefix}: protocol event requires canonical protocol_id`);
  }
  if (event.run_id != null && !uuidPattern.test(event.run_id)) fail(`${prefix}: invalid optional run_id`);
  if (event.protocol_id != null && !protocolPattern.test(event.protocol_id)) fail(`${prefix}: invalid optional protocol_id`);
  if (feedbackEvents.has(event.event_type) && !event.feedback?.reason) fail(`${prefix}: feedback event requires reason`);
}

function validateObservation(observation, index) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) fail(`observation ${index}: wrapper must be an object`);
  validateEvent(observation.event, index);
  const provenance = observation.provenance;
  if (!provenance || typeof provenance !== 'object') fail(`observation ${index}: provenance is required`);
  if (!['github-issue', 'manual-import'].includes(provenance.source_channel)) fail(`observation ${index}: invalid provenance channel`);
  if (!/^https:\/\//.test(provenance.source_url ?? '')) fail(`observation ${index}: source URL is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.reviewed_at ?? '')) fail(`observation ${index}: reviewed_at is required`);
  if (!(provenance.reviewed_by?.length >= 3)) fail(`observation ${index}: reviewed_by is required`);
  if (provenance.consent_confirmed !== true) fail(`observation ${index}: consent confirmation is required`);
}

if (schema.$id !== `${base}/contracts/outcome-event.schema.json`) fail('event schema identity drift');
if (policy.schema_version !== 1 || policy.name !== 'Brali outcome observation policy') fail('outcome policy identity drift');
if (policy.collection_status !== 'contract-ready') fail('first outcome slice must remain contract-ready until interactive feedback is live');
if (policy.collection_status !== registry.collection_status) fail('policy and registry collection status differ');
if (policy.automatic_collection?.enabled !== false || policy.automatic_collection?.network_requests_from_feedback !== false) fail('automatic collection must remain disabled');
if (registry.schema_version !== 1 || !Array.isArray(registry.observations)) fail('observation registry is malformed');

registry.observations.forEach(validateObservation);
const eventIds = registry.observations.map(item => item.event.event_id);
if (new Set(eventIds).size !== eventIds.length) fail('duplicate outcome event IDs');

function isoWeekKey(value) {
  const date = new Date(value);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const countsByEventType = Object.fromEntries(eventTypes.map(type => [type, 0]));
const countsByClient = Object.fromEntries(clientCategories.map(category => [category, 0]));
const protocolCounts = new Map();
const runEvents = new Map();
const observedWeeks = new Set();

for (const observation of registry.observations) {
  const event = observation.event;
  countsByEventType[event.event_type] += 1;
  countsByClient[event.client.category] += 1;
  observedWeeks.add(isoWeekKey(event.occurred_at));
  const protocolIds = new Set([event.protocol_id, ...(event.result?.protocol_ids ?? [])].filter(Boolean));
  for (const protocolId of protocolIds) protocolCounts.set(protocolId, (protocolCounts.get(protocolId) ?? 0) + 1);
  if (event.run_id) {
    const events = runEvents.get(event.run_id) ?? [];
    events.push(event);
    runEvents.set(event.run_id, events);
  }
}

const verifiedRuns = [];
const weeklyVerified = {};
for (const [runId, events] of runEvents.entries()) {
  const completions = events.filter(event => event.event_type === 'protocol_completed');
  const helpful = events.filter(event => event.event_type === 'helpful_yes' && event.protocol_id);
  const matching = completions.find(completed => helpful.some(answer =>
    answer.protocol_id === completed.protocol_id &&
    answer.dataset.version === completed.dataset.version &&
    isoWeekKey(answer.occurred_at) === isoWeekKey(completed.occurred_at)
  ));
  if (!matching) continue;
  const week = isoWeekKey(matching.occurred_at);
  verifiedRuns.push({ run_id: runId, protocol_id: matching.protocol_id, dataset_version: matching.dataset.version, week });
  weeklyVerified[week] = (weeklyVerified[week] ?? 0) + 1;
}

const report = {
  schema_version: 1,
  name: 'Brali outcome observation report',
  collection_status: policy.collection_status,
  observation_status: registry.observations.length ? 'reviewed-observations-present' : 'no-reviewed-observations',
  dataset_version: manifest.dataset_version,
  generated_from: 'data/outcome-observations.json',
  north_star: {
    id: policy.north_star.id,
    definition: policy.north_star.definition,
    observed_total: verifiedRuns.length,
    weekly_observed: Object.fromEntries(Object.entries(weeklyVerified).sort(([left], [right]) => left.localeCompare(right))),
    initial_validation_target: policy.north_star.initial_validation_target,
    target_type: policy.north_star.target_type
  },
  counts: {
    reviewed_events: registry.observations.length,
    distinct_event_ids: new Set(eventIds).size,
    distinct_runs: runEvents.size,
    distinct_protocols: protocolCounts.size,
    observed_weeks: observedWeeks.size,
    verified_successful_executions: verifiedRuns.length,
    by_event_type: countsByEventType,
    by_client_category: countsByClient,
    by_protocol_id: Object.fromEntries([...protocolCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    rejected_or_withheld: registry.rejected_or_withheld_counts
  },
  interpretation: registry.observations.length
    ? 'Counts include only reviewed, explicit opt-in observations accepted into the versioned registry.'
    : 'No reviewed outcome observation has been accepted yet. Zero is an observed zero; contracts, fixtures, downloads, page views and CI do not count as use.',
  privacy: {
    automatic_collection: false,
    raw_queries_in_report: false,
    user_identifiers_in_report: false,
    source_registry: '/life-os/datasets/outcome-observations.json',
    policy: '/life-os/datasets/outcome-policy.json',
    event_schema: '/contracts/outcome-event.schema.json'
  },
  next_instrumentation_step: 'Add explicit opt-in Query and Protocol feedback that creates a reviewable event envelope without automatic transmission.'
};

await mkdir(path.join(root, 'life-os/datasets'), { recursive: true });
await mkdir(path.join(root, 'quality/outcomes'), { recursive: true });
await writeFile(path.join(root, 'life-os/datasets/outcome-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
await writeFile(path.join(root, 'life-os/datasets/outcome-observations.json'), `${JSON.stringify(registry, null, 2)}\n`);
await writeFile(path.join(root, 'life-os/datasets/outcome-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const eventRows = eventTypes.map(type => `<tr><th scope="row">${escapeHtml(type.replace(/_/g, ' '))}</th><td>${countsByEventType[type]}</td></tr>`).join('');
const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: report.name,
  description: report.interpretation,
  url: `${base}/quality/outcomes/`,
  isPartOf: { '@type': 'WebSite', name: 'Brali', url: `${base}/` },
  distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${base}/life-os/datasets/outcome-report.json` }
};
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Observed outcomes — Brali</title><meta name="description" content="What Brali has actually observed, what is still zero, and how privacy-light outcome reporting will work."><link rel="canonical" href="${base}/quality/outcomes/"><meta property="og:type" content="website"><meta property="og:title" content="Observed outcomes — Brali"><meta property="og:description" content="Real observations, explicit zero states, and the privacy boundary around Brali outcome reporting."><meta property="og:url" content="${base}/quality/outcomes/"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(pageSchema).replace(/</g, '\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/life-os/">Explore</a><a href="/life-os/methodology/">Evidence</a><a href="/research/">Research</a><a href="/for-ai/">For AI &amp; Developers</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Observed outcomes</p><h1>The contract is ready. The evidence of usefulness is still ${report.north_star.observed_total}.</h1><p class="lead">Good. Zero is a number, not an embarrassment. Brali now has a strict outcome contract and a public place to report what has actually happened. It does not yet have live Query or Protocol feedback, so this page does not pretend otherwise.</p><div class="grid three" data-outcome-summary><article class="card" data-reviewed-events="${report.counts.reviewed_events}"><span class="card-label">Reviewed events</span><h2>${report.counts.reviewed_events}</h2><p>Consent-checked events accepted into the public registry.</p></article><article class="card" data-verified-executions="${report.north_star.observed_total}"><span class="card-label">Verified successful executions</span><h2>${report.north_star.observed_total}</h2><p>Completed protocol runs also explicitly marked helpful under the matching rule.</p></article><article class="card" data-validation-target="${report.north_star.initial_validation_target}"><span class="card-label">Initial validation target</span><h2>${report.north_star.initial_validation_target}</h2><p>A hypothesis target, not an observed result and definitely not a progress bar.</p></article></div><section class="prose"><h2>What counts</h2><p>${escapeHtml(policy.north_star.definition)}</p><p>A protocol has to be completed and explicitly marked helpful under the same run, protocol, dataset version and week. That is intentionally stricter than “someone opened a page.”</p><h2>What does not count</h2><p>Page views, downloads, copied JSON, CI runs, demo events and repository commits do not count as successful executions. A download is not a transformed life. Shocking, but useful.</p><h2>Why the status is contract-ready</h2><p><strong>Query/Protocol feedback is not live yet.</strong> The schema, privacy rules, reviewed registry and reporting semantics are ready first. The next slice will add an explicit opt-in feedback envelope. Until that path is verified, Brali does not call itself instrumented.</p><h2>Event counts</h2><div class="table-scroll"><table><thead><tr><th>Event type</th><th>Reviewed count</th></tr></thead><tbody>${eventRows}</tbody></table></div><h2>Privacy boundary</h2><ul><li>No automatic telemetry or background outcome transmission.</li><li>Raw queries, personal data and user identifiers are forbidden in the event envelope.</li><li>Only explicitly consented events with reviewed provenance may enter the public registry.</li><li>Negative outcomes are first-class data: not-helpful, bad-match, no-answer and missing-knowledge belong here when they meet the same rules.</li></ul><h2>Machine-readable surfaces</h2><ul><li><a href="/contracts/outcome-event.schema.json">Outcome event JSON Schema</a></li><li><a href="/life-os/datasets/outcome-policy.json">Outcome policy</a></li><li><a href="/life-os/datasets/outcome-observations.json">Reviewed observation registry</a></li><li><a href="/life-os/datasets/outcome-report.json">Aggregate outcome report</a></li></ul></section><div class="callout"><h3>The next useful step is not another counter.</h3><p>It is one explicit feedback path that lets a person say whether a matched protocol was useful without handing Brali their prompt history or identity.</p><a class="button" href="/for-ai/query/">Ask Brali</a></div></main><footer class="footer"><div class="wrap footer-row"><small>Brali · observed outcomes</small><div class="footer-links"><a href="/life-os/">Growth Library</a><a href="/life-os/methodology/">Methodology</a><a href="/privacy/">Privacy</a></div></div></footer></body></html>`;
await writeFile(path.join(root, 'quality/outcomes/index.html'), page);

const datasetsPath = path.join(root, 'life-os/datasets/index.html');
let datasets = await readFile(datasetsPath, 'utf8');
if (!datasets.includes('/quality/outcomes/')) {
  const block = '<aside class="callout" data-brali-outcomes><h3>Observed outcomes</h3><p>See the privacy-light outcome contract, the reviewed registry, and the current honest zero state.</p><a class="button" href="/quality/outcomes/">Open outcome report</a></aside>';
  datasets = datasets.includes('</main>') ? datasets.replace('</main>', `${block}</main>`) : `${datasets}\n${block}\n`;
  await writeFile(datasetsPath, datasets);
}

const sitemapPath = path.join(root, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
const canonical = `${base}/quality/outcomes/`;
if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
  sitemap = sitemap.replace('</urlset>', `  <url><loc>${canonical}</loc></url>\n</urlset>`);
  await writeFile(sitemapPath, sitemap);
}

console.log(`Outcome surfaces built: status=${policy.collection_status}; reviewed-events=${registry.observations.length}; verified-successes=${verifiedRuns.length}; automatic-collection=false.`);
