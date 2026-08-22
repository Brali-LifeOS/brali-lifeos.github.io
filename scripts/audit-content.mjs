import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { classifyEvidence } from './lib/content-trust.mjs';
import { detectClaimMarkers, extractPublicText, resolveMarkerSupport } from './lib/claim-integrity.mjs';

const root = process.cwd();
const contentRoot = path.join(root, 'data/life-os-content');
const index = JSON.parse(await readFile(path.join(contentRoot, 'index.json'), 'utf8'));
const overrides = JSON.parse(await readFile(path.join(root, 'data/evidence-overrides.json'), 'utf8'));
const evidenceIndex = JSON.parse(await readFile(path.join(root, 'life-os/datasets/evidence.json'), 'utf8'));
const protocols = JSON.parse(await readFile(path.join(root, 'life-os/datasets/protocols.json'), 'utf8'));
const decisions = JSON.parse(await readFile(path.join(root, 'data/evidence-decisions.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(root, 'data/claim-review-registry.json'), 'utf8'));
const strict = process.argv.includes('--strict');

const counts = { reviewed: 0, practical: 0, 'pending-review': 0, restricted: 0 };
let legacySourceEntries = 0;
let legacyGeneratedPages = 0;
let restrictedStillIndexable = 0;
let missingProtocolSummaries = 0;
let evidenceStatusMismatches = 0;
let quantitativeQueue = 0;
let blockingClaimPages = 0;
let blockingClaimMarkers = 0;
let withheldClaimMarkers = 0;
const examples = [];
const claimExamples = [];
const evidenceBySlug = new Map((evidenceIndex.entries ?? []).map((record) => [record.slug, record]));
const protocolBySlug = new Map((protocols.entries ?? []).map((record) => [record.slug, record]));

for (const entry of index) {
  const article = JSON.parse(await readFile(path.join(contentRoot, `${entry.slug}.json`), 'utf8'));
  const sourceText = JSON.stringify(article);
  const evidence = classifyEvidence(article, entry, overrides);
  counts[evidence.status] = (counts[evidence.status] ?? 0) + 1;
  if (evidence.claims.quantitative && evidence.status !== 'reviewed') quantitativeQueue += 1;
  if (/metalhatscats/i.test(sourceText)) legacySourceEntries += 1;

  const generatedPath = path.join(root, 'life-os', entry.slug, 'index.html');
  const generated = await readFile(generatedPath, 'utf8');
  if (/metalhatscats/i.test(generated)) legacyGeneratedPages += 1;
  if (!generated.includes('data-protocol-summary="true"')) missingProtocolSummaries += 1;
  if (!generated.includes(`data-evidence-status="${evidence.status}"`)) evidenceStatusMismatches += 1;
  if (!evidence.indexable && !/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(generated)) {
    restrictedStillIndexable += 1;
  }

  const indexed = evidenceBySlug.get(entry.slug);
  if (!indexed || indexed.status !== evidence.status || indexed.reason !== evidence.reason) {
    evidenceStatusMismatches += 1;
  }

  const protocol = protocolBySlug.get(entry.slug) ?? null;
  const markers = detectClaimMarkers(extractPublicText(generated)).map(marker => ({
    marker,
    support: resolveMarkerSupport({
      marker,
      slug: entry.slug,
      protocolId: protocol?.protocol_id,
      evidenceRecord: indexed ?? evidence,
      decisions: decisions.entries ?? [],
      registry
    })
  }));
  const blockers = markers.filter(item => (indexed ?? evidence).indexable && !item.support.supported);
  const withheld = markers.filter(item => !(indexed ?? evidence).indexable && !item.support.supported);
  if (blockers.length) {
    blockingClaimPages += 1;
    blockingClaimMarkers += blockers.length;
    if (claimExamples.length < 12) {
      claimExamples.push(`${entry.slug}:${blockers.map(item => `${item.marker.category}/${item.marker.id}`).join('+')}`);
    }
  }
  withheldClaimMarkers += withheld.length;

  if ((evidence.status === 'restricted' || evidence.status === 'pending-review') && examples.length < 12) {
    examples.push(`${entry.slug}:${evidence.status}`);
  }
}

const claimReportPath = path.join(root, 'life-os/datasets/claim-debt.json');
if (fs.existsSync(claimReportPath)) {
  const report = JSON.parse(fs.readFileSync(claimReportPath, 'utf8'));
  if (report.summary?.blocking_indexable_unsupported_markers !== blockingClaimMarkers) evidenceStatusMismatches += 1;
  if (report.summary?.withheld_review_markers !== withheldClaimMarkers) evidenceStatusMismatches += 1;
}

console.log('Brali Growth Library content audit');
console.log(`- Entries: ${index.length}`);
console.log(`- Reviewed: ${counts.reviewed}`);
console.log(`- Practical: ${counts.practical}`);
console.log(`- Pending review: ${counts['pending-review']}`);
console.log(`- Restricted: ${counts.restricted}`);
console.log(`- Quantitative claims not reviewed: ${quantitativeQueue}`);
console.log(`- Source records containing legacy MetalHatsCats branding: ${legacySourceEntries}`);
console.log(`- Generated pages containing legacy branding: ${legacyGeneratedPages}`);
console.log(`- Indexable pages with unsupported enforced claim markers: ${blockingClaimPages}`);
console.log(`- Unsupported enforced claim markers on indexable pages: ${blockingClaimMarkers}`);
console.log(`- Unsupported markers withheld behind review boundaries: ${withheldClaimMarkers}`);
console.log(`- Generated pages missing protocol summaries: ${missingProtocolSummaries}`);
console.log(`- Restricted pages still indexable: ${restrictedStillIndexable}`);
console.log(`- Evidence status/index/report mismatches: ${evidenceStatusMismatches}`);
if (claimExamples.length) console.log(`- Blocking claim examples: ${claimExamples.join(', ')}`);
if (examples.length) console.log(`- Review queue examples: ${examples.join(', ')}`);

const blockingProblems = legacyGeneratedPages + blockingClaimMarkers + restrictedStillIndexable + missingProtocolSummaries + evidenceStatusMismatches;
if (strict && blockingProblems > 0) {
  console.error(`Content trust audit failed with ${blockingProblems} blocking problem(s).`);
  process.exit(1);
}

if (counts['pending-review'] + counts.restricted > 0) {
  console.warn('Evidence review queue remains. Use data/evidence-overrides.json and data/claim-review-registry.json only after actual-source review and bounded wording decisions.');
}
