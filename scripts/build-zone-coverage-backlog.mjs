import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const index = JSON.parse(await readFile(path.join(root, 'data/life-os-content/index.json'), 'utf8'));
const zones = JSON.parse(await readFile(path.join(root, 'data/life-os-zones.json'), 'utf8'));
const evidence = JSON.parse(await readFile(path.join(root, 'life-os/datasets/evidence.json'), 'utf8'));
const protocols = JSON.parse(await readFile(path.join(root, 'life-os/datasets/protocols.json'), 'utf8'));
let decisions = { zones: {} };
try {
  decisions = JSON.parse(await readFile(path.join(root, 'data/zone-coverage-decisions.json'), 'utf8'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const evidenceBySlug = new Map((evidence.entries ?? []).map(entry => [entry.slug, entry]));
const trusted = new Set((protocols.entries ?? []).map(entry => entry.slug));
const byZone = new Map(zones.map(zone => [zone.slug, { zone, entries: [] }]));
for (const entry of index) byZone.get(entry.zone.slug)?.entries.push(entry);

function candidateScore(entry, trust) {
  let score = 0;
  if (trust?.status === 'pending-review') score += 100;
  if (trust?.status === 'restricted') score -= 100;
  if (!trust?.sensitive) score += 80;
  if (!trust?.claims?.quantitative) score += 40;
  if (!trust?.claims?.evidenceLanguage) score += 30;
  if (trust?.source?.recorded) score += 20;
  if (trust?.ontology?.topics?.length) score += 15;
  if ((entry.description ?? '').length >= 60) score += 5;
  return score;
}

const rows = [];
for (const { zone, entries } of byZone.values()) {
  const trustedEntries = entries.filter(entry => trusted.has(entry.slug));
  if (trustedEntries.length) continue;
  const candidates = entries
    .map(entry => ({ entry, trust: evidenceBySlug.get(entry.slug) }))
    .sort((a, b) => candidateScore(b.entry, b.trust) - candidateScore(a.entry, a.trust) || a.entry.slug.localeCompare(b.entry.slug))
    .slice(0, 5)
    .map(({ entry, trust }) => ({
      slug: entry.slug,
      title: entry.title,
      description: entry.description ?? '',
      status: trust?.status ?? null,
      sensitive: Boolean(trust?.sensitive),
      quantitative_claims: Boolean(trust?.claims?.quantitative),
      evidence_language: Boolean(trust?.claims?.evidenceLanguage),
      source_recorded: Boolean(trust?.source?.recorded),
      topics: trust?.ontology?.topics ?? [],
      score: candidateScore(entry, trust),
    }));
  const decision = decisions.zones?.[zone.slug] ?? null;
  rows.push({
    zone_slug: zone.slug,
    zone_title: zone.title,
    entry_count: entries.length,
    trusted_protocols: 0,
    disposition: decision?.disposition ?? 'unclassified',
    decision_reason: decision?.reason ?? null,
    next_action: decision?.next_action ?? null,
    candidates,
  });
}
rows.sort((a, b) => a.zone_title.localeCompare(b.zone_title));

const dispositionCounts = rows.reduce((acc, row) => {
  acc[row.disposition] = (acc[row.disposition] ?? 0) + 1;
  return acc;
}, {});
const output = {
  schema_version: 2,
  purpose: "Editorial backlog for Growth Zones that currently have zero trusted protocols. Candidate scores are triage-only and never change evidence status automatically. Editorial dispositions describe Brali's current source/protocol state, not the validity of an entire therapy or school.",
  zero_trust_zone_count: rows.length,
  populated_zero_trust_zone_count: rows.filter(row => row.entry_count > 0).length,
  empty_zero_trust_zone_count: rows.filter(row => row.entry_count === 0).length,
  dispositions: dispositionCounts,
  candidate_rule: 'Prefer pending-review, non-sensitive entries without quantitative/evidence-like claims; recorded sources and Topic mapping are positive review signals. Human/editorial review or curated rewriting is still required before promotion.',
  zones: rows,
};

await mkdir(path.join(root, 'life-os/datasets'), { recursive: true });
await writeFile(path.join(root, 'life-os/datasets/zone-coverage-backlog.json'), JSON.stringify(output, null, 2));

console.log(`Zone coverage backlog: ${rows.length} zero-trust zones; ${rows.filter(row => row.entry_count > 0).length} populated; dispositions=${JSON.stringify(dispositionCounts)}.`);
for (const row of rows) {
  const best = row.candidates[0];
  console.log(`ZONE_COVERAGE ${row.zone_slug} | ${row.zone_title} | entries=${row.entry_count} | disposition=${row.disposition} | best=${best?.slug ?? 'none'} | status=${best?.status ?? 'none'} | sensitive=${best?.sensitive ?? false} | quantitative=${best?.quantitative_claims ?? false} | evidenceLanguage=${best?.evidence_language ?? false} | source=${best?.source_recorded ?? false} | score=${best?.score ?? 0}`);
}
