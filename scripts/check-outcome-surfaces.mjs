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
const protocols = await readJson('life-os/datasets/protocols.json');
const qualityPage = await readFile(path.join(root, 'quality/outcomes/index.html'), 'utf8');
const datasetsPage = await readFile(path.join(root, 'life-os/datasets/index.html'), 'utf8');
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const builder = await readFile(path.join(root, 'scripts/build-outcome-surfaces.mjs'), 'utf8');
const queryPage = await readFile(path.join(root, 'for-ai/query/index.html'), 'utf8');
const queryApp = await readFile(path.join(root, 'for-ai/query/app.js'), 'utf8');
const queryOutcome = await readFile(path.join(root, 'for-ai/query/outcome-feedback.js'), 'utf8');
const runnerPage = await readFile(path.join(root, 'run/index.html'), 'utf8');
const runnerApp = await readFile(path.join(root, 'run/app.js'), 'utf8');
const runnerOutcome = await readFile(path.join(root, 'run/outcome-run.js'), 'utf8');

const eventTypes = schema.properties?.event_type?.enum ?? [];
const clientCategories = schema.properties?.client?.properties?.category?.enum ?? [];
const channels = schema.properties?.consent?.properties?.channel?.enum ?? [];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const protocolPattern = /^brali:protocol:[a-z0-9][a-z0-9-]*$/;
const resultStates = new Set(['trusted_match', 'no_trusted_answer', 'not_applicable']);
const queryEvents = new Set(['query_submitted', 'trusted_match_returned', 'no_trusted_answer', 'bad_match', 'missing_knowledge', 'context_packet_copied']);
const protocolEvents = new Set(['protocol_opened', 'protocol_started', 'protocol_completed', 'source_opened']);
const helpfulEvents = new Set(['helpful_yes', 'helpful_no']);
const feedbackEvents = new Set(['helpful_yes', 'helpful_no', 'bad_match', 'missing_knowledge', 'integration_reported']);

function hasQueryContext(event) {
  return uuidPattern.test(event?.query_id ?? '') && resultStates.has(event?.result?.state);
}
function hasRunContext(event) {
  return uuidPattern.test(event?.run_id ?? '') && protocolPattern.test(event?.protocol_id ?? '');
}
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
  if (queryEvents.has(event?.event_type) && !hasQueryContext(event)) errors.push('query_id');
  if (protocolEvents.has(event?.event_type) && !hasRunContext(event)) errors.push('run_id');
  if (helpfulEvents.has(event?.event_type) && !hasQueryContext(event) && !hasRunContext(event)) errors.push('feedback context');
  if (event?.run_id != null && !uuidPattern.test(event.run_id)) errors.push('run_id');
  if (event?.protocol_id != null && !protocolPattern.test(event.protocol_id)) errors.push('protocol_id');
  if (feedbackEvents.has(event?.event_type) && !event?.feedback?.reason) errors.push('feedback');
  if ('query' in (event ?? {}) || 'raw_query' in (event ?? {}) || 'user_id' in (event ?? {})) errors.push('forbidden field');
  return errors;
}

if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') fail('schema draft drift');
if (schema.$id !== 'https://brali-lifeos.github.io/contracts/outcome-event.schema.json') fail('schema identity drift');
if (schema.additionalProperties !== false) fail('event schema must reject undeclared top-level fields');
for (const type of ['protocol_started','protocol_completed','helpful_yes','helpful_no','bad_match','missing_knowledge','no_trusted_answer']) {
  if (!eventTypes.includes(type)) fail(`core event type missing: ${type}`);
}
for (const category of ['browser-query', 'browser-runner']) if (!clientCategories.includes(category)) fail(`browser client category missing: ${category}`);
for (const channel of ['github-issue','native-share','download','manual-import']) if (!channels.includes(channel)) fail(`opt-in channel missing: ${channel}`);
if (channels.includes('copy')) fail('unreviewed copy channel leaked back into contract');
if (schema.properties?.privacy?.properties?.raw_query_included?.const !== false) fail('schema does not forbid raw queries');
if (schema.properties?.privacy?.properties?.personal_data_included?.const !== false) fail('schema does not forbid personal data');
if (schema.properties?.privacy?.properties?.user_identifier_included?.const !== false) fail('schema does not forbid user identifiers');

