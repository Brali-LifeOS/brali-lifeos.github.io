import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { answerWithBrali, buildMcpPlan } from '../examples/javascript/reference-agent-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const fail = message => { throw new Error(`Reference agent demo check failed: ${message}`); };
const source = read('data/reference-agent-scenarios.json');
const dataset = read('life-os/datasets/reference-agent-demos.json');
const api = read('api/v1/demos.json');
const index = read('api/v1/index.json');
const manifest = read('life-os/datasets/manifest.json');

if ((source.scenarios || []).length !== 4 || (dataset.scenarios || []).length !== 4) fail('expected exactly four reference scenarios');
if (JSON.stringify(dataset) !== JSON.stringify(api)) fail('API demos endpoint diverges from canonical demo dataset');
if (!(index.endpoints || []).includes('demos.json')) fail('API index does not expose demos.json');
for (const rel of ['data/reference-agent-scenarios.json','life-os/datasets/reference-agent-demos.json']) if (!(manifest.files || []).some(x => (x.path || x) === rel)) fail(`manifest missing ${rel}`);

for (const scenario of source.scenarios || []) {
  const row = (dataset.scenarios || []).find(x => x.id === scenario.id);
  if (!row) fail(`missing generated scenario ${scenario.id}`);
  const packet = row.packet;
  if (packet.status !== scenario.expected_status) fail(`${scenario.id}: expected status ${scenario.expected_status}, got ${packet.status}`);
  const routed = new Set((packet.route?.topics || []).map(x => x.id));
  for (const id of scenario.expected_topic_ids || []) if (!routed.has(id)) fail(`${scenario.id}: missing Topic ${id}`);
  const slugs = new Set((packet.recommendations || []).map(x => x.slug));
  for (const slug of scenario.expected_protocol_slugs || []) if (!slugs.has(slug)) fail(`${scenario.id}: missing Protocol ${slug}`);
  const decisionIds = new Set((packet.evidence_boundaries || []).map(x => x.id));
  for (const id of scenario.expected_decision_ids || []) if (!decisionIds.has(id)) fail(`${scenario.id}: missing Evidence Decision ${id}`);
  for (const rec of packet.recommendations || []) {
    if (!/^brali:protocol:/.test(rec.canonical_id || '')) fail(`${scenario.id}: invalid protocol canonical ID ${rec.canonical_id}`);
    if (!['reviewed','practical'].includes(rec.evidence_state)) fail(`${scenario.id}: untrusted recommendation state ${rec.evidence_state}`);
    if (!rec.provenance?.record_url) fail(`${scenario.id}: recommendation lacks Brali record provenance`);
    if (rec.evidence_state === 'reviewed' && !rec.provenance?.source_url) fail(`${scenario.id}: reviewed recommendation lacks source provenance`);
  }
  for (const topic of packet.route?.topics || []) if (!/^brali:topic:/.test(topic.canonical_id || '')) fail(`${scenario.id}: invalid Topic canonical ID`);
  for (const decision of packet.evidence_boundaries || []) {
    if (!/^brali:evidence-decision:/.test(decision.canonical_id || '')) fail(`${scenario.id}: invalid Evidence Decision canonical ID`);
    if (!decision.source_url || !decision.supported_claim || !(decision.limitations || []).length) fail(`${scenario.id}: incomplete Evidence Decision provenance/boundary`);
  }
  const plan = buildMcpPlan(packet);
  if (plan.steps?.[0]?.tool !== 'search_knowledge' || plan.steps?.[0]?.arguments?.trusted_only !== true) fail(`${scenario.id}: MCP plan does not start with trusted search`);
  for (const rec of packet.recommendations || []) if (!plan.steps.some(step => step.tool === 'get_protocol' && step.arguments?.id === rec.canonical_id)) fail(`${scenario.id}: MCP plan missing get_protocol for ${rec.canonical_id}`);
  const rerun = await answerWithBrali(scenario.question, { root: ROOT });
  if (JSON.stringify(rerun) !== JSON.stringify(packet)) fail(`${scenario.id}: generated packet is not deterministic`);
}

const boundary = dataset.scenarios.find(x => x.id === 'safety-boundary')?.packet;
if (!boundary || boundary.status !== 'no-trusted-answer' || boundary.recommendations.length || boundary.safety?.blocked_from_normal_recommendation !== true) fail('safety boundary must be an explicit no-trusted-answer');
const task = dataset.scenarios.find(x => x.id === 'task-initiation')?.packet;
if (!task?.recommendations?.length) fail('task-initiation must return at least one trusted protocol without hard-coding a slug');
if (!(task.route?.topics || []).some(x => x.id === 'task-initiation')) fail('task-initiation does not route to its canonical Topic');

for (const id of ['sleep','memory','task-initiation','safety-boundary']) {
  const run = spawnSync(process.execPath, ['examples/javascript/reference-agent.mjs','--scenario',id,'--root',ROOT], { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) fail(`CLI scenario ${id} failed: ${run.stderr}`);
  const packet = JSON.parse(run.stdout);
  if (packet.question !== source.scenarios.find(x=>x.id===id).question) fail(`CLI scenario ${id} returned wrong question`);
}
const mcp = spawnSync(process.execPath, ['examples/javascript/reference-mcp-plan.mjs','--scenario','memory','--root',ROOT], { cwd: ROOT, encoding: 'utf8' });
if (mcp.status !== 0) fail(`MCP plan CLI failed: ${mcp.stderr}`);
const plan = JSON.parse(mcp.stdout);
if (!plan.steps.some(step => step.tool === 'get_protocol')) fail('MCP plan CLI produced no protocol lookup');

const page = fs.readFileSync(path.join(ROOT,'for-ai/demos/index.html'),'utf8');
for (const marker of ['Question → Topic → Protocol → Evidence → provenance','reference-agent.mjs','api/v1/demos.json']) if (!page.includes(marker)) fail(`public demo page missing ${marker}`);
console.log(`Reference agent demos verified: 4 scenarios, ${dataset.scenarios.filter(x=>x.packet.status==='trusted-answer').length} trusted answers, deterministic API packets, MCP plans, canonical IDs, provenance, and explicit safety no-answer.`);
