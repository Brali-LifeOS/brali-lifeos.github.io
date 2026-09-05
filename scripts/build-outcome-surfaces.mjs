import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const base = 'https://brali-lifeos.github.io';
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fail = message => { throw new Error(`Outcome surface build failed: ${message}`); };

const schema = await readJson('contracts/outcome-event.schema.json');
const policy = await readJson('data/outcome-policy.json');
const registry = await readJson('data/outcome-observations.json');
const manifest = await readJson('life-os/datasets/manifest.json');

const eventTypes = schema.properties?.event_type?.enum ?? [];
const clientCategories = schema.properties?.client?.properties?.category?.enum ?? [];
const shareChannels = schema.properties?.consent?.properties?.channel?.enum ?? [];
const queryEvents = new Set(['query_submitted', 'trusted_match_returned', 'no_trusted_answer', 'bad_match', 'missing_knowledge', 'context_packet_copied']);
const protocolEvents = new Set(['protocol_opened', 'protocol_started', 'protocol_completed', 'source_opened']);
const helpfulEvents = new Set(['helpful_yes', 'helpful_no']);
const feedbackEvents = new Set(['helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'integration_reported']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const protocolPattern = /^brali:protocol:[a-z0-9][a-z0-9-]*$/;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/;
const resultStates = new Set(['trusted_match', 'no_trusted_answer', 'not_applicable']);

function hasQueryContext(event) {
  return uuidPattern.test(event.query_id ?? '') && resultStates.has(event.result?.state);
}

function hasRunContext(event) {
  return uuidPattern.test(event.run_id ?? '') && protocolPattern.test(event.protocol_id ?? '');
}

function validateEvent(event, label) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail(`${label}: event must be an object`);
  if (event.schema_version !== 1) fail(`${label}: unsupported event schema`);
  if (!uuidPattern.test(event.event_id ?? '')) fail(`${label}: invalid event_id`);
  if (!eventTypes.includes(event.event_type)) fail(`${label}: unknown event_type ${event.event_type}`);
  if (!Number.isFinite(Date.parse(event.occurred_at))) fail(`${label}: invalid occurred_at`);
  if (!clientCategories.includes(event.client?.category)) fail(`${label}: invalid client category`);
  if (!versionPattern.test(event.dataset?.version ?? '')) fail(`${label}: invalid dataset version`);
  if (event.dataset?.manifest_sha256 != null && !/^[a-f0-9]{64}$/.test(event.dataset.manifest_sha256)) fail(`${label}: invalid manifest SHA-256`);
  if (event.consent?.explicit !== true || !shareChannels.includes(event.consent?.channel)) fail(`${label}: explicit consent and supported channel are required`);
  if (event.privacy?.raw_query_included !== false) fail(`${label}: raw query is forbidden`);
  if (event.privacy?.personal_data_included !== false) fail(`${label}: personal data is forbidden`);
  if (event.privacy?.user_identifier_included !== false) fail(`${label}: user identifiers are forbidden`);
  if ('query' in event || 'raw_query' in event || 'user_id' in event) fail(`${label}: prohibited top-level field`);
  if (queryEvents.has(event.event_type) && !hasQueryContext(event)) fail(`${label}: query event requires query_id and result`);
  if (protocolEvents.has(event.event_type) && !hasRunContext(event)) fail(`${label}: protocol event requires run_id and canonical protocol_id`);
  if (helpfulEvents.has(event.event_type) && !hasQueryContext(event) && !hasRunContext(event)) fail(`${label}: helpful event requires query or run context`);
  if (event.run_id != null && !uuidPattern.test(event.run_id)) fail(`${label}: invalid optional run_id`);
  if (event.protocol_id != null && !protocolPattern.test(event.protocol_id)) fail(`${label}: invalid optional protocol_id`);
  if (feedbackEvents.has(event.event_type) && !event.feedback?.reason) fail(`${label}: feedback event requires reason`);
}

function validateObservation(observation, index) {
  const label = `observation ${index}`;
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) fail(`${label}: wrapper must be an object`);
  validateEvent(observation.event, label);
  const provenance = observation.provenance;
  if (!provenance || typeof provenance !== 'object') fail(`${label}: provenance is required`);
  if (!['github-issue', 'manual-import'].includes(provenance.source_channel)) fail(`${label}: invalid provenance channel`);
  if (!/^https:\/\//.test(provenance.source_url ?? '')) fail(`${label}: source URL is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.reviewed_at ?? '')) fail(`${label}: reviewed_at is required`);
  if (!(provenance.reviewed_by?.length >= 3)) fail(`${label}: reviewed_by is required`);
  if (provenance.consent_confirmed !== true) fail(`${label}: consent confirmation is required`);
}

if (schema.$id !== `${base}/contracts/outcome-event.schema.json`) fail('event schema identity drift');
if (policy.schema_version !== 1 || policy.name !== 'Brali outcome observation policy') fail('outcome policy identity drift');
if (policy.collection_status !== 'instrumented') fail('outcome status must remain instrumented');
if (policy.instrumentation_scope?.query_feedback !== 'live') fail('Query feedback instrumentation status drift');
if (policy.instrumentation_scope?.protocol_execution !== 'live') fail('Protocol Runner instrumentation status drift');
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
  return `${utc.getUTCFullYear()}-W${String(Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
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
  for (const protocolId of new Set([event.protocol_id, ...(event.result?.protocol_ids ?? [])].filter(Boolean))) {
    protocolCounts.set(protocolId, (protocolCounts.get(protocolId) ?? 0) + 1);
  }
  if (event.run_id) {
    const current = runEvents.get(event.run_id) ?? [];
    current.push(event);
    runEvents.set(event.run_id, current);
  }
}

const verifiedRuns = [];
const weeklyVerified = {};
for (const [runId, events] of runEvents.entries()) {
  const completions = events.filter(event => event.event_type === 'protocol_completed');
  const helpful = events.filter(event => event.event_type === 'helpful_yes' && event.protocol_id);
  const match = completions.find(completed => helpful.some(answer =>
    answer.protocol_id === completed.protocol_id &&
    answer.dataset.version === completed.dataset.version &&
    isoWeekKey(answer.occurred_at) === isoWeekKey(completed.occurred_at)
  ));
  if (!match) continue;
  const week = isoWeekKey(match.occurred_at);
  verifiedRuns.push({ run_id: runId, protocol_id: match.protocol_id, dataset_version: match.dataset.version, week });
  weeklyVerified[week] = (weeklyVerified[week] ?? 0) + 1;
}

const report = {
  schema_version: 1,
  name: 'Brali outcome observation report',
  collection_status: policy.collection_status,
  instrumentation_scope: policy.instrumentation_scope,
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
    : 'Query feedback and Protocol Runner export are live, but no reviewed observation has been accepted yet. Zero remains an observed zero; generated bundles, drafts, downloads, share actions, page views and CI do not count as use.',
  privacy: {
    automatic_collection: false,
    raw_queries_in_report: false,
    user_identifiers_in_report: false,
    source_registry: '/life-os/datasets/outcome-observations.json',
    policy: '/life-os/datasets/outcome-policy.json',
    event_schema: '/contracts/outcome-event.schema.json'
  },
  next_step: 'Collect the first deliberately shared events, review them for schema/privacy/provenance, publish both positive and negative observations, and let outcome evidence influence Gold and retrieval priorities.'
};

await mkdir(path.join(root, 'life-os/datasets'), { recursive: true });
await mkdir(path.join(root, 'quality/outcomes'), { recursive: true });
await writeFile(path.join(root, 'life-os/datasets/outcome-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
await writeFile(path.join(root, 'life-os/datasets/outcome-observations.json'), `${JSON.stringify(registry, null, 2)}\n`);
await writeFile(path.join(root, 'life-os/datasets/outcome-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const eventRows = eventTypes.map(type => `<tr><th scope="row">${escapeHtml(type.replace(/_/g, ' '))}</th><td>${countsByEventType[type]}</td></tr>`).join('');
const pageSchema = { '@context': 'https://schema.org', '@type': 'Dataset', name: report.name, description: report.interpretation, url: `${base}/quality/outcomes/`, isPartOf: { '@type': 'WebSite', name: 'Brali', url: `${base}/` }, distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${base}/life-os/datasets/outcome-report.json` } };
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Observed outcomes — Brali</title><meta name="description" content="What Brali has actually observed, what is still zero, and how privacy-light outcome reporting works."><link rel="canonical" href="${base}/quality/outcomes/"><meta property="og:type" content="website"><meta property="og:title" content="Observed outcomes — Brali"><meta property="og:description" content="Real observations, explicit zero states, and the privacy boundary around Brali outcome reporting."><meta property="og:url" content="${base}/quality/outcomes/"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(pageSchema).replace(/</g, '\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/life-os/">Explore</a><a href="/life-os/methodology/">Evidence</a><a href="/for-ai/query/">Ask Brali</a><a href="/run/">Run</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Observed outcomes</p><h1>The loop is runnable. Verified usefulness is still ${report.north_star.observed_total}.</h1><p class="lead">Ask Brali can route a question to trusted protocols. The Protocol Runner can guide one action from Start to Done and ask whether it helped. Both create privacy-light event data only after explicit user action. The public count stays at zero until deliberately shared events are reviewed and accepted.</p><div class="grid three" data-outcome-summary><article class="card" data-reviewed-events="${report.counts.reviewed_events}"><span class="card-label">Reviewed events</span><h2>${report.counts.reviewed_events}</h2><p>Consent-checked events accepted into the public registry.</p></article><article class="card" data-verified-executions="${report.north_star.observed_total}"><span class="card-label">Verified successful executions</span><h2>${report.north_star.observed_total}</h2><p>Completed protocol runs also explicitly marked helpful under the matching rule.</p></article><article class="card" data-validation-target="${report.north_star.initial_validation_target}"><span class="card-label">Initial validation target</span><h2>${report.north_star.initial_validation_target}</h2><p>A hypothesis target, not an observed result and definitely not a progress bar.</p></article></div><section class="prose"><h2>What is live</h2><p><strong>Question feedback and protocol execution are both instrumented.</strong> Query can capture Helpful, Not helpful, Bad match, or Missing knowledge. Runner can create linked Start, Done, and Helpful/Not helpful events for one trusted protocol.</p><h2>What counts</h2><p>${escapeHtml(policy.north_star.definition)}</p><p>Opening a page is not execution. Clicking Start is not success. A verified successful execution requires a reviewed completion event plus an explicit helpful event for the same run, protocol, dataset version and week.</p><h2>What does not count</h2><p>Page views, generated feedback drafts, local JSON downloads, native-share actions, copied packets, CI runs, demo events and repository commits do not count. A dashboard can count almost anything. Brali is trying to count something that actually means something.</p><h2>Current zero</h2><p>${escapeHtml(report.interpretation)}</p><h2>Event counts</h2><div class="table-scroll"><table><thead><tr><th>Event type</th><th>Reviewed count</th></tr></thead><tbody>${eventRows}</tbody></table></div><h2>Privacy boundary</h2><ul><li>No automatic outcome telemetry or background transmission.</li><li>Raw queries, personal data and user identifiers are forbidden inside the event envelope.</li><li>Run state lives only in the open browser page unless the user explicitly exports it.</li><li>Only deliberately shared events with reviewed provenance may enter the public registry.</li><li>Negative outcomes are first-class: not-helpful, bad-match, no-answer and missing-knowledge use the same review bar.</li></ul><h2>Machine-readable surfaces</h2><ul><li><a href="/contracts/outcome-event.schema.json">Outcome event JSON Schema</a></li><li><a href="/life-os/datasets/outcome-policy.json">Outcome policy</a></li><li><a href="/life-os/datasets/outcome-observations.json">Reviewed observation registry</a></li><li><a href="/life-os/datasets/outcome-report.json">Aggregate outcome report</a></li></ul></section><div class="grid two"><article class="card"><span class="card-label">1 · Find</span><h3>Ask Brali</h3><p>Start from a practical question and inspect the trusted match and evidence boundary.</p><a class="button" href="/for-ai/query/">Ask a question</a></article><article class="card"><span class="card-label">2 · Do</span><h3>Run a protocol</h3><p>Execute one trusted action, check the signal, and optionally export a privacy-light run bundle.</p><a class="button" href="/run/">Open runner</a></article></div></main><footer class="footer"><div class="wrap footer-row"><small>Brali · observed outcomes</small><div class="footer-links"><a href="/life-os/">Growth Library</a><a href="/life-os/methodology/">Methodology</a><a href="/privacy/">Privacy</a></div></div></footer></body></html>`;
await writeFile(path.join(root, 'quality/outcomes/index.html'), page);

const datasetsPath = path.join(root, 'life-os/datasets/index.html');
let datasets = await readFile(datasetsPath, 'utf8');
if (!datasets.includes('/quality/outcomes/')) {
  const block = '<aside class="callout" data-brali-outcomes><h3>Observed outcomes</h3><p>See the privacy-light feedback contract, reviewed registry, current observed counts, and Protocol Runner boundary.</p><a class="button" href="/quality/outcomes/">Open outcome report</a></aside>';
  datasets = datasets.includes('</main>') ? datasets.replace('</main>', `${block}</main>`) : `${datasets}\n${block}\n`;
  await writeFile(datasetsPath, datasets);
}

const sitemapPath = path.join(root, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
for (const route of ['/quality/outcomes/', '/run/']) {
  const canonical = `${base}${route}`;
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) sitemap = sitemap.replace('</urlset>', `  <url><loc>${canonical}</loc></url>\n</urlset>`);
}
await writeFile(sitemapPath, sitemap);

console.log(`Outcome surfaces built: status=instrumented; query-feedback=live; protocol-execution=live; reviewed-events=${registry.observations.length}; verified-successes=${verifiedRuns.length}; automatic-collection=false.`);
