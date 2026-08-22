import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const claimDebtPath = path.join(root, 'life-os/datasets/claim-debt.json');
const evidencePath = path.join(root, 'life-os/datasets/evidence.json');
const outputDir = path.join(root, 'quality/claims');
const datasetsPage = path.join(root, 'life-os/datasets/index.html');
const claimDebt = JSON.parse(await readFile(claimDebtPath, 'utf8'));
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
})[character]);
const number = value => Number(value ?? 0).toLocaleString('en-US');
const statusOrder = new Map([['restricted', 0], ['pending-review', 1], ['reviewed', 2], ['practical', 3]]);
const categoryDefinitions = claimDebt.category_definitions ?? [];
const enforced = categoryDefinitions.filter(item => item.enforced);
const monitored = categoryDefinitions.filter(item => !item.enforced);
const debtEntries = (claimDebt.entries ?? [])
  .filter(entry => (entry.debt_reasons ?? []).length > 0)
  .sort((left, right) => {
    if (left.indexable !== right.indexable) return left.indexable ? -1 : 1;
    const statusDelta = (statusOrder.get(left.status) ?? 9) - (statusOrder.get(right.status) ?? 9);
    if (statusDelta) return statusDelta;
    return left.slug.localeCompare(right.slug);
  });

const categoryRows = categoryDefinitions.map(definition => {
  const count = claimDebt.counts?.by_category?.[definition.id] ?? 0;
  return `<tr><td><code>${escapeHtml(definition.id)}</code></td><td>${definition.enforced ? 'Blocked in phase one' : 'Monitored'}</td><td>${number(count)}</td><td>${escapeHtml(definition.description)}</td></tr>`;
}).join('');

const debtRows = debtEntries.slice(0, 25).map(entry => {
  const reasons = (entry.debt_reasons ?? []).map(reason => `<code>${escapeHtml(reason)}</code>`).join(', ');
  return `<tr><td><a href="/life-os/${encodeURIComponent(entry.slug)}/">${escapeHtml(entry.slug)}</a></td><td>${escapeHtml(entry.status)}</td><td>${entry.indexable ? 'Yes' : 'No'}</td><td>${reasons}</td></tr>`;
}).join('');

const statusCounts = ['reviewed', 'practical', 'pending-review', 'restricted']
  .map(status => `<li><strong>${escapeHtml(status)}</strong>: ${number(evidence.counts?.[status] ?? 0)}</li>`)
  .join('');
const enforcedList = enforced.map(item => `<li><code>${escapeHtml(item.id)}</code>: ${escapeHtml(item.description)}</li>`).join('');
const monitoredList = monitored.map(item => `<li><code>${escapeHtml(item.id)}</code>: ${escapeHtml(item.description)}</li>`).join('');
const canonical = 'https://brali-lifeos.github.io/quality/claims/';
const description = 'Current Brali public-claim review signals, enforced categories, debt counts, indexing state, and evidence boundaries.';

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Claim quality — Brali</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Claim quality — Brali">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://brali-lifeos.github.io/assets/images/brali-logo.png">
  <link rel="icon" href="/assets/images/brali-logo.png">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Brali claim quality',
    description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Brali', url: 'https://brali-lifeos.github.io/' },
  })}</script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a><a href="/faq/">FAQ</a><a class="button yellow" href="/partners/">Partners</a></div></nav></header>
<main id="content" class="page wrap">
  <p class="eyebrow">Trust and claim integrity</p>
  <h1>Claim quality is measured, not assumed.</h1>
  <p class="lead">This page reports claim markers found in Brali's canonical public protocol records. A marker is a review signal, not a verdict that a statement is false. Enforced unsupported claims cannot remain in normal indexable discovery.</p>

  <section class="grid four" aria-label="Claim quality metrics">
    <article class="card"><span class="card-label">Records checked</span><h2 data-claim-metric="records_checked">${number(claimDebt.counts?.records_checked)}</h2><p>Canonical protocol records inspected by the current build.</p></article>
    <article class="card"><span class="card-label">Records with markers</span><h2 data-claim-metric="records_with_markers">${number(claimDebt.counts?.records_with_markers)}</h2><p>Records containing at least one enforced or monitor-only review signal.</p></article>
    <article class="card"><span class="card-label">Debt entries</span><h2 data-claim-metric="debt_entries">${number(claimDebt.counts?.debt_entries)}</h2><p>Records requiring review, rewrite, restriction, or stronger provenance.</p></article>
    <article class="card"><span class="card-label">Indexable debt</span><h2 data-claim-metric="indexable_debt_entries">${number(claimDebt.counts?.indexable_debt_entries)}</h2><p>Debt still exposed through normal trusted discovery. The quality gate requires zero.</p></article>
  </section>

  <section class="prose">
    <h2>Current evidence states</h2>
    <ul>${statusCounts}</ul>
    <p>Only <code>reviewed</code> and <code>practical</code> records qualify for normal trusted retrieval. Pending and restricted records retain stable provenance but stay outside ordinary recommendations.</p>

    <h2>Phase-one blockers</h2>
    <p>These categories block unsupported indexable wording now:</p>
    <ul>${enforcedList}</ul>

    <h2>Monitor-only signals</h2>
    <p>These remain visible for editorial prioritisation and false-positive analysis. They are not automatic proof of debt by themselves:</p>
    <ul>${monitoredList}</ul>

    <h2>Marker coverage</h2>
    <div class="table-wrap"><table><thead><tr><th>Category</th><th>Policy</th><th>Records</th><th>Meaning</th></tr></thead><tbody>${categoryRows}</tbody></table></div>

    <h2>Current claim debt</h2>
    ${debtEntries.length ? `<p>The table shows up to 25 current debt entries. The complete deterministic report remains available as JSON.</p><div class="table-wrap"><table><thead><tr><th>Record</th><th>Status</th><th>Indexable</th><th>Debt reason</th></tr></thead><tbody>${debtRows}</tbody></table></div>` : '<p>No current debt entries were produced by this build.</p>'}

    <h2>How to read this report</h2>
    <ul>
      <li>The absence of a marker does not prove a protocol is supported by research.</li>
      <li>The presence of a marker does not prove a claim is false.</li>
      <li>Reviewed wording must preserve its exact source, limitations, population, intervention, and outcome boundary.</li>
      <li>Targets, demos, generated counters, repository activity, and page views are not evidence of users or successful outcomes.</li>
    </ul>
    <p><a href="/life-os/datasets/claim-debt.json">Download the complete claim-debt report →</a></p>
    <p><a href="/life-os/methodology/">Read the content and evidence methodology →</a></p>
  </section>
</main>
<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Practical knowledge with visible trust boundaries.</small></div><div class="footer-links"><a href="/life-os/">Library</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a><a href="/cite/">Cite</a></div></div></footer>
</body>
</html>
`;

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'index.html'), html);

let datasetsHtml = await readFile(datasetsPage, 'utf8');
if (!datasetsHtml.includes('/quality/claims/')) {
  datasetsHtml = datasetsHtml.replace('</ul>', '<li><a href="/quality/claims/">Public claim quality summary</a></li></ul>');
  await writeFile(datasetsPage, datasetsHtml);
}

console.log(`Claim quality summary generated: ${claimDebt.counts?.records_checked ?? 0} checked, ${claimDebt.counts?.debt_entries ?? 0} debt, ${claimDebt.counts?.indexable_debt_entries ?? 0} indexable debt.`);
