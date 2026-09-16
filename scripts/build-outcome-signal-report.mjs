import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Outcome signal report build failed: ${message}`); };

const definitions = await readJson('data/outcome-signal-definitions.json');
const registry = await readJson('data/outcome-observations.json');
const eventSchema = await readJson('contracts/outcome-event.schema.json');
const manifest = await readJson('life-os/datasets/manifest.json');

if (definitions.schema_version !== 1 || !Array.isArray(definitions.signals)) fail('signal definitions are malformed');
if (!Array.isArray(registry.observations)) fail('outcome observation registry is malformed');
const knownEventTypes = new Set(eventSchema.properties?.event_type?.enum ?? []);
const eventCounts = new Map();
for (const observation of registry.observations) {
  const type = observation?.event?.event_type;
  if (!knownEventTypes.has(type)) fail(`reviewed observation has unknown event type: ${type}`);
  eventCounts.set(type, (eventCounts.get(type) ?? 0) + 1);
}

const allowedModes = new Set(['provider-only', 'reviewed-event-count', 'reviewed-event-breakdown', 'not-collected']);
const signalIds = new Set();
const signals = definitions.signals.map(definition => {
  if (!definition?.id || signalIds.has(definition.id)) fail(`duplicate or missing signal id: ${definition?.id}`);
  signalIds.add(definition.id);
  if (!allowedModes.has(definition.collection_mode)) fail(`${definition.id}: unsupported collection mode`);
  if (!Array.isArray(definition.event_types)) fail(`${definition.id}: event_types must be an array`);
  for (const type of definition.event_types) if (!knownEventTypes.has(type)) fail(`${definition.id}: unknown event type ${type}`);

  const base = {
    id: definition.id,
    meaning: definition.meaning,
    collection_mode: definition.collection_mode,
    event_types: definition.event_types,
    claim_boundary: definition.claim_boundary
  };

  if (definition.collection_mode === 'provider-only' || definition.collection_mode === 'not-collected') {
    return {
      ...base,
      observation_state: 'unknown',
      observed_value: null,
      interpretation: definition.collection_mode === 'provider-only'
        ? 'This outcome report has no reviewed first-party observation for this signal. Provider measurements, if available elsewhere, remain separate and are not converted into an outcome count.'
        : 'Brali does not currently collect this signal. Unknown remains null rather than being presented as zero.'
    };
  }

  if (!definition.event_types.length) fail(`${definition.id}: reviewed-event mode requires event types`);
  const counts = Object.fromEntries(definition.event_types.map(type => [type, eventCounts.get(type) ?? 0]));
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  if (definition.collection_mode === 'reviewed-event-breakdown') {
    const positive = counts.helpful_yes ?? 0;
    const negative = counts.helpful_no ?? 0;
    const denominator = positive + negative;
    return {
      ...base,
      observation_state: 'reviewed-opt-in-observations',
      observed_value: {
        total,
        by_event_type: counts,
        helpfulness_rate: denominator > 0 ? positive / denominator : null
      },
      interpretation: denominator > 0
        ? 'Counts and rate use only reviewed explicit opt-in feedback. They are not a population or traffic estimate.'
        : 'There are no reviewed helpfulness observations, so the count is zero but the helpfulness rate remains unknown (null), not 0%.'
    };
  }

  return {
    ...base,
    observation_state: 'reviewed-opt-in-observations',
    observed_value: total,
    by_event_type: counts,
    interpretation: `Observed value counts only reviewed explicit opt-in events (${definition.event_types.join(', ')}). It is not a population total and does not imply later-stage outcomes.`
  };
});

const report = {
  schema_version: 1,
  name: 'Brali outcome signal report',
  dataset_version: manifest.dataset_version,
  generated_from: [
    'data/outcome-signal-definitions.json',
    'data/outcome-observations.json',
    'contracts/outcome-event.schema.json'
  ],
  reviewed_observation_events: registry.observations.length,
  population_totals_available: false,
  unknown_representation: null,
  signals,
  rules: definitions.rules,
  interpretation: 'This report distinguishes measurable reviewed opt-in observations from signals Brali does not collect. Null means unknown/uncollected; numeric zero means zero accepted reviewed events of that explicit type, not zero real-world users, opens, attempts or outcomes.'
};

await mkdir(path.join(root, 'life-os/datasets'), { recursive: true });
await writeFile(path.join(root, 'life-os/datasets/outcome-signal-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Outcome signal report built: reviewed-events=${registry.observations.length}; signals=${signals.length}; unknown=${signals.filter(signal => signal.observed_value === null).length}.`);
