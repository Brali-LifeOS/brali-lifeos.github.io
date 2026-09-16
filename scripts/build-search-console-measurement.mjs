import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchProblems } from '../for-ai/query/retrieval.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const config = read('data/search-console-measurement.json');
const problems = read('data/problem-collections.json');
const feed = read('life-os/datasets/protocols.json');
const trusted = new Set((feed.entries ?? []).filter(item => ['reviewed', 'practical'].includes(item.evidence?.status)).map(item => item.slug));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateSearchMeasurementContract() {
  assert(config.schema_version === 1, 'Search Console measurement schema_version must be 1.');
  const required = ['trusted-current-guidance','problem-question','topic-hubs','research-data-ai','review-required-neutral','legacy-archive','other'];
  const ids = (config.segments ?? []).map(segment => segment.id);
  assert(new Set(ids).size === ids.length, 'Search Console segment IDs must be unique.');
  for (const id of required) assert(ids.includes(id), `Search Console measurement contract lacks segment ${id}.`);
  assert(Number(config.opportunity_rules?.problem_match_threshold) >= 1, 'Problem match threshold must be positive.');
  assert((problems.collections ?? []).length >= 10, 'Search measurement expects the maintained canonical Problem Discovery Graph.');
  assert(trusted.size > 0, 'Search measurement cannot classify trusted guidance without the Protocol Feed.');
  assert(config.generative_ai_search?.metric === 'impressions', 'Generative AI Search contract must measure impressions separately.');
  assert((config.generative_ai_search?.dimensions ?? []).includes('pages'), 'Generative AI Search contract must include the pages dimension.');
  assert((config.generative_ai_search?.supported_features_at_contract_date ?? []).includes('AI Overviews'), 'Generative AI Search contract must identify AI Overviews.');
  assert((config.generative_ai_search?.supported_features_at_contract_date ?? []).includes('AI Mode'), 'Generative AI Search contract must identify AI Mode.');
  return { segment_count: ids.length, trusted_protocols: trusted.size, problems: problems.collections.length, generative_ai_metric: config.generative_ai_search.metric };
}

function findFiles(dir, filename, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, filename, found);
    else if (entry.name === filename) found.push(full);
  }
  return found;
}

function pagePathname(url) {
  try { return new URL(url, 'https://brali-lifeos.github.io').pathname.replace(/\/+/g, '/'); }
  catch { return '/'; }
}

