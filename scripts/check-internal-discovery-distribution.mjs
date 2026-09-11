import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const BASE = 'https://brali-lifeos.github.io';
const evidence = JSON.parse(await readFile(path.join(root, 'life-os/datasets/evidence.json'), 'utf8'));
const source = JSON.parse(await readFile(path.join(root, 'data/life-os-content/index.json'), 'utf8'));
const sourceSlugs = new Set(source.map((entry) => entry.slug));
const indexable = (evidence.entries || []).filter((entry) => entry.indexable === true && sourceSlugs.has(entry.slug));
const indexableSlugs = new Set(indexable.map((entry) => entry.slug));
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
const manifest = JSON.parse(await readFile(path.join(root, 'life-os/datasets/internal-discovery.json'), 'utf8'));

function fail(message) { throw new Error(`Internal Discovery check failed: ${message}`); }
function canonical(html) { return html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] || ''; }
function section(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return '';
  const end = html.indexOf('</section>', start);
  return end < 0 ? html.slice(start) : html.slice(start, end + 10);
}

if (manifest.arwp_revision !== '793483e3404a97f7892e86bcda3fd317d5c7427c') fail('manifest ARWP revision mismatch');
if (manifest.canonical_indexable_protocols !== indexable.length) fail('manifest indexable protocol count mismatch');
if (manifest.enhanced_slugs.length !== indexable.length) fail('manifest enhanced cohort mismatch');
await access(path.join(root, 'internal-discovery.js'));
const styles = await readFile(path.join(root, 'styles.css'), 'utf8');
if (!styles.includes('/* ARWP Internal Discovery & Distribution */')) fail('styles marker missing');

let relatedEdges = 0;
for (const record of indexable) {
  const file = path.join(root, 'life-os', record.slug, 'index.html');
  const html = await readFile(file, 'utf8');
  const expected = `${BASE}/life-os/${record.slug}/`;
  if (canonical(html) !== expected) fail(`${record.slug}: canonical mismatch`);
  if (!sitemapUrls.has(expected)) fail(`${record.slug}: canonical indexable page missing from sitemap`);
  for (const marker of ['data-page-utility','data-internal-discovery-continuation','src="/internal-discovery.js"']) {
    if (!html.includes(marker)) fail(`${record.slug}: missing ${marker}`);
  }
  if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) fail(`${record.slug}: indexable page became noindex`);
  const continuation = section(html, '<section class="prose internal-continuation"');
  const hrefs = [...continuation.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  if (hrefs.length < 2) fail(`${record.slug}: fewer than two continuation paths`);
  for (const href of hrefs) {
    const absolute = new URL(href, BASE).href;
    if (!sitemapUrls.has(absolute)) fail(`${record.slug}: continuation target not in sitemap: ${href}`);
  }
  const related = section(html, '<section class="prose related-protocols"');
  for (const match of related.matchAll(/href="\/life-os\/([^/]+)\/"/g)) {
    relatedEdges += 1;
    if (!indexableSlugs.has(match[1])) fail(`${record.slug}: Related protocols points to non-indexable protocol ${match[1]}`);
  }
}
if (relatedEdges === 0) fail('existing Related protocols graph disappeared from the indexable cohort');
console.log(`Internal Discovery & Distribution gate passed: ${indexable.length} canonical indexable protocols expose utilities and hierarchy continuations; ${relatedEdges} existing Related-protocol edges remain indexable-only.`);
