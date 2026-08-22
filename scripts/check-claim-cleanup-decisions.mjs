import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProtocolOverrides } from './lib/protocol-overrides.mjs';
import { loadClaimCleanupHistory } from './lib/claim-cleanup-history.mjs';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Claim cleanup decision check failed: ${message}`); };
const sorted = values => [...values].sort((left, right) => left.localeCompare(right));
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

const history = await loadClaimCleanupHistory(root);
const policy = await readJson('data/claim-cleanup-policy.json');
const evidence = await readJson('life-os/datasets/evidence.json');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const protocols = await readJson('life-os/datasets/protocols.json');
const indexing = await readJson('life-os/datasets/indexing.json');
const registry = await loadProtocolOverrides(root);

if (history.batches.length < 1) fail('at least one completed cleanup batch is required');
if (new Set(history.completedSlugs).size !== history.completedSlugs.length) fail('completed cleanup slugs must be globally unique');

const evidenceBySlug = new Map((evidence.entries ?? []).map(entry => [entry.slug, entry]));
const claimDebtBySlug = new Map((claimDebt.entries ?? []).map(entry => [entry.slug, entry]));
const feedBySlug = new Map((protocols.entries ?? []).map(entry => [entry.slug, entry]));
const indexable = new Set(indexing.indexable ?? []);

for (const batchRecord of history.batches) {
  const decisions = batchRecord.document;
  if (decisions.schema_version !== 1) fail(`${batchRecord.name}: unexpected schema version ${decisions.schema_version}`);
  if (!/^claim-cleanup-\d{4}-\d{2}-\d{2}-\d{2}$/.test(decisions.batch_id ?? '')) fail(`${batchRecord.name}: batch identity drift`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decisions.selected_at ?? '')) fail(`${batchRecord.name}: selection date drift`);
  if (!(decisions.entries?.length >= 1 && decisions.entries.length <= policy.batch_size)) {
    fail(`${batchRecord.name}: completed records must be between 1 and ${policy.batch_size}`);
  }
  if (new Set(decisions.selection_order ?? []).size !== decisions.selection_order.length) fail(`${batchRecord.name}: duplicate selection slugs`);
  if (JSON.stringify(decisions.entries.map(entry => entry.slug)) !== JSON.stringify(decisions.selection_order)) {
    fail(`${batchRecord.name}: decision entries do not preserve canonical selection order`);
  }
  if (decisions.observed_initial_queue?.selected !== decisions.entries.length) fail(`${batchRecord.name}: observed selected count drift`);
  if (!(decisions.observed_initial_queue?.blocked_preview >= 0)) fail(`${batchRecord.name}: blocked preview observation is missing`);
  if (!(decisions.selection_basis?.length >= 60)) fail(`${batchRecord.name}: selection basis is too weak`);
  if (!(decisions.guardrail?.length >= 60)) fail(`${batchRecord.name}: guardrail is too weak`);

  for (const decision of decisions.entries) {
    if (decision.previous_status !== 'pending-review') fail(`${decision.slug}: previous status drift`);
    if (!(decision.previous_enforced_categories?.length > 0)) fail(`${decision.slug}: previous enforced categories are missing`);
    if (decision.previous_source_recorded !== false) fail(`${decision.slug}: source boundary drift`);
    if (decision.disposition !== 'rewrite-practical') fail(`${decision.slug}: unsupported disposition ${decision.disposition}`);
    if (!(decision.decision?.length >= 80)) fail(`${decision.slug}: decision rationale is too short`);
    if (!(decision.resulting_topics?.length >= 1)) fail(`${decision.slug}: resulting Topics are missing`);

    const override = registry.entries?.[decision.slug];
    if (!override) fail(`${decision.slug}: missing protocol content override`);
    if (override.evidence_status !== 'practical') fail(`${decision.slug}: protocol override is not practical`);
    if (!(override.forbidden_public_fragments?.length >= 4)) fail(`${decision.slug}: insufficient regression fragments`);

    const trust = evidenceBySlug.get(decision.slug);
    if (!trust) fail(`${decision.slug}: missing evidence record`);
    if (trust.status !== 'practical' || trust.indexable !== true) fail(`${decision.slug}: effective status is not indexable practical`);
    if (trust.source?.recorded !== false) fail(`${decision.slug}: practical rewrite unexpectedly records a source`);
    if ((trust.claims?.categories ?? []).length !== 0 || (trust.claims?.enforcedCategories ?? []).length !== 0) {
      fail(`${decision.slug}: claim markers remain after rewrite: ${JSON.stringify(trust.claims?.categories ?? [])}`);
    }
    if (claimDebtBySlug.has(decision.slug)) fail(`${decision.slug}: completed rewrite remains in claim-debt report`);
    if (!indexable.has(decision.slug)) fail(`${decision.slug}: missing from indexable set`);

    const protocol = feedBySlug.get(decision.slug);
    if (!protocol) fail(`${decision.slug}: missing from trusted protocol feed`);
    const actualTopics = (trust.ontology?.topics ?? []).map(topic => topic.id);
    if (!same(actualTopics, decision.resulting_topics ?? [])) {
      fail(`${decision.slug}: ontology topics ${JSON.stringify(actualTopics)} != ${JSON.stringify(decision.resulting_topics ?? [])}`);
    }
    if (!same((protocol.ontology?.topics ?? []).map(topic => topic.id), decision.resulting_topics ?? [])) {
      fail(`${decision.slug}: protocol-feed ontology topics drift`);
    }
  }
}

console.log(`Claim cleanup decisions verified: ${history.entries.length} practical rewrites across ${history.batches.length} batch(es); all claim markers removed, indexable, topic-mapped and present in the trusted feed.`);
