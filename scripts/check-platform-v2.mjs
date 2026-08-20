import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const fail = msg => { throw new Error(`platform check failed: ${msg}`); };
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const config = read('data/platform.json');
for (const rel of ['life-os/datasets/manifest.json','life-os/datasets/identity.json','life-os/datasets/identity-aliases.json','life-os/datasets/ontology-migration-queue.json','life-os/datasets/evidence-metrics.json','life-os/datasets/retrieval-benchmark.json',`api/${config.api_version}/index.json`,`api/${config.api_version}/openapi.json`,`api/${config.api_version}/evidence-decisions.json`]) if (!exists(rel)) fail(`missing ${rel}`);
const identity = read('life-os/datasets/identity.json');
const ids = new Set();
for (const item of identity.identities || []) {
  if (!/^brali:(domain|topic|method|lens|hack|protocol|evidence|evidence-decision|research-candidate):[a-z0-9-]+$/.test(item.id)) fail(`invalid canonical id ${item.id}`);
  if (ids.has(item.id)) fail(`duplicate canonical id ${item.id}`);
  ids.add(item.id);
}
const aliasDoc = read('life-os/datasets/identity-aliases.json');
const aliasKeys = new Map();
for (const item of aliasDoc.aliases || []) {
  if (!ids.has(item.canonical_id)) fail(`alias references unknown id ${item.canonical_id}`);
  const kind = item.kind || item.canonical_id.split(':')[1];
  const key = `${kind}:${item.language}:${String(item.value).toLowerCase()}`;
  if (aliasKeys.has(key) && aliasKeys.get(key) !== item.canonical_id && ['domain','topic','method','lens'].includes(kind)) fail(`ambiguous ontology alias ${key}`);
  if (!aliasKeys.has(key)) aliasKeys.set(key, item.canonical_id);
}
const decisions = read('data/evidence-decisions.json');
for (const item of decisions.entries || []) {
  const id = `brali:evidence-decision:${String(item.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  if (!ids.has(id)) fail(`missing evidence-decision identity ${id}`);
}
const manifest = read('life-os/datasets/manifest.json');
if (manifest.schema_version !== 2 || manifest.dataset_version !== config.dataset_version) fail('manifest version mismatch');
for (const item of manifest.files || []) {
  if (!exists(item.path)) fail(`manifest references missing ${item.path}`);
  const text = fs.readFileSync(path.join(ROOT, item.path), 'utf8');
  if (hash(text) !== item.sha256) fail(`manifest checksum drift for ${item.path}`);
}
if (JSON.stringify(read(`api/${config.api_version}/manifest.json`)) !== JSON.stringify(manifest)) fail('API manifest differs from canonical manifest');
const topics = new Set((read('data/knowledge-ontology.json').topics || []).map(x => x.id));
const migration = read('life-os/datasets/ontology-migration-queue.json');
for (const item of migration.items || []) {
  if (item.type === 'growth-gap' && !topics.has(item.id)) fail(`migration queue invented Topic ${item.id}`);
  if (item.pending_entries < 0 || item.priority_score < 0) fail(`invalid migration priority for ${item.id}`);
}
const evidence = read('life-os/datasets/evidence-metrics.json');
if (typeof evidence.current?.review_queue !== 'number' || typeof evidence.current?.stale_reviews !== 'number' || typeof evidence.current?.evidence_decisions !== 'number') fail('evidence metrics incomplete');
if (evidence.review_stale_days !== config.review_stale_days) fail('stale-review policy mismatch');
const benchmark = read('life-os/datasets/retrieval-benchmark.json');
const failedBenchmarkCases = (benchmark.cases || []).filter(item => !item.pass).map(item => `${item.id}=>[${(item.result_ids || []).join(',')}]`).join('; ');
if ((benchmark.summary?.cases || 0) < 5 || (benchmark.summary?.recall_at_k || 0) < 0.80) fail(`retrieval benchmark regression: ${benchmark.summary?.recall_at_k}; failed: ${failedBenchmarkCases || 'unknown'}`);
if (!(benchmark.cases || []).find(x => x.id === 'safety')?.pass) fail('safety-sensitive benchmark failed');
const api = read(`api/${config.api_version}/index.json`);
if (api.api_version !== config.api_version || api.dataset_version !== config.dataset_version) fail('API version mismatch');
if (!(api.endpoints || []).includes('evidence-decisions.json')) fail('API does not expose evidence decisions');
const openapi = read(`api/${config.api_version}/openapi.json`);
if (!String(openapi.openapi || '').startsWith('3.1') || !openapi.paths?.[`/api/${config.api_version}/evidence-decisions.json`]) fail('OpenAPI contract incomplete');
for (const endpoint of api.endpoints || []) if (!exists(`api/${config.api_version}/${endpoint}`)) fail(`API endpoint missing ${endpoint}`);
console.log(`platform check passed: ${ids.size} canonical ids, ${aliasKeys.size} aliases, ${manifest.files.length} manifest files, recall@${benchmark.k}=${benchmark.summary.recall_at_k}`);