if (fixtures.schema_version !== 1 || !(fixtures.valid?.length >= 3) || !(fixtures.invalid?.length >= 5)) fail('fixture coverage incomplete');
for (const fixture of fixtures.valid) {
  const errors = validate(fixture.event);
  if (errors.length) fail(`valid fixture ${fixture.id} failed: ${errors.join(', ')}`);
}
for (const fixture of fixtures.invalid) {
  const errors = validate(fixture.event);
  if (!errors.some(error => error.includes(fixture.expected_error))) fail(`invalid fixture ${fixture.id} did not fail for ${fixture.expected_error}: ${errors.join(', ')}`);
}
const runHelpfulFixture = fixtures.valid.find(item => item.id === 'helpful-run-feedback-without-query')?.event;
if (!runHelpfulFixture || runHelpfulFixture.query_id || runHelpfulFixture.result || !hasRunContext(runHelpfulFixture)) fail('standalone protocol helpfulness fixture is not testing the run-only path');

if (sourcePolicy.collection_status !== 'instrumented' || sourcePolicy.instrumentation_scope?.query_feedback !== 'live' || sourcePolicy.instrumentation_scope?.protocol_execution !== 'live') fail('source instrumentation status drift');
if (sourcePolicy.automatic_collection?.enabled !== false || sourcePolicy.automatic_collection?.network_requests_from_feedback !== false) fail('automatic collection boundary drift');
if (sourcePolicy.privacy_contract?.raw_query_in_event !== false || sourcePolicy.privacy_contract?.personal_data_in_event !== false || sourcePolicy.privacy_contract?.user_identifier_in_event !== false) fail('privacy policy drift');
if (sourceObservations.collection_status !== 'instrumented' || !Array.isArray(sourceObservations.observations)) fail('source observation registry drift');
if (JSON.stringify(sourcePolicy) !== JSON.stringify(policy)) fail('published policy differs from source');
if (JSON.stringify(sourceObservations) !== JSON.stringify(observations)) fail('published registry differs from source');
if (report.collection_status !== 'instrumented' || report.instrumentation_scope?.query_feedback !== 'live' || report.instrumentation_scope?.protocol_execution !== 'live') fail('published report instrumentation drift');
if (report.counts?.reviewed_events !== observations.observations.length) fail('reviewed-event aggregate drift');
if (report.north_star?.id !== 'weekly_verified_successful_executions') fail('north-star identity drift');
if (report.north_star?.observed_total !== report.counts?.verified_successful_executions) fail('north-star aggregate drift');
if (!observations.observations.length && (report.observation_status !== 'no-reviewed-observations' || report.north_star.observed_total !== 0)) fail('empty registry must publish an honest zero');

for (const rel of ['quality/outcomes/index.html','life-os/datasets/outcome-policy.json','life-os/datasets/outcome-observations.json','life-os/datasets/outcome-report.json','for-ai/query/outcome-feedback.js','run/index.html','run/app.js','run/outcome-run.js']) await access(path.join(root, rel));

