import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProtocolOverrides } from './lib/protocol-overrides.mjs';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Claim cleanup decision check failed: ${message}`); };
const sorted = values => [...values].sort((left, right) => left.localeCompare(right));
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

const decisions = await readJson('data/claim-cleanup-decisions-batch-1.json');
const evidence = await readJson('life-os/datasets/evidence.json');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const protocols = await readJson('life-os/datasets/protocols.json');
const indexing = await readJson('life-os/datasets/indexing.json');
const registry = await loadProtocolOverrides(root);

if (decisions.schema_version !== 1) fail(`unexpected schema version ${decisions.schema_version}`);
if (decisions.batch_id !== 'claim-cleanup-2026-08-22-01') fail('batch identity drift');
if (decisions.selected_at !== '2026-08-22') fail('selection date drift');
if (!(decisions.entries?.length === 4)) fail('batch one must contain exactly four completed records');
if (new Set(decisions.selection_order ?? []).size !== 4 || decisions.selection_order.length !== 4) fail('selection order must contain four unique slugs');
if (JSON.stringify(decisions.entries.map(entry => entry.slug)) !== JSON.stringify(decisions.selection_order)) fail('decision entries do not preserve canonical selection order');
if (decisions.observed_initial_queue?.selected !== 4 || decisions.observed_initial_queue?.blocked_preview !== 8) fail('initial selector observation drift');

const evidenceBySlug = new Map((evidence.entries ?? []).map(entry => [entry.slug, entry]));
const claimDebtBySlug = new Map((claimDebt.entries ?? []).map(entry => [entry.slug, entry]));
const feedBySlug = new Map((protocols.entries ?? []).map(entry => [entry.slug, entry]));
const indexable = new Set(indexing.indexable ?? []);

for (const decision of decisions.entries) {
  if (decision.previous_status !== 'pending-review') fail(`${decision.slug}: previous status drift`);
  if (!same(decision.previous_enforced_categories ?? [], ['quantitative', 'first-party-result'])) {
    fail(`${decision.slug}: previous enforced categories drift`);
  }
  if (decision.previous_source_recorded !== false) fail(`${decision.slug}: source boundary drift`);
  if (decision.disposition !== 'rewrite-practical') fail(`${decision.slug}: unsupported disposition ${decision.disposition}`);
  if (!(decision.decision?.length >= 80)) fail(`${decision.slug}: decision rationale is too short`);

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

console.log(`Claim cleanup decisions verified: ${decisions.entries.length} practical rewrites; all claim markers removed, indexable, topic-mapped and present in the trusted feed.`);
