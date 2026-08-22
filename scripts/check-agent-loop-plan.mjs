import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_PATH = 'data/agent-loop-plan.json';
const SCHEMA_PATH = 'contracts/agent-loop-plan.schema.json';
const DOC_PATH = 'AGENT_LOOP.md';
const ISSUE_BASE = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/';
const REQUIRED_ISSUES = [93, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118];
const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2']);
const VALID_STATUSES = new Set(['active', 'queued', 'blocked', 'awaiting-external', 'completed']);
const VALID_LANES = new Set(['implementation', 'editorial', 'external', 'decision']);

const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readText = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const fail = message => { throw new Error(`Agent loop validation failed: ${message}`); };
const unique = values => new Set(values).size === values.length;

for (const rel of [PLAN_PATH, SCHEMA_PATH, DOC_PATH]) {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`missing ${rel}`);
}

const plan = readJson(PLAN_PATH);
const schema = readJson(SCHEMA_PATH);
const doc = readText(DOC_PATH);

if (plan.schema_version !== 1) fail(`unexpected plan schema_version ${plan.schema_version}`);
if (schema.$id !== 'https://brali-lifeos.github.io/contracts/agent-loop-plan.schema.json') fail('schema $id drift');
if (schema.title !== 'Brali Product Outcome Loop Plan') fail('schema title drift');
if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.updated_at) || Number.isNaN(Date.parse(`${plan.updated_at}T00:00:00Z`))) fail('updated_at must be an ISO date');
if (plan.canonical_issue_repo !== 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues') fail('canonical issue repository drift');
if (!/evidence-aware protocol layer/i.test(plan.product_positioning)) fail('product positioning must retain the evidence-aware protocol-layer identity');

const expectedValueChain = ['practical-question', 'trusted-protocol-match', 'bounded-action', 'evidence-and-provenance', 'outcome-review'];
for (const step of expectedValueChain) if (!plan.value_chain?.includes(step)) fail(`value chain missing ${step}`);
if (!unique(plan.value_chain ?? [])) fail('value chain contains duplicates');

if (plan.north_star?.id !== 'weekly_verified_successful_executions') fail('north-star identity drift');
if (plan.north_star?.target_type !== 'hypothesis') fail('initial north-star target must remain labelled as a hypothesis');
if (!['not-collected', 'instrumented', 'observed'].includes(plan.north_star?.collection_status)) fail('invalid north-star collection status');
if (!Number.isInteger(plan.north_star?.initial_validation_target) || plan.north_star.initial_validation_target < 1) fail('invalid initial validation target');
if ((plan.north_star?.anti_metrics ?? []).length < 3 || !unique(plan.north_star.anti_metrics)) fail('anti-metrics must contain at least three unique values');

const limits = plan.wip_limits ?? {};
for (const [key, value] of Object.entries(limits)) if (!Number.isInteger(value) || value < 1) fail(`invalid WIP limit ${key}`);

const gates = plan.gates ?? [];
if (gates.length < 5) fail('at least five stage gates are required');
const gateIds = gates.map(gate => gate.id);
const gateOrders = gates.map(gate => gate.order);
if (!unique(gateIds)) fail('duplicate gate id');
if (!unique(gateOrders)) fail('duplicate gate order');
const sortedOrders = [...gateOrders].sort((a, b) => a - b);
for (let i = 0; i < sortedOrders.length; i += 1) if (sortedOrders[i] !== i) fail('gate order must be contiguous from zero');
for (const gate of gates) {
  if (!VALID_STATUSES.has(gate.status)) fail(`${gate.id}: invalid gate status ${gate.status}`);
  if (!(gate.issue_numbers?.length > 0) || !unique(gate.issue_numbers)) fail(`${gate.id}: issue_numbers must be non-empty and unique`);
  if (!(gate.exit_criteria?.length >= 2)) fail(`${gate.id}: at least two exit criteria are required`);
}

const workstreams = plan.workstreams ?? [];
if (workstreams.length < 8) fail('at least eight workstreams are required');
const workstreamIds = workstreams.map(item => item.id);
const issueNumbers = workstreams.map(item => item.issue_number);
if (!unique(workstreamIds)) fail('duplicate workstream id');
if (!unique(issueNumbers)) fail('duplicate workstream issue number');
const workstreamByIssue = new Map(workstreams.map(item => [item.issue_number, item]));
const gateSet = new Set(gateIds);

for (const required of REQUIRED_ISSUES) if (!workstreamByIssue.has(required)) fail(`required issue #${required} is missing from the loop plan`);

for (const item of workstreams) {
  if (!VALID_PRIORITIES.has(item.priority)) fail(`${item.id}: invalid priority ${item.priority}`);
  if (!VALID_STATUSES.has(item.status)) fail(`${item.id}: invalid status ${item.status}`);
  if (!VALID_LANES.has(item.lane)) fail(`${item.id}: invalid lane ${item.lane}`);
  if (!gateSet.has(item.gate)) fail(`${item.id}: references unknown gate ${item.gate}`);
  if (item.issue_url !== `${ISSUE_BASE}${item.issue_number}`) fail(`${item.id}: issue URL does not match issue number`);
  if (!(item.next_slice?.length >= 20)) fail(`${item.id}: next_slice is missing or too vague`);
  if (!Array.isArray(item.depends_on) || !unique(item.depends_on)) fail(`${item.id}: dependencies must be a unique array`);
  if (item.depends_on.includes(item.issue_number)) fail(`${item.id}: self dependency`);
  for (const dependency of item.depends_on) if (!workstreamByIssue.has(dependency)) fail(`${item.id}: missing dependency #${dependency}`);
  if (item.status === 'blocked' && item.depends_on.length === 0) fail(`${item.id}: blocked workstream must name a dependency`);
  if (item.status === 'completed' && !(item.completion_evidence?.length > 0)) fail(`${item.id}: completed workstream lacks observed completion evidence`);
  if (!Array.isArray(item.completion_evidence)) fail(`${item.id}: completion_evidence must be an array`);
}

for (const gate of gates) {
  for (const issue of gate.issue_numbers) if (!workstreamByIssue.has(issue)) fail(`${gate.id}: references issue #${issue} without a workstream`);
}

const activeImplementation = workstreams.filter(item => item.lane === 'implementation' && item.status === 'active');
const activeEditorial = workstreams.filter(item => item.lane === 'editorial' && item.status === 'active');
if (activeImplementation.length > limits.active_implementation_slices) fail(`active implementation WIP ${activeImplementation.length}/${limits.active_implementation_slices}`);
if (activeEditorial.length > limits.active_editorial_reviews) fail(`active editorial WIP ${activeEditorial.length}/${limits.active_editorial_reviews}`);
if (activeImplementation.length === 0) fail('the plan must identify one active implementation slice');

const unfinishedP0 = workstreams.filter(item => item.priority === 'P0' && item.status !== 'completed');
const activeLowerPriorityImplementation = workstreams.filter(item => item.lane === 'implementation' && item.status === 'active' && item.priority !== 'P0');
if (unfinishedP0.length > 0 && activeLowerPriorityImplementation.length > 0) fail('P1/P2 implementation is active while P0 work remains unfinished');

if ((plan.stop_rules ?? []).length < 5 || !unique(plan.stop_rules)) fail('stop_rules must contain at least five unique controls');
if (!(plan.run_protocol?.length >= 7)) fail('run_protocol must contain at least seven steps');
if (!(plan.external_blocker_policy?.length >= 60)) fail('external blocker policy is missing or too weak');

for (const marker of [PLAN_PATH, 'weekly_verified_successful_executions', 'trust-reset', 'gold-core', 'outcome-loop', 'distribution-and-adoption']) {
  if (!doc.includes(marker)) fail(`${DOC_PATH} does not reference ${marker}`);
}

const activeSummary = workstreams.filter(item => item.status === 'active').map(item => `#${item.issue_number}:${item.lane}`).join(', ');
console.log(`Agent loop verified: ${gates.length} gates, ${workstreams.length} workstreams, active ${activeSummary}, implementation WIP ${activeImplementation.length}/${limits.active_implementation_slices}, editorial WIP ${activeEditorial.length}/${limits.active_editorial_reviews}.`);
