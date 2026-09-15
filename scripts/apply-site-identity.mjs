import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-identity.json'), 'utf8'));
const file = path.join(ROOT, 'index.html');
let html = fs.readFileSync(file, 'utf8');

const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const replaceMeta = (attribute, key, value) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapedKey}["'])[^>]*>`, 'i');
  const replacement = `<meta ${attribute}="${key}" content="${escapeAttr(value)}">`;
  if (!pattern.test(html)) throw new Error(`Homepage lacks ${attribute}=${key}; refuse to silently invent a second metadata block.`);
  html = html.replace(pattern, replacement);
};

html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeAttr(identity.homepageTitle)}</title>`);
replaceMeta('name', 'description', identity.homepageDescription);
replaceMeta('property', 'og:title', identity.homepageTitle);
replaceMeta('property', 'og:description', identity.homepageDescription);

html = html.replace(
  '<p class="eyebrow">Practical protocols · explicit evidence · open data</p>',
  '<p class="eyebrow">Evidence-informed decisions · practical protocols · open data</p>'
);
html = html.replace(
  '<p class="lead">Brali helps you find one useful protocol for real life. Every idea keeps its evidence, sources, and limits visible before you decide whether it fits.</p>',
  '<p class="lead">Start with a real problem. Brali gives you a bounded recommendation, keeps evidence and limits visible, then lets you inspect, run, or reuse the underlying protocol.</p>'
);

html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i, (block, raw) => {
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Homepage JSON-LD is invalid before identity application.'); }
  const graph = Array.isArray(value?.['@graph']) ? value['@graph'] : [value];
  const website = graph.find(node => node?.['@type'] === 'WebSite');
  if (!website) throw new Error('Homepage lacks the canonical WebSite JSON-LD node.');
  website.name = identity.siteName;
  website.url = identity.siteUrl;
  website.description = identity.homepageDescription;
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
});

fs.writeFileSync(file, html);
console.log(`Homepage product identity applied: ${identity.homepageTitle}`);
