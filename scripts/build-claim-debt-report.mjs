import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const base = 'https://brali-lifeos.github.io';
const canonical = `${base}/quality/claims/`;
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const humanize = value => String(value ?? '')
  .replace(/[-_]+/g, ' ')
  .replace(/^./, letter => letter.toUpperCase());

const claimDebt = await readJson('life-os/datasets/claim-debt.json');
const reviewQueue = await readJson('life-os/datasets/review-queue.json');
const publicIndex = await readJson('life-os-index.json');
const counts = claimDebt.counts ?? {};
const indexBySlug = new Map(publicIndex.map(entry => [entry.slug, entry]));
const debtBySlug = new Map((claimDebt.entries ?? [])
  .filter(entry => (entry.debt_reasons ?? []).length > 0)
  .map(entry => [entry.slug, entry]));

const categoryDefinitions = [...(claimDebt.category_definitions ?? [])].sort((left, right) => {
  if (left.enforced !== right.enforced) return left.enforced ? -1 : 1;
  const countDelta = (counts.by_category?.[right.id] ?? 0) - (counts.by_category?.[left.id] ?? 0);
  return countDelta || left.id.localeCompare(right.id);
});
const categoryCards = categoryDefinitions.map(category => {
  const count = counts.by_category?.[category.id] ?? 0;
  const mode = category.enforced ? 'Blocks unresolved discovery' : 'Monitor-only review signal';
  return `<article class="card" data-claim-category="${escapeHtml(category.id)}" data-claim-category-count="${count}"><span class="card-label">${category.enforced ? 'Enforced' : 'Monitor only'} · ${count}</span><h3>${escapeHtml(humanize(category.id))}</h3><p>${escapeHtml(category.description)}</p><p><strong>${escapeHtml(mode)}.</strong></p></article>`;
}).join('');

const statuses = ['reviewed', 'practical', 'pending-review', 'restricted'];
const statusCards = statuses.map(status => {
  const count = counts.by_status?.[status] ?? 0;
  const explanation = {
    reviewed: 'Claim wording has a recorded editorial review boundary. A marker can remain without being unresolved debt.',
    practical: 'Low-risk practical wording should not retain enforced evidence claims. Any exception remains visible for review.',
    'pending-review': 'Evidence-like wording or a source exists, but the exact public claim has not completed review.',
    restricted: 'Sensitive or higher-risk material remains outside normal trusted discovery until reviewed.',
  }[status];
  return `<article class="card" data-claim-status="${status}" data-claim-status-count="${count}"><span class="card-label">${count} record${count === 1 ? '' : 's'}</span><h3>${escapeHtml(humanize(status))}</h3><p>${escapeHtml(explanation)}</p></article>`;
}).join('');

const priorityDebt = (reviewQueue.entries ?? [])
  .filter(entry => debtBySlug.has(entry.slug))
  .slice(0, 12);
const queueCards = priorityDebt.map((queueEntry, index) => {
  const debt = debtBySlug.get(queueEntry.slug);
  const source = indexBySlug.get(queueEntry.slug) ?? {};
  const title = source.subtitle || source.title || queueEntry.slug;
  const zoneTitle = source.zone?.title || debt.zone || 'Unclassified';
  const reasons = (debt.debt_reasons ?? []).map(humanize).join(' · ');
  const categories = (debt.categories ?? []).map(humanize).join(' · ');
  const factors = (queueEntry.editorial_priority?.factors ?? []).slice(0, 5).map(humanize).join(' · ');
  return `<article class="card" data-claim-queue-rank="${index + 1}" data-claim-queue-slug="${escapeHtml(queueEntry.slug)}"><span class="card-label">#${index + 1} · ${escapeHtml(humanize(debt.status))} · ${escapeHtml(zoneTitle)}</span><h3>${escapeHtml(title)}</h3><p><strong>Debt:</strong> ${escapeHtml(reasons || 'Editorial review required')}</p><p><strong>Markers:</strong> ${escapeHtml(categories || 'None')}</p><p><strong>Priority signals:</strong> ${escapeHtml(factors || 'Queue order')}</p></article>`;
}).join('');

const schema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Brali public claim debt report',
  description: 'A transparent summary of claim-review markers, unresolved claim debt, indexing safeguards, and the current editorial queue in Brali.',
  url: canonical,
  isPartOf: { '@type': 'WebSite', name: 'Brali', url: `${base}/` },
  about: {
    '@type': 'Dataset',
    name: 'Brali public claim debt report',
    url: `${base}/life-os/datasets/claim-debt.json`,
  },
};

