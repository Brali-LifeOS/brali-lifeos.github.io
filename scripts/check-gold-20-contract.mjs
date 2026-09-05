import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Gold 20 contract check failed: ${message}`); };
const gold = await readJson('data/gold-20.json');
const protocolFeed = await readJson('api/v1/protocols.json');
const evidence = await readJson('life-os/datasets/evidence.json');
const indexing = await readJson('life-os/datasets/indexing.json');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const page = await readFile(path.join(root, 'life-os/gold-20/index.html'), 'utf8');
const app = await readFile(path.join(root, 'life-os/gold-20/app.js'), 'utf8');

if (gold.schema_version !== 1 || gold.collection_id !== 'brali:collection:gold-20') fail('collection identity drift');
if (gold.status !== 'editorially-curated' || gold.target_count !== 20) fail('collection status or target drift');
if (gold.selected_at !== '2026-08-22') fail('selection date drift');
if (gold.entries?.length !== 20) fail(`expected 20 entries, found ${gold.entries?.length ?? 0}`);
if (!(gold.selection_rule?.length >= 5) || !(gold.required_contract?.length >= 9)) fail('selection or field contract is incomplete');

const slugs = gold.entries.map(entry => entry.slug);
if (new Set(slugs).size !== 20) fail('Gold slugs must be unique');
const slugSet = new Set(slugs);
const protocolItems = protocolFeed.items ?? protocolFeed.entries ?? [];
const protocolBySlug = new Map(protocolItems.map(protocol => [protocol.slug, protocol]));
const evidenceBySlug = new Map((evidence.entries ?? []).map(entry => [entry.slug, entry]));
const indexable = new Set(indexing.indexable ?? []);
const debtSlugs = new Set((claimDebt.entries ?? []).map(entry => entry.slug));
const lifeAreas = new Set();
const topics = new Set();

for (let index = 0; index < gold.entries.length; index += 1) {
  const entry = gold.entries[index];
  if (entry.rank !== index + 1) fail(`${entry.slug}: rank ${entry.rank} does not match position ${index + 1}`);
  for (const field of ['problem', 'eligibility', 'first_action', 'observable_signal', 'stop_rule']) {
    if (!(entry[field]?.length >= 60)) fail(`${entry.slug}: ${field} is too weak`);
  }
  if (!(entry.limitations?.length >= 2) || entry.limitations.some(item => item.length < 35)) fail(`${entry.slug}: limitations are incomplete`);
  if (!(entry.alternatives?.length >= 2) || new Set(entry.alternatives).size !== entry.alternatives.length) fail(`${entry.slug}: alternatives are incomplete or duplicated`);
  for (const alternative of entry.alternatives) {
    if (alternative === entry.slug) fail(`${entry.slug}: self-reference in alternatives`);
    if (!slugSet.has(alternative)) fail(`${entry.slug}: alternative ${alternative} is outside Gold 20`);
  }
  if (entry.gold_reviewed_at !== '2026-08-22') fail(`${entry.slug}: Gold review date drift`);
  if (!(entry.provenance?.basis?.length >= 10)) fail(`${entry.slug}: provenance basis is missing`);
  if (!Array.isArray(entry.provenance?.decision_ids)) fail(`${entry.slug}: decision_ids must be an array`);
  const expectedUrl = `https://brali-lifeos.github.io/life-os/${entry.slug}/`;
  if (entry.provenance.canonical_url !== expectedUrl) fail(`${entry.slug}: canonical URL drift`);

  const protocol = protocolBySlug.get(entry.slug);
  if (!protocol) fail(`${entry.slug}: missing from API v1 Protocol Feed`);
  if (!['reviewed', 'practical'].includes(protocol.evidence_state)) fail(`${entry.slug}: untrusted evidence state ${protocol.evidence_state}`);
  if (protocol.canonical_id !== `brali:protocol:${entry.slug}`) fail(`${entry.slug}: canonical ID drift`);
  if (protocol.url !== expectedUrl) fail(`${entry.slug}: Protocol Feed URL drift`);
  if (!indexable.has(entry.slug) || debtSlugs.has(entry.slug)) fail(`${entry.slug}: indexing or claim-debt boundary failed`);

  const trust = evidenceBySlug.get(entry.slug);
  if (!trust || !['reviewed', 'practical'].includes(trust.status) || trust.indexable !== true) fail(`${entry.slug}: effective trust record is invalid`);
  if ((trust.claims?.enforcedCategories ?? []).length !== 0) fail(`${entry.slug}: enforced claim markers remain`);

  const lifeArea = typeof protocol.life_area === 'string' ? protocol.life_area : protocol.life_area?.id || protocol.life_area?.title;
  if (lifeArea) lifeAreas.add(lifeArea);
  for (const topic of protocol.ontology?.topics ?? []) topics.add(topic.id || topic.title);
}

if (lifeAreas.size < 7) fail(`Gold 20 covers only ${lifeAreas.size} Life Areas`);
if (topics.size < 8) fail(`Gold 20 covers only ${topics.size} Topics`);

for (const slug of [
  '25-minute-pomodoro-focus-sprints',
  'active-listening-exercises',
  'weekly-theme-learning-sprints',
  'brainwriting-group-idea-generation',
]) {
  if (!slugSet.has(slug)) fail(`source-reviewed flagship missing: ${slug}`);
}
for (const slug of [
  'ad-astra-per-aspera-motivation-tracker',
  'analogy-studio',
  'ask-better-interview-questions',
  'ask-for-feedback-tracker',
  'avoid-anthropocentric-bias',
  'avoid-contrast-effect',
  'avoid-gamblers-fallacy-trust-the-odds',
  'avoid-selection-bias-in-analysis',
  'backfire-effect-coach',
  'belief-update-coach',
  'biomimicry-creative-problem-solving',
  'bold-brainstorm-kickoff',
]) {
  if (!slugSet.has(slug)) fail(`completed cleanup record missing: ${slug}`);
}

for (const marker of [
  'Twenty Protocols with an explicit use contract.',
  'data-gold-summary',
  '/data/gold-20.json',
  '/life-os/gold-20/app.js',
  'Pending-review or restricted records permitted.',
]) {
  if (!page.includes(marker)) fail(`Gold page lacks ${marker}`);
}
for (const marker of [
  "getJson('/data/gold-20.json')",
  "getJson('/api/v1/protocols.json')",
  'data-gold-slug',
  'Stop when:',
  'Limitations:',
]) {
  if (!app.includes(marker)) fail(`Gold client lacks ${marker}`);
}
if (/sendBeacon|XMLHttpRequest|localStorage|document\.cookie/.test(app)) fail('Gold client contains telemetry or persistent storage');

console.log(`Gold 20 verified: entries=20; life-areas=${lifeAreas.size}; topics=${topics.size}; trusted=20; debt=0.`);
