import { readFile } from 'node:fs/promises';

const BASE = 'https://brali-lifeos.github.io';
const evidence = JSON.parse(await readFile('life-os/datasets/evidence.json', 'utf8'));
const sample = (evidence.entries || []).filter((entry) => entry.indexable === true && entry.sensitive !== true).slice(0, 6);
if (sample.length < 4) throw new Error('Live Internal Discovery sample is unexpectedly small.');
for (const record of sample) {
  const url = `${BASE}/life-os/${record.slug}/`;
  const response = await fetch(url, { headers: { 'user-agent': 'BraliInternalDiscoveryCheck/1.0' } });
  if (!response.ok) throw new Error(`${record.slug}: live fetch returned ${response.status}`);
  const html = await response.text();
  for (const marker of ['data-page-utility','data-internal-discovery-continuation','src="/internal-discovery.js"']) {
    if (!html.includes(marker)) throw new Error(`${record.slug}: live page missing ${marker}`);
  }
  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
  if (canonical !== url) throw new Error(`${record.slug}: live canonical mismatch`);
}
console.log(`Live Internal Discovery & Distribution passed on ${sample.length} representative non-sensitive Brali protocols.`);
