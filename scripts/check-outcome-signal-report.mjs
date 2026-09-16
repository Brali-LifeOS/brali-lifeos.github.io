import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Outcome signal report check failed: ${message}`); };

const definitions = await readJson('data/outcome-signal-definitions.json');
const registry = await readJson('data/outcome-observations.json');
const eventSchema = await readJson('contracts/outcome-event.schema.json');
const report = await readJson('life-os/datasets/outcome-signal-report.json');
const builder = await readFile(path.join(root, 'scripts/build-outcome-signal-report.mjs'), 'utf8');

const requiredSignals = [
  'page_discovered',
  'page_opened',
  'method_understood',
  'method_attempted',
  'method_completed',
  'user_reported_usefulness',
  'return_usage',
  'external_agent_tool_usage',
  'downstream_outcome'
];
const definitionsById = new Map(definitions.signals?.map(signal => [signal.id, signal]) ?? []);
const reportById = new Map(report.signals?.map(signal => [signal.id, signal]) ?? []);
const knownEventTypes = new Set(eventSchema.properties?.event_type?.enum ?? []);

if (definitions.schema_version !== 1 || definitions.population_totals_available !== false) fail('definitions identity or population-total boundary drift');
if (report.schema_version !== 1 || report.population_totals_available !== false) fail('report identity or population-total boundary drift');
if (report.unknown_representation !== null) fail('unknown must be represented as null');
if (report.reviewed_observation_events !== registry.observations.length) fail('reviewed observation count drift');
if (!Array.isArray(report.signals) || report.signals.length !== requiredSignals.length) fail('signal report surface changed unexpectedly');

for (const id of requiredSignals) {
  const definition = definitionsById.get(id);
  const signal = reportById.get(id);
  if (!definition || !signal) fail(`missing required signal ${id}`);
  if (signal.collection_mode !== definition.collection_mode) fail(`${id}: collection mode drift`);
  if (JSON.stringify(signal.event_types) !== JSON.stringify(definition.event_types)) fail(`${id}: event type drift`);
  for (const type of definition.event_types) if (!knownEventTypes.has(type)) fail(`${id}: unknown event type ${type}`);
  if (!signal.claim_boundary || signal.claim_boundary !== definition.claim_boundary) fail(`${id}: claim boundary drift`);
}

for (const id of ['page_discovered', 'method_understood', 'return_usage', 'downstream_outcome']) {
  const signal = reportById.get(id);
  if (signal.observation_state !== 'unknown') fail(`${id}: uncollected/provider-only signal must remain unknown`);
  if (signal.observed_value !== null) fail(`${id}: unknown signal was silently converted to a numeric value`);
}

const pageOpen = reportById.get('page_opened');
if (pageOpen.collection_mode !== 'reviewed-event-count' || !pageOpen.event_types.includes('protocol_opened')) fail('page_opened must stay an explicit reviewed-event signal');
if (/visitor|session|traffic total/i.test(pageOpen.interpretation ?? '')) fail('page_opened interpretation overclaims population coverage');

const attempted = reportById.get('method_attempted');
const completed = reportById.get('method_completed');
const external = reportById.get('external_agent_tool_usage');
if (!attempted.event_types.includes('protocol_started')) fail('method_attempted must use protocol_started');
if (!completed.event_types.includes('protocol_completed')) fail('method_completed must use protocol_completed');
if (!external.event_types.includes('integration_reported')) fail('external agent/tool usage must remain explicit-report only');

const usefulness = reportById.get('user_reported_usefulness');
if (usefulness.collection_mode !== 'reviewed-event-breakdown') fail('usefulness must remain a reviewed explicit feedback breakdown');
if (!usefulness.event_types.includes('helpful_yes') || !usefulness.event_types.includes('helpful_no')) fail('usefulness event mapping drift');
if ((usefulness.observed_value?.total ?? -1) === 0 && usefulness.observed_value?.helpfulness_rate !== null) {
  fail('empty helpfulness denominator must remain unknown/null, never 0%');
}

if (registry.observations.length === 0) {
  for (const id of ['page_opened', 'method_attempted', 'method_completed', 'external_agent_tool_usage']) {
    if (reportById.get(id).observed_value !== 0) fail(`${id}: empty reviewed registry must yield zero accepted explicit events`);
  }
  if (usefulness.observed_value?.total !== 0 || usefulness.observed_value?.helpfulness_rate !== null) fail('empty registry helpfulness semantics are dishonest');
}

for (const observation of registry.observations) {
  const type = observation?.event?.event_type;
  if (!knownEventTypes.has(type)) fail(`registry contains unknown event type ${type}`);
}

for (const phrase of ['Unknown is represented as null', 'not population totals', 'must never be inferred']) {
  if (!JSON.stringify(definitions).includes(phrase)) fail(`definitions lack anti-false-green rule: ${phrase}`);
}
if (!builder.includes("observed_value: null") || !builder.includes("helpfulness_rate: denominator > 0 ? positive / denominator : null")) {
  fail('builder no longer protects unknown/null semantics');
}
if (/localStorage|sessionStorage|document\.cookie|sendBeacon/.test(builder)) fail('signal report builder must not collect or persist user behavior');

await access(path.join(root, 'life-os/datasets/outcome-signal-report.json'));
console.log(`Outcome signal semantics verified: signals=${requiredSignals.length}; reviewed-events=${registry.observations.length}; unknown stays null; explicit zeros stay scoped to accepted events.`);
