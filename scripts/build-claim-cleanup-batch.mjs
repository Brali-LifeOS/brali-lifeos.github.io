import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadClaimCleanupHistory, publicClaimCleanupHistory } from './lib/claim-cleanup-history.mjs';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const policy = await readJson('data/claim-cleanup-policy.json');
const history = await loadClaimCleanupHistory(root);
const publicHistory = publicClaimCleanupHistory(history);
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
  schema_version: 2,
  name: 'Brali next claim cleanup batch',
  policy_version: policy.schema_version,
  selection_order: policy.selection_order,
  purpose: policy.purpose,
  counts: {
    unresolved_claim_debt: claimDebt.counts?.debt_entries ?? 0,
    actionable_under_policy: eligibleTotal,
    selected: selected.length,
    blocked_preview: blocked.length,
    completed_total: history.entries.length,
    completed_batches: history.batches.length,
  },
  guardrails: policy.guardrails,
  completed_history_url: '/life-os/datasets/claim-cleanup-history.json',
  completed_batches: publicHistory.batches,
  selected,
  blocked_preview: blocked,
};

const outputPath = path.join(root, 'life-os/datasets/claim-cleanup-batch.json');
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  path.join(root, 'life-os/datasets/claim-cleanup-history.json'),
  `${JSON.stringify(publicHistory, null, 2)}\n`,
);

const countDocument = document => {
  if (Array.isArray(document)) return document.length;
  for (const key of ['items', 'entries', 'protocols', 'candidates', 'queries', 'identities', 'aliases', 'batches']) {
    if (Array.isArray(document?.[key])) return document[key].length;
  }
  return null;
};
const manifestEntry = async rel => {
  const text = await readFile(path.join(root, rel), 'utf8');
  const document = JSON.parse(text);
  return {
    path: rel,
    sha256: crypto.createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text),
    count: countDocument(document),
  };
};

const manifest = await readJson('life-os/datasets/manifest.json');
if (manifest.schema_version !== 2 || !Array.isArray(manifest.files)) {
  throw new Error('Claim cleanup batch requires the finalized schema-v2 dataset manifest.');
}
const manifestPaths = [
  'life-os/datasets/claim-debt.json',
  'life-os/datasets/claim-cleanup-batch.json',
  'life-os/datasets/claim-cleanup-history.json',
  ...history.files.map(file => file.rel),
];
const additions = await Promise.all(manifestPaths.map(manifestEntry));
const byPath = new Map(manifest.files.map(entry => [entry.path, entry]));
for (const entry of additions) byPath.set(entry.path, entry);
manifest.files = [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
manifest.counts ||= {};
manifest.counts.files = manifest.files.length;
manifest.counts.claim_debt_entries = claimDebt.counts?.debt_entries ?? 0;
manifest.counts.claim_cleanup_selected = report.counts.selected;
manifest.counts.claim_cleanup_completed = history.entries.length;
manifest.counts.claim_cleanup_batches = history.batches.length;
manifest.claim_cleanup_batch_schema_version = report.schema_version;
manifest.claim_cleanup_history_schema_version = publicHistory.schema_version;
manifest.claim_cleanup_batch_counts = report.counts;
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(root, 'life-os/datasets/manifest.json'), manifestText);
await writeFile(path.join(root, 'api/v1/manifest.json'), manifestText);

const datasetsPath = path.join(root, 'life-os/datasets/index.html');
let datasets = await readFile(datasetsPath, 'utf8');
const requiredLinks = [
  ['/life-os/datasets/claim-cleanup-batch.json', 'Next claim cleanup batch (JSON)'],
  ['/life-os/datasets/claim-cleanup-history.json', 'Completed claim cleanup history (JSON)'],
  ...history.files.map(file => [
    `/${file.rel}`,
    `Completed claim cleanup batch ${file.number} decisions (JSON)`,
  ]),
];
for (const [href, label] of requiredLinks) {
  if (!datasets.includes(href)) {
    datasets = datasets.replace('</ul>', `<li><a href="${href}">${label}</a></li></ul>`);
  }
}
await writeFile(datasetsPath, datasets);

console.log(`Claim cleanup selector: unresolved=${report.counts.unresolved_claim_debt}; actionable=${eligibleTotal}; selected=${selected.length}; blocked-preview=${blocked.length}; completed=${history.entries.length} across ${history.batches.length} batch(es).`);
for (const [index, entry] of selected.entries()) {
  console.log(`CLAIM_CLEANUP_SELECTED ${index + 1} | ${entry.slug} | ${entry.status} | ${entry.enforced_categories.join(',')} | score=${entry.editorial_priority?.score ?? 0}`);
}
for (const [index, entry] of blocked.entries()) {
  console.log(`CLAIM_CLEANUP_BLOCKED ${index + 1} | ${entry.slug} | ${entry.blocked_reason} | ${entry.status} | score=${entry.editorial_priority?.score ?? 0}`);
}
