import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyEvidence } from './lib/content-trust.mjs';
import { loadKnowledgeOntology } from './lib/knowledge-ontology.mjs';

const root = process.cwd();
const contentRoot = path.join(root, 'data/life-os-content');
const outputRoot = path.join(root, 'life-os/datasets');
const index = JSON.parse(await readFile(path.join(contentRoot, 'index.json'), 'utf8'));
const overrides = JSON.parse(await readFile(path.join(root, 'data/evidence-overrides.json'), 'utf8'));
const evidenceDecisions = JSON.parse(await readFile(path.join(root, 'data/evidence-decisions.json'), 'utf8'));
const { classifyRecord } = await loadKnowledgeOntology(root);
const knownSlugs = new Set(index.map((entry) => entry.slug));
const allowedStatuses = new Set(['reviewed', 'practical', 'pending-review', 'restricted']);

for (const [slug, override] of Object.entries(overrides.entries ?? {})) {
  if (!knownSlugs.has(slug)) throw new Error(`Evidence override references unknown entry: ${slug}`);
  if (!allowedStatuses.has(override.status)) throw new Error(`Evidence override has invalid status for ${slug}: ${override.status}`);
  if (!override.reviewed_at || !override.reviewed_by) {
    throw new Error(`Evidence override for ${slug} must record reviewed_at and reviewed_by.`);
  }
}

const records = [];
for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), 'utf8'));
  const trustRecord = classifyEvidence(article, entry, overrides);
  const record = { ...trustRecord, ontology: classifyRecord(article, entry.zone.slug) };
  const manual = overrides.entries?.[entry.slug];
  if (manual?.status === 'practical' && (record.claims.evidenceLanguage || record.claims.enforced)) {
    throw new Error(`Cannot mark ${entry.slug} practical while evidence-like or enforced claim markers remain in the effective source record.`);
  }
  if (manual?.status === 'reviewed' && (record.claims.evidenceLanguage || record.claims.enforced || record.sensitive) && !record.source.recorded) {
    throw new Error(`Cannot mark ${entry.slug} reviewed without a usable source while evidence, claim, or sensitive-content review is required.`);
  }
  records.push(record);
}
records.sort((a, b) => a.slug.localeCompare(b.slug));

const counts = records.reduce((acc, record) => {
  acc[record.status] = (acc[record.status] ?? 0) + 1;
  return acc;
}, {});
const ontologyCoverage = {
  domain_mapped: records.filter((record) => record.ontology?.domains?.length).length,
  topic_mapped: records.filter((record) => record.ontology?.topics?.length).length,
  topic_pending: records.filter((record) => record.ontology?.classification_status === 'topic-pending').length,
  method_tagged: records.filter((record) => record.ontology?.methods?.length).length,
  lens_tagged: records.filter((record) => record.ontology?.lenses?.length).length,
};

function withEditorialPriority(record) {
  let score = record.status === 'restricted' ? 200 : 50;
  const factors = [record.status];

  if (record.sensitive) {
    score += 40;
    factors.push('sensitive-topic');
  }
  if (record.claims.quantitative) {
    score += 30;
    factors.push('quantitative-claims');
  }
  if (record.claims.enforced) {
    score += 25;
    factors.push('enforced-claim-marker');
    factors.push(...(record.claims.categories || []).map(category => `claim:${category}`));
  }
  if (record.claims.evidenceLanguage) {
    score += 20;
    factors.push('evidence-language');
  }
  if (!record.source.recorded) {
    score += 15;
    factors.push('no-usable-source');
  } else if (record.status === 'pending-review') {
    score += 5;
    factors.push('source-recorded-not-reviewed');
  }
  if (record.ontology?.classification_status === 'topic-pending') {
    factors.push('topic-classification-pending');
  }

  return { ...record, editorial_priority: { score, factors: [...new Set(factors)] } };
}

const queue = records
  .filter((record) => record.status === 'restricted' || record.status === 'pending-review')
  .map(withEditorialPriority)
  .sort((a, b) => (b.editorial_priority.score - a.editorial_priority.score) || a.slug.localeCompare(b.slug));

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, 'evidence.json'), JSON.stringify({
  schema_version: 2,
  name: 'Brali Growth Library evidence index',
  statuses: ['reviewed', 'practical', 'pending-review', 'restricted'],
  counts,
  ontology_coverage: ontologyCoverage,
  entries: records,
}, null, 2));
await writeFile(path.join(outputRoot, 'review-queue.json'), JSON.stringify({
  schema_version: 3,
  name: 'Brali Growth Library evidence review queue',
  priority: 'Restricted entries always rank ahead of pending-review entries. Within those groups, sensitive topic, quantitative claims, enforced claim markers, evidence-like language, and missing usable sources raise editorial priority. Ontology classification gaps are exposed as factors but do not alter evidence priority by themselves.',
  priority_model: {
    version: 3,
    purpose: 'Editorial triage only; the score is not a clinical-risk or evidence-strength measure.',
    weights: {
      restricted: 200,
      pending_review: 50,
      sensitive_topic: 40,
      quantitative_claims: 30,
      enforced_claim_marker: 25,
      evidence_language: 20,
      no_usable_source: 15,
      source_recorded_not_reviewed: 5,
      topic_classification_pending: 0
    }
  },
  ontology_coverage: ontologyCoverage,
  entries: queue,
}, null, 2));
await writeFile(path.join(outputRoot, 'evidence-decisions.json'), JSON.stringify({
  schema_version: 1,
  name: 'Brali Evidence Decisions',
  description: evidenceDecisions.description,
  count: (evidenceDecisions.entries ?? []).length,
  entries: evidenceDecisions.entries ?? [],
}, null, 2));

const manifestPath = path.join(outputRoot, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.files = [...new Set([...(manifest.files ?? []), 'evidence.json', 'review-queue.json', 'evidence-decisions.json'])];
manifest.evidence_status_counts = counts;
manifest.evidence_ontology_coverage = ontologyCoverage;
manifest.evidence_decision_count = (evidenceDecisions.entries ?? []).length;
manifest.review_queue_schema_version = 3;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPage = path.join(root, 'life-os/datasets/index.html');
let html = await readFile(datasetsPage, 'utf8');
if (!html.includes('/life-os/datasets/evidence.json')) {
  html = html.replace('</ul>', '<li><a href="/life-os/datasets/evidence.json">Evidence status index (JSON)</a></li><li><a href="/life-os/datasets/review-queue.json">Evidence review queue (JSON)</a></li></ul>');
}
if (!html.includes('/life-os/datasets/evidence-decisions.json')) {
  html = html.replace('</ul>', '<li><a href="/life-os/datasets/evidence-decisions.json">Evidence decisions (JSON)</a></li></ul>');
}
await writeFile(datasetsPage, html);

console.log(`Evidence index generated: ${records.length} entries; ${queue.length} queued; ${ontologyCoverage.topic_mapped} topic-mapped, ${ontologyCoverage.topic_pending} topic-pending; ${(evidenceDecisions.entries ?? []).length} evidence decision(s) published.`);
