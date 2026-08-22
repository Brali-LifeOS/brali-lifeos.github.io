import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Claim cleanup batch check failed: ${message}`); };
const policy = await readJson('data/claim-cleanup-policy.json');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const reviewQueue = await readJson('life-os/datasets/review-queue.json');
const batch = await readJson('life-os/datasets/claim-cleanup-batch.json');
const manifest = await readJson('life-os/datasets/manifest.json');
const datasets = await readFile(path.join(root, 'life-os/datasets/index.html'), 'utf8');
const debtBySlug = new Map((claimDebt.entries ?? []).map(entry => [entry.slug, entry]));

if (policy.schema_version !== 1 || batch.schema_version !== 1) fail('unexpected policy or batch schema version');
if (batch.policy_version !== policy.schema_version) fail('policy version drift');
if (batch.selection_order !== 'canonical-review-queue') fail('selection order drift');
if (!Number.isInteger(policy.batch_size) || policy.batch_size < 1 || policy.batch_size > 10) fail('batch size must remain between 1 and 10');
if (!Number.isInteger(policy.blocked_preview_size) || policy.blocked_preview_size < 1) fail('blocked preview size is invalid');

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
if (!manifest.files?.includes('claim-cleanup-batch.json')) fail('dataset manifest lacks claim cleanup batch');
if (manifest.claim_cleanup_batch_schema_version !== 1) fail('dataset manifest schema marker drift');
if (!datasets.includes('/life-os/datasets/claim-cleanup-batch.json')) fail('dataset catalog lacks claim cleanup batch');
if (JSON.stringify(batch).includes('examples')) fail('batch must not republish claim-marker snippets');

console.log(`Claim cleanup batch verified: selected=${selectedSlugs.join(',')}; blocked-preview=${blockedSlugs.join(',')}; actionable=${eligibleTotal}.`);
