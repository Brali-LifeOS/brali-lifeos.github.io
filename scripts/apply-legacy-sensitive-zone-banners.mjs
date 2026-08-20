import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const state = read('life-os/datasets/legacy-sensitive-collections.json');
const items = [
  ...(state.collections ?? []),
  ...(state.empty_legacy_collections ?? []),
];

const replaceDescription = (html, description) => {
  const safe = esc(description);
  html = /<meta\s+name=["']description["'][^>]*>/i.test(html)
    ? html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${safe}">`)
    : html;
  html = /<meta\s+property=["']og:description["'][^>]*>/i.test(html)
    ? html.replace(/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${safe}">`)
    : html;
  return html;
};

let changed = 0;
for (const item of items) {
  const pagePath = path.join(ROOT, 'life-os', item.zone_slug, 'index.html');
  const machinePath = path.join(ROOT, 'life-os', item.zone_slug, 'index.json');
  if (!fs.existsSync(pagePath) || !fs.existsSync(machinePath)) throw new Error(`Missing generated zone surface for ${item.zone_slug}`);

  let html = fs.readFileSync(pagePath, 'utf8');
  const before = html;
  const sensitive = item.recommendation_status === 'archive-only';
  const label = sensitive ? 'Archive-only · not recommended by Brali' : 'Empty legacy collection';
  const description = sensitive
    ? `${item.zone_title} is a preserved Brali legacy archive. Its current entries are withheld from trusted recommendation pending direct source-to-protocol review.`
    : `${item.zone_title} is an empty Brali legacy compatibility collection and is not filled merely to improve coverage statistics.`;
  const banner = `<aside class="callout" data-legacy-trust-boundary="true"><span class="card-label">${esc(label)}</span><h2>${sensitive ? 'Preserved for compatibility, withheld from trusted recommendation' : 'Preserved compatibility URL with no current entries'}</h2><p>${esc(item.decision_reason)}</p><p><strong>Next review step:</strong> ${esc(item.next_action)}</p><p><strong>Scope:</strong> ${esc(item.scope_note)}</p><p><a href="/state/legacy-sensitive/">Read the Legacy Sensitive Collections trust state →</a></p></aside>`;
  if (!html.includes('data-legacy-trust-boundary="true"')) {
    const leadPattern = /(<p class="lead">[\s\S]*?<\/p>)/;
    html = leadPattern.test(html) ? html.replace(leadPattern, `$1${banner}`) : html.replace('</h1>', `</h1>${banner}`);
  }
  html = replaceDescription(html, description);
  if (html !== before) {
    fs.writeFileSync(pagePath, html);
    changed += 1;
  }

  const machine = read(`life-os/${item.zone_slug}/index.json`);
  machine.recommendation_status = item.recommendation_status;
  machine.trust_boundary = {
    disposition: item.disposition,
    reason: item.decision_reason,
    next_action: item.next_action,
    scope_note: item.scope_note,
    state_url: `${BASE}/state/legacy-sensitive/`,
    trusted_protocols: 0,
  };
  fs.writeFileSync(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
}

console.log(`Legacy zone trust banners applied: ${changed}/${items.length} zone page(s) updated with visible and machine-readable archive boundaries.`);
