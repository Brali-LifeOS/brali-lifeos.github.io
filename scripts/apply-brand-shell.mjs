import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = 'https://brali-lifeos.github.io';
const SKIP = new Set(['node_modules', '.git', 'reports']);

const header = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/" aria-label="Brali home"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/life-os/">Explore</a><a href="/life-os/methodology/">Evidence</a><a href="/research/">Research</a><a href="/partners/">Build with Brali</a><a class="button" href="/for-ai/">For AI &amp; Developers</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>One useful next move, with the why still attached.</small></div><div class="footer-links"><a href="/life-os/">Explore</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a><a href="/partners/">Partners</a><a href="/contact/">Contact</a><a href="/terms/">Terms</a><a href="/privacy/">Privacy</a></div></div></footer>`;
const arwpDiscovery = '  <link rel="describedby" type="application/json" href="/ai/site-profile.json" title="Agent-Ready Web Profile">\n';
const preferredSource = '<aside class="callout" data-brali-preferred-source="true"><h2>Follow Brali as a preferred source</h2><p>If Google offers Brali in Preferred Sources for your account, you can choose this site so Brali can be highlighted for you in supported Search surfaces.</p><p><a class="button" href="https://www.google.com/preferences/source?q=brali-lifeos.github.io" rel="noopener" target="_blank">Add Brali as a Preferred Source on Google</a></p><small>This is a user preference, not a ranking guarantee and not a claim that Brali is currently eligible in every locale or account.</small></aside>';
const organizationIdentity = `<script type="application/ld+json" data-brali-growth-identity="true">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${BASE}/#organization`,
  name: 'Brali',
  alternateName: 'Brali LifeOS',
  url: `${BASE}/`,
  logo: { '@type': 'ImageObject', url: `${BASE}/assets/images/brali-logo.png` }
}).replace(/</g, '\\u003c')}</script>`;

function files(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...files(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) result.push(file);
  }
  return result;
}

function cluster(rel) {
  if (/^(life-os|topics|problems|questions)\//.test(rel)) return 'library';
  if (/^(research|evidence|state)\//.test(rel)) return 'research';
  if (/^(for-ai|agents|skills|api)\//.test(rel)) return 'ai';
  if (/^partners\//.test(rel)) return 'partners';
  return 'general';
}

function plainText(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function breadcrumb(rel, html) {
  const directories = rel.split('/').slice(0, -1);
  if (directories.length < 2) return '';
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1) return '';
  const current = plainText(h1[1]);
  const shortCurrent = current.length > 58 ? `${current.slice(0, 55).trim()}…` : current;
  const root = directories[0];
  const section = {
    'life-os': ['Explore', '/life-os/'],
    topics: ['Topics', '/topics/'],
    research: ['Research', '/research/'],
    'for-ai': ['For AI', '/for-ai/'],
    problems: ['Problems', '/problems/'],
    evidence: ['Evidence', '/evidence/']
  }[root] || [root.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()), `/${root}/`];
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><a href="${section[1]}">${section[0]}</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><span aria-current="page" title="${escapeAttribute(current)}">${escapeAttribute(shortCurrent)}</span></nav>`;
}

function markLongHeadings(html, isHomepage) {
  if (isHomepage) return html;
  return html.replace(/<(h[12])([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, body) => {
    const threshold = tag.toLowerCase() === 'h1' ? 46 : 68;
    if (plainText(body).length <= threshold || /\blong-heading\b/.test(attrs)) return match;
    if (/\sclass="[^"]*"/.test(attrs)) {
      attrs = attrs.replace(/\sclass="([^"]*)"/, (_classMatch, classes) => ` class="${classes} long-heading"`);
    } else {
      attrs += ' class="long-heading"';
    }
    return `<${tag}${attrs}>${body}</${tag}>`;
  });
}

function ensureLargeImagePreview(html) {
  const match = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i);
  if (!match) return html.replace(/<\/head>/i, '<meta name="robots" content="max-image-preview:large"></head>');
  const tag = match[0];
  const content = tag.match(/\bcontent=(["'])(.*?)\1/i)?.[2] ?? '';
  if (/(?:^|,)\s*max-image-preview\s*:/i.test(content)) return html;
  const next = content.trim() ? `${content}, max-image-preview:large` : 'max-image-preview:large';
  const replacement = /\bcontent=(["'])(.*?)\1/i.test(tag)
    ? tag.replace(/\bcontent=(["'])(.*?)\1/i, (_whole, quote) => `content=${quote}${next}${quote}`)
    : tag.replace(/>$/, ` content="${next}">`);
  return html.replace(tag, replacement);
}

let changed = 0;
for (const file of files(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  html = html.replace(/href="\/styles\.css(?:\?[^\"]*)?"/g, 'href="/styles.css?v=20260822j"');
  html = html.replace(/href="\/life-os\/flagships\/100\/"/g, 'href="/life-os/flagships/curated-100/"');
  html = markLongHeadings(html, rel === 'index.html');
  html = html.replace(/<a class="skip"[^>]*>[\s\S]*?<\/a>/g, '');
  html = ensureLargeImagePreview(html);

  if (!/href="\/ai\/site-profile\.json"/.test(html) && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${arwpDiscovery}</head>`);
  }
  if (rel === 'index.html' && !html.includes('data-brali-growth-identity="true"')) {
    html = html.replace(/<\/head>/i, `${organizationIdentity}</head>`);
  }
  if (rel === 'updates/index.html' && !html.includes('data-brali-preferred-source="true"')) {
    html = html.replace(/<\/main>/i, `${preferredSource}</main>`);
  }

  if (/<header class="site-header">[\s\S]*?<\/header>/.test(html)) {
    html = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, header);
  } else if (/<body[^>]*>/.test(html)) {
    html = html.replace(/(<body[^>]*>)(?:<a class="skip"[^>]*>.*?<\/a>)?/, `$1<a class="skip" href="#content">Skip to content</a>${header}`);
  }

  if (!/<a class="skip"/.test(html) && /<header class="site-header">/.test(html)) {
    html = html.replace('<header class="site-header">', '<a class="skip" href="#content">Skip to content</a><header class="site-header">');
  }

  if (!/class="breadcrumbs"/.test(html)) {
    const trail = breadcrumb(rel, html);
    if (trail) html = html.replace(/(<main\b[^>]*>)/, `$1${trail}`);
  }

  if (/<footer class="footer">[\s\S]*?<\/footer>/.test(html)) {
    html = html.replace(/<footer class="footer">[\s\S]*?<\/footer>/, footer);
  } else if (/<\/body>/.test(html)) {
    html = html.replace('</body>', `${footer}</body>`);
  }

  if (/<body(?![^>]*data-brali-cluster)[^>]*>/.test(html)) {
    html = html.replace(/<body([^>]*)>/, `<body$1 data-brali-cluster="${cluster(rel)}">`);
  }

  if (html !== before) {
    fs.writeFileSync(file, html);
    changed += 1;
  }
}

console.log(`Applied Brali brand shell and ARWP Growth discovery defaults to ${changed} HTML files.`);