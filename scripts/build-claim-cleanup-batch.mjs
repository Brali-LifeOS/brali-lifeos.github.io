import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const policy = await readJson('data/claim-cleanup-policy.json');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const reviewQueue = await readJson('life-os/datasets/review-queue.json');
const publicIndex = await readJson('life-os-index.json');
const indexBySlug = new Map(publicIndex.map(entry => [entry.slug, entry]));
const debtBySlug = new Map((claimDebt.entries ?? []).map(entry => [entry.slug, entry]));

function blockedReason(debt) {
  if (debt.sensitive || debt.status === 'restricted') return 'sensitive-source-review';
  if (debt.source?.recorded) return 'recorded-source-review';
  if (!(debt.enforced_categories ?? []).length) return 'monitor-only-marker';
  return 'outside-actionable-rule';
}

function decorate(queueEntry, debt) {
  const source = indexBySlug.get(queueEntry.slug) ?? {};
  return {
    slug: queueEntry.slug,
    title: source.subtitle || source.title || queueEntry.slug,
    zone: source.zone ?? { slug: debt.zone ?? null, title: debt.zone ?? null },
    status: debt.status,
    sensitive: debt.sensitive,
    source_recorded: Boolean(debt.source?.recorded),
    categories: debt.categories ?? [],
    enforced_categories: debt.enforced_categories ?? [],
    debt_reasons: debt.debt_reasons ?? [],
    editorial_priority: queueEntry.editorial_priority ?? null,
  };
}

const selected = [];
const blocked = [];
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
    if (selected.length < policy.batch_size) {
      selected.push({
        ...decorate(queueEntry, debt),
        proposed_disposition: policy.actionable_rule.proposed_disposition,
      });
    }
  } else if (blocked.length < policy.blocked_preview_size) {
    blocked.push({
      ...decorate(queueEntry, debt),
      blocked_reason: blockedReason(debt),
    });
  }
}

const report = {
  schema_version: 1,
  name: 'Brali next claim cleanup batch',
  policy_version: policy.schema_version,
  selection_order: policy.selection_order,
  purpose: policy.purpose,
  counts: {
    unresolved_claim_debt: claimDebt.counts?.debt_entries ?? 0,
    actionable_under_policy: eligibleTotal,
    selected: selected.length,
    blocked_preview: blocked.length,
  },
  guardrails: policy.guardrails,
  selected,
  blocked_preview: blocked,
};

const outputPath = path.join(root, 'life-os/datasets/claim-cleanup-batch.json');
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

const manifestPath = path.join(root, 'life-os/datasets/manifest.json');
const manifest = await readJson('life-os/datasets/manifest.json');
manifest.files = [...new Set([...(manifest.files ?? []), 'claim-cleanup-batch.json'])];
manifest.claim_cleanup_batch_schema_version = 1;
manifest.claim_cleanup_batch_counts = report.counts;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const datasetsPath = path.join(root, 'life-os/datasets/index.html');
let datasets = await readFile(datasetsPath, 'utf8');
if (!datasets.includes('/life-os/datasets/claim-cleanup-batch.json')) {
  const item = '<li><a href="/life-os/datasets/claim-cleanup-batch.json">Next claim cleanup batch (JSON)</a></li>';
  datasets = datasets.replace('</ul>', `${item}</ul>`);
  await writeFile(datasetsPath, datasets);
}

console.log(`Claim cleanup selector: unresolved=${report.counts.unresolved_claim_debt}; actionable=${eligibleTotal}; selected=${selected.length}; blocked-preview=${blocked.length}.`);
for (const [index, entry] of selected.entries()) {
  console.log(`CLAIM_CLEANUP_SELECTED ${index + 1} | ${entry.slug} | ${entry.status} | ${entry.enforced_categories.join(',')} | score=${entry.editorial_priority?.score ?? 0}`);
}
for (const [index, entry] of blocked.entries()) {
  console.log(`CLAIM_CLEANUP_BLOCKED ${index + 1} | ${entry.slug} | ${entry.blocked_reason} | ${entry.status} | score=${entry.editorial_priority?.score ?? 0}`);
}
