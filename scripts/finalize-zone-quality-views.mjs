import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const zones = read('data/life-os-zones.json');
const protocols = read('life-os/datasets/protocols.json');
const protocolsByZone = new Map();
for (const protocol of protocols.entries ?? []) {
  const slug = protocol.growth_zone?.slug;
  if (!slug) continue;
  if (!protocolsByZone.has(slug)) protocolsByZone.set(slug, []);
  protocolsByZone.get(slug).push(protocol);
}
for (const items of protocolsByZone.values()) items.sort((a, b) => a.title.localeCompare(b.title));

let normalized = 0;
for (const zone of zones) {
  const pagePath = path.join(ROOT, 'life-os', zone.slug, 'index.html');
  const machine = read(`life-os/${zone.slug}/index.json`);
  const trusted = protocolsByZone.get(zone.slug) ?? [];
  let html = fs.readFileSync(pagePath, 'utf8');
  const before = html;

  const trustedBody = trusted.length
    ? `<ul class="article-list" data-zone-trusted-list="true">${trusted.slice(0, 10).map(protocol => `<li><a href="/life-os/${esc(protocol.slug)}/">${esc(protocol.title)}</a><span>${esc(protocol.action || protocol.description || '')}</span><small>${esc(protocol.evidence?.status || 'trusted')}</small></li>`).join('')}</ul>${trusted.length > 10 ? `<p><small>${trusted.length - 10} more trusted protocols are listed in the full archive below.</small></p>` : ''}`
    : '<p>No entry in this zone currently meets the trusted Protocol Feed bar. The archive is search-visible and evidence-labelled, but its entries remain excluded from normal trusted recommendations until review is complete.</p>';
  const trustedSection = `<section class="prose" data-zone-trusted="true"><h2>Start with trusted protocols</h2><p>These entries currently meet Brali's reviewed/practical retrieval bar. “Trusted” is a publication state, not a promise that every protocol has equal scientific support.</p>${trustedBody}</section>`;
  const trustedPattern = /<section class="prose"><h2>Start with trusted protocols<\/h2>[\s\S]*?<\/section>/;
  const markedTrustedPattern = /<section class="prose" data-zone-trusted="true"><h2>Start with trusted protocols<\/h2>[\s\S]*?<\/section>/;
  if (markedTrustedPattern.test(html)) html = html.replace(markedTrustedPattern, trustedSection);
  else if (trustedPattern.test(html)) html = html.replace(trustedPattern, trustedSection);

  const archiveHeading = `<h2>${machine.counts.library_entries} library entries</h2>`;
  if (html.includes(`<section class="prose">${archiveHeading}`)) {
    html = html.replace(`<section class="prose">${archiveHeading}`, `<section class="prose" data-zone-archive="true">${archiveHeading}`);
  }
  const archiveSectionPattern = /(<section class="prose" data-zone-archive="true">[\s\S]*?)(<ul class="article-list">)([\s\S]*?<\/ul>)(<\/section>)/;
  if (archiveSectionPattern.test(html)) html = html.replace(archiveSectionPattern, '$1<ul class="article-list" data-zone-archive-list="true">$3$4');

  if (html !== before) {
    fs.writeFileSync(pagePath, html);
    normalized += 1;
  }
}

const reportPath = path.join(ROOT, 'state/quality/index.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
report.loop.zone_view_normalization = { zones_checked: zones.length, zones_changed: normalized, purpose: 'Keep the trusted-protocol subset distinct from the full evidence-labelled archive after iterative HTML passes.' };
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Zone quality views finalized: ${zones.length} checked, ${normalized} normalized; trusted subset and full archive kept separate.`);
