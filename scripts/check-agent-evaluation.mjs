import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(`Agent evaluation validation failed: ${message}`); };

const suite = read('data/agent-evaluation-suite.json');
const platform = read('data/platform.json');
const report = read('life-os/datasets/agent-evaluation.json');
const api = read(`api/${platform.api_version}/evaluation.json`);
const apiIndex = read(`api/${platform.api_version}/index.json`);
const openapi = read(`api/${platform.api_version}/openapi.json`);
const manifest = read('life-os/datasets/manifest.json');
const apiManifest = read(`api/${platform.api_version}/manifest.json`);
const page = fs.readFileSync(path.join(ROOT, 'for-ai/evaluation/index.html'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

if (suite.schema_version !== 1 || report.schema_version !== 1) fail('unexpected schema version');
if ((suite.cases || []).length < 30 || (suite.cases || []).length > 50) fail('suite must contain 30-50 cases');
const ids = (suite.cases || []).map(item => item.id);
if (new Set(ids).size !== ids.length) fail('duplicate case ids');
if (report.summary?.cases !== ids.length || (report.cases || []).length !== ids.length) fail('report case count differs from source suite');
if (report.suite_version !== suite.suite_version || report.dataset_version !== platform.dataset_version) fail('version metadata drift');
if (JSON.stringify(api) !== JSON.stringify(report)) fail('API evaluation endpoint differs from canonical report');
if (!(apiIndex.endpoints || []).includes('evaluation.json')) fail('API index does not expose evaluation.json');
if (!openapi.paths?.[`/api/${platform.api_version}/evaluation.json`]) fail('OpenAPI does not describe evaluation endpoint');
if (JSON.stringify(apiManifest) !== JSON.stringify(manifest)) fail('API manifest drift after evaluation build');

const summary = report.summary || {};
const failures = (report.cases || []).filter(item => !item.pass);
console.log(`Agent evaluation diagnostics: ${summary.passed}/${summary.cases} pass; Topic structured=${summary.structured_topic_hit_rate}, lexical=${summary.lexical_topic_hit_rate}; Protocol structured=${summary.structured_protocol_hit_rate}, lexical=${summary.lexical_protocol_hit_rate}; Decision recall=${summary.evidence_decision_recall}; usefulness structured=${summary.structured_usefulness_proxy}, lexical=${summary.lexical_usefulness_proxy}.`);
for (const item of failures) console.log(`Agent evaluation gap ${item.id}: ${item.gaps.join(', ')} | expected protocols=${item.expected.protocol_slugs.join(',') || '-'} | structured=${item.structured_brali.protocol_slugs.join(',') || '-'} | lexical=${item.lexical_brali.protocol_slugs.join(',') || '-'} | decisions=${item.structured_brali.evidence_decision_ids.join(',') || '-'}`);

if (summary.safety_no_answer_pass_rate !== 1) fail(`safety/no-answer pass rate must be 1, got ${summary.safety_no_answer_pass_rate}`);
if (summary.evidence_state_preservation_rate !== 1) fail(`evidence-state preservation must be 1, got ${summary.evidence_state_preservation_rate}`);
if (summary.provenance_preservation_rate !== 1) fail(`provenance preservation must be 1, got ${summary.provenance_preservation_rate}`);
if (summary.unsupported_evidence_claims !== 0 || summary.unsupported_evidence_claim_rate !== 0) fail('structured packets contain unsupported evidence claims');
if ((summary.structured_topic_hit_rate || 0) < 0.70) fail(`structured Topic hit rate below 0.70: ${summary.structured_topic_hit_rate}`);
if ((summary.structured_protocol_hit_rate || 0) < 0.60) fail(`structured expected-protocol hit rate below 0.60: ${summary.structured_protocol_hit_rate}`);
if ((summary.evidence_decision_recall || 0) < 0.80) fail(`Evidence Decision recall below 0.80: ${summary.evidence_decision_recall}`);
if ((summary.structured_usefulness_proxy || 0) < (summary.lexical_usefulness_proxy || 0)) fail('structured usefulness proxy is worse than lexical baseline');
if ((summary.structured_topic_hit_rate || 0) < (summary.lexical_topic_hit_rate || 0)) fail('structured Topic routing is worse than lexical baseline');

const allowedGaps = new Set(['topic-routing-gap','trusted-coverage-gap','protocol-retrieval-gap','evidence-decision-retrieval-gap','no-answer-or-safety-gap','evidence-boundary-gap','evidence-state-loss','provenance-loss','actionability-gap']);
for (const item of report.cases || []) {
  if (!ids.includes(item.id)) fail(`report invented case ${item.id}`);
  if (item.no_knowledge_control?.grounded !== false) fail(`${item.id}: no-knowledge control must remain ungrounded`);
  if (!item.structured_brali || !item.lexical_brali) fail(`${item.id}: missing comparison layers`);
  if (item.structured_brali.unsupported_evidence_claims > 0) fail(`${item.id}: unsupported evidence claim`);
  if (!item.pass && !(item.gaps || []).length) fail(`${item.id}: failed case has no actionable gap`);
  for (const gap of item.gaps || []) if (!allowedGaps.has(gap)) fail(`${item.id}: unknown gap ${gap}`);
  if (item.mode === 'no-answer' && item.structured_brali.no_answer !== true) fail(`${item.id}: no-answer case returned a recommendation`);
}

for (const rel of ['data/agent-evaluation-suite.json','life-os/datasets/agent-evaluation.json']) {
  const entry = (manifest.files || []).find(item => (typeof item === 'string' ? item : item.path) === rel);
  if (!entry || typeof entry === 'string') fail(`canonical manifest missing hashed entry for ${rel}`);
  if (!exists(rel)) fail(`missing ${rel}`);
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (entry.sha256 !== digest(text)) fail(`manifest checksum mismatch for ${rel}`);
}
if (!page.includes('Does structure improve grounded retrieval?') || !page.includes('/life-os/datasets/agent-evaluation.json')) fail('public evaluation report is incomplete');
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/for-ai/evaluation/</loc>')) fail('evaluation page missing from sitemap');

console.log(`Agent evaluation verified: ${summary.passed}/${summary.cases} cases; Topic hit ${(summary.structured_topic_hit_rate*100).toFixed(1)}% vs ${(summary.lexical_topic_hit_rate*100).toFixed(1)}%; usefulness ${(summary.structured_usefulness_proxy*100).toFixed(1)}% vs ${(summary.lexical_usefulness_proxy*100).toFixed(1)}%; safety ${(summary.safety_no_answer_pass_rate*100).toFixed(0)}%.`);
