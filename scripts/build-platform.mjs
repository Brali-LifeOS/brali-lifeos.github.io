import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch (error) { if (fallback !== null) return fallback; throw error; }
};
const writeJson = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const slug = value => String(value || '').toLowerCase().replace(/^brali:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || sha256(String(value)).slice(0, 16);
const canonicalId = (kind, local) => `brali:${kind}:${slug(local)}`;
const list = (doc, key) => Array.isArray(doc) ? doc : Array.isArray(doc?.[key]) ? doc[key] : Array.isArray(doc?.entries) ? doc.entries : [];
const generatedAt = process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : null;

const config = readJson('data/platform.json');
const ontology = readJson('data/knowledge-ontology.json');
const aliasConfig = readJson('data/knowledge-aliases.json', { aliases: [] });
const protocolsDoc = readJson('life-os/datasets/protocols.json', { protocols: [] });
const evidenceDoc = readJson('life-os/datasets/evidence.json', { entries: [] });
const reviewQueueDoc = readJson('life-os/datasets/review-queue.json', []);
const coverageDoc = readJson('life-os/datasets/ontology-coverage.json', { topics: [], legacy_resolution: [] });
const candidatesDoc = readJson('data/research-candidates.json', { candidates: [] });
const hacksDoc = readJson('life-os/datasets/hacks.json', []);

const identities = [];
const seen = new Set();
const addIdentity = (kind, localId, title, extra = {}) => {
  if (!localId) return null;
  const id = canonicalId(kind, localId);
  if (seen.has(id)) return id;
  seen.add(id);
  identities.push({ id, kind, local_id: String(localId), title: title || String(localId), ...extra });
  return id;
};
for (const kind of ['domain', 'topic', 'method', 'lens']) for (const item of ontology[`${kind}s`] || []) addIdentity(kind, item.id, item.title, { status: item.status || 'active' });
for (const item of list(protocolsDoc, 'protocols')) { const local = item.protocol_id || item.id || item.slug || item.url; addIdentity('protocol', local, item.title || item.canonical_name, { legacy_ids: [item.protocol_id, item.id].filter(Boolean) }); }
for (const item of list(hacksDoc, 'hacks')) { const local = item.id || item.slug || item.url || item.title; addIdentity('hack', local, item.title || item.canonical_name, { legacy_ids: [item.id].filter(Boolean) }); }
for (const item of list(evidenceDoc, 'entries')) { const local = item.id || item.slug || item.protocol_id || item.url; addIdentity('evidence', local, item.title || item.slug || local, { evidence_state: item.status || item.evidence_state || null }); }
for (const item of list(candidatesDoc, 'candidates')) { const local = item.doi || item.source_id || item.id; addIdentity('research', local, item.title, { legacy_ids: [item.id].filter(Boolean), source: item.source }); }
identities.sort((a, b) => a.id.localeCompare(b.id));

const entityByLocal = new Map(identities.map(x => [`${x.kind}:${x.local_id}`, x.id]));
const aliases = [], aliasKeys = new Map(), kindById = new Map(identities.map(x => [x.id, x.kind]));
const addAlias = (canonical_id, language, value, type = 'alias') => {
  const normalized = String(value || '').trim(); if (!canonical_id || !normalized) return;
  const kind = kindById.get(canonical_id) || 'unknown';
  const key = `${kind}:${language}:${normalized.toLocaleLowerCase(language === 'ru' ? 'ru' : 'en')}`;
  const prior = aliasKeys.get(key);
  if (prior && prior !== canonical_id && ['domain','topic','method','lens'].includes(kind)) throw new Error(`Alias collision for ${key}: ${prior} vs ${canonical_id}`);
  if (!prior) aliasKeys.set(key, canonical_id);
  if (!aliases.some(x => x.canonical_id === canonical_id && x.language === language && x.value === normalized)) aliases.push({ canonical_id, kind, language, value: normalized, type });
};
for (const identity of identities) addAlias(identity.id, 'en', identity.title, 'label');
for (const entry of aliasConfig.aliases || []) {
  const id = entityByLocal.get(`${entry.kind}:${entry.id}`) || canonicalId(entry.kind, entry.id);
  if (!seen.has(id)) throw new Error(`Alias references unknown identity ${entry.kind}:${entry.id}`);
  addAlias(id, entry.language, entry.label, 'label'); for (const value of entry.aliases || []) addAlias(id, entry.language, value);
}
aliases.sort((a, b) => `${a.language}:${a.value}`.localeCompare(`${b.language}:${b.value}`));
writeJson('life-os/datasets/identity.json', { schema_version: 1, dataset_version: config.dataset_version, generated_at: generatedAt, identities });
writeJson('life-os/datasets/identity-aliases.json', { schema_version: 1, dataset_version: config.dataset_version, default_language: config.default_language, supported_languages: config.supported_languages, aliases });

const migration = [];
for (const item of coverageDoc.legacy_resolution || []) {
  const pending = Number(item.topic_pending ?? item.pending_entries ?? item.unresolved_entries ?? 0); if (pending <= 0) continue;
  const score = 100 + Math.min(pending, 50) + (item.semantic_kind === 'method' || item.semantic_kind === 'lens' ? 20 : 0);
  migration.push({ type: 'classification-debt', id: item.zone_id || item.slug || item.id, title: item.title || item.zone_id, pending_entries: pending, semantic_kind: item.semantic_kind || null, canonical_id: item.canonical_id || null, priority_score: score, reason: 'Legacy collection still contains records without a concrete Topic.' });
}
for (const item of coverageDoc.topics || []) {
  const state = item.coverage_state || item.status || item.topic?.status; if (state !== 'growth-gap' && state !== 'gap') continue;
  const topicId = item.topic_id || item.id || item.topic?.id;
  migration.push({ type: 'growth-gap', id: topicId, title: item.title || item.topic?.title || topicId, pending_entries: 0, semantic_kind: 'topic', canonical_id: canonicalId('topic', topicId), priority_score: 40, reason: 'Canonical Topic is intentionally present but lacks useful trusted coverage.' });
}
migration.sort((a, b) => b.priority_score - a.priority_score || String(a.id).localeCompare(String(b.id)));
writeJson('life-os/datasets/ontology-migration-queue.json', { schema_version: 1, dataset_version: config.dataset_version, generated_at: generatedAt, summary: { classification_debt: migration.filter(x => x.type === 'classification-debt').length, growth_gaps: migration.filter(x => x.type === 'growth-gap').length, pending_entries: migration.reduce((n, x) => n + x.pending_entries, 0) }, items: migration });

const evidenceEntries = list(evidenceDoc, 'entries');
const reviewItems = list(reviewQueueDoc, 'items');
const evidenceStatus = item => item.status || item.evidence_state || item.evidence?.status || 'unknown';
const stateCounts = {}; for (const item of evidenceEntries) stateCounts[evidenceStatus(item)] = (stateCounts[evidenceStatus(item)] || 0) + 1;
const queueReasons = {}; let sensitive = 0, quantitative = 0;
for (const item of reviewItems) { const reason = item.reason || item.priority_reason || evidenceStatus(item); queueReasons[reason] = (queueReasons[reason] || 0) + 1; const text = JSON.stringify(item).toLowerCase(); if (/health|mental|clinical|treatment|diagnos/.test(text)) sensitive += 1; if (/\b\d+(?:\.\d+)?%|percent|effect size|sample size/.test(text)) quantitative += 1; }
writeJson('life-os/datasets/evidence-metrics.json', { schema_version: 1, dataset_version: config.dataset_version, generated_at: generatedAt, review_stale_days: config.review_stale_days, current: { total_entries: evidenceEntries.length, states: stateCounts, review_queue: reviewItems.length, sensitive_queue_items: sensitive, quantitative_queue_items: quantitative, priority_reasons: queueReasons }, comparison_key: config.dataset_version, note: 'Compare this immutable metrics snapshot between data-v releases. Restricted and sensitive material remains highest review priority.' });

const searchDocs = [];
for (const item of ontology.topics || []) { const id = canonicalId('topic', item.id); searchDocs.push({ id, kind: 'topic', title: item.title, text: [item.title, item.description, ...aliases.filter(a => a.canonical_id === id).map(a => a.value)].join(' '), trust: 'taxonomy', topic_ids: [item.id], url: '/ontology/topics/' }); }
for (const item of list(protocolsDoc, 'protocols')) { const local = item.protocol_id || item.id || item.slug || item.url; const id = canonicalId('protocol', local); const status = evidenceStatus(item); searchDocs.push({ id, kind: 'protocol', title: item.title || item.canonical_name, text: [item.title, item.summary, item.action, item.problem, JSON.stringify(item.ontology || {})].filter(Boolean).join(' '), trust: status, topic_ids: item.ontology?.topic_ids || item.topic_ids || [], url: item.url || null }); }
const tokenize = value => String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
const search = (query, trustedOnly = false, k = 5) => {
  if (trustedOnly && /severe depression|suicid|self[- ]harm|diagnos|treat .* without/i.test(String(query))) return [];
  const stop = new Set(['how','can','i','a','the','to','and','or','without','do','my','what','is','как','и','не','лучше']); const terms = new Set(tokenize(query).filter(term => !stop.has(term)));
  return searchDocs.map(doc => { if (trustedOnly && doc.kind === 'protocol' && !['reviewed', 'practical'].includes(doc.trust)) return null; const hay = tokenize(`${doc.title} ${doc.text}`); let score = 0; for (const term of terms) if (hay.includes(term)) score += 2; for (const term of terms) if (String(doc.title).toLocaleLowerCase().includes(term)) score += 2; return score > 0 ? { ...doc, score } : null; }).filter(Boolean).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
};

const benchmark = readJson('data/retrieval-benchmark.json'); const benchmarkResults = []; let recalls = 0, precisions = 0, scored = 0;
for (const test of benchmark.cases || []) {
  const results = search(test.query, Boolean(test.trusted_only), benchmark.k || 5), got = results.map(x => x.id), expected = test.expected_ids || [];
  if (test.expect_no_answer) { const pass = expected.length === 0 && results.length === 0; benchmarkResults.push({ id: test.id, query: test.query, expected_ids: expected, result_ids: got, pass, recall_at_k: pass ? 1 : 0, precision_at_k: pass ? 1 : 0 }); recalls += pass ? 1 : 0; precisions += pass ? 1 : 0; scored += 1; continue; }
  const hits = expected.filter(id => got.includes(id)).length, recall = expected.length ? hits / expected.length : 1, precision = got.length ? hits / got.length : expected.length ? 0 : 1;
  benchmarkResults.push({ id: test.id, query: test.query, expected_ids: expected, result_ids: got, pass: recall === 1, recall_at_k: recall, precision_at_k: precision }); recalls += recall; precisions += precision; scored += 1;
}
writeJson('life-os/datasets/retrieval-benchmark.json', { schema_version: 1, dataset_version: config.dataset_version, generated_at: generatedAt, k: benchmark.k || 5, summary: { cases: scored, recall_at_k: scored ? Number((recalls / scored).toFixed(4)) : 1, precision_at_k: scored ? Number((precisions / scored).toFixed(4)) : 1, passed: benchmarkResults.filter(x => x.pass).length }, cases: benchmarkResults });

const apiDir = `api/${config.api_version}`;
const apiTopics = (ontology.topics || []).map(item => ({ canonical_id: canonicalId('topic', item.id), id: item.id, domain_id: item.domain_id, title: item.title, description: item.description, status: item.status || 'active', aliases: aliases.filter(a => a.canonical_id === canonicalId('topic', item.id)) }));
const apiProtocols = list(protocolsDoc, 'protocols').map(item => ({ ...item, canonical_id: canonicalId('protocol', item.protocol_id || item.id || item.slug || item.url) }));
const apiHacks = list(hacksDoc, 'hacks').map(item => ({ ...item, canonical_id: canonicalId('hack', item.id || item.slug || item.url || item.title) }));
const apiEvidence = evidenceEntries.map(item => ({ ...item, canonical_id: canonicalId('evidence', item.id || item.slug || item.protocol_id || item.url) }));
writeJson(`${apiDir}/topics.json`, { schema_version: 1, dataset_version: config.dataset_version, items: apiTopics }); writeJson(`${apiDir}/protocols.json`, { schema_version: 1, dataset_version: config.dataset_version, items: apiProtocols }); writeJson(`${apiDir}/hacks.json`, { schema_version: 1, dataset_version: config.dataset_version, items: apiHacks }); writeJson(`${apiDir}/evidence.json`, { schema_version: 1, dataset_version: config.dataset_version, items: apiEvidence }); writeJson(`${apiDir}/search.json`, { schema_version: 1, dataset_version: config.dataset_version, note: 'Compact client-side retrieval index. Consumers should preserve trust/evidence state.', items: searchDocs.map(({ text, ...doc }) => ({ ...doc, search_text: text })) }); writeJson(`${apiDir}/identity.json`, { schema_version: 1, dataset_version: config.dataset_version, identities, aliases });
writeJson(`${apiDir}/index.json`, { name: 'Brali Knowledge API', api_version: config.api_version, dataset_version: config.dataset_version, static_api: true, endpoints: ['topics.json', 'protocols.json', 'hacks.json', 'evidence.json', 'search.json', 'identity.json', 'manifest.json', 'openapi.json'], semantics: { lookup: 'Filter list files by canonical_id or local id.', trust: 'Only reviewed/practical protocols are normal trusted recommendations. Preserve evidence state in downstream output.', missing: 'An empty filtered result means not found; clients must not invent a match.' } });
const openapi = { openapi: '3.1.1', info: { title: 'Brali Knowledge API', version: config.dataset_version, description: 'Versioned read-only static JSON API over the canonical Brali knowledge model.' }, servers: [{ url: 'https://brali-lifeos.github.io' }], paths: {} };
for (const name of ['index', 'topics', 'protocols', 'hacks', 'evidence', 'search', 'identity', 'manifest']) openapi.paths[`/api/${config.api_version}/${name}.json`] = { get: { operationId: `get_${name}`, responses: { '200': { description: 'Static JSON response', content: { 'application/json': { schema: { type: 'object' } } } } } } }; writeJson(`${apiDir}/openapi.json`, openapi);

const datasetFiles = ['life-os/datasets/hacks.json','life-os/datasets/zones.json','life-os/datasets/metrics.json','life-os/datasets/ontology.json','life-os/datasets/ontology-coverage.json','life-os/datasets/ontology-migration-queue.json','life-os/datasets/protocols.json','life-os/datasets/evidence.json','life-os/datasets/evidence-metrics.json','life-os/datasets/review-queue.json','life-os/datasets/indexing.json','life-os/datasets/editorial-normalizations.json','life-os/datasets/identity.json','life-os/datasets/identity-aliases.json','life-os/datasets/retrieval-benchmark.json','data/research-queries.json','data/research-candidates.json','agents/registry.json'].filter(rel => fs.existsSync(path.join(ROOT, rel)));
const files = datasetFiles.map(rel => { const text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); const doc = (() => { try { return JSON.parse(text); } catch { return null; } })(); const count = Array.isArray(doc) ? doc.length : ['items','entries','protocols','candidates','queries','identities','aliases'].reduce((n, key) => n ?? (Array.isArray(doc?.[key]) ? doc[key].length : null), null); return { path: rel, sha256: sha256(text), bytes: Buffer.byteLength(text), count }; });
const manifest = { schema_version: 2, dataset_version: config.dataset_version, api_version: config.api_version, generated_at: generatedAt, canonical_url: 'https://brali-lifeos.github.io/life-os/datasets/manifest.json', files, counts: { files: files.length, identities: identities.length, aliases: aliases.length, topics: ontology.topics?.length || 0, protocols: list(protocolsDoc, 'protocols').length, evidence_entries: evidenceEntries.length, research_candidates: list(candidatesDoc, 'candidates').length } };
writeJson('life-os/datasets/manifest.json', manifest); writeJson(`${apiDir}/manifest.json`, manifest);
console.log(`platform build: ${identities.length} identities, ${aliases.length} aliases, ${migration.length} migration items, ${scored} retrieval cases, ${files.length} manifest files`);
