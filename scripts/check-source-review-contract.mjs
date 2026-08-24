import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProtocolOverrides } from './lib/protocol-overrides.mjs';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Source review contract check failed: ${message}`); };
const decisions = await readJson('data/source-review-decisions-batch-1.json');
const evidence = await readJson('life-os/datasets/evidence.json');
const protocols = await readJson('life-os/datasets/protocols.json');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const indexing = await readJson('life-os/datasets/indexing.json');
const overrides = await loadProtocolOverrides(root);
const reportPage = await readFile(path.join(root, 'quality/source-reviews/index.html'), 'utf8');

if (decisions.schema_version !== 1 || decisions.batch_id !== 'source-review-2026-08-22-01') fail('batch identity drift');
if (decisions.reviewed_at !== '2026-08-22' || !(decisions.method?.length >= 100)) fail('review method or date drift');
if (decisions.summary?.decisions !== 4 || decisions.entries?.length !== 4) fail('first source batch must contain four decisions');
if (decisions.summary?.promoted_to_reviewed !== 0 || decisions.summary?.rewritten_keep_practical !== 4) fail('summary disposition drift');

const slugs = decisions.entries.map(entry => entry.slug);
const ids = decisions.entries.map(entry => entry.decision_id);
if (new Set(slugs).size !== slugs.length || new Set(ids).size !== ids.length) fail('decision identifiers must be unique');
const evidenceBySlug = new Map((evidence.entries ?? []).map(entry => [entry.slug, entry]));
const protocolBySlug = new Map((protocols.entries ?? []).map(entry => [entry.slug, entry]));
const debtSlugs = new Set((claimDebt.entries ?? []).map(entry => entry.slug));
const indexable = new Set(indexing.indexable ?? []);
const reviewBases = new Set(['full-open-access-article', 'article-level-method-and-results-review']);

for (const entry of decisions.entries) {
  if (!/^brali:source-review:[a-z0-9-]+$/.test(entry.decision_id ?? '')) fail(`${entry.slug}: invalid decision_id`);
  if (entry.previous_status !== 'practical' || entry.disposition !== 'rewrite-keep-practical' || entry.resulting_status !== 'practical') {
    fail(`${entry.slug}: unexpected trust disposition`);
  }
  if (!(entry.source?.title?.length >= 30) || !(entry.source?.authors?.length >= 2)) fail(`${entry.slug}: incomplete source identity`);
  if (!(entry.source?.year >= 1900 && entry.source.year <= 2026)) fail(`${entry.slug}: invalid source year`);
  if (!/^10\.[0-9]{4,9}\/.+/.test(entry.source?.doi ?? '')) fail(`${entry.slug}: invalid DOI`);
  if (entry.source.url !== `https://doi.org/${entry.source.doi}`) fail(`${entry.slug}: DOI URL drift`);
  if (!reviewBases.has(entry.source.review_basis)) fail(`${entry.slug}: invalid review basis`);
  if (!(entry.supported_claim?.length >= 80)) fail(`${entry.slug}: supported claim is too weak`);
  if (!(entry.does_not_support?.length >= 3) || !(entry.limitations?.length >= 3)) fail(`${entry.slug}: source boundary is incomplete`);
  if (!(entry.public_change?.length >= 70) || !(entry.editorial_reason?.length >= 80)) fail(`${entry.slug}: editorial rationale is incomplete`);

  const override = overrides.entries?.[entry.slug];
  if (!override || override.evidence_status !== 'practical') fail(`${entry.slug}: missing practical override`);
  if (override.title !== entry.title || !(override.forbidden_public_fragments?.length >= 4)) fail(`${entry.slug}: public rewrite contract drift`);

  const trust = evidenceBySlug.get(entry.slug);
  if (!trust || trust.status !== 'practical' || trust.indexable !== true) fail(`${entry.slug}: effective trust record is not indexable practical`);
  if ((trust.claims?.enforcedCategories ?? []).length !== 0) fail(`${entry.slug}: enforced claim markers remain`);
  if (debtSlugs.has(entry.slug) || !indexable.has(entry.slug)) fail(`${entry.slug}: debt/indexing parity failed`);

  const protocol = protocolBySlug.get(entry.slug);
  if (!protocol || protocol.title !== entry.title || protocol.evidence_state !== 'practical') fail(`${entry.slug}: trusted feed parity failed`);

  for (const marker of [entry.slug, entry.source.doi, entry.title]) {
    if (!reportPage.includes(marker)) fail(`${entry.slug}: public report lacks ${marker}`);
  }
}

for (const marker of [
  'data-decisions="4"',
  'data-promoted="0"',
  'data-rewritten="4"',
  'Rewrite · keep practical',
  '/data/source-review-decisions-batch-1.json',
  'All four records remain <code>practical</code>',
]) {
  if (!reportPage.includes(marker)) fail(`public report lacks ${marker}`);
}
if (/data-promoted="[1-9]/.test(reportPage)) fail('public report implies a reviewed promotion');

console.log(`Source review contract verified: ${decisions.entries.length} decisions; promoted=0; rewritten-practical=4; all indexable, debt-free and present in the trusted feed.`);
