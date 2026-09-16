import { buildSearchMeasurement, validateSearchMeasurementContract } from './build-search-console-measurement.mjs';

const fail = message => { throw new Error(`Search Console measurement check failed: ${message}`); };

validateSearchMeasurementContract();

const baseReport = {
  generated_at: '2026-09-16T00:00:00.000Z',
  urls: [],
  search_analytics: {
    status: 'available',
    data_through: '2026-09-14',
    windows: { '28d': { start: '2026-08-18', end: '2026-09-14' } },
    top_pages_28d: [],
    top_queries_28d: []
  }
};

const unavailable = buildSearchMeasurement(baseReport).generative_ai_search;
if (unavailable.status !== 'not-exported') fail(`missing AI report should be not-exported, got ${unavailable.status}`);
if (unavailable.property_total_impressions_28d !== null) fail('missing AI property total must remain null, not zero');
if (unavailable.top_page_sample_rows_28d !== null) fail('missing AI page sample size must remain null');
if (unavailable.control.checked !== null || unavailable.control.include_in_search_generative_ai !== null) fail('unrecorded AI control state must remain null');
if (unavailable.page_sample_by_segment_28d.some(row => row.impressions !== null)) fail('unavailable AI segment impressions must remain null');

const measured = buildSearchMeasurement({
  ...baseReport,
  generative_ai_search: {
    status: 'available',
    data_through: '2026-09-14',
    total_impressions_28d: 125,
    supported_features: ['AI Overviews', 'AI Mode'],
    control: {
      checked: true,
      include_in_search_generative_ai: true
    },
    top_pages_28d: [
      { key: 'https://brali-lifeos.github.io/problems/interrupted-work/', impressions: 12 },
      { key: 'https://brali-lifeos.github.io/topics/focus/', impressions: 8 },
      { key: 'https://brali-lifeos.github.io/for-ai/', impressions: 5 }
    ]
  }
}).generative_ai_search;

if (measured.status !== 'available') fail(`expected available AI report, got ${measured.status}`);
if (measured.property_total_impressions_28d !== 125) fail('explicit property total was not preserved');
if (measured.top_page_sample_rows_28d !== 3) fail('AI page sample row count drift');
const sampledTotal = measured.page_sample_by_segment_28d.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
if (sampledTotal !== 25) fail(`expected page-table sample sum 25, got ${sampledTotal}`);
if (sampledTotal === measured.property_total_impressions_28d) fail('test fixture must distinguish page-table sample from property total');
if (measured.control.checked !== true || measured.control.include_in_search_generative_ai !== true) fail('explicit AI control state was not preserved');

const problem = measured.page_sample_by_segment_28d.find(row => row.id === 'problem-question');
const topic = measured.page_sample_by_segment_28d.find(row => row.id === 'topic-hubs');
const ai = measured.page_sample_by_segment_28d.find(row => row.id === 'research-data-ai');
if (problem?.impressions !== 12 || topic?.impressions !== 8 || ai?.impressions !== 5) fail('AI page sample did not preserve Brali segmentation');

console.log('Search Console measurement verified: ordinary search remains separate from Generative AI Search impressions; unavailable stays null; page sample is not treated as property total.');
