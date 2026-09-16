import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Scenario validation check failed: ${message}`); };

const contract = await readJson('contracts/scenario-validation.schema.json');
const experiment = await readJson('data/scenario-validation.json');
const outcomeSchema = await readJson('contracts/outcome-event.schema.json');
const outcomeRegistry = await readJson('data/outcome-observations.json');

const attemptIdPattern = /^attempt-[a-z0-9][a-z0-9-]*$/;
const evidenceIdPattern = /^evidence-[a-z0-9][a-z0-9-]*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const validTracks = new Set(['human', 'external_agent']);
const validEvidenceStates = new Set(['observed', 'verified', 'inferred']);
const validDecisionValues = new Set(['keep', 'change', 'reject']);
const validSourceKinds = new Set(['github-issue', 'provider-artifact', 'outcome-event', 'manual-review']);

if (contract.$schema !== 'https://json-schema.org/draft/2020-12/schema') fail('scenario contract draft drift');
if (contract.$id !== 'https://brali-lifeos.github.io/contracts/scenario-validation.schema.json') fail('scenario contract identity drift');
if (contract.additionalProperties !== false) fail('scenario contract must reject undeclared top-level fields');
if (experiment.schema_version !== 1) fail('unsupported experiment schema version');
if (experiment.scenario_id !== 'brali:scenario:interrupted-knowledge-work') fail('unexpected active scenario identity');
if (!['planned', 'running', 'paused', 'complete'].includes(experiment.status)) fail('invalid experiment status');
if (!Array.isArray(experiment.attempts) || !Array.isArray(experiment.evidence)) fail('attempts and evidence must be arrays');

if (outcomeSchema.$id !== 'https://brali-lifeos.github.io/contracts/outcome-event.schema.json') fail('outcome event contract identity drift');
const outcomeEventTypes = new Set(outcomeSchema.properties?.event_type?.enum ?? []);
for (const requiredType of ['protocol_started', 'protocol_completed', 'helpful_yes', 'helpful_no', 'integration_reported', 'no_trusted_answer']) {
  if (!outcomeEventTypes.has(requiredType)) fail(`required reusable outcome event is missing: ${requiredType}`);
}
if (outcomeSchema.properties?.privacy?.properties?.raw_query_included?.const !== false) fail('outcome schema no longer forbids raw query data');
if (outcomeSchema.properties?.privacy?.properties?.personal_data_included?.const !== false) fail('outcome schema no longer forbids personal data');
if (outcomeSchema.properties?.privacy?.properties?.user_identifier_included?.const !== false) fail('outcome schema no longer forbids user identifiers');
if (!Array.isArray(outcomeRegistry.observations)) fail('reviewed outcome registry is malformed');

for (const [trackKey, expectedId] of [['human', 'human'], ['external_agent', 'external_agent']]) {
  const track = experiment.tracks?.[trackKey];
  if (!track || track.track_id !== expectedId) fail(`${trackKey} track identity drift`);
  const target = track.target;
  if (target?.type !== 'experiment-target') fail(`${trackKey} target must remain explicitly classified as an experiment target`);
  if (!Number.isInteger(target?.minimum_attempts) || !Number.isInteger(target?.maximum_attempts)) fail(`${trackKey} target bounds must be integers`);
  if (target.minimum_attempts < 1 || target.maximum_attempts < target.minimum_attempts) fail(`${trackKey} target bounds are invalid`);
  if (!Number.isInteger(target.observed_attempts) || target.observed_attempts < 0) fail(`${trackKey} observed_attempts must be a non-negative integer`);
  if (!Array.isArray(track.procedure) || track.procedure.length < 3) fail(`${trackKey} procedure is not pre-registered`);
  if (!Array.isArray(track.success_criteria) || track.success_criteria.length < 2) fail(`${trackKey} success criteria are not pre-registered`);
  if (!Array.isArray(track.failure_criteria) || track.failure_criteria.length < 2) fail(`${trackKey} failure criteria are not pre-registered`);
}

if (experiment.tracks.human.target.minimum_attempts !== 10 || experiment.tracks.human.target.maximum_attempts !== 15) {
  fail('human experiment target must remain 10-15 attempts unless the experiment is explicitly versioned');
}
if (experiment.tracks.external_agent.target.minimum_attempts !== 5 || experiment.tracks.external_agent.target.maximum_attempts !== 5) {
  fail('external-agent experiment target must remain 5 attempts unless the experiment is explicitly versioned');
}

const reviewedEvents = new Map();
for (const observation of outcomeRegistry.observations) {
  const event = observation?.event;
  if (!event?.event_id) fail('reviewed outcome observation lacks event_id');
  reviewedEvents.set(event.event_id, event);
}

function assertSafeRefs(refs, label) {
  if (!Array.isArray(refs)) fail(`${label}: source_refs must be an array`);
  for (const ref of refs) {
    if (!validSourceKinds.has(ref?.kind)) fail(`${label}: unsupported source ref kind`);
    if (typeof ref?.ref !== 'string' || ref.ref.length < 8) fail(`${label}: source ref is too weak`);
    if (/\b(?:email|phone|participant-name|user-id|employer|client-name)\s*[:=]/i.test(ref.ref)) fail(`${label}: source ref appears to contain prohibited identifying metadata`);
  }
}

function assertReviewedOutcomeIds(ids, label) {
  if (!Array.isArray(ids)) fail(`${label}: outcome_event_ids must be an array`);
  for (const eventId of ids) {
    if (!uuidPattern.test(eventId)) fail(`${label}: invalid outcome event id ${eventId}`);
    if (!reviewedEvents.has(eventId)) fail(`${label}: outcome event ${eventId} is not accepted into data/outcome-observations.json`);
  }
}

const attemptIds = new Set();
const attemptsByTrack = { human: 0, external_agent: 0 };
for (const [index, attempt] of experiment.attempts.entries()) {
  const label = `attempt ${index}`;
  if (!attemptIdPattern.test(attempt?.attempt_id ?? '')) fail(`${label}: invalid attempt_id`);
  if (attemptIds.has(attempt.attempt_id)) fail(`${label}: duplicate attempt_id ${attempt.attempt_id}`);
  attemptIds.add(attempt.attempt_id);
  if (!validTracks.has(attempt.track)) fail(`${label}: invalid track`);
  if (attempt.state !== 'attempted') fail(`${label}: attempt state must be attempted; planned work belongs in the track definition`);
  if (!Number.isFinite(Date.parse(attempt.attempted_at))) fail(`${label}: attempted_at must be an ISO date-time`);
  if (!Number.isInteger(attempt.procedure_version) || attempt.procedure_version < 1) fail(`${label}: invalid procedure_version`);
  assertReviewedOutcomeIds(attempt.outcome_event_ids, label);
  assertSafeRefs(attempt.source_refs, label);
  if (!attempt.outcome_event_ids.length && !attempt.source_refs.length) fail(`${label}: a real attempt needs at least one privacy-safe audit reference`);
  attemptsByTrack[attempt.track] += 1;
}

for (const track of validTracks) {
  if (experiment.tracks[track].target.observed_attempts !== attemptsByTrack[track]) {
    fail(`${track} observed_attempts (${experiment.tracks[track].target.observed_attempts}) does not equal actual attempt records (${attemptsByTrack[track]})`);
  }
}

const evidenceIds = new Set();
const evidenceById = new Map();
for (const [index, item] of experiment.evidence.entries()) {
  const label = `evidence ${index}`;
  if (!evidenceIdPattern.test(item?.evidence_id ?? '')) fail(`${label}: invalid evidence_id`);
  if (evidenceIds.has(item.evidence_id)) fail(`${label}: duplicate evidence_id ${item.evidence_id}`);
  evidenceIds.add(item.evidence_id);
  evidenceById.set(item.evidence_id, item);
  if (!attemptIds.has(item.attempt_id)) fail(`${label}: references missing attempt ${item.attempt_id}`);
  if (!validTracks.has(item.track)) fail(`${label}: invalid track`);
  const attempt = experiment.attempts.find(candidate => candidate.attempt_id === item.attempt_id);
  if (attempt.track !== item.track) fail(`${label}: evidence track does not match its attempt`);
  if (!validEvidenceStates.has(item.state)) fail(`${label}: invalid evidence state`);
  if (typeof item.finding !== 'string' || item.finding.length < 8) fail(`${label}: finding is too weak`);
  assertReviewedOutcomeIds(item.outcome_event_ids, label);
  assertSafeRefs(item.source_refs, label);
  if (!item.outcome_event_ids.length && !item.source_refs.length) fail(`${label}: observed/verified/inferred evidence needs an auditable privacy-safe reference`);
  if (item.state === 'verified' && !item.outcome_event_ids.length && !item.source_refs.some(ref => ['provider-artifact', 'manual-review', 'github-issue'].includes(ref.kind))) {
    fail(`${label}: verified evidence lacks an auditable verification source`);
  }
}

const privacy = experiment.privacy ?? {};
for (const key of ['raw_task_text', 'personal_data', 'employer_or_client_material', 'user_identifier']) {
  if (privacy[key] !== false) fail(`privacy boundary drift: ${key} must remain false`);
}
if (typeof privacy.observation_reference_policy !== 'string' || privacy.observation_reference_policy.length < 20) fail('observation reference policy is missing');

const decision = experiment.decision ?? {};
const minimumsMet = attemptsByTrack.human >= experiment.tracks.human.target.minimum_attempts && attemptsByTrack.external_agent >= experiment.tracks.external_agent.target.minimum_attempts;
if (decision.status === 'pending') {
  if (decision.value !== null || decision.rationale !== null || (decision.evidence_refs?.length ?? 0) !== 0) fail('pending decision must not smuggle in a value, rationale or evidence-backed verdict');
} else if (decision.status === 'made') {
  if (!minimumsMet) fail('decision cannot be made before both tracks meet their minimum real-attempt target');
  if (!validDecisionValues.has(decision.value)) fail('made decision must be keep, change or reject');
  if (typeof decision.rationale !== 'string' || decision.rationale.length < 20) fail('made decision requires a substantive rationale');
  if (!Array.isArray(decision.evidence_refs) || decision.evidence_refs.length === 0) fail('made decision requires evidence references');
  const cited = decision.evidence_refs.map(id => evidenceById.get(id));
  if (cited.some(item => !item)) fail('decision references missing evidence');
  if (!cited.some(item => item.state === 'verified')) fail('decision must cite at least one verified evidence row');
  if (cited.every(item => item.state === 'inferred')) fail('inference cannot be the sole basis for a decision');
} else {
  fail('decision status must be pending or made');
}

if (!Array.isArray(decision.limitations) || decision.limitations.length === 0) fail('decision limitations must remain explicit');
if (experiment.status === 'planned' && experiment.attempts.length > 0) fail('planned experiment cannot already contain attempts');
if (experiment.status === 'complete' && decision.status !== 'made') fail('complete experiment requires a made decision');
if (experiment.status === 'complete' && !minimumsMet) fail('complete experiment requires both minimum attempt targets');
if (experiment.attempts.length === 0) {
  if (experiment.status !== 'planned') fail('empty experiment must remain planned');
  if (experiment.evidence.length !== 0) fail('empty experiment cannot contain evidence');
  if (decision.status !== 'pending') fail('empty experiment must keep decision pending');
}

if (experiment.links?.issue !== 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/262') fail('scenario issue link drift');
if (experiment.links?.outcome_event_schema !== 'https://brali-lifeos.github.io/contracts/outcome-event.schema.json') fail('outcome schema link drift');
if (experiment.links?.runbook !== 'docs/SCENARIO_VALIDATION.md') fail('scenario runbook link drift');

console.log(`Scenario validation verified: status=${experiment.status}; human attempts=${attemptsByTrack.human}/${experiment.tracks.human.target.minimum_attempts}-${experiment.tracks.human.target.maximum_attempts}; external-agent attempts=${attemptsByTrack.external_agent}/${experiment.tracks.external_agent.target.minimum_attempts}; evidence=${experiment.evidence.length}; reviewed outcome refs=${reviewedEvents.size}; decision=${decision.status}.`);
