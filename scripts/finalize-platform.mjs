import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch (error) { if (fallback !== null) return fallback; throw error; }
};
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const slug = value => String(value || '').toLowerCase().replace(/^brali:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || digest(String(value)).slice(0, 16);
const cid = (kind, value) => `brali:${kind}:${slug(value)}`;
const list = (doc, key) => Array.isArray(doc) ? doc : Array.isArray(doc?.[key]) ? doc[key] : Array.isArray(doc?.entries) ? doc.entries : [];

const config = read('data/platform.json');
const ontology = read('data/knowledge-ontology.json');
const coverage = read('life-os/datasets/ontology-coverage.json', {});
const evidence = read('life-os/datasets/evidence.json', { entries: [] });
const reviewQueue = read('life-os/datasets/review-queue.json', { entries: [] });
const candidates = read('data/research-candidates.json', { candidates: [] });
const decisions = read('data/evidence-decisions.json', { entries: [] });
const identity = read('life-os/datasets/identity.json');
const aliasDoc = read('life-os/datasets/identity-aliases.json');
const apiDir = `api/${config.api_version}`;
const attribution = { creator: 'Dzmitryi Kharlanau', project: 'Brali', canonical_url: 'https://brali-lifeos.github.io/', citation_url: 'https://brali-lifeos.github.io/citation/', citation_file: 'https://brali-lifeos.github.io/CITATION.cff', license: 'CC BY-NC-SA 4.0' };

const replacement = new Map();
for (const item of identity.identities || []) {
  if (item.kind !== 'research') continue;
  const next = cid('research-candidate', item.local_id);
  replacement.set(item.id, next);
  item.id = next;
  item.kind = 'research-candidate';
}
for (const item of aliasDoc.aliases || []) {
  if (replacement.has(item.canonical_id)) item.canonical_id = replacement.get(item.canonical_id);
  if (item.kind === 'research') item.kind = 'research-candidate';
}
const seen = new Set((identity.identities || []).map(x => x.id));
for (const decision of decisions.entries || []) {
  const id = cid('evidence-decision', decision.id);
  if (!seen.has(id)) {
    identity.identities.push({ id, kind: 'evidence-decision', local_id: decision.id, title: decision.source_title || decision.id, candidate_id: decision.candidate_id, decision: decision.decision });
    seen.add(id);
  }
  if (!(aliasDoc.aliases || []).some(x => x.canonical_id === id && x.language === 'en' && x.value === (decision.source_title || decision.id))) {
    aliasDoc.aliases.push({ canonical_id: id, kind: 'evidence-decision', language: 'en', value: decision.source_title || decision.id, type: 'label' });
  }
}
identity.identities.sort((a, b) => a.id.localeCompare(b.id));
aliasDoc.aliases.sort((a, b) => `${a.language}:${a.kind}:${a.value}`.localeCompare(`${b.language}:${b.kind}:${b.value}`));
write('life-os/datasets/identity.json', identity);
write('life-os/datasets/identity-aliases.json', aliasDoc);

const semantic = new Map([
  ...(coverage.methods || []).map(x => [`method:${x.id}`, x]),
  ...(coverage.lenses || []).map(x => [`lens:${x.id}`, x])
]);
const migration = [];
for (const item of coverage.unresolved_legacy_collections || []) {
  const pending = Number(item.entries || 0);
  if (!pending) continue;
  const related = semantic.get(`${item.kind}:${item.target_id}`) || {};
  const trusted = Number(item.trusted || 0);
  const research = Number(item.research_candidates ?? related.research_candidates ?? 0);
  migration.push({ type: 'classification-debt', id: item.zone_slug, title: item.target_title || item.zone_slug, pending_entries: pending, trusted_entries: trusted, research_candidates: research, semantic_kind: item.kind, target_id: item.target_id, priority_score: 100 + Math.min(pending, 50) + Math.min(trusted * 20, 100) + Math.min(research * 3, 30), priority_factors: ['topic-pending', trusted ? 'trusted-content' : null, research ? 'research-coverage' : null].filter(Boolean), reason: 'Topic classification debt. Trusted records rank first, then volume and available research coverage.' });
}
for (const item of coverage.growth_gap_topics || []) {
  const research = Number(item.research_candidates || 0);
  migration.push({ type: 'growth-gap', id: item.id, title: item.title, pending_entries: 0, trusted_entries: 0, research_candidates: research, semantic_kind: 'topic', canonical_id: cid('topic', item.id), priority_score: 40 + Math.min(research * 5, 40) + (Number(item.entries || 0) === 0 ? 10 : 0), priority_factors: [Number(item.entries || 0) === 0 ? 'empty-topic' : 'thin-topic', research ? 'research-coverage' : 'needs-research'], reason: 'Canonical Topic exists but still lacks sufficient useful trusted coverage.' });
}
migration.sort((a, b) => b.priority_score - a.priority_score || String(a.id).localeCompare(String(b.id)));
write('life-os/datasets/ontology-migration-queue.json', { schema_version: 1, dataset_version: config.dataset_version, summary: { classification_debt: migration.filter(x => x.type === 'classification-debt').length, growth_gaps: migration.filter(x => x.type === 'growth-gap').length, pending_entries: migration.reduce((n, x) => n + x.pending_entries, 0), trusted_pending_entries: migration.reduce((n, x) => n + (x.trusted_entries || 0), 0) }, items: migration });

const evidenceEntries = list(evidence, 'entries');
const queueItems = list(reviewQueue, 'items');
const status = item => item.status || item.evidence_state || item.evidence?.status || 'unknown';
const states = {};
for (const item of evidenceEntries) states[status(item)] = (states[status(item)] || 0) + 1;
let sensitive = 0, quantitative = 0;
const reasons = {};
for (const item of queueItems) {
  const reason = item.reason || item.priority_reason || item.editorial_priority?.factors?.join(',') || status(item);
  reasons[reason] = (reasons[reason] || 0) + 1;
  const text = JSON.stringify(item).toLowerCase();
  if (/health|mental|clinical|treatment|diagnos/.test(text)) sensitive += 1;
  if (/\b\d+(?:\.\d+)?%|percent|effect size|sample size/.test(text)) quantitative += 1;
}
const cutoff = Date.now() - Number(config.review_stale_days || 365) * 86400000;
const stale = evidenceEntries.filter(item => {
  if (!['reviewed', 'practical'].includes(status(item))) return false;
  const raw = item.reviewed_at || item.review?.reviewed_at || item.evidence?.reviewed_at;
  return raw && !Number.isNaN(Date.parse(raw)) && Date.parse(raw) < cutoff;
}).map(item => ({ id: item.id || item.slug, title: item.title || item.slug, reviewed_at: item.reviewed_at || item.review?.reviewed_at || item.evidence?.reviewed_at, status: status(item) }));
write('life-os/datasets/evidence-metrics.json', { schema_version: 1, dataset_version: config.dataset_version, review_stale_days: config.review_stale_days, current: { total_entries: evidenceEntries.length, states, review_queue: queueItems.length, restricted: states.restricted || 0, pending_review: states['pending-review'] || 0, sensitive_queue_items: sensitive, quantitative_queue_items: quantitative, stale_reviews: stale.length, evidence_decisions: (decisions.entries || []).length, priority_reasons: reasons }, stale_review_items: stale.slice(0, 100), comparison_key: config.dataset_version, note: 'Compare immutable data-v snapshots to track reviewed, removed, downgraded and queued content.' });

const apiIdentity = read(`${apiDir}/identity.json`);
apiIdentity.identities = identity.identities;
apiIdentity.aliases = aliasDoc.aliases;
apiIdentity.attribution = attribution;
write(`${apiDir}/identity.json`, apiIdentity);
write(`${apiDir}/evidence-decisions.json`, { schema_version: 1, dataset_version: config.dataset_version, attribution, items: (decisions.entries || []).map(item => ({ ...item, canonical_id: cid('evidence-decision', item.id), candidate_canonical_id: cid('research-candidate', String(item.candidate_id || '').replace(/^[^:]+:/, '')) })) });
const apiIndex = read(`${apiDir}/index.json`);
apiIndex.attribution = attribution;
apiIndex.endpoints = [...new Set([...(apiIndex.endpoints || []), 'evidence-decisions.json'])];
write(`${apiDir}/index.json`, apiIndex);
const openapi = read(`${apiDir}/openapi.json`);
openapi['x-brali-attribution'] = attribution;
openapi.paths[`/api/${config.api_version}/evidence-decisions.json`] = { get: { operationId: 'get_evidence_decisions', responses: { '200': { description: 'Reviewed source decisions', content: { 'application/json': { schema: { type: 'object' } } } } } } };
write(`${apiDir}/openapi.json`, openapi);

const datasetFiles = ['life-os/datasets/hacks.json','life-os/datasets/zones.json','life-os/datasets/metrics.json','life-os/datasets/ontology.json','life-os/datasets/ontology-coverage.json','life-os/datasets/ontology-migration-queue.json','life-os/datasets/protocols.json','life-os/datasets/evidence.json','life-os/datasets/evidence-decisions.json','life-os/datasets/evidence-metrics.json','life-os/datasets/review-queue.json','life-os/datasets/indexing.json','life-os/datasets/editorial-normalizations.json','life-os/datasets/identity.json','life-os/datasets/identity-aliases.json','life-os/datasets/retrieval-benchmark.json','data/research-queries.json','data/research-candidates.json','data/evidence-decisions.json','agents/registry.json'].filter(rel => fs.existsSync(path.join(ROOT, rel)));
const files = datasetFiles.map(rel => {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const doc = (() => { try { return JSON.parse(text); } catch { return null; } })();
  const count = Array.isArray(doc) ? doc.length : ['items','entries','protocols','candidates','queries','identities','aliases'].reduce((n, key) => n ?? (Array.isArray(doc?.[key]) ? doc[key].length : null), null);
  return { path: rel, sha256: digest(text), bytes: Buffer.byteLength(text), count };
});
const manifest = { schema_version: 2, dataset_version: config.dataset_version, api_version: config.api_version, canonical_url: 'https://brali-lifeos.github.io/life-os/datasets/manifest.json', attribution, files, counts: { files: files.length, identities: identity.identities.length, aliases: aliasDoc.aliases.length, topics: (ontology.topics || []).length, research_candidates: (candidates.candidates || []).length, evidence_entries: evidenceEntries.length, evidence_decisions: (decisions.entries || []).length } };
write('life-os/datasets/manifest.json', manifest);
write(`${apiDir}/manifest.json`, manifest);

const page = path.join(ROOT, 'life-os/datasets/index.html');
if (fs.existsSync(page)) {
  let html = fs.readFileSync(page, 'utf8');
  const links = [['ontology-migration-queue.json','Ontology migration queue'],['evidence-metrics.json','Evidence review metrics'],['identity.json','Canonical identity registry'],['identity-aliases.json','Identity aliases'],['retrieval-benchmark.json','Retrieval benchmark'],['manifest.json','Canonical dataset manifest']];
  const missing = links.filter(([file]) => !html.includes(`/life-os/datasets/${file}`));
  if (missing.length) html = html.replace('</ul>', `${missing.map(([file,label]) => `<li><a href="/life-os/datasets/${file}">${label} (JSON)</a></li>`).join('')}</ul>`);
  if (!html.includes('/api/v1/index.json')) html = html.replace('</section>', '<p><a href="/api/v1/index.json">Knowledge API v1 →</a></p></section>');
  fs.writeFileSync(page, html);
}
console.log(`platform finalized: ${identity.identities.length} identities, ${migration.length} migration items, ${files.length} manifest files, ${(decisions.entries || []).length} evidence decisions`);
