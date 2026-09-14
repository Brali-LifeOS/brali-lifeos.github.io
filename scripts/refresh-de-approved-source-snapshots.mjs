import fs from 'node:fs';
import path from 'node:path';
import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from './lib/localization-source.mjs';

const root = process.cwd();
const dir = path.join(root, 'data/localization/de/library');
const approved = new Set([
  'challenge-confirmation-bias-checklist',
  'cut-your-losses-sunk-cost',
  'if-then-rules-productivity',
  'pause-to-avoid-anchoring-bias',
  'sunk-cost-decision-coach',
]);
const canonical = new Map((await loadLocalizationAuthoringIndex(root)).map((entry) => [entry.slug, entry]));
const flagshipsDoc = JSON.parse(fs.readFileSync(path.join(root, 'data/localization/de/flagships.json'), 'utf8'));
const flagshipRecords = Array.isArray(flagshipsDoc.records) ? flagshipsDoc.records : [];
const flagshipSlugs = new Set(flagshipRecords.map((record) => record.slug));
const found = new Set();
let changedFiles = 0;
let removedDuplicates = 0;

for (const name of fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
  const file = path.join(dir, name);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(doc.records) ? doc.records : [];
  let changed = false;

  const deduped = records.filter((record) => {
    if (!flagshipSlugs.has(record.slug)) return true;
    removedDuplicates += 1;
    changed = true;
    return false;
  });

  for (const record of deduped) {
    if (!approved.has(record.slug)) continue;
    const source = canonical.get(record.slug);
    if (!source) throw new Error(`Approved slug missing from canonical corpus: ${record.slug}`);
    record.source = localizationSourceSnapshot(source);
    found.add(record.slug);
    changed = true;
  }

  if (changed) {
    doc.records = deduped;
    fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    changedFiles += 1;
  }
}

const missing = [...approved].filter((slug) => !found.has(slug));
if (missing.length) throw new Error(`Approved German records not found: ${missing.join(', ')}`);
console.log(`Refreshed reviewed source snapshots for ${found.size} German records, removed ${removedDuplicates} flagship duplicate(s), across ${changedFiles} files.`);
