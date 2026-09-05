import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Outcome surface check failed: ${message}`); };

const schema = await readJson('contracts/outcome-event.schema.json');
const fixtures = await readJson('data/outcome-event-fixtures.json');
const sourcePolicy = await readJson('data/outcome-policy.json');
const sourceObservations = await readJson('data/outcome-observations.json');
const policy = await readJson('life-os/datasets/outcome-policy.json');
const observations = await readJson('life-os/datasets/outcome-observations.json');
const report = await readJson('life-os/datasets/outcome-report.json');
const qualityPage = await readFile(path.join(root, 'quality/outcomes/index.html'), 'utf8');
const datasets = await readFile(path.join(root, 'life-os/datasets/index.html'), 'utf8');
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const builder = await readFile(path.join(root, 'scripts/build-outcome-surfaces.mjs'), 'utf8');

const eventTypes = schema.properties?.event_type?.enum ?? [];
const clientCategories = schema.properties?.client?.properties?.category?.enum ?? [];
const channels = schema.properties?.consent?.properties?.channel?.enum ?? [];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const protocolPattern = /^brali:protocol:[a-z0-9][a-z0-9-]*$/;
const queryEvents = new Set(['query_submitted', 'trusted_match_returned', 'no_trusted_answer', 'helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'context_packet_copied']);
const protocolEvents = new Set(['protocol_opened', 'protocol_started', 'protocol_completed', 'source_opened']);
const feedbackEvents = new Set(['helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'integration_reported']);

function validate(event) {
  const errors = [];
  if (event?.schema_version !== 1) errors.push('schema_version');
  if (!uuidPattern.test(event?.event_id ?? '')) errors.push('event_id');
  if (!eventTypes.includes(event?.event_type)) errors.push('event_type');
  if (!Number.isFinite(Date.parse(event?.occurred_at))) errors.push('occurred_at');
  if (!clientCategories.includes(event?.client?.category)) errors.push('client');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(event?.dataset?.version ?? '')) errors.push('dataset');
  if (event?.dataset?.manifest_sha256 != null && !/^[a-f0-9]{64}$/.test(event.dataset.manifest_sha256)) errors.push('manifest_sha256');
  if (event?.consent?.explicit !== true || !channels.includes(event?.consent?.channel)) errors.push('consent');
  if (event?.privacy?.raw_query_included !== false) errors.push('raw query');
  if (event?.privacy?.personal_data_included !== false) errors.push('personal data');
  if (event?.privacy?.user_identifier_included !== false) errors.push('user identifier');
  if (queryEvents.has(event?.event_type)) {
    if (!uuidPattern.test(event?.query_id ?? '')) errors.push('query_id');
    if (!['trusted_match', 'no_trusted_answer', 'not_applicable'].includes(event?.result?.state)) errors.push('result');
  }
  if (protocolEvents.has(event?.event_type)) {
    if (!uuidPattern.test(event?.run_id ?? '')) errors.push('run_id');
    if (!protocolPattern.test(event?.protocol_id ?? '')) errors.push('protocol_id');
  }
  if (event?.run_id != null && !uuidPattern.test(event.run_id)) errors.push('run_id');
  if (event?.protocol_id != null && !protocolPattern.test(event.protocol_id)) errors.push('protocol_id');
  if (feedbackEvents.has(event?.event_type) && !event?.feedback?.reason) errors.push('feedback');
  if ('query' in (event ?? {}) || 'raw_query' in (event ?? {}) || 'user_id' in (event ?? {})) errors.push('forbidden field');
  return errors;
}

if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') fail('schema draft drift');
if (schema.$id !== 'https://brali-lifeos.github.io/contracts/outcome-event.schema.json') fail('schema identity drift');
if (schema.additionalProperties !== false) fail('event schema must reject undeclared top-level fields');
for (const type of ['protocol_completed', 'helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'no_trusted_answer']) {
  if (!eventTypes.includes(type)) fail(`core event type missing: ${type}`);
}
for (const channel of ['github-issue', 'native-share', 'download', 'manual-import']) {
  if (!channels.includes(channel)) fail(`required opt-in channel missing: ${channel}`);
}
if (channels.includes('copy')) fail('unreviewed copy channel leaked back into the contract');
if (schema.properties?.privacy?.properties?.raw_query_included?.const !== false) fail('schema does not forbid raw queries');
if (schema.properties?.privacy?.properties?.personal_data_included?.const !== false) fail('schema does not forbid personal data');
if (schema.properties?.privacy?.properties?.user_identifier_included?.const !== false) fail('schema does not forbid user identifiers');

if (fixtures.schema_version !== 1 || !(fixtures.valid?.length >= 3) || !(fixtures.invalid?.length >= 4)) fail('fixture coverage is incomplete');
for (const fixture of fixtures.valid) {
  const errors = validate(fixture.event);
  if (errors.length) fail(`valid fixture ${fixture.id} failed: ${errors.join(', ')}`);
}
for (const fixture of fixtures.invalid) {
  const errors = validate(fixture.event);
  if (!errors.some(error => error.includes(fixture.expected_error))) {
    fail(`invalid fixture ${fixture.id} did not fail for ${fixture.expected_error}: ${errors.join(', ')}`);
  }
}

if (sourcePolicy.schema_version !== 1 || sourcePolicy.collection_status !== 'contract-ready') fail('source policy status drift');
if (sourcePolicy.automatic_collection?.enabled !== false || sourcePolicy.automatic_collection?.network_requests_from_feedback !== false) fail('source policy automatic-collection boundary drift');
if (sourcePolicy.privacy_contract?.raw_query_in_event !== false || sourcePolicy.privacy_contract?.personal_data_in_event !== false || sourcePolicy.privacy_contract?.user_identifier_in_event !== false) fail('source policy privacy boundary drift');
if (sourceObservations.schema_version !== 1 || sourceObservations.collection_status !== 'contract-ready' || !Array.isArray(sourceObservations.observations)) fail('source observation registry drift');
if (JSON.stringify(sourcePolicy) !== JSON.stringify(policy)) fail('published outcome policy differs from source policy');
if (JSON.stringify(sourceObservations) !== JSON.stringify(observations)) fail('published observation registry differs from source registry');
if (report.schema_version !== 1 || report.collection_status !== 'contract-ready') fail('report status drift');
if (report.counts?.reviewed_events !== observations.observations.length) fail('reviewed-event aggregate drift');
if (report.north_star?.id !== 'weekly_verified_successful_executions') fail('north-star identity drift');
if (report.north_star?.observed_total !== report.counts?.verified_successful_executions) fail('north-star aggregate drift');
if (!observations.observations.length && report.observation_status !== 'no-reviewed-observations') fail('empty registry must render explicit zero state');
if (!observations.observations.length && report.north_star.observed_total !== 0) fail('empty registry cannot report successful executions');

for (const rel of [
  'quality/outcomes/index.html',
  'life-os/datasets/outcome-policy.json',
  'life-os/datasets/outcome-observations.json',
  'life-os/datasets/outcome-report.json'
]) await access(path.join(root, rel));

for (const marker of [
  'The contract is ready. The evidence of usefulness is still',
  `data-reviewed-events="${report.counts.reviewed_events}"`,
  `data-verified-executions="${report.north_star.observed_total}"`,
  `data-validation-target="${report.north_star.initial_validation_target}"`,
  'not an observed result',
  'do not count as successful executions',
  'Query/Protocol feedback is not live yet',
  '/contracts/outcome-event.schema.json',
  '/life-os/datasets/outcome-report.json'
]) {
  if (!qualityPage.includes(marker)) fail(`quality page lacks required marker: ${marker}`);
}

if (!datasets.includes('/quality/outcomes/')) fail('dataset catalog lacks outcome report entry point');
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/quality/outcomes/</loc>')) fail('sitemap lacks outcome report');
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie/.test(builder)) fail('outcome builder contains collection or persistent-storage primitives');
if (!builder.includes("policy.collection_status !== 'contract-ready'")) fail('builder does not protect contract-ready status');
if (!builder.includes("answer.protocol_id === completed.protocol_id")) fail('builder does not match helpful feedback to the completed protocol');
if (!builder.includes("answer.dataset.version === completed.dataset.version")) fail('builder does not match helpful feedback to the completed dataset version');

console.log(`Outcome surfaces verified: status=contract-ready; reviewed-events=${observations.observations.length}; verified-successes=${report.north_star.observed_total}; automatic-collection=false; fixtures=${fixtures.valid.length + fixtures.invalid.length}.`);
