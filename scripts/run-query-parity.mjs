import fs from 'node:fs';
import path from 'node:path';
import { queryBrali } from '../for-ai/query/retrieval.mjs';

const ROOT = process.cwd();
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const pct = (n, d) => d ? Number((100 * n / d).toFixed(1)) : 100;
const suite = read('data/agent-evaluation-suite.json');
const data = { topics: read('api/v1/topics.json'), identity: read('api/v1/identity.json'), flagships: read('api/v1/flagships.json'), decisions: read('api/v1/evidence-decisions.json') };

const rows = [];
for (const test of suite.cases || []) {
  const packet = queryBrali(test.query, data, { limit: suite.k || 5 });
  const routed = new Set((packet.route?.topics || []).map(x => x.id));
  const expectedTopics = test.expected_topic_ids || [];
  const acceptableTopics = test.acceptable_topic_ids || [];
  const topicChoices = [...expectedTopics, ...acceptableTopics];
  const topicApplicable = topicChoices.length > 0;
  const topicHit = !topicApplicable || topicChoices.some(id => routed.has(id));

  const gotProtocols = new Set((packet.recommendations || []).map(x => x.slug));
  const expectedProtocols = test.expected_protocol_slugs || [];
  const protocolApplicable = expectedProtocols.length > 0;
  const protocolHit = !protocolApplicable || expectedProtocols.some(slug => gotProtocols.has(slug));

  const gotDecisions = new Set((packet.evidence_boundaries || []).map(x => x.id));
  const expectedDecisions = test.expected_decision_ids || [];
  const decisionApplicable = expectedDecisions.length > 0;
  const decisionHit = !decisionApplicable || expectedDecisions.every(id => gotDecisions.has(id));

  const normalRetrieve = test.mode === 'retrieve';
  const boundaryOnly = Boolean(test.expect_boundary_only);
  const noAnswer = test.mode === 'no-answer';
  const statusPass = noAnswer
    ? packet.status === 'no-trusted-answer'
    : boundaryOnly
      ? packet.status === 'boundary-only'
      : normalRetrieve
        ? packet.status === 'trusted-answer'
        : ['trusted-answer','boundary-only'].includes(packet.status);

  const trustPass = (packet.recommendations || []).every(x => ['reviewed','practical'].includes(x.evidence_state));
  const provenancePass = (packet.recommendations || []).every(x => x.canonical_id?.startsWith('brali:protocol:') && x.provenance?.record_url?.startsWith(BASE));
  const safetyPass = test.safety_sensitive ? packet.safety?.blocked === true && packet.recommendations.length === 0 : true;
  const noAnswerPass = noAnswer ? packet.recommendations.length === 0 : true;
  const pass = topicHit && protocolHit && decisionHit && statusPass && trustPass && provenancePass && safetyPass && noAnswerPass;

  rows.push({
    id: test.id,
    category: test.category,
    language: test.language,
    query: test.query,
    mode: test.mode,
    expected: {
      topic_ids: expectedTopics,
      acceptable_topic_ids: acceptableTopics,
      protocol_slugs: expectedProtocols,
      decision_ids: expectedDecisions,
      boundary_only: boundaryOnly,
      safety_sensitive: Boolean(test.safety_sensitive)
    },
    observed: {
      status: packet.status,
      topic_ids: [...routed],
      protocol_slugs: [...gotProtocols],
      decision_ids: [...gotDecisions]
    },
    gates: { topic_hit: topicHit, protocol_hit: protocolHit, decision_hit: decisionHit, status_pass: statusPass, trust_pass: trustPass, provenance_pass: provenancePass, safety_pass: safetyPass, no_answer_pass: noAnswerPass },
    pass
  });
}

