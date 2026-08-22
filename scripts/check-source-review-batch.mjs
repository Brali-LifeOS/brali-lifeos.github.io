import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProtocolOverrides } from './lib/protocol-overrides.mjs';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Source review batch check failed: ${message}`); };

const decisions = await readJson('data/source-review-decisions-batch-1.json');
const evidence = await readJson('life-os/datasets/evidence.json');
const protocols = await readJson('life-os/datasets/protocols.json');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const indexing = await readJson('life-os/datasets/indexing.json');
const overrides = await loadProtocolOverrides(root);
const reportPage = await readFile(path.join(root, 'quality/source-reviews/index.html'), 'utf8');

if (decisions.schema_version !== 1) fail(`unexpected schema_version ${decisions.schema_version}`);
if (decisions.batch_id !== 'source-review-2026-08-22-01') fail('batch identity drift');
if (decisions.reviewed_at !== '2026-08-22') fail('review date drift');
if (!(decisions.method?.length >= 100)) fail('method statement is too weak');
if (decisions.summary?.decisions !== 4 || decisions.entries?.length !== 4) fail('the first batch must contain four decisions');
if (decisions.summary?.promoted_to_reviewed !== 0) fail('batch claims an unsupported promotion');
if (decisions.summary?.rewritten_keep_practical !== 4) fail('batch rewrite count drift');

const slugs = decisions.entries.map(entry => entry.slug);
const decisionIds = decisions.entries.map(entry => entry.decision_id);
if (new Set(slugs).size !== slugs.length) fail('duplicate reviewed slug');
if (new Set(decisionIds).size !== decisionIds.length) fail('duplicate decision_id');

const evidenceBySlug = new Map((evidence.entries ?? []).map(entry => [entry.slug, entry]));
const protocolBySlug = new Map((protocols.entries ?? []).map(entry => [entry.slug, entry]));
const debtSlugs = new Set((claimDebt.entries ?? []).map(entry => entry.slug));
const indexable = new Set(indexing.indexable ?? []);
const allowedDisposition = new Set(['rewrite-keep-practical', 'keep-practical', 'rewrite-reviewed', 'reject', 'watch']);
const allowedBasis = new Set(['full-open-access-article', 'article-level-method-and-results-review']);

for (const entry of decisions.entries) {
  if (!/^brali:source-review:[a-z0-9-]+$/.test(entry.decision_id ?? '')) fail(`${entry.slug}: invalid decision_id`);
  if (!allowedDisposition.has(entry.disposition)) fail(`${entry.slug}: invalid disposition ${entry.disposition}`);
  if (entry.disposition !== 'rewrite-keep-practical' || entry.resulting_status !== 'practical') fail(`${entry.slug}: this batch must remain practical`);
  if (!(entry.source?.title?.length >= 30)) fail(`${entry.slug}: source title is missing`);
  if (!(entry.source?.authors?.length >= 2)) fail(`${entry.slug}: source authors are incomplete`);
  if (!(entry.source?.year >= 1900 && entry.source.year <= 2026)) fail(`${entry.slug}: invalid source year`);
  if (!/^10\.[0-9]{4,9}\/.+/.test(entry.source?.doi ?? '')) fail(`${entry.slug}: invalid DOI`);
  if (entry.source?.url !== `https://doi.org/${entry.source.doi}`) fail(`${entry.slug}: canonical DOI URL drift`);
  if (!allowedBasis.has(entry.source?.review_basis)) fail(`${entry.slug}: unsupported review basis`);
  if (!(entry.supported_claim?.length >= 80)) fail(`${entry.slug}: supported claim is too vague`);
  if (!(entry.does_not_support?.length >= 3)) fail(`${entry.slug}: unsupported claim boundary is incomplete`);
  if (!(entry.limitations?.length >= 3)) fail(`${entry.slug}: limitations are incomplete`);
  if (!(entry.public_change?.length >= 70)) fail(`${entry.slug}: public change is too vague`);
  if (!(entry.editorial_reason?.length >= 80)) fail(`${entry.slug}: editorial reason is too vague`);

  const override = overrides.entries?.[entry.slug];
  if (!override) fail(`${entry.slug}: missing protocol content override`);
  if (override.evidence_status !== 'practical') fail(`${entry.slug}: override is not practical`);
  if (override.title !== entry.title) fail(`${entry.slug}: decision and public title differ`);
  if (!(override.forbidden_public_fragments?.length >= 4)) fail(`${entry.slug}: insufficient wording regression fragments`);

  const trust = evidenceBySlug.get(entry.slug);
  if (!trust) fail(`${entry.slug}: missing effective evidence record`);
  if (trust.status !== 'practical' || trust.indexable !== true) fail(`${entry.slug}: effective record is not indexable practical`);
  if ((trust.claims?.enforcedCategories ?? []).length !== 0) {
    fail(`${entry.slug}: enforced claim markers remain: ${JSON.stringify(trust.claims.enforcedCategories)}`);
  }
  if (debtSlugs.has(entry.slug)) fail(`${entry.slug}: source-reviewed rewrite remains in claim debt`);
  if (!indexable.has(entry.slug)) fail(`${entry.slug}: missing from indexable set`);

  const protocol = protocolBySlug.get(entry.slug);
  if (!protocol) fail(`${entry.slug}: missing from trusted Protocol Feed`);
  if (protocol.title !== entry.title) fail(`${entry.slug}: Protocol Feed title drift`);
  if (protocol.evidence_state !== 'practical') fail(`${entry.slug}: Protocol Feed evidence state drift`);

  for (const marker of [entry.slug, entry.source.doi, entry.title, entry.disposition]) {
    if (!reportPage.includes(marker)) fail(`${entry.slug}: public report lacks ${marker}`);
  }
}

for (const marker of [
  'data-decisions="4"',
  'data-promoted="0"',
  'data-rewritten="4"',
  '/data/source-review-decisions-batch-1.json',
  'All four records remain <code>practical</code>',
]) {
  if (!reportPage.includes(marker)) fail(`public report lacks ${marker}`);
}
if (/promoted to reviewed[^<]*[1-9]/i.test(reportPage)) fail('public report implies a reviewed promotion');

console.log(`Source review batch verified: ${decisions.entries.length} decisions; promoted=0; rewritten-practical=4; all indexable, debt-free and present in the trusted feed.`);
