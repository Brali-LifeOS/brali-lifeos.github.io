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
const outcomes = read('for-ai/query/outcome-feedback.js');
assert(queryHtml.includes('data-outcome-feedback'), 'Query outcome feedback section missing');
for (const choice of ['helpful','not-helpful','bad-match','missing-knowledge']) {
  assert(queryHtml.includes(`data-outcome-choice="${choice}"`), `Query feedback choice missing: ${choice}`);
}
assert(queryHtml.includes('id="feedback-include-query"'), 'Raw-query opt-in control missing');
assert(queryHtml.includes('off by default'), 'Raw-query opt-in is not visibly off by default');
assert(queryHtml.includes('id="feedback-integration"'), 'Integration feedback link missing');
assert(queryHtml.includes('review before submitting'), 'Feedback privacy/review warning missing');
assert(app.includes("from './outcome-feedback.js'"), 'Query app does not load outcome feedback module');
assert(app.includes("buildOutcome('github-issue')") && app.includes("buildOutcome('native-share')"), 'Query app feedback export channels not wired');
assert(outcomes.includes(`${REPO}/issues/new`), 'Outcome module does not build GitHub issue drafts');
assert(outcomes.includes('encodeURIComponent'), 'Outcome draft URLs are not encoded');
assert(outcomes.includes('topic_ids: topics') && outcomes.includes('protocol_ids: protocols'), 'Outcome envelope lacks returned packet context');
assert(outcomes.includes('raw_query_included: false') && outcomes.includes('user_identifier_included: false'), 'Outcome envelope privacy flags missing');
assert(outcomes.includes('includeQuery = false'), 'Raw query is not opt-in by default');
assert(!/fetch\([^)]*issues\/new|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|google-analytics|gtag\(|plausible|segment\.com/i.test(`${app}\n${outcomes}`), 'Feedback code must not submit outcome data, persist identity, or add its own analytics automatically');

console.log(`Query adoption funnel verified: ${deepLinks} Topic deep links, homepage/LifeOS entry points, four opt-in outcome signals, privacy-light export paths, and integration feedback.`);
