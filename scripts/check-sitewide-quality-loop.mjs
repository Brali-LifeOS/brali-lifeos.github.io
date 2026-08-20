import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const fail = message => { throw new Error(`Site-wide quality validation failed: ${message}`); };

const sourceIndex = read('data/life-os-content/index.json');
const zones = read('data/life-os-zones.json');
const evidence = read('life-os/datasets/evidence.json');
const protocols = read('life-os/datasets/protocols.json');
const report = read('state/quality/index.json');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
const stateHtml = fs.readFileSync(path.join(ROOT, 'state/index.html'), 'utf8');

if (report.schema_version !== 1) fail('unexpected report schema version');
if (report.coverage.entry_pages_checked !== sourceIndex.length) fail(`entry coverage drift: ${report.coverage.entry_pages_checked}/${sourceIndex.length}`);
if (report.coverage.zone_pages_checked !== zones.length) fail(`zone coverage drift: ${report.coverage.zone_pages_checked}/${zones.length}`);
if (report.coverage.total_pages_checked !== sourceIndex.length + zones.length) fail('total page coverage drift');
if (report.coverage.machine_readable_page_records !== sourceIndex.length + zones.length) fail('machine-readable page count drift');
if (report.coverage.trusted_protocols !== (protocols.count ?? protocols.entries?.length ?? 0)) fail('trusted protocol count drift');
if (report.coverage.indexable_entry_pages !== (evidence.entries ?? []).filter(item => item.indexable).length) fail('indexable entry count drift');
if (report.coverage.withheld_entry_pages !== (evidence.entries ?? []).filter(item => !item.indexable).length) fail('withheld entry count drift');
if (!report.loop?.converged || report.loop.changed_pages_by_pass?.at(-1) !== 0) fail('automatic loop did not converge');
if ((report.error_count ?? 0) !== 0) fail(`report contains ${report.error_count} enforced error(s)`);
if ((report.issues ?? []).some(issue => issue.severity === 'error')) fail('report issue list still contains an error');
if ((report.zones ?? []).length !== zones.length) fail('zone report does not cover every Growth Zone');

const evidenceBySlug = new Map((evidence.entries ?? []).map(item => [item.slug, item]));
const zoneReport = new Map((report.zones ?? []).map(item => [item.slug, item]));

for (const entry of sourceIndex) {
  const pathname = `/life-os/${entry.slug}/`;
  const htmlPath = path.join(ROOT, 'life-os', entry.slug, 'index.html');
  const jsonPath = path.join(ROOT, 'life-os', entry.slug, 'index.json');
  if (!fs.existsSync(htmlPath) || !fs.existsSync(jsonPath)) fail(`${entry.slug}: missing HTML or JSON page record`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const machine = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const trust = evidenceBySlug.get(entry.slug);
  if (!html.includes('data-sitewide-quality-context="true"')) fail(`${entry.slug}: missing site-wide quality context`);
  if (!html.includes(`rel="alternate" type="application/json" href="${pathname}index.json"`)) fail(`${entry.slug}: missing alternate JSON link`);
  if (machine.slug !== entry.slug || machine.canonical_url !== `${BASE}${pathname}`) fail(`${entry.slug}: machine record identity drift`);
  if (machine.evidence?.status !== trust?.status || Boolean(machine.evidence?.indexable) !== Boolean(trust?.indexable)) fail(`${entry.slug}: machine evidence state drift`);
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  if (Boolean(trust?.indexable) === noindex) fail(`${entry.slug}: robots policy disagrees with evidence index`);
  const inSitemap = sitemap.includes(`<loc>${BASE}${pathname}</loc>`);
  if (Boolean(trust?.indexable) !== inSitemap) fail(`${entry.slug}: sitemap policy disagrees with evidence index`);
}

for (const zone of zones) {
  const pathname = `/life-os/${zone.slug}/`;
  const row = zoneReport.get(zone.slug);
  if (!row) fail(`${zone.slug}: missing zone report row`);
  const htmlPath = path.join(ROOT, 'life-os', zone.slug, 'index.html');
  const jsonPath = path.join(ROOT, 'life-os', zone.slug, 'index.json');
  if (!fs.existsSync(htmlPath) || !fs.existsSync(jsonPath)) fail(`${zone.slug}: missing zone HTML or JSON`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const machine = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!html.includes('data-zone-quality="true"')) fail(`${zone.slug}: missing trust-first zone overview`);
  if (!html.includes(`rel="alternate" type="application/json" href="${pathname}index.json"`)) fail(`${zone.slug}: missing alternate JSON link`);
  if (machine.slug !== zone.slug || Boolean(machine.indexable) !== Boolean(row.indexable)) fail(`${zone.slug}: zone machine record drift`);
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  if (Boolean(row.indexable) === noindex) fail(`${zone.slug}: robots policy disagrees with trusted coverage`);
  const inSitemap = sitemap.includes(`<loc>${BASE}${pathname}</loc>`);
  if (Boolean(row.indexable) !== inSitemap) fail(`${zone.slug}: sitemap policy disagrees with trusted coverage`);
  if (row.indexable !== (row.trusted_protocols > 0)) fail(`${zone.slug}: zone indexing must require at least one trusted protocol`);
}

if (!fs.existsSync(path.join(ROOT, 'state/quality/index.html'))) fail('missing public quality report page');
if (!sitemap.includes(`<loc>${BASE}/state/quality/</loc>`)) fail('quality report missing from sitemap');
if (!stateHtml.includes('data-sitewide-quality-cycle')) fail('State page does not expose quality cycle');
if (!llms.includes('Page & Zone Quality Cycle:')) fail('llms.txt does not expose quality cycle');

console.log(`Site-wide quality verified: ${sourceIndex.length} entry pages, ${zones.length} zones, ${report.coverage.indexable_zones} indexable zones, loop ${report.loop.changed_pages_by_pass.join(' -> ')}, zero enforced errors.`);