function classify(url) {
  const pathname = pagePathname(url);
  if (pathname.startsWith('/problems/') || pathname === '/problems' || pathname.startsWith('/questions/') || pathname === '/questions') return 'problem-question';
  if (pathname.startsWith('/topics/') || pathname === '/topics') return 'topic-hubs';
  if (pathname.startsWith('/research/') || pathname.startsWith('/for-ai/') || pathname.startsWith('/api/') || pathname.startsWith('/bench/') || pathname.startsWith('/skill-packs/') || pathname.startsWith('/agents/') || pathname.startsWith('/life-os/datasets/') || pathname.startsWith('/cite/') || pathname.startsWith('/contracts/') || pathname.startsWith('/skills/')) return 'research-data-ai';
  if (pathname.startsWith('/zones/') || pathname.startsWith('/growth-zones/') || pathname.startsWith('/archive/') || pathname.startsWith('/legacy/') || pathname.startsWith('/state/legacy-sensitive/')) return 'legacy-archive';
  const match = pathname.match(/^\/life-os\/([^/]+)\/?$/);
  if (match) return trusted.has(match[1]) ? 'trusted-current-guidance' : 'review-required-neutral';
  return 'other';
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildGenerativeAiSearchMeasurement(report) {
  const input = report.generative_ai_search ?? {};
  const suppliedRows = Array.isArray(input.top_pages_28d) ? input.top_pages_28d : [];
  const explicitStatus = typeof input.status === 'string' && input.status.trim() ? input.status.trim() : null;
  const status = explicitStatus ?? (suppliedRows.length ? 'available' : 'not-exported');
  const available = status === 'available';
  const segmentBuckets = new Map(config.segments.map(segment => [segment.id, {
    id: segment.id,
    label: segment.label,
    sampled_page_rows: 0,
    impressions: 0
  }]));

  if (available) {
    for (const row of suppliedRows) {
      const bucket = segmentBuckets.get(classify(row.key ?? row.page ?? row.url ?? ''));
      if (!bucket) continue;
      bucket.sampled_page_rows += 1;
      bucket.impressions += Number(row.impressions || 0);
    }
  }

  const pageSample = [...segmentBuckets.values()].map(bucket => ({
    ...bucket,
    impressions: available ? Number(bucket.impressions.toFixed(3)) : null
  }));

  const controlInput = input.control ?? {};
  const controlChecked = typeof controlInput.checked === 'boolean' ? controlInput.checked : null;
  const controlIncluded = typeof controlInput.include_in_search_generative_ai === 'boolean'
    ? controlInput.include_in_search_generative_ai
    : null;

  return {
    status,
    metric: 'impressions',
    supported_features: input.supported_features ?? config.generative_ai_search.supported_features_at_contract_date,
    data_through: input.data_through ?? null,
    property_total_impressions_28d: available ? finiteOrNull(input.total_impressions_28d) : null,
    top_page_sample_rows_28d: available ? suppliedRows.length : null,
    page_sample_by_segment_28d: pageSample,
    control: {
      checked: controlChecked,
      include_in_search_generative_ai: controlIncluded
    },
    source_semantics: {
      property_total: 'Use an explicitly exported property/chart total only. Never reconstruct the property total by summing page-table rows.',
      page_table: config.generative_ai_search.page_sample_semantics,
      absence: config.generative_ai_search.absence_semantics
    }
  };
}

export function buildSearchMeasurement(report) {
  validateSearchMeasurementContract();
  const segmentDefinitions = new Map(config.segments.map(segment => [segment.id, segment]));
  const pageSegments = new Map(config.segments.map(segment => [segment.id, { id: segment.id, label: segment.label, tracked_pages: 0, stale_pages: 0, status_counts: {} }]));
  for (const item of report.urls ?? []) {
    if (item.kind !== 'page') continue;
    const id = classify(item.url);
    const bucket = pageSegments.get(id);
    bucket.tracked_pages += 1;
    if (item.stale) bucket.stale_pages += 1;
    const status = String(item.status || 'unknown');
    bucket.status_counts[status] = (bucket.status_counts[status] || 0) + 1;
  }

  const analytics = report.search_analytics || {};
  const analyticsSegments = new Map(config.segments.map(segment => [segment.id, { id: segment.id, label: segment.label, sampled_page_rows: 0, clicks: 0, impressions: 0, weighted_position_sum: 0 }]));
  for (const row of analytics.top_pages_28d ?? []) {
    const id = classify(row.key);
    const bucket = analyticsSegments.get(id);
    const impressions = Number(row.impressions || 0);
    bucket.sampled_page_rows += 1;
    bucket.clicks += Number(row.clicks || 0);
    bucket.impressions += impressions;
    bucket.weighted_position_sum += Number(row.position || 0) * impressions;
  }
  const segmentPerformance = [...analyticsSegments.values()].map(bucket => ({
    id: bucket.id,
    label: bucket.label,
    sampled_page_rows: bucket.sampled_page_rows,
    clicks: Number(bucket.clicks.toFixed(3)),
    impressions: Number(bucket.impressions.toFixed(3)),
    ctr: bucket.impressions ? Number((bucket.clicks / bucket.impressions).toFixed(6)) : 0,
    impression_weighted_position: bucket.impressions ? Number((bucket.weighted_position_sum / bucket.impressions).toFixed(3)) : 0
  }));

  const matchThreshold = Number(config.opportunity_rules.problem_match_threshold || 12);
  const weakThreshold = matchThreshold * 2;
  const minImpressions = Number(config.opportunity_rules.minimum_impressions_in_top_query_sample || 1);
  const queryRows = (analytics.top_queries_28d ?? []).map(row => {
    const matches = matchProblems(row.key, problems.collections, 1);
    const match = matches[0] || null;
    const score = match?.score || 0;
    const coverage = score < matchThreshold ? 'unmatched' : score < weakThreshold ? 'weak-match' : 'strong-match';
    return {
      query: row.key,
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 0),
      coverage,
      problem_slug: score >= matchThreshold ? match.problem.slug : null,
      problem_match_score: score
    };
  });
  const opportunities = queryRows
    .filter(row => row.impressions >= minImpressions && row.coverage !== 'strong-match')
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.query.localeCompare(b.query));

  const baselineCaptured = analytics.status === 'available' && Boolean(analytics.windows?.['28d']);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_report_generated_at: report.generated_at || null,
    measurement_status: baselineCaptured ? 'baseline-captured' : 'analytics-unavailable',
    baseline_captured: baselineCaptured,
    breadth_expansion_gate: baselineCaptured ? 'baseline exists; require repeated segment evidence before broadening index policy' : 'freeze broad index expansion until Search Console analytics are available',
    data_through: analytics.data_through || null,
    windows: analytics.windows || {},
    segments: [...pageSegments.values()],
    top_page_sample_by_segment_28d: segmentPerformance,
    query_coverage_28d: {
      sample_rows: queryRows.length,
      strong_match_rows: queryRows.filter(row => row.coverage === 'strong-match').length,
      weak_match_rows: queryRows.filter(row => row.coverage === 'weak-match').length,
      unmatched_rows: queryRows.filter(row => row.coverage === 'unmatched').length,
      opportunities
    },
    generative_ai_search: buildGenerativeAiSearchMeasurement(report),
    interpretation_limits: config.interpretation_limits,
    decision_options: config.decision_options,
    segment_definitions: Object.fromEntries([...segmentDefinitions].map(([id, value]) => [id, value.definition]))
  };
}

