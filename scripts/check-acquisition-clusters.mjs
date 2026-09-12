import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const fail = message => { throw new Error(`acquisition cluster check failed: ${message}`); };
const plan = read('data/acquisition-clusters.json');
const topics = read('api/v1/topics.json').items || [];
const topicIds = new Set(topics.map(item => item.id));
if ((plan.clusters || []).length < 10 || plan.clusters.length > 20) fail('keep the acquisition portfolio between 10 and 20 focused clusters');
if (!/provider-visible external distribution artifact/i.test(plan.activation_gate?.external_distribution || '')) fail('external distribution gate is missing');
if (!/Do not generate thin keyword permutations/i.test(plan.activation_gate?.content_rule || '')) fail('thin-page guardrail is missing');
const ids = new Set();
for (const cluster of plan.clusters || []) {
  if (!cluster.id || ids.has(cluster.id)) fail(`duplicate or missing cluster id ${cluster.id || '<missing>'}`);
  ids.add(cluster.id);
  if (cluster.status !== 'candidate') fail(`${cluster.id} must remain candidate until demand gates are met`);
  if (!cluster.problem_intent || (cluster.seed_questions || []).length < 3) fail(`${cluster.id} needs one problem intent and at least three seed questions`);
  if (!(cluster.topic_ids || []).length) fail(`${cluster.id} has no canonical Topics`);
  for (const id of cluster.topic_ids) if (!topicIds.has(id)) fail(`${cluster.id} references unknown Topic ${id}`);
}
console.log(`Organic acquisition portfolio verified: ${plan.clusters.length} bounded candidates; no page expansion activated.`);
