import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Public claim debt report check failed: ${message}`); };

const pagePath = path.join(root, 'quality/claims/index.html');
await access(pagePath);
const page = await readFile(pagePath, 'utf8');
const methodology = await readFile(path.join(root, 'life-os/methodology/index.html'), 'utf8');
const datasets = await readFile(path.join(root, 'life-os/datasets/index.html'), 'utf8');
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const reviewQueue = await readJson('life-os/datasets/review-queue.json');
const counts = claimDebt.counts ?? {};

if (claimDebt.schema_version !== 2) fail(`expected claim-debt schema 2, found ${claimDebt.schema_version}`);

for (const marker of [
  'Claim debt is visible. Unresolved claims stay out of discovery.',
  'A marker is not proof that a statement is false.',
  'Debt by canonical Topic',
  'Highest-priority current queue',
  'What closes claim debt',
  '/life-os/datasets/claim-debt.json',
  '/life-os/datasets/review-queue.json',
  '/life-os/datasets/evidence.json',
  '"@type":"WebPage"',
]) {
  if (!page.includes(marker)) fail(`missing page marker: ${marker}`);
}

if (!page.includes(`data-claim-records-checked="${counts.records_checked ?? 0}"`)) fail('records-checked count drift');
if (!page.includes(`data-claim-debt-entries="${counts.debt_entries ?? 0}"`)) fail('debt count drift');
if (!page.includes(`data-indexable-claim-debt="${counts.indexable_debt_entries ?? 0}"`)) fail('indexable-debt count drift');
if (!page.includes(`${counts.records_with_markers ?? 0} records contain at least one review marker`)) fail('marker-record count drift');

for (const category of claimDebt.category_definitions ?? []) {
  const count = counts.by_category?.[category.id] ?? 0;
  if (!page.includes(`data-claim-category="${category.id}" data-claim-category-count="${count}"`)) {
    fail(`category count drift: ${category.id}`);
  }
}
for (const status of ['reviewed', 'practical', 'pending-review', 'restricted']) {
  const count = counts.by_status?.[status] ?? 0;
  if (!page.includes(`data-claim-status="${status}" data-claim-status-count="${count}"`)) {
    fail(`status count drift: ${status}`);
  }
}

const topicDebt = Object.entries(counts.debt_by_topic ?? {})
  .sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]));
if (!page.includes(`data-claim-topic-groups="${topicDebt.length}"`)) fail('Topic group count drift');
if (!page.includes(`data-claim-topic-pending-debt="${counts.topic_pending_debt_entries ?? 0}"`)) fail('topic-pending debt count drift');
for (const [[topicId, count], index] of topicDebt.slice(0, 12).map((entry, index) => [entry, index])) {
  const marker = `data-claim-topic-rank="${index + 1}" data-claim-topic="${topicId}" data-claim-topic-count="${count}"`;
  if (!page.includes(marker)) fail(`Topic order drift at rank ${index + 1}: ${topicId}`);
}
const renderedTopicRows = (page.match(/data-claim-topic-rank=/g) ?? []).length;
if (renderedTopicRows !== Math.min(topicDebt.length, 12)) {
  fail(`Topic row count drift: ${renderedTopicRows}/${Math.min(topicDebt.length, 12)}`);
}

const debtSlugs = new Set((claimDebt.entries ?? [])
  .filter(entry => (entry.debt_reasons ?? []).length > 0)
  .map(entry => entry.slug));
const expectedQueue = (reviewQueue.entries ?? [])
  .filter(entry => debtSlugs.has(entry.slug))
  .slice(0, 12);
if (expectedQueue.length === 0) fail('expected at least one claim-debt queue row');
for (const [index, entry] of expectedQueue.entries()) {
  const marker = `data-claim-queue-rank="${index + 1}" data-claim-queue-slug="${entry.slug}"`;
  if (!page.includes(marker)) fail(`queue order drift at rank ${index + 1}: ${entry.slug}`);
}
const renderedQueueRows = (page.match(/data-claim-queue-rank=/g) ?? []).length;
if (renderedQueueRows !== expectedQueue.length) fail(`queue row count drift: ${renderedQueueRows}/${expectedQueue.length}`);

if (!methodology.includes('href="/quality/claims/"')) fail('methodology page does not link to public report');
if (!datasets.includes('href="/quality/claims/"')) fail('dataset catalog does not link to public report');
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/quality/claims/</loc>')) fail('sitemap lacks public report');
if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(page)) fail('public quality report is unexpectedly noindex');
if (/data-claim-example/i.test(page)) fail('public report must not render claim-example fields or snippets');

console.log(`Public claim debt report verified: ${counts.records_checked ?? 0} checked, ${counts.debt_entries ?? 0} unresolved, ${counts.indexable_debt_entries ?? 0} indexable, ${topicDebt.length} Topic debt group(s), ${expectedQueue.length} queue rows.`);
