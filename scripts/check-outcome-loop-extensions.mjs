import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const read = rel => readFile(path.join(root, rel), 'utf8');
const readJson = async rel => JSON.parse(await read(rel));
const fail = message => { throw new Error(`Outcome extension check failed: ${message}`); };

const policy = await readJson('data/outcome-policy.json');
const queue = await readJson('life-os/datasets/outcome-review-queue.json');
const integrationIndex = await read('for-ai/integrations/index.html');
const integrationPage = await read('for-ai/integrations/report/index.html');
const integrationApp = await read('for-ai/integrations/report/app.js');
const runnerPage = await read('run/index.html');
const runnerApp = await read('run/app.js');
const runnerOutcome = await read('run/outcome-run.js');
const queryApp = await read('for-ai/query/app.js');
const sitemap = await read('sitemap.xml');

if (policy.instrumentation_scope?.query_feedback !== 'live') fail('Query feedback is not live');
if (policy.instrumentation_scope?.protocol_execution !== 'live') fail('Protocol Runner is not live');
if (policy.instrumentation_scope?.integration_feedback !== 'live') fail('integration feedback is not live');
if (policy.instrumentation_scope?.unresolved_review_queue !== 'live') fail('unresolved review queue is not live');
if (policy.automatic_collection?.enabled !== false) fail('automatic collection must remain disabled');
if (!policy.public_surfaces?.review_queue?.endsWith('/life-os/datasets/outcome-review-queue.json')) fail('review queue public surface missing');
if (!policy.public_surfaces?.integration_feedback?.endsWith('/for-ai/integrations/report/')) fail('integration feedback public surface missing');

if (queue.schema_version !== 1 || !Array.isArray(queue.items)) fail('outcome review queue malformed');
if (queue.counts?.total !== queue.items.length) fail('outcome review queue count drift');
const categories = new Set(['no_trusted_answer', 'bad_match', 'missing_knowledge']);
for (const item of queue.items) {
  if (!categories.has(item.category)) fail(`unsupported unresolved category: ${item.category}`);
  if (item.raw_query_included !== false || item.user_identifier_included !== false) fail(`privacy flags drift for ${item.id}`);
  if ('query' in item || 'raw_query' in item || 'query_text' in item || 'user_id' in item || 'prompt' in item) fail(`private text/identity field leaked into ${item.id}`);
  if (!Array.isArray(item.topic_ids) || !Array.isArray(item.protocol_ids)) fail(`canonical context arrays missing for ${item.id}`);
  if (!item.provenance?.source_channel || !item.provenance?.source_url) fail(`review provenance missing for ${item.id}`);
}

for (const marker of ['Tell Brali that an integration path was actually used','integration-report-form','integration-client','Create local report','Nothing is sent automatically','/contracts/outcome-event.schema.json']) {
  if (!integrationPage.includes(marker)) fail(`integration report page lacks marker: ${marker}`);
}
for (const marker of ["event_type: 'integration_reported'","reason: 'integration'",'raw_query_included: false','personal_data_included: false','user_identifier_included: false',"channel,",'githubDraft(buildEvent']) {
  if (!integrationApp.includes(marker)) fail(`integration report app lacks marker: ${marker}`);
}
const integrationRisk = integrationApp.replace("fetch('/life-os/datasets/manifest.json'", "STATIC_MANIFEST_FETCH(");
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|google-analytics|gtag\(|plausible|segment\.com/i.test(integrationRisk)) fail('integration outcome code contains unapproved network telemetry or persistence');
if (!integrationIndex.includes('data-brali-integration-outcome') || !integrationIndex.includes('/for-ai/integrations/report/')) fail('integration surface does not expose outcome report path');

for (const marker of ['Protocol Runner','id="run-start"','id="run-complete"','id="run-helpful"','id="run-not-helpful"','Nothing has been sent']) if (!runnerPage.includes(marker)) fail(`runner page lacks marker: ${marker}`);
if (!queryApp.includes('/run/?protocol=') || !queryApp.includes('Run protocol')) fail('Ask Brali does not link trusted matches to Runner');
if (!runnerApp.includes("['reviewed', 'practical'].includes(protocol.evidence?.status)")) fail('Runner does not restrict source feed to trusted evidence states');
if (!runnerApp.includes('newRunId()') || !runnerApp.includes('completeRun()') || !runnerApp.includes('setHelpful(true)') || !runnerApp.includes('setHelpful(false)')) fail('Runner lifecycle wiring incomplete');
const runnerNetworkRisk = runnerApp
  .replace("fetch('/life-os/datasets/protocols.json'", 'STATIC_PROTOCOL_FETCH(')
  .replace("fetch('/life-os/datasets/manifest.json'", 'STATIC_MANIFEST_FETCH(');
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/i.test(runnerNetworkRisk)) fail('Runner contains unapproved network transmission or persistence');
if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/i.test(runnerOutcome)) fail('Runner outcome export contains network transmission or persistence');

for (const rel of ['for-ai/query/app.js','for-ai/query/outcome-feedback.js','run/app.js','run/outcome-run.js','for-ai/integrations/report/app.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${rel} syntax error: ${(result.stderr || result.stdout).trim()}`);
}

for (const route of ['/run/', '/for-ai/integrations/report/']) {
  if (!sitemap.includes(`<loc>https://brali-lifeos.github.io${route}</loc>`)) fail(`sitemap lacks ${route}`);
}

console.log(`Outcome extensions verified: runner=live; integration-feedback=live; unresolved-queue=${queue.items.length}; raw-query=false; automatic-collection=false.`);
