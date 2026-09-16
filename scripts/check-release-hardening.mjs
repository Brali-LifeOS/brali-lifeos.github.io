import fs from 'node:fs';

const fail = message => { throw new Error(`Release hardening check failed: ${message}`); };
const html = fs.readFileSync('index.html', 'utf8');
const titleQuality = JSON.parse(fs.readFileSync('life-os/datasets/title-quality.json', 'utf8'));
const sourceIndex = JSON.parse(fs.readFileSync('data/life-os-content/index.json', 'utf8'));

if ((titleQuality.unresolved_count ?? 0) !== 0 || (titleQuality.unresolved ?? []).length !== 0) {
  fail(`unresolved display titles remain: ${JSON.stringify(titleQuality.unresolved ?? [])}`);
}

const canonicalCorpus = JSON.stringify(sourceIndex).toLowerCase();
for (const residue of ['we share it for free', 'prototype mini-apps', 'flame counter']) {
  if (canonicalCorpus.includes(residue)) fail(`legacy product/template residue returned to canonical corpus: ${residue}`);
}

const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
const hero = images.filter(tag => /class="[^"]*hero-mascot[^"]*"/i.test(tag));
if (hero.length !== 1) fail(`expected exactly one hero mascot image, found ${hero.length}`);
if (!/fetchpriority="high"/i.test(hero[0])) fail('hero mascot must have fetchpriority="high"');
if (!/decoding="async"/i.test(hero[0])) fail('hero mascot must have decoding="async"');
if (/loading="lazy"/i.test(hero[0])) fail('hero mascot must not be lazy-loaded');

const deferred = images.filter(tag => /src="[^"]*brali-category-[^"]*"/i.test(tag) || /class="[^"]*audience-visual[^"]*"/i.test(tag));
if (deferred.length < 10) fail(`expected at least 10 below-fold topic/audience images, found ${deferred.length}`);
for (const tag of deferred) {
  if (!/loading="lazy"/i.test(tag)) fail(`below-fold image is missing lazy loading: ${tag}`);
  if (!/decoding="async"/i.test(tag)) fail(`below-fold image is missing async decoding: ${tag}`);
}

console.log(`Release hardening verified: zero unresolved titles, legacy EN residue blocked, ${deferred.length} below-fold homepage images deferred.`);
