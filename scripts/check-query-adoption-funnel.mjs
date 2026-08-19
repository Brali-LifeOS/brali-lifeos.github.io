import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io';
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const hubs = JSON.parse(read('data/topic-hubs.json')).hubs || [];

assert(hubs.length === 7, `Expected 7 Topic Hubs, got ${hubs.length}`);
let deepLinks = 0;
for (const hub of hubs) {
  const html = read(`topics/${hub.slug}/index.html`);
  const encoded = encodeURIComponent(hub.question);
  const href = `/for-ai/query/?q=${encoded}`;
  assert(html.includes('data-brali-query-deeplink'), `${hub.slug}: Query deep-link marker missing`);
  assert(html.includes(href), `${hub.slug}: exact encoded Query URL missing`);
  assert(decodeURIComponent(encoded) === hub.question, `${hub.slug}: query encoding does not round-trip`);
  deepLinks += (html.match(/data-brali-query-deeplink/g) || []).length;
}
assert(deepLinks === 7, `Expected exactly 7 Topic deep-link blocks, got ${deepLinks}`);

for (const rel of ['index.html','life-os/index.html']) {
  const html = read(rel);
  assert(html.includes('data-brali-query-entry'), `${rel}: public Query entry marker missing`);
  assert(html.includes('/for-ai/query/'), `${rel}: Query URL missing`);
}

const queryHtml = read('for-ai/query/index.html');
const app = read('for-ai/query/app.js');
assert(queryHtml.includes('data-query-feedback'), 'Query feedback section missing');
assert(queryHtml.includes('id="feedback-match"'), 'Bad-match feedback link missing');
assert(queryHtml.includes('id="feedback-integration"'), 'Integration feedback link missing');
assert(queryHtml.includes('review the draft before submitting'), 'Feedback privacy/review warning missing');
assert(app.includes(`${REPO}/issues/new`), 'Query app does not build GitHub issue drafts');
assert(app.includes('feedback-match') && app.includes('feedback-integration'), 'Query app feedback elements not wired');
assert(app.includes('encodeURIComponent'), 'Query feedback URLs are not encoded');
assert(app.includes('Observed status') && app.includes('Returned Topics') && app.includes('Returned Protocols'), 'Retrieval feedback draft lacks observed packet context');
assert(!/fetch\([^)]*issues\/new|XMLHttpRequest|google-analytics|gtag\(|plausible|segment\.com/i.test(`${queryHtml}\n${app}`), 'Feedback funnel must not submit data or add analytics automatically');

console.log(`Query adoption funnel verified: ${deepLinks} Topic deep links, homepage/LifeOS entry points, privacy-light retrieval and integration GitHub drafts.`);
