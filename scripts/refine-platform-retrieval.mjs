import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const slug = value => String(value || '').toLowerCase().replace(/^brali:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
const canonicalId = (kind, local) => `brali:${kind}:${slug(local)}`;
const list = (doc, key) => Array.isArray(doc) ? doc : Array.isArray(doc?.[key]) ? doc[key] : Array.isArray(doc?.entries) ? doc.entries : [];
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

const config = read('data/platform.json');
const protocolsDoc = read('life-os/datasets/protocols.json');
const searchPath = `api/${config.api_version}/search.json`;
const searchDoc = read(searchPath);
const benchmarkConfig = read('data/retrieval-benchmark.json');

const protocolById = new Map();
for (const protocol of list(protocolsDoc, 'protocols')) {
  const local = protocol.protocol_id || protocol.id || protocol.slug || protocol.url;
  protocolById.set(canonicalId('protocol', local), protocol);
}

const semanticText = ontology => [
  ...(ontology?.domains ?? []).flatMap(item => [item?.id, item?.title]),
  ...(ontology?.topics ?? []).flatMap(item => [item?.id, item?.title]),
].map(clean).filter(Boolean).join(' ');

let refinedProtocols = 0;
for (const item of searchDoc.items ?? []) {
  if (item.kind !== 'protocol') continue;
  const protocol = protocolById.get(item.id);
  if (!protocol) continue;
  item.search_text = [
    protocol.title,
    protocol.description,
    protocol.action,
    protocol.check_in,
    semanticText(protocol.ontology),
  ].map(clean).filter(Boolean).join(' ');
  refinedProtocols += 1;
}
searchDoc.retrieval_policy = {
  version: 2,
  lexical_fields: ['title', 'description', 'action', 'check_in', 'ontology.domains', 'ontology.topics'],
  excluded_from_free_text: ['ontology.methods', 'ontology.lenses', 'ontology.legacy'],
  reason: 'Legacy Method/Lens labels and compatibility navigation are structured metadata, not unrestricted lexical evidence. Excluding them prevents historical labels such as Quantum from matching unrelated scientific queries.',
};
write(searchPath, searchDoc);

const tokenize = value => String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
const stop = new Set(['how','can','i','a','the','to','and','or','without','do','my','what','is','как','и','не','лучше']);
const kindPriority = kind => kind === 'topic' ? 0 : kind === 'protocol' ? 1 : 2;
const search = (query, trustedOnly = false, k = 5) => {
  if (trustedOnly && /severe depression|suicid|self[- ]harm|diagnos|treat .* without/i.test(String(query))) return [];
  const terms = new Set(tokenize(query).filter(term => !stop.has(term)));
  return (searchDoc.items ?? []).map(doc => {
    if (trustedOnly && doc.kind === 'protocol' && !['reviewed', 'practical'].includes(doc.trust)) return null;
    const hay = tokenize(`${doc.title ?? ''} ${doc.search_text ?? ''}`);
    let score = 0;
    for (const term of terms) if (hay.includes(term)) score += 2;
    for (const term of terms) if (String(doc.title ?? '').toLocaleLowerCase().includes(term)) score += 2;
    return score > 0 ? { ...doc, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || kindPriority(a.kind) - kindPriority(b.kind) || a.id.localeCompare(b.id)).slice(0, k);
};

const results = [];
let recalls = 0;
let precisions = 0;
let scored = 0;
for (const test of benchmarkConfig.cases ?? []) {
  const found = search(test.query, Boolean(test.trusted_only), benchmarkConfig.k || 5);
  const got = found.map(item => item.id);
  const expected = test.expected_ids ?? [];
  if (test.expect_no_answer) {
    const pass = expected.length === 0 && found.length === 0;
    results.push({ id: test.id, query: test.query, expected_ids: expected, result_ids: got, pass, recall_at_k: pass ? 1 : 0, precision_at_k: pass ? 1 : 0 });
    recalls += pass ? 1 : 0;
    precisions += pass ? 1 : 0;
    scored += 1;
    continue;
  }
  const hits = expected.filter(id => got.includes(id)).length;
  const recall = expected.length ? hits / expected.length : 1;
  const precision = got.length ? hits / got.length : expected.length ? 0 : 1;
  results.push({ id: test.id, query: test.query, expected_ids: expected, result_ids: got, pass: recall === 1, recall_at_k: recall, precision_at_k: precision });
  recalls += recall;
  precisions += precision;
  scored += 1;
}

const benchmark = {
  schema_version: 2,
  dataset_version: config.dataset_version,
  k: benchmarkConfig.k || 5,
  ranking_policy: 'Lexical score first; canonical Topic wins equal-score ties over protocols. Protocol free text excludes legacy compatibility metadata and legacy Method/Lens labels.',
  summary: {
    cases: scored,
    recall_at_k: scored ? Number((recalls / scored).toFixed(4)) : 1,
    precision_at_k: scored ? Number((precisions / scored).toFixed(4)) : 1,
    passed: results.filter(item => item.pass).length,
  },
  cases: results,
};
write('life-os/datasets/retrieval-benchmark.json', benchmark);

const failed = results.filter(item => !item.pass).map(item => item.id);
console.log(`Platform retrieval refined: ${refinedProtocols} protocols; recall@${benchmark.k}=${benchmark.summary.recall_at_k}; failed=${failed.length ? failed.join(',') : 'none'}.`);
