import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "life-os/index.html");
let html = await readFile(pagePath, "utf8");

if (!html.includes('/library-search.css')) {
  html = html.replace('</head>', '<link rel="stylesheet" href="/library-search.css"><script src="/library-search.js" defer></script></head>');
}

if (!html.includes('data-library-search="true"')) {
  const search = '<section class="library-search" data-library-search="true"><label for="protocol-search">Find a protocol</label><input id="protocol-search" type="search" inputmode="search" autocomplete="off" placeholder="Try: focus, negotiation, language, sleep…" aria-describedby="protocol-search-status"><p id="protocol-search-status" class="search-status" data-search-status aria-live="polite">Search reviewed and low-risk practical entries by topic, goal, or method.</p><ul class="search-results" data-search-results></ul></section>';
  const gridMarker = '<div class="grid three">';
  if (!html.includes(gridMarker)) throw new Error('Growth Library landing page no longer contains its zone grid marker.');
  html = html.replace(gridMarker, `${search}${gridMarker}`);
}

await writeFile(pagePath, html);
console.log('Growth Library search UI added.');