const body = `<p class="eyebrow">Quality report</p><h1>Claim debt is visible. Unresolved claims stay out of discovery.</h1><p class="lead">Brali scans public protocol wording for evidence-like signals, then keeps review state, sources, indexing, and editorial priority separate. A marker is not proof that a statement is false. It is a reason not to pretend the review already happened.</p><div class="grid three" data-claim-summary><article class="card" data-claim-records-checked="${counts.records_checked ?? 0}"><span class="card-label">Corpus checked</span><h2>${counts.records_checked ?? 0}</h2><p>Source records inspected by the current claim taxonomy.</p></article><article class="card" data-claim-debt-entries="${counts.debt_entries ?? 0}"><span class="card-label">Unresolved claim debt</span><h2>${counts.debt_entries ?? 0}</h2><p>Records requiring an explicit review, rewrite, restriction, watch, or rejection decision.</p></article><article class="card" data-indexable-claim-debt="${counts.indexable_debt_entries ?? 0}"><span class="card-label">Indexable unresolved debt</span><h2>${counts.indexable_debt_entries ?? 0}</h2><p>The enforced target is zero. Search exposure must follow trust state rather than page existence.</p></article></div><section class="prose"><h2>How to read this report</h2><p>${counts.records_with_markers ?? 0} records contain at least one review marker. ${counts.debt_entries ?? 0} currently carry unresolved debt. These numbers are editorial workload, not an effectiveness score and not a count of proven falsehoods.</p><p><strong>Enforced categories</strong> prevent normal discovery when exact wording has not completed the required review. <strong>Monitor-only categories</strong> expose causal, mechanism, and research language for inspection without pretending that a regular expression can judge a paper.</p></section><div class="grid three" data-claim-categories>${categoryCards}</div><section class="prose"><h2>Debt by current evidence state</h2><p>The same marker can have a different meaning depending on whether the wording was reviewed, remains practical, is awaiting review, or is restricted.</p></section><div class="grid two" data-claim-statuses>${statusCards}</div><section class="prose"><h2>Highest-priority current queue</h2><p>This compact view follows the canonical evidence review queue. It shows titles and review reasons, but deliberately does not repeat unsupported claim snippets on an indexable report page. The full machine-readable report retains the traceable details for editors and tools.</p></section><div class="grid two" data-claim-priority-queue>${queueCards}</div><section class="prose"><h2>What closes claim debt</h2><ol><li>Inspect the exact public wording, not only its title or metadata.</li><li>Read the actual source when factual support is required.</li><li>Record supported wording, unsupported wording, limitations, population and outcome boundaries, provenance, and editorial decision.</li><li>Choose an honest outcome: keep practical, rewrite, review and retain, restrict, watch, or reject.</li><li>Rebuild and verify that evidence state, indexing, page data, API, citation, and claim debt agree.</li></ol><h2>Machine-readable transparency</h2><ul><li><a href="/life-os/datasets/claim-debt.json">Complete claim-debt report</a></li><li><a href="/life-os/datasets/review-queue.json">Canonical editorial review queue</a></li><li><a href="/life-os/datasets/evidence.json">Complete evidence-state index</a></li><li><a href="/life-os/methodology/">Content methodology and indexing policy</a></li></ul></section><div class="callout"><h3>Zero indexable debt is a boundary, not a victory lap.</h3><p>The remaining work is to review and improve the underlying records without mass-promoting weak content or manufacturing citations.</p><a class="button" href="/life-os/methodology/">Read the methodology</a></div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Public claim debt report — Brali</title><meta name="description" content="Claim-review markers, unresolved claim debt, indexing safeguards, and the current editorial queue for Brali practical protocols."><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="Public claim debt report — Brali"><meta property="og:description" content="See how Brali detects claim-review debt and keeps unresolved wording out of trusted discovery."><meta property="og:url" content="${canonical}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/life-os/methodology/">Methodology</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a></div></nav></header><main id="content" class="page wrap">${body}</main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Evidence-aware practical knowledge for people and machines.</small></div><div class="footer-links"><a href="/life-os/methodology/">Methodology</a><a href="/life-os/datasets/">Datasets</a><a href="/cite/">Citation</a></div></div></footer></body></html>`;

const outputDir = path.join(root, 'quality/claims');
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'index.html'), html);

const methodologyPath = path.join(root, 'life-os/methodology/index.html');
let methodology = await readFile(methodologyPath, 'utf8');
if (!methodology.includes('/quality/claims/')) {
  methodology = methodology.replace(
    '<p><a href="/life-os/datasets/claim-debt.json">Open the machine-readable claim-debt report →</a></p>',
    '<p><a href="/quality/claims/">Open the public claim-debt report →</a> · <a href="/life-os/datasets/claim-debt.json">Machine-readable JSON</a></p>',
  );
  await writeFile(methodologyPath, methodology);
}

const datasetsPath = path.join(root, 'life-os/datasets/index.html');
let datasets = await readFile(datasetsPath, 'utf8');
if (!datasets.includes('/quality/claims/')) {
  const jsonItem = '<li><a href="/life-os/datasets/claim-debt.json">Public claim debt and review signals (JSON)</a></li>';
  const reportItem = '<li><a href="/quality/claims/">Human-readable claim debt report</a></li>';
  datasets = datasets.includes(jsonItem)
    ? datasets.replace(jsonItem, `${reportItem}${jsonItem}`)
    : datasets.replace('</ul>', `${reportItem}</ul>`);
  await writeFile(datasetsPath, datasets);
}

const sitemapPath = path.join(root, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
  sitemap = sitemap.replace('</urlset>', `  <url><loc>${canonical}</loc></url>\n</urlset>`);
  await writeFile(sitemapPath, sitemap);
}

console.log(`Public claim debt report built: ${counts.records_checked ?? 0} checked, ${counts.debt_entries ?? 0} unresolved, ${counts.indexable_debt_entries ?? 0} indexable, ${priorityDebt.length} priority rows.`);
