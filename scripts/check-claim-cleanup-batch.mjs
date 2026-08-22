import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadClaimCleanupHistory, publicClaimCleanupHistory } from './lib/claim-cleanup-history.mjs';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Claim cleanup batch check failed: ${message}`); };
const policy = await readJson('data/claim-cleanup-policy.json');
const decisionHistory = await loadClaimCleanupHistory(root);
const expectedPublicHistory = publicClaimCleanupHistory(decisionHistory);
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const reviewQueue = await readJson('life-os/datasets/review-queue.json');
const batch = await readJson('life-os/datasets/claim-cleanup-batch.json');
const publicHistory = await readJson('life-os/datasets/claim-cleanup-history.json');
const manifest = await readJson('life-os/datasets/manifest.json');
const apiManifest = await readJson('api/v1/manifest.json');
const datasets = await readFile(path.join(root, 'life-os/datasets/index.html'), 'utf8');
const debtBySlug = new Map((claimDebt.entries ?? []).map(entry => [entry.slug, entry]));

if (policy.schema_version !== 1 || batch.schema_version !== 2 || publicHistory.schema_version !== 1) {
  fail('unexpected policy, batch or history schema version');
}
if (batch.policy_version !== policy.schema_version) fail('policy version drift');
if (batch.selection_order !== 'canonical-review-queue') fail('selection order drift');
if (!Number.isInteger(policy.batch_size) || policy.batch_size < 1 || policy.batch_size > 10) fail('batch size must remain between 1 and 10');
if (!Number.isInteger(policy.blocked_preview_size) || policy.blocked_preview_size < 1) fail('blocked preview size is invalid');
if (JSON.stringify(publicHistory) !== JSON.stringify(expectedPublicHistory)) fail('generated cleanup history drift');
if (JSON.stringify(batch.completed_batches) !== JSON.stringify(publicHistory.batches)) fail('batch/history summary drift');
if (batch.completed_history_url !== '/life-os/datasets/claim-cleanup-history.json') fail('history URL drift');

const completedSlugs = decisionHistory.completedSlugs;
if (new Set(completedSlugs).size !== completedSlugs.length) fail('completed cleanup history contains duplicate slugs');
for (let index = 0; index < decisionHistory.batches.length; index += 1) {
  const batchRecord = decisionHistory.batches[index];
  if (batchRecord.number !== index + 1) fail(`cleanup batch numbering is not contiguous at ${batchRecord.name}`);
  if (batchRecord.document.schema_version !== 1) fail(`${batchRecord.name}: unexpected decision schema version`);
  if (!(batchRecord.document.entries?.length >= 1 && batchRecord.document.entries.length <= policy.batch_size)) {
    fail(`${batchRecord.name}: decision count must be between 1 and ${policy.batch_size}`);
  }
  if (JSON.stringify(batchRecord.document.entries.map(entry => entry.slug)) !== JSON.stringify(batchRecord.document.selection_order)) {
    fail(`${batchRecord.name}: entries do not preserve selection order`);
  }
}

const expectedSelected = [];
const expectedBlocked = [];
let eligibleTotal = 0;
for (const queueEntry of reviewQueue.entries ?? []) {
  const debt = debtBySlug.get(queueEntry.slug);
  if (!debt || !(debt.debt_reasons ?? []).length) continue;
  const actionable = debt.status === policy.actionable_rule.status
    && debt.sensitive === policy.actionable_rule.sensitive
    && Boolean(debt.source?.recorded) === policy.actionable_rule.source_recorded
    && (!policy.actionable_rule.requires_enforced_category || (debt.enforced_categories ?? []).length > 0);
  if (actionable) {
    eligibleTotal += 1;
    if (expectedSelected.length < policy.batch_size) expectedSelected.push(queueEntry.slug);
  } else if (expectedBlocked.length < policy.blocked_preview_size) {
    expectedBlocked.push(queueEntry.slug);
  }
}

const selectedSlugs = (batch.selected ?? []).map(entry => entry.slug);
const blockedSlugs = (batch.blocked_preview ?? []).map(entry => entry.slug);
if (JSON.stringify(selectedSlugs) !== JSON.stringify(expectedSelected)) {
  fail(`selected order drift: ${JSON.stringify(selectedSlugs)} != ${JSON.stringify(expectedSelected)}`);
}
if (JSON.stringify(blockedSlugs) !== JSON.stringify(expectedBlocked)) {
  fail(`blocked preview order drift: ${JSON.stringify(blockedSlugs)} != ${JSON.stringify(expectedBlocked)}`);
}
if (new Set(selectedSlugs).size !== selectedSlugs.length) fail('selected batch contains duplicates');
if (selectedSlugs.some(slug => blockedSlugs.includes(slug))) fail('selected and blocked entries overlap');
if (selectedSlugs.some(slug => completedSlugs.includes(slug))) fail('completed record returned to the next queue');

for (const entry of batch.selected ?? []) {
  if (entry.status !== 'pending-review') fail(`${entry.slug}: selected status is not pending-review`);
  if (entry.sensitive) fail(`${entry.slug}: sensitive entry cannot enter automatic practical-rewrite batch`);
  if (entry.source_recorded) fail(`${entry.slug}: recorded source requires exact source review`);
  if (!(entry.enforced_categories ?? []).length) fail(`${entry.slug}: no enforced category remains`);
  if (entry.proposed_disposition !== 'rewrite-practical-or-restrict') fail(`${entry.slug}: disposition drift`);
}
for (const entry of batch.blocked_preview ?? []) {
  if (!entry.blocked_reason) fail(`${entry.slug}: blocked entry lacks a reason`);
}

if (batch.counts?.unresolved_claim_debt !== claimDebt.counts?.debt_entries) fail('unresolved debt count drift');
if (batch.counts?.actionable_under_policy !== eligibleTotal) fail('actionable count drift');
if (batch.counts?.selected !== expectedSelected.length) fail('selected count drift');
if (batch.counts?.blocked_preview !== expectedBlocked.length) fail('blocked count drift');
if (batch.counts?.completed_total !== decisionHistory.entries.length) fail('completed total drift');
if (batch.counts?.completed_batches !== decisionHistory.batches.length) fail('completed batch count drift');
if (publicHistory.counts?.completed !== decisionHistory.entries.length || publicHistory.counts?.batches !== decisionHistory.batches.length) {
  fail('public history count drift');
}

if (manifest.schema_version !== 2 || !Array.isArray(manifest.files)) fail('dataset manifest is not finalized schema v2');
const manifestPaths = new Set(manifest.files.map(entry => entry.path));
for (const rel of [
  'life-os/datasets/claim-debt.json',
  'life-os/datasets/claim-cleanup-batch.json',
  'life-os/datasets/claim-cleanup-history.json',
  ...decisionHistory.files.map(file => file.rel),
]) {
  if (!manifestPaths.has(rel)) fail(`dataset manifest lacks ${rel}`);
}
if (manifest.counts?.files !== manifest.files.length) fail('dataset manifest file count drift');
if (manifest.counts?.claim_debt_entries !== claimDebt.counts?.debt_entries) fail('manifest claim-debt count drift');
if (manifest.counts?.claim_cleanup_selected !== expectedSelected.length) fail('manifest selected-count drift');
if (manifest.counts?.claim_cleanup_completed !== decisionHistory.entries.length) fail('manifest completed-count drift');
if (manifest.counts?.claim_cleanup_batches !== decisionHistory.batches.length) fail('manifest batch-count drift');
if (manifest.claim_cleanup_batch_schema_version !== 2 || manifest.claim_cleanup_history_schema_version !== 1) {
  fail('manifest cleanup schema marker drift');
}
if (JSON.stringify(manifest) !== JSON.stringify(apiManifest)) fail('static and API manifests differ after claim batch finalization');
for (const href of [
  '/life-os/datasets/claim-cleanup-batch.json',
  '/life-os/datasets/claim-cleanup-history.json',
  ...decisionHistory.files.map(file => `/${file.rel}`),
]) {
  if (!datasets.includes(href)) fail(`dataset catalog lacks ${href}`);
}
if (JSON.stringify(batch).includes('examples') || JSON.stringify(publicHistory).includes('examples')) {
  fail('cleanup batch/history must not republish claim-marker snippets');
}

console.log(`Claim cleanup batch verified: completed=${decisionHistory.entries.length} across ${decisionHistory.batches.length} batch(es); selected=${selectedSlugs.join(',')}; blocked-preview=${blockedSlugs.join(',')}; actionable=${eligibleTotal}.`);
