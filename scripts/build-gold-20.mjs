import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const candidates = await readJson('data/gold-20-candidates.json');
const reviews = await readJson('data/gold-20-reviews.json');
const reviewSchema = await readJson('contracts/gold-protocol-review.schema.json');
const protocols = await readJson('life-os/datasets/protocols.json');
const evidence = await readJson('life-os/datasets/evidence.json');
const decisions = await readJson('life-os/datasets/evidence-decisions.json');

const protocolBySlug = new Map((protocols.entries ?? []).map(entry => [entry.slug, entry]));
const evidenceBySlug = new Map((evidence.entries ?? []).map(entry => [entry.slug, entry]));
const decisionIdsByProtocol = new Map();
for (const decision of decisions.entries ?? []) {
  for (const protocolId of decision.target_protocol_ids ?? []) {
    if (!decisionIdsByProtocol.has(protocolId)) decisionIdsByProtocol.set(protocolId, []);
    decisionIdsByProtocol.get(protocolId).push(decision.id);
  }
}

function present(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

function missingReviewFields(review) {
  if (!review) return [...reviewSchema.required];
  return reviewSchema.required.filter(field => !present(review[field]));
}

const entries = [];
for (const candidate of candidates.candidates ?? []) {
  const protocol = protocolBySlug.get(candidate.slug);
  if (!protocol) throw new Error(`Gold candidate is not present in trusted Protocol Feed: ${candidate.slug}`);
  const trust = evidenceBySlug.get(candidate.slug);
  if (!trust?.indexable || !['reviewed', 'practical'].includes(trust.status)) {
    throw new Error(`Gold candidate does not meet the trusted discovery bar: ${candidate.slug}`);
  }
  const review = reviews.entries?.[candidate.slug] ?? null;
  const missing = missingReviewFields(review);
  if (review && review.slug !== candidate.slug) throw new Error(`Gold review slug mismatch: ${candidate.slug}`);
  if (review && review.protocol_id !== protocol.protocol_id) throw new Error(`Gold review protocol_id mismatch: ${candidate.slug}`);
  if (review?.review_status === 'gold-ready' && missing.length) {
    throw new Error(`Gold-ready review is incomplete for ${candidate.slug}: ${missing.join(', ')}`);
  }
  if (review?.evidence_boundary?.status && review.evidence_boundary.status !== trust.status) {
    throw new Error(`Gold review evidence-state drift for ${candidate.slug}: ${review.evidence_boundary.status}/${trust.status}`);
  }
  const decisionIds = [...new Set(decisionIdsByProtocol.get(protocol.protocol_id) ?? [])].sort();
  const goldReady = review?.review_status === 'gold-ready' && missing.length === 0;
  entries.push({
    rank: candidate.rank,
    slug: candidate.slug,
    protocol_id: protocol.protocol_id,
    title: protocol.title,
    url: protocol.url,
    cluster: candidate.cluster,
    user_problem_hypothesis: candidate.problem,
    selection_reasons: candidate.selection_reasons,
    evidence_status: trust.status,
    evidence_source_url: trust.status === 'reviewed' ? (trust.source?.url ?? null) : null,
    evidence_decision_ids: decisionIds,
    manual_review_status: review?.review_status ?? 'not-reviewed',
    gold_ready: goldReady,
    missing_contract_fields: missing,
  });
}

entries.sort((a, b) => a.rank - b.rank);
const output = {
  schema_version: 1,
  name: 'Brali Gold 20 readiness registry',
  status: 'candidate-selection',
  target_count: candidates.target_count,
  candidate_count: entries.length,
  gold_ready_count: entries.filter(entry => entry.gold_ready).length,
  rework_count: entries.filter(entry => entry.manual_review_status === 'rework').length,
  rejected_count: entries.filter(entry => entry.manual_review_status === 'reject').length,
  observed_user_demand_available: candidates.observed_user_demand_available,
  selection_note: candidates.selection_note,
  contract_url: 'https://brali-lifeos.github.io/contracts/gold-protocol-review.schema.json',
  entries,
};

await mkdir(path.join(root, 'life-os/datasets'), { recursive: true });
await writeFile(path.join(root, 'life-os/datasets/gold-20.json'), JSON.stringify(output, null, 2));

const manifestPath = path.join(root, 'life-os/datasets/manifest.json');
const manifest = await readJson('life-os/datasets/manifest.json');
manifest.files = [...new Set([...(manifest.files ?? []), 'gold-20.json'])];
manifest.gold_20 = {
  schema_version: output.schema_version,
  target_count: output.target_count,
  candidate_count: output.candidate_count,
  gold_ready_count: output.gold_ready_count,
  observed_user_demand_available: output.observed_user_demand_available,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPath = path.join(root, 'life-os/datasets/index.html');
let datasetsHtml = await readFile(datasetsPath, 'utf8');
if (!datasetsHtml.includes('/life-os/datasets/gold-20.json')) {
  datasetsHtml = datasetsHtml.replace('</ul>', '<li><a href="/life-os/datasets/gold-20.json">Gold 20 candidate readiness (JSON)</a></li></ul>');
  await writeFile(datasetsPath, datasetsHtml);
}

console.log(`Gold 20 readiness built: ${output.candidate_count} candidates; ${output.gold_ready_count} Gold-ready; observed user demand=${output.observed_user_demand_available}.`);
