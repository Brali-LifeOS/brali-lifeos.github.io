import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const source = read('data/evidence-decisions.json');
const ledger = read('evidence/index.json');
const decisions = source.entries ?? [];

if (decisions.length < 5) throw new Error(`Evidence Ledger expected at least 5 reviewed decisions, found ${decisions.length}.`);
if (ledger.count !== decisions.length || ledger.entries.length !== decisions.length) throw new Error('Evidence Ledger count does not reconcile with reviewed Evidence Decisions.');
if (new Set(ledger.entries.map(entry => entry.id)).size !== ledger.entries.length) throw new Error('Evidence Ledger IDs must be unique.');
if (ledger.unsupported_or_overstated_claim_count < ledger.count) throw new Error('Evidence Ledger should expose at least one explicit boundary per reviewed decision on average.');

for (const decision of decisions) {
  if (decision.source_reviewed !== true) throw new Error(`Evidence Decision is not source-reviewed: ${decision.id}`);
  if (!decision.source_url || !decision.source_title || !decision.supported_claim) throw new Error(`Evidence Decision lacks required source/claim fields: ${decision.id}`);
  if (!(decision.unsupported_or_overstated_claims ?? []).length) throw new Error(`Evidence Decision lacks unsupported/overstated claim boundaries: ${decision.id}`);
  if (!(decision.limitations ?? []).length) throw new Error(`Evidence Decision lacks limitations: ${decision.id}`);
  const htmlPath = path.join(ROOT, 'evidence', decision.id, 'index.html');
  const jsonPath = path.join(ROOT, 'evidence', decision.id, 'index.json');
  if (!fs.existsSync(htmlPath) || !fs.existsSync(jsonPath)) throw new Error(`Evidence Ledger page output missing: ${decision.id}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  for (const marker of ['What the source supports', 'What it does not establish', 'Important limitations', 'What this changes in Brali', decision.source_url]) {
    if (!html.includes(marker)) throw new Error(`Evidence Ledger page ${decision.id} lacks required marker: ${marker}`);
  }
  const record = read(`evidence/${decision.id}/index.json`);
  if (record.supported_claim !== decision.supported_claim || record.source.url !== decision.source_url) throw new Error(`Evidence Ledger JSON drift: ${decision.id}`);
}

const indexHtml = fs.readFileSync(path.join(ROOT, 'evidence/index.html'), 'utf8');
if (!indexHtml.includes('Claims Brali deliberately does not make')) throw new Error('Evidence Ledger index lacks visible claim-boundary section.');
if (!indexHtml.includes('<script type="application/ld+json">')) throw new Error('Evidence Ledger index lacks structured data.');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const route of ['/evidence/', ...ledger.entries.map(entry => `/evidence/${entry.id}/`)]) {
  if (!sitemap.includes(`https://brali-lifeos.github.io${route}`)) throw new Error(`Sitemap lacks Evidence Ledger route ${route}.`);
}
const research = fs.readFileSync(path.join(ROOT, 'research/index.html'), 'utf8');
if (!research.includes('data-brali-evidence-ledger')) throw new Error('Research page does not expose Evidence Ledger.');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
if (!llms.includes('Evidence Ledger: https://brali-lifeos.github.io/evidence/')) throw new Error('llms.txt does not expose Evidence Ledger.');

console.log(`Evidence Ledger verified: ${ledger.count} reviewed decisions, ${ledger.unsupported_or_overstated_claim_count} explicit unsupported/overstated claim boundaries.`);
