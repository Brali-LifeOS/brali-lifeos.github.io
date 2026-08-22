import crypto from 'node:crypto';
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

const policy = await readJson('data/outcome-policy.json');
const registry = await readJson('data/outcome-observations.json');
const manifest = await readJson('life-os/datasets/manifest.json');

const eventTypes = [
  'query_submitted',
  'trusted_match_returned',
  'no_trusted_answer',
  'protocol_opened',
  'protocol_started',
  'protocol_completed',
  'helpful_yes',
  'helpful_no',
  'bad_match',
  'missing_knowledge',
  'source_opened',
  'context_packet_copied',
  'integration_reported',
];
const clientCategories = [
  'browser-query',
  'static-api',
  'local-mcp',
  'hosted-mcp',
  'external-agent',
  'manual',
  'other',
];
const shareChannels = ['github-issue', 'native-share', 'copy', 'download', 'manual-import'];
const queryEvents = new Set([
  'query_submitted',
  'trusted_match_returned',
  'no_trusted_answer',
  'helpful_yes',
  'helpful_no',
  'bad_match',
  'missing_knowledge',
  'context_packet_copied',
]);
const protocolEvents = new Set(['protocol_opened', 'protocol_started', 'protocol_completed', 'source_opened']);
const feedbackEvents = new Set(['helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'integration_reported']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
  if (event.consent?.explicit !== true || !shareChannels.includes(event.consent?.channel)) fail(`${prefix}: explicit consent and channel are required`);
  if (event.privacy?.raw_query_included !== false) fail(`${prefix}: raw query is forbidden`);
  if (event.privacy?.personal_data_included !== false) fail(`${prefix}: personal data is forbidden`);
  if (event.privacy?.user_identifier_included !== false) fail(`${prefix}: user identifiers are forbidden`);
  if (queryEvents.has(event.event_type)) {
    if (!uuidPattern.test(event.query_id ?? '')) fail(`${prefix}: query event requires query_id`);
    if (!['trusted_match', 'no_trusted_answer', 'not_applicable'].includes(event.result?.state)) fail(`${prefix}: query event requires result state`);
  }
  if (protocolEvents.has(event.event_type)) {
    if (!uuidPattern.test(event.run_id ?? '')) fail(`${prefix}: protocol event requires run_id`);
    if (!/^brali:protocol:[a-z0-9][a-z0-9-]*$/.test(event.protocol_id ?? '')) fail(`${prefix}: protocol event requires canonical protocol_id`);
  }
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

if (policy.schema_version !== 1 || policy.name !== 'Brali outcome observation policy') fail('outcome policy identity drift');
if (policy.collection_status !== registry.collection_status) fail('policy and registry collection status differ');
if (policy.automatic_collection?.enabled !== false) fail('automatic collection must remain disabled');
if (policy.automatic_collection?.network_requests_from_query_feedback !== false) fail('Query feedback must not transmit automatically');
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
  const protocolIds = new Set([
    event.protocol_id,
    ...(event.result?.protocol_ids ?? []),
  ].filter(Boolean));
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
  const helpful = events.filter(event => event.event_type === 'helpful_yes');
  const matching = completions.find(completed => helpful.some(answer => isoWeekKey(answer.occurred_at) === isoWeekKey(completed.occurred_at)));
  if (!matching) continue;
  const week = isoWeekKey(matching.occurred_at);
  verifiedRuns.push(runId);
  weeklyVerified[week] = (weeklyVerified[week] ?? 0) + 1;
}

const report = {
  schema_version: 1,
  name: 'Brali outcome observation report',
  collection_status: policy.collection_status,
  observation_status: registry.observations.length ? 'reviewed-observations-present' : 'no-reviewed-observations',
  north_star: {
    id: policy.north_star.id,
    definition: policy.north_star.definition,
    observed_total: verifiedRuns.length,
    weekly_observed: Object.fromEntries(Object.entries(weeklyVerified).sort(([left], [right]) => left.localeCompare(right))),
    initial_validation_target: policy.north_star.initial_validation_target,
    target_type: policy.north_star.target_type,
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
    rejected_or_withheld: registry.rejected_or_withheld_counts,
  },
  interpretation: registry.observations.length
    ? 'Counts include only reviewed, explicit opt-in observations in the versioned registry.'
    : 'No reviewed outcome observation has been accepted yet. Zero is shown explicitly; instrumentation, demos and feedback exports are not counted as use.',
  privacy: {
    automatic_collection: false,
    raw_queries_in_report: false,
    user_identifiers_in_report: false,
    source_registry: '/life-os/datasets/outcome-observations.json',
    policy: '/life-os/datasets/outcome-policy.json',
    event_schema: '/contracts/outcome-event.schema.json',
  },
};

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
  license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  isPartOf: { '@type': 'WebSite', name: 'Brali', url: `${base}/` },
  distribution: {
    '@type': 'DataDownload',
    encodingFormat: 'application/json',
    contentUrl: `${base}/life-os/datasets/outcome-report.json`,
  },
};
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outcome observation report — Brali</title><meta name="description" content="Reviewed outcome observations, privacy rules, verified successful executions and explicit zero-state reporting for Brali."><link rel="canonical" href="${base}/quality/outcomes/"><meta property="og:type" content="website"><meta property="og:title" content="Outcome observation report — Brali"><meta property="og:description" content="See what Brali has actually observed, what remains a target, and how privacy-light feedback works."><meta property="og:url" content="${base}/quality/outcomes/"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(pageSchema).replace(/</g, '\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/for-ai/query/">Ask Brali</a><a href="/quality/claims/">Claim quality</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Observed outcomes</p><h1>Instrumentation exists. Verified outcomes remain an observed zero.</h1><p class="lead">Brali now has a versioned event contract and explicit opt-in feedback export. It does not send automatic telemetry, store prompts, set analytics cookies or infer usage from page views and repository activity.</p><div class="grid three" data-outcome-summary><article class="card" data-reviewed-events="${report.counts.reviewed_events}"><span class="card-label">Reviewed events</span><h2>${report.counts.reviewed_events}</h2><p>Explicitly consented events accepted into the public observation registry.</p></article><article class="card" data-verified-executions="${report.north_star.observed_total}"><span class="card-label">Verified successful executions</span><h2>${report.north_star.observed_total}</h2><p>Unique runs with both completion and explicit helpful feedback in the same week.</p></article><article class="card" data-validation-target="${report.north_star.initial_validation_target}"><span class="card-label">Initial validation target</span><h2>${report.north_star.initial_validation_target}</h2><p>A hypothesis target, not an observed result and not a progress percentage.</p></article></div><section class="prose"><h2>Current interpretation</h2><p>${escapeHtml(report.interpretation)}</p><p><strong>Collection status:</strong> ${escapeHtml(report.collection_status)}. <strong>Observation status:</strong> ${escapeHtml(report.observation_status)}.</p><h2>What counts</h2><p>${escapeHtml(policy.north_star.definition)}</p><p>Downloads, copies, prepared issue drafts, tests, demos and CI runs do not count. They prove that the mechanism works, not that a person benefited. A rather important distinction, despite the internet's long campaign against it.</p><h2>Event counts</h2><div class="table-scroll"><table><thead><tr><th>Event type</th><th>Reviewed count</th></tr></thead><tbody>${eventRows}</tbody></table></div><h2>Privacy boundary</h2><ul><li>No automatic network request is made by the Query feedback controls.</li><li>Raw queries and user identifiers are excluded from the event envelope.</li><li>The user reviews a GitHub draft, native share, copied JSON or local download before anything leaves the page.</li><li>Only reviewed events with consent and provenance enter the public observation registry.</li></ul><h2>Machine-readable surfaces</h2><ul><li><a href="/contracts/outcome-event.schema.json">Outcome event JSON Schema</a></li><li><a href="/life-os/datasets/outcome-policy.json">Outcome policy</a></li><li><a href="/life-os/datasets/outcome-observations.json">Reviewed observation registry</a></li><li><a href="/life-os/datasets/outcome-report.json">Aggregate outcome report</a></li></ul></section><div class="callout"><h3>Try the instrumented path.</h3><p>Run a Query, inspect the result, then prepare helpful, not-helpful, bad-match or missing-knowledge feedback. Nothing is transmitted automatically.</p><a class="button yellow" href="/for-ai/query/">Ask Brali</a></div></main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Evidence-aware practical knowledge for people and machines.</small></div><div class="footer-links"><a href="/quality/claims/">Claim quality</a><a href="/life-os/datasets/">Datasets</a><a href="/cite/">Citation</a></div></div></footer></body></html>`;
await writeFile(path.join(root, 'quality/outcomes/index.html'), page);

const queryPath = path.join(root, 'for-ai/query/index.html');
let queryHtml = await readFile(queryPath, 'utf8');
const privacyFeedback = `<section class="prose" data-query-feedback><h2>Help improve Brali retrieval</h2><p>Report a bad match or missing knowledge through a reviewable GitHub draft. Query text is omitted by default; include it only when it contains no personal, customer, credential or private system information.</p><p><label><input id="feedback-include-query" type="checkbox"> Include the current query text in the GitHub draft after I review it</label></p><p><a id="feedback-match" href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new">Report a bad match or missing knowledge</a> · <a id="feedback-integration" href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new">Share an integration or usage report</a></p></section>`;
if (queryHtml.includes('data-query-feedback')) queryHtml = queryHtml.replace(/<section class="prose" data-query-feedback>[\s\S]*?<\/section>/, privacyFeedback);
else queryHtml = queryHtml.replace('</main>', `${privacyFeedback}</main>`);
const outcomePanel = `<section class="prose" data-outcome-feedback data-outcome-disabled="true"><h2>Prepare privacy-light outcome feedback</h2><p>Run a query, then choose what happened. Brali prepares a versioned event without the raw query, personal data or a user identifier. No event is sent automatically.</p><div class="hero-actions" role="group" aria-label="Outcome feedback"><button class="button" type="button" data-outcome-choice="helpful" disabled>Helpful</button><button class="button" type="button" data-outcome-choice="not-helpful" disabled>Not helpful</button><button class="button" type="button" data-outcome-choice="bad-match" disabled>Bad match</button><button class="button" type="button" data-outcome-choice="missing-knowledge" disabled>Missing knowledge</button></div><p id="outcome-status" class="query-status" role="status" aria-live="polite">Run a query before preparing outcome feedback.</p><div data-outcome-actions hidden><p><strong>Review the event before sharing it.</strong></p><pre id="outcome-preview"></pre><div class="hero-actions"><button id="outcome-github" class="button yellow" type="button">Open GitHub draft</button><button id="outcome-share" class="button" type="button">Share or copy</button><button id="outcome-copy" class="button" type="button">Copy JSON</button><button id="outcome-download" class="button" type="button">Download JSON</button></div></div><p><a href="/quality/outcomes/">Read the outcome and privacy policy →</a></p></section>`;
if (queryHtml.includes('data-outcome-feedback')) queryHtml = queryHtml.replace(/<section class="prose" data-outcome-feedback[\s\S]*?<\/section>/, outcomePanel);
else queryHtml = queryHtml.replace(privacyFeedback, `${outcomePanel}${privacyFeedback}`);
if (!queryHtml.includes('/for-ai/query/outcome-feedback.js')) {
  queryHtml = queryHtml.replace('</body>', '<script type="module" src="/for-ai/query/outcome-feedback.js"></script></body>');
}
await writeFile(queryPath, queryHtml);

const datasetsPath = path.join(root, 'life-os/datasets/index.html');
let datasets = await readFile(datasetsPath, 'utf8');
for (const [href, label] of [
  ['/quality/outcomes/', 'Human-readable outcome observation report'],
  ['/life-os/datasets/outcome-policy.json', 'Outcome observation policy (JSON)'],
  ['/life-os/datasets/outcome-observations.json', 'Reviewed outcome observations (JSON)'],
  ['/life-os/datasets/outcome-report.json', 'Aggregate outcome report (JSON)'],
]) {
  if (!datasets.includes(href)) datasets = datasets.replace('</ul>', `<li><a href="${href}">${label}</a></li></ul>`);
}
await writeFile(datasetsPath, datasets);

const sitemapPath = path.join(root, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/quality/outcomes/</loc>')) {
  sitemap = sitemap.replace('</urlset>', '  <url><loc>https://brali-lifeos.github.io/quality/outcomes/</loc></url>\n</urlset>');
}
await writeFile(sitemapPath, sitemap);

const manifestEntry = async rel => {
  const text = await readFile(path.join(root, rel), 'utf8');
  let count = null;
  if (rel.endsWith('.json')) {
    const document = JSON.parse(text);
    for (const key of ['observations', 'entries', 'items', 'batches']) {
      if (Array.isArray(document?.[key])) {
        count = document[key].length;
        break;
      }
    }
  }
  return {
    path: rel,
    sha256: crypto.createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text),
    count,
  };
};
const outcomeFiles = [
  'contracts/outcome-event.schema.json',
  'life-os/datasets/outcome-policy.json',
  'life-os/datasets/outcome-observations.json',
  'life-os/datasets/outcome-report.json',
];
if (manifest.schema_version !== 2 || !Array.isArray(manifest.files)) fail('outcome surfaces require finalized schema-v2 manifest');
const byPath = new Map(manifest.files.map(entry => [entry.path, entry]));
for (const entry of await Promise.all(outcomeFiles.map(manifestEntry))) byPath.set(entry.path, entry);
manifest.files = [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
manifest.counts ||= {};
manifest.counts.files = manifest.files.length;
manifest.counts.outcome_observations = registry.observations.length;
manifest.counts.verified_successful_executions = verifiedRuns.length;
manifest.outcome_event_schema_version = 1;
manifest.outcome_report_schema_version = 1;
manifest.outcome_collection_status = policy.collection_status;
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(root, 'life-os/datasets/manifest.json'), manifestText);
await writeFile(path.join(root, 'api/v1/manifest.json'), manifestText);

console.log(`Outcome surfaces built: status=${policy.collection_status}; reviewed-events=${registry.observations.length}; verified-successes=${verifiedRuns.length}; automatic-collection=false.`);