function renderMarkdown(measured) {
  const lines = [
    '# Brali Search Console measurement',
    '',
    `Generated: \`${measured.generated_at}\``,
    '',
    `- Measurement status: **${measured.measurement_status}**`,
    `- Search data through: **${measured.data_through || 'unavailable'}**`,
    `- Growth gate: ${measured.breadth_expansion_gate}`,
    '',
    '## Indexing inventory by Brali segment',
    '',
    '| Segment | Tracked pages | Stale carry-over | Status counts |',
    '| --- | ---: | ---: | --- |'
  ];
  for (const segment of measured.segments) {
    const counts = Object.entries(segment.status_counts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `${status}: ${count}`).join(', ') || 'none';
    lines.push(`| ${segment.label} | ${segment.tracked_pages} | ${segment.stale_pages} | ${counts} |`);
  }
  lines.push('', '## Search performance by segment', '', 'This table uses only the Search Console **top-page sample** in the source report; absence here is not a measured zero.', '', '| Segment | Sampled page rows | Clicks | Impressions | CTR | Impression-weighted position |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const segment of measured.top_page_sample_by_segment_28d) {
    lines.push(`| ${segment.label} | ${segment.sampled_page_rows} | ${segment.clicks} | ${segment.impressions} | ${(segment.ctr * 100).toFixed(1)}% | ${segment.impression_weighted_position.toFixed(1)} |`);
  }
  const opportunities = measured.query_coverage_28d.opportunities;
  lines.push('', '## Query-to-problem opportunities', '', `Top-query sample: ${measured.query_coverage_28d.sample_rows} rows · strong ${measured.query_coverage_28d.strong_match_rows} · weak ${measured.query_coverage_28d.weak_match_rows} · unmatched ${measured.query_coverage_28d.unmatched_rows}.`, '');
  if (!opportunities.length) lines.push('No unmatched or weakly matched query appears in the current top-query sample.');
  else {
    lines.push('| Query | Impressions | Clicks | Position | Coverage | Problem | Score |', '| --- | ---: | ---: | ---: | --- | --- | ---: |');
    for (const row of opportunities.slice(0, 20)) lines.push(`| ${String(row.query).replaceAll('|', '\\|')} | ${row.impressions} | ${row.clicks} | ${row.position.toFixed(1)} | ${row.coverage} | ${row.problem_slug || '—'} | ${row.problem_match_score} |`);
  }

  const gai = measured.generative_ai_search;
  lines.push('', '## Google Search generative AI', '', `- Status: **${gai.status}**`, `- Metric: **${gai.metric} only**`, `- Data through: **${gai.data_through || 'unavailable'}**`, `- Property total impressions (28d): **${gai.property_total_impressions_28d ?? 'unavailable'}**`, `- Exported page rows (28d): **${gai.top_page_sample_rows_28d ?? 'unavailable'}**`, `- Inclusion control checked: **${gai.control.checked === null ? 'not recorded' : gai.control.checked ? 'yes' : 'no'}**`, `- Inclusion control value: **${gai.control.include_in_search_generative_ai === null ? 'not recorded' : gai.control.include_in_search_generative_ai ? 'included' : 'excluded'}**`, '');
  lines.push('The table below is a sum of the exported **page table sample**, not a reconstruction of the property total.', '', '| Segment | Sampled page rows | Generative AI impressions in page sample |', '| --- | ---: | ---: |');
  for (const segment of gai.page_sample_by_segment_28d) {
    lines.push(`| ${segment.label} | ${segment.sampled_page_rows} | ${segment.impressions ?? '—'} |`);
  }

  lines.push('', '## Interpretation boundary', '');
  for (const limit of config.interpretation_limits) lines.push(`- ${limit}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const summary = validateSearchMeasurementContract();
  if (args.includes('--config-check')) {
    console.log(`Search Console measurement contract verified: ${summary.segment_count} stable segments, ${summary.trusted_protocols} trusted protocol slugs, ${summary.problems} canonical problems, generative-AI metric=${summary.generative_ai_metric}.`);
    return;
  }
  const reportArgIndex = args.indexOf('--report');
  const explicitReport = reportArgIndex >= 0 ? args[reportArgIndex + 1] : null;
  const reportPath = explicitReport
    ? path.resolve(ROOT, explicitReport)
    : findFiles(path.join(ROOT, 'reports', 'seo', 'google-search'), 'google-indexing.json')[0];
  assert(reportPath && fs.existsSync(reportPath), 'Google Search report not found. Run/download the Google Search Pipeline artifact before Brali measurement.');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const measured = buildSearchMeasurement(report);
  measured.source_report = path.relative(ROOT, reportPath).replaceAll('\\', '/');
  const outputDir = path.join(ROOT, 'reports', 'seo', 'google-search');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'brali-search-measurement.json'), `${JSON.stringify(measured, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'brali-search-measurement.md'), renderMarkdown(measured));
  console.log(`Brali Search measurement: status=${measured.measurement_status}; tracked=${measured.segments.reduce((sum, segment) => sum + segment.tracked_pages, 0)}; top-query opportunities=${measured.query_coverage_28d.opportunities.length}; generative-ai=${measured.generative_ai_search.status}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === MODULE_PATH) main();