for (const marker of ['The loop is runnable. Verified usefulness is still',`data-reviewed-events="${report.counts.reviewed_events}"`,`data-verified-executions="${report.north_star.observed_total}"`,'Question feedback and protocol execution are both instrumented','Opening a page is not execution','A dashboard can count almost anything','/for-ai/query/','/run/']) {
  if (!qualityPage.includes(marker)) fail(`outcome page lacks marker: ${marker}`);
}
for (const marker of ['data-outcome-feedback','data-outcome-choice="helpful"','data-outcome-choice="not-helpful"','data-outcome-choice="bad-match"','data-outcome-choice="missing-knowledge"','feedback-include-query','off by default','Nothing is sent automatically','/quality/outcomes/']) {
  if (!queryPage.includes(marker)) fail(`Query page lacks outcome marker: ${marker}`);
}
if (!queryApp.includes("from './outcome-feedback.js'")) fail('Query app does not load outcome module');
if (!queryApp.includes('/run/?protocol=') || !queryApp.includes('Run protocol')) fail('Query recommendations do not link to Protocol Runner');
if (!queryApp.includes('newQueryId()')) fail('Query app does not create privacy-safe query IDs');
for (const marker of ['raw_query_included: false','personal_data_included: false','user_identifier_included: false',"'github-issue'","'native-share'","'download'",'includeQuery = false']) if (!queryOutcome.includes(marker)) fail(`Query outcome module lacks marker: ${marker}`);
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/.test(queryOutcome)) fail('Query outcome module performs automatic collection or persistent storage');

for (const marker of ['Protocol Runner','No streaks','id="run-start"','id="run-complete"','id="run-helpful"','id="run-not-helpful"','Nothing has been sent','/quality/outcomes/']) if (!runnerPage.includes(marker)) fail(`Runner page lacks marker: ${marker}`);
if (!runnerApp.includes("fetch('/life-os/datasets/protocols.json'") || !runnerApp.includes("fetch('/life-os/datasets/manifest.json'")) fail('Runner does not load canonical trusted feed and manifest');
if (!runnerApp.includes("['reviewed', 'practical'].includes(protocol.evidence?.status)")) fail('Runner does not enforce trusted evidence states');
if (!runnerApp.includes('newRunId()') || !runnerApp.includes("buildRunBundle({")) fail('Runner does not create linked run events');
if (!runnerApp.includes("setHelpful(true)") || !runnerApp.includes("setHelpful(false)")) fail('Runner helpfulness controls not wired');
if (!runnerOutcome.includes("category: 'browser-runner'")) fail('Runner outcome client category missing');
if (!runnerOutcome.includes("eventType: 'protocol_started'") || !runnerOutcome.includes("eventType: 'protocol_completed'")) fail('Runner bundle misses start/completion events');
if (!runnerOutcome.includes("positive ? 'helpful_yes' : 'helpful_no'")) fail('Runner bundle misses explicit helpfulness event');
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/.test(runnerOutcome)) fail('Runner outcome module performs automatic collection or persistent storage');
if (/localStorage|sessionStorage|document\.cookie/.test(runnerApp)) fail('Runner persists run state outside page memory');

if (!protocols.entries?.length || !protocols.entries.every(entry => ['reviewed','practical'].includes(entry.evidence?.status))) fail('Runner source feed contains untrusted protocols');
if (!datasetsPage.includes('/quality/outcomes/')) fail('dataset catalog lacks outcome report');
for (const route of ['/quality/outcomes/','/run/']) if (!sitemap.includes(`<loc>https://brali-lifeos.github.io${route}</loc>`)) fail(`sitemap lacks ${route}`);
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie/.test(builder)) fail('outcome builder contains collection or persistent-storage primitives');
if (!builder.includes("policy.instrumentation_scope?.protocol_execution !== 'live'")) fail('builder does not protect live Protocol Runner status');
if (!builder.includes('answer.protocol_id === completed.protocol_id') || !builder.includes('answer.dataset.version === completed.dataset.version')) fail('builder does not match successful run context strictly');

console.log(`Outcome loop verified: Query feedback live; Protocol Runner live; trusted-feed-only; reviewed-events=${observations.observations.length}; verified-successes=${report.north_star.observed_total}; automatic-collection=false; fixtures=${fixtures.valid.length + fixtures.invalid.length}.`);
