import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const claimDebt = JSON.parse(await readFile(path.join(root, 'life-os/datasets/claim-debt.json'), 'utf8'));
const page = await readFile(path.join(root, 'quality/claims/index.html'), 'utf8');
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const datasetsPage = await readFile(path.join(root, 'life-os/datasets/index.html'), 'utf8');
const failures = [];

const formatted = value => Number(value ?? 0).toLocaleString('en-US');
const metricKeys = ['records_checked', 'records_with_markers', 'debt_entries', 'indexable_debt_entries'];

if (claimDebt.schema_version !== 1) failures.push(`unexpected claim-debt schema ${claimDebt.schema_version}`);
if ((claimDebt.counts?.records_checked ?? 0) < 1) failures.push('claim-debt report checked no records');
if ((claimDebt.counts?.indexable_debt_entries ?? 0) !== 0) {
  failures.push(`indexable claim debt must be zero, found ${claimDebt.counts?.indexable_debt_entries ?? 0}`);
}
if (!page.includes('<link rel="canonical" href="https://brali-lifeos.github.io/quality/claims/">')) failures.push('missing canonical claim-quality URL');
if (!page.includes('/life-os/datasets/claim-debt.json')) failures.push('missing claim-debt JSON link');
if (!page.includes('A marker is a review signal, not a verdict that a statement is false.')) failures.push('missing marker interpretation boundary');
if (!datasetsPage.includes('/quality/claims/')) failures.push('datasets catalog does not link the public summary');
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/quality/claims/</loc>')) failures.push('sitemap does not contain the public summary');

for (const key of metricKeys) {
  const expected = `<h2 data-claim-metric="${key}">${formatted(claimDebt.counts?.[key])}</h2>`;
  if (!page.includes(expected)) failures.push(`metric drift for ${key}`);
}
for (const definition of claimDebt.category_definitions ?? []) {
  if (!page.includes(`<code>${definition.id}</code>`)) failures.push(`missing category ${definition.id}`);
}

const reportDebt = (claimDebt.entries ?? []).filter(entry => (entry.debt_reasons ?? []).length > 0).length;
if (reportDebt !== (claimDebt.counts?.debt_entries ?? 0)) failures.push('claim-debt entry count does not match public metric');

if (failures.length) throw new Error(`Claim quality summary check failed:\n- ${failures.join('\n- ')}`);
console.log(`Claim quality summary passed: ${claimDebt.counts.records_checked} checked; ${claimDebt.counts.debt_entries} debt; zero indexable debt.`);