const topicRows = rows.filter((_, i) => ((suite.cases[i].expected_topic_ids || []).length + (suite.cases[i].acceptable_topic_ids || []).length) > 0);
const protocolRows = rows.filter((_, i) => (suite.cases[i].expected_protocol_slugs || []).length > 0);
const decisionRows = rows.filter((_, i) => (suite.cases[i].expected_decision_ids || []).length > 0);
const safetyRows = rows.filter((_, i) => suite.cases[i].safety_sensitive);
const noAnswerRows = rows.filter((_, i) => suite.cases[i].mode === 'no-answer');
const enRows = rows.filter(x => x.language === 'en');
const ruRows = rows.filter(x => x.language === 'ru');
const summary = {
  cases: rows.length,
  passed: rows.filter(x => x.pass).length,
  pass_rate_pct: pct(rows.filter(x => x.pass).length, rows.length),
  topic_hit_pct: pct(topicRows.filter(x => x.gates.topic_hit).length, topicRows.length),
  expected_protocol_hit_pct: pct(protocolRows.filter(x => x.gates.protocol_hit).length, protocolRows.length),
  evidence_decision_recall_pct: pct(decisionRows.filter(x => x.gates.decision_hit).length, decisionRows.length),
  trust_preservation_pct: pct(rows.filter(x => x.gates.trust_pass).length, rows.length),
  provenance_preservation_pct: pct(rows.filter(x => x.gates.provenance_pass).length, rows.length),
  safety_pct: pct(safetyRows.filter(x => x.gates.safety_pass && x.gates.status_pass).length, safetyRows.length),
  no_answer_pct: pct(noAnswerRows.filter(x => x.gates.no_answer_pass && x.gates.status_pass).length, noAnswerRows.length),
  en_pass_pct: pct(enRows.filter(x => x.pass).length, enRows.length),
  ru_pass_pct: pct(ruRows.filter(x => x.pass).length, ruRows.length),
  failed_case_ids: rows.filter(x => !x.pass).map(x => x.id)
};

const report = {
  schema_version: 1,
  dataset_version: data.flagships.dataset_version,
  source_suite_version: suite.suite_version,
  name: 'Brali Query Playground Parity Report',
  description: 'Runs the zero-install browser retrieval core against the maintained 50-case Brali Agent Evaluation Suite. The browser core uses the same Flagship 100 hybrid retrieval contract; failures remain visible rather than being removed from the suite.',
  page_url: `${BASE}/for-ai/query/`,
  report_url: `${BASE}/for-ai/query/parity.json`,
  summary,
  cases: rows
};
writeJson('for-ai/query/parity.json', report);

const pagePath = path.join(ROOT, 'for-ai/query/index.html');
let html = fs.readFileSync(pagePath, 'utf8');
const failures = summary.failed_case_ids.length ? `<p><strong>Visible gaps:</strong> ${summary.failed_case_ids.map(x => `<code>${x}</code>`).join(', ')}</p>` : '<p><strong>Visible gaps:</strong> none in the maintained suite.</p>';
const block = `<aside class="callout" data-query-parity-summary><h2>Browser parity against the maintained evaluation suite</h2><p><strong>${summary.passed}/${summary.cases}</strong> cases pass · Topic hit ${summary.topic_hit_pct}% · pinned Protocol hit ${summary.expected_protocol_hit_pct}% · Evidence Decision recall ${summary.evidence_decision_recall_pct}% · safety ${summary.safety_pct}% · RU ${summary.ru_pass_pct}%.</p>${failures}<p><a href="/for-ai/query/parity.json">Open machine-readable parity report</a></p></aside>`;
if (html.includes('data-query-parity-summary')) html = html.replace(/<aside class="callout" data-query-parity-summary>[\s\S]*?<\/aside>/, block);
else html = html.replace('<section class="prose">', `${block}<section class="prose">`);
fs.writeFileSync(pagePath, html);

console.log(`Query parity: ${summary.passed}/${summary.cases} pass; Topic ${summary.topic_hit_pct}%; Protocol ${summary.expected_protocol_hit_pct}%; Decision ${summary.evidence_decision_recall_pct}%; safety ${summary.safety_pct}%; no-answer ${summary.no_answer_pct}%; RU ${summary.ru_pass_pct}%; gaps=${summary.failed_case_ids.join(',') || 'none'}.`);
for (const row of rows.filter(x => !x.pass)) console.log(`QUERY_GAP ${row.id}: status=${row.observed.status}; topics=${row.observed.topic_ids.join('|') || '-'}; protocols=${row.observed.protocol_slugs.join('|') || '-'}; decisions=${row.observed.decision_ids.join('|') || '-'}; failed=${Object.entries(row.gates).filter(([,ok]) => !ok).map(([gate]) => gate).join('|')}`);
