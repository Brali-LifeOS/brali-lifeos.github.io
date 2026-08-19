import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io';
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
const hubs = JSON.parse(read('data/topic-hubs.json')).hubs || [];

for (const hub of hubs) {
  const rel = `topics/${hub.slug}/index.html`;
  let html = read(rel);
  const href = `/for-ai/query/?q=${encodeURIComponent(hub.question)}`;
  const block = `<aside class="callout" data-brali-query-deeplink><h3>Ask Brali about ${hub.title}</h3><p>Run this hub's problem-first question through the zero-install Query Playground and inspect the high-trust Protocol and evidence packet.</p><a class="button" href="${href}">Ask Brali about this →</a></aside>`;
  if (html.includes('data-brali-query-deeplink')) html = html.replace(/<aside class="callout" data-brali-query-deeplink>[\s\S]*?<\/aside>/, block);
  else html = html.replace('<section><h2>What this topic covers</h2>', `${block}<section><h2>What this topic covers</h2>`);
  write(rel, html);
}

const entryBlock = '<aside class="callout" data-brali-query-entry><h3>Ask a practical question</h3><p>Use Brali Query to inspect the matched Topic, high-trust Protocols, evidence boundaries, provenance, and a copyable agent-context packet.</p><a class="button" href="/for-ai/query/">Ask Brali →</a></aside>';
for (const rel of ['index.html', 'life-os/index.html']) {
  let html = read(rel);
  if (!html.includes('data-brali-query-entry')) html = html.replace('</main>', `${entryBlock}</main>`);
  write(rel, html);
}

const queryRel = 'for-ai/query/index.html';
let queryHtml = read(queryRel);
const feedback = `<section class="prose" data-query-feedback><h2>Help improve Brali retrieval</h2><p>If the match is wrong or useful knowledge is missing, open a prefilled GitHub issue draft. The current query and returned IDs are added to the draft only when you click the link; review the draft before submitting it.</p><p><a id="feedback-match" href="${REPO}/issues/new">Report a bad match or missing knowledge</a> · <a id="feedback-integration" href="${REPO}/issues/new">Share an integration or usage report</a></p></section>`;
if (queryHtml.includes('data-query-feedback')) queryHtml = queryHtml.replace(/<section class="prose" data-query-feedback>[\s\S]*?<\/section>/, feedback);
else queryHtml = queryHtml.replace('</main>', `${feedback}</main>`);
write(queryRel, queryHtml);

console.log(`Query adoption funnel generated: ${hubs.length} Topic deep links, 2 public entry points, 2 GitHub feedback paths.`);
