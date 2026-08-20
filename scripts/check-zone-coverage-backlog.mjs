import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`zone coverage backlog check failed: ${message}`); };

const backlog = await read('life-os/datasets/zone-coverage-backlog.json');
const decisions = await read('data/zone-coverage-decisions.json');
const zones = await read('data/life-os-zones.json');
const protocols = await read('life-os/datasets/protocols.json');
const manifest = await read('life-os/datasets/manifest.json');

const allowed = new Set(decisions.allowed_dispositions ?? ['legacy-sensitive', 'needs-new-protocol', 'empty-legacy']);
const knownZones = new Set(zones.map(zone => zone.slug));
const trustedByZone = new Map();
for (const entry of protocols.entries ?? []) {
  const zone = entry.zone?.slug ?? entry.legacy?.growth_zone_slug ?? entry.ontology?.legacy?.growth_zone_slug;
  if (!zone) continue;
  trustedByZone.set(zone, (trustedByZone.get(zone) ?? 0) + 1);
}

if (backlog.schema_version !== 2) fail(`expected schema_version 2, got ${backlog.schema_version}`);
if (backlog.zero_trust_zone_count !== (backlog.zones ?? []).length) fail('zero_trust_zone_count does not match rows');
if (backlog.populated_zero_trust_zone_count !== (backlog.zones ?? []).filter(row => row.entry_count > 0).length) fail('populated count drift');
if (backlog.empty_zero_trust_zone_count !== (backlog.zones ?? []).filter(row => row.entry_count === 0).length) fail('empty count drift');

const backlogBySlug = new Map();
for (const row of backlog.zones ?? []) {
  if (!knownZones.has(row.zone_slug)) fail(`unknown zone ${row.zone_slug}`);
  if (backlogBySlug.has(row.zone_slug)) fail(`duplicate zone ${row.zone_slug}`);
  backlogBySlug.set(row.zone_slug, row);
  if ((trustedByZone.get(row.zone_slug) ?? 0) !== 0) fail(`${row.zone_slug} is in zero-trust backlog but has trusted protocols`);
  if (!allowed.has(row.disposition)) fail(`${row.zone_slug} has invalid or missing disposition ${row.disposition}`);
  if (!row.decision_reason || !row.next_action) fail(`${row.zone_slug} is missing decision reason or next action`);
  if (row.disposition === 'empty-legacy' && row.entry_count !== 0) fail(`${row.zone_slug} marked empty-legacy with ${row.entry_count} entries`);
  if (row.disposition !== 'empty-legacy' && row.entry_count <= 0) fail(`${row.zone_slug} is populated disposition without entries`);
  if (row.disposition === 'legacy-sensitive' && !(row.candidates ?? []).every(candidate => candidate.sensitive)) fail(`${row.zone_slug} legacy-sensitive backlog contains a non-sensitive candidate`);
}

const decisionSlugs = Object.keys(decisions.zones ?? {});
for (const zoneSlug of decisionSlugs) {
  if (!knownZones.has(zoneSlug)) fail(`decision references unknown zone ${zoneSlug}`);
  if (!backlogBySlug.has(zoneSlug)) fail(`decision ${zoneSlug} is stale because the zone is no longer in the zero-trust backlog`);
}
if (decisionSlugs.length !== backlog.zero_trust_zone_count) fail(`expected one editorial disposition per zero-trust zone; decisions=${decisionSlugs.length}, backlog=${backlog.zero_trust_zone_count}`);

const calculated = {};
for (const row of backlog.zones ?? []) calculated[row.disposition] = (calculated[row.disposition] ?? 0) + 1;
if (JSON.stringify(calculated) !== JSON.stringify(backlog.dispositions ?? {})) fail('disposition summary drift');

const manifestEntry = (manifest.files ?? []).find(entry => (typeof entry === 'string' ? entry : entry.path) === 'life-os/datasets/zone-coverage-backlog.json');
if (!manifestEntry) fail('canonical manifest does not include zone-coverage-backlog.json');

console.log(`Zone coverage backlog verified: ${backlog.zero_trust_zone_count} zero-trust zones; ${backlog.populated_zero_trust_zone_count} populated; dispositions=${JSON.stringify(backlog.dispositions)}.`);
