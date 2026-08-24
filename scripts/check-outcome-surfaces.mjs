import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Outcome surface check failed: ${message}`); };
const schema = await readJson('contracts/outcome-event.schema.json');
const fixtures = await readJson('data/outcome-event-fixtures.json');
const policy = await readJson('life-os/datasets/outcome-policy.json');
const observations = await readJson('life-os/datasets/outcome-observations.json');
const report = await readJson('life-os/datasets/outcome-report.json');
const manifest = await readJson('life-os/datasets/manifest.json');
const apiManifest = await readJson('api/v1/manifest.json');
const queryConfig = await readJson('for-ai/query/config.json');
const queryPage = await readFile(path.join(root, 'for-ai/query/index.html'), 'utf8');
const queryApp = await readFile(path.join(root, 'for-ai/query/app.js'), 'utf8');
const outcomeClient = await readFile(path.join(root, 'for-ai/query/outcome-feedback.js'), 'utf8');
const qualityPage = await readFile(path.join(root, 'quality/outcomes/index.html'), 'utf8');
const datasets = await readFile(path.join(root, 'life-os/datasets/index.html'), 'utf8');
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');

const eventTypes = schema.properties?.event_type?.enum ?? [];
const clientCategories = schema.properties?.client?.properties?.category?.enum ?? [];
const channels = schema.properties?.consent?.properties?.channel?.enum ?? [];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
    if (!/^brali:protocol:[a-z0-9][a-z0-9-]*$/.test(event?.protocol_id ?? '')) errors.push('protocol_id');
  }
  if (feedbackEvents.has(event?.event_type) && !event?.feedback?.reason) errors.push('feedback');
  if ('query' in (event ?? {}) || 'raw_query' in (event ?? {}) || 'user_id' in (event ?? {})) errors.push('forbidden field');
  return errors;
}

if (schema.$id !== 'https://brali-lifeos.github.io/contracts/outcome-event.schema.json') fail('schema identity drift');
if (schema.additionalProperties !== false) fail('event schema must reject undeclared top-level fields');
if (!eventTypes.includes('protocol_completed') || !eventTypes.includes('helpful_yes') || !eventTypes.includes('no_trusted_answer')) fail('core event types are missing');
if (!channels.includes('github-issue') || !channels.includes('native-share') || !channels.includes('copy') || !channels.includes('download')) fail('required opt-in channels are missing');
if (schema.properties?.privacy?.properties?.raw_query_included?.const !== false) fail('schema does not forbid raw queries');
if (schema.properties?.privacy?.properties?.user_identifier_included?.const !== false) fail('schema does not forbid user identifiers');

if (fixtures.schema_version !== 1 || !(fixtures.valid?.length >= 2) || !(fixtures.invalid?.length >= 3)) fail('fixture coverage is incomplete');
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

if (policy.schema_version !== 1 || policy.collection_status !== 'instrumented') fail('policy status drift');
if (policy.automatic_collection?.enabled !== false || policy.automatic_collection?.network_requests_from_query_feedback !== false) fail('automatic collection boundary drift');
if (policy.privacy_contract?.raw_query_in_event !== false || policy.privacy_contract?.user_identifier_in_event !== false) fail('policy privacy boundary drift');
if (observations.schema_version !== 1 || observations.collection_status !== policy.collection_status || !Array.isArray(observations.observations)) fail('observation registry drift');
if (report.schema_version !== 1 || report.collection_status !== policy.collection_status) fail('report identity drift');
if (report.counts?.reviewed_events !== observations.observations.length) fail('reviewed event count drift');
if (report.north_star?.id !== 'weekly_verified_successful_executions') fail('north star identity drift');
if (report.north_star?.observed_total !== report.counts?.verified_successful_executions) fail('north star aggregate drift');
if (!observations.observations.length && report.observation_status !== 'no-reviewed-observations') fail('empty registry must render explicit zero state');
if (!observations.observations.length && report.north_star.observed_total !== 0) fail('empty registry cannot report successful executions');

for (const rel of [
  'quality/outcomes/index.html',
  'life-os/datasets/outcome-policy.json',
  'life-os/datasets/outcome-observations.json',
  'life-os/datasets/outcome-report.json',
  'for-ai/query/outcome-feedback.js',
]) await access(path.join(root, rel));

for (const marker of [
  'Instrumentation exists. Verified outcomes remain an observed zero.',
  `data-reviewed-events="${report.counts.reviewed_events}"`,
  `data-verified-executions="${report.north_star.observed_total}"`,
  `data-validation-target="${report.north_star.initial_validation_target}"`,
  '/contracts/outcome-event.schema.json',
  '/life-os/datasets/outcome-report.json',
]) {
  if (!qualityPage.includes(marker)) fail(`quality page lacks ${marker}`);
}
if (!qualityPage.includes('not an observed result')) fail('quality page does not separate target from observation');
if (!qualityPage.includes('does not count')) fail('quality page does not reject instrumentation-as-usage');

for (const marker of [
  'data-outcome-feedback',
  'data-outcome-choice="helpful"',
  'data-outcome-choice="not-helpful"',
  'data-outcome-choice="bad-match"',
  'data-outcome-choice="missing-knowledge"',
  'feedback-include-query',
  '/for-ai/query/outcome-feedback.js',
  '/quality/outcomes/',
]) {
  if (!queryPage.includes(marker)) fail(`Query page lacks ${marker}`);
}
if (!queryPage.includes('Query text is omitted by default')) fail('Query issue feedback does not preserve the default privacy boundary');
if (!queryConfig.dataset_version || !/^[a-f0-9]{64}$/.test(queryConfig.manifest_sha256 ?? '')) fail('Query config lacks dataset identity');
if (!queryConfig.feedback?.event_schema || !queryConfig.feedback?.claim_policy) fail('Query config lacks outcome contract links');
if (!queryApp.includes("window.BraliQueryOutcomeContext")) fail('Query app does not expose privacy-light result context');
if (!queryApp.includes("raw_query_included: false")) fail('Query app does not declare raw-query exclusion');
if (!queryApp.includes("Query text: omitted by default")) fail('Query GitHub draft does not omit query text by default');
if (!outcomeClient.includes("raw_query_included: false") || !outcomeClient.includes("user_identifier_included: false")) fail('outcome client privacy fields drift');
if (!outcomeClient.includes("No event has been sent")) fail('outcome client does not state the transmission boundary');
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie/.test(outcomeClient)) fail('outcome client performs automatic collection or persistent storage');
for (const channel of ['github-issue', 'native-share', "buildEvent('copy'", "buildEvent('download'"]) {
  if (!outcomeClient.includes(channel)) fail(`outcome client lacks channel ${channel}`);
}

for (const href of [
  '/quality/outcomes/',
  '/life-os/datasets/outcome-policy.json',
  '/life-os/datasets/outcome-observations.json',
  '/life-os/datasets/outcome-report.json',
]) {
  if (!datasets.includes(href)) fail(`dataset catalog lacks ${href}`);
}
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/quality/outcomes/</loc>')) fail('sitemap lacks outcome report');

const manifestPaths = new Set((manifest.files ?? []).map(entry => entry.path));
for (const rel of [
  'contracts/outcome-event.schema.json',
  'life-os/datasets/outcome-policy.json',
  'life-os/datasets/outcome-observations.json',
  'life-os/datasets/outcome-report.json',
]) {
  if (!manifestPaths.has(rel)) fail(`manifest lacks ${rel}`);
}
if (manifest.counts?.outcome_observations !== observations.observations.length) fail('manifest observation count drift');
if (manifest.counts?.verified_successful_executions !== report.north_star.observed_total) fail('manifest verified-success count drift');
if (manifest.outcome_collection_status !== policy.collection_status) fail('manifest collection status drift');
if (JSON.stringify(manifest) !== JSON.stringify(apiManifest)) fail('static and API manifests differ after outcome finalization');

console.log(`Outcome surfaces verified: status=${policy.collection_status}; reviewed-events=${observations.observations.length}; verified-successes=${report.north_star.observed_total}; automatic-collection=false; fixtures=${fixtures.valid.length + fixtures.invalid.length}.`);
