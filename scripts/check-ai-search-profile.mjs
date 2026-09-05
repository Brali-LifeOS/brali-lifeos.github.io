import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const fail = message => { throw new Error(`AI search profile check failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const profile = await readJson('ai/ai-search-profile.json');
const siteProfile = await readJson('ai/site-profile.json');
const locales = await readJson('ai/locales.json');
const trust = await readJson('trust/trust.json');
const corrections = await readJson('trust/corrections.json');
const graph = await readJson('knowledge/graph.json');
const llms = await readFile('llms.txt', 'utf8');
const trustHtml = await readFile('trust/index.html', 'utf8');

assert(profile.profileVersion === '0.1', 'unexpected profileVersion');
assert(profile.site?.canonicalUrl === 'https://brali-lifeos.github.io/', 'canonical URL drift');
assert(profile.site?.canonicalLanguage === 'en', 'canonical language must remain explicit');

for (const key of ['entityHome', 'siteProfile', 'llmsCanonical', 'localeManifest', 'knowledgeGraph', 'claimsIndex', 'trustCenter', 'correctionsLedger']) {
  assert(profile.surfaces?.[key]?.status === 'active', `${key} surface must be active`);
  assert(profile.surfaces[key].url?.startsWith('https://'), `${key} surface must expose an HTTPS URL`);
}

const requiredModules = [
  'answerPages', 'originalResearch', 'protocolObservatory', 'comparisonPages', 'conceptDefinitions',
  'claimsRegistry', 'evidenceReceipts', 'crawlerMatrix', 'agentFetchLab', 'knowledgeGraph',
  'citationVisuals', 'openReuseAssets', 'trustCenter', 'correctionsLedger', 'softwareProvenance',
  'persistentIdentifiers', 'externalTrustSignals', 'externalDistribution', 'aiVisibility', 'localization', 'history'
];
const allowedStatuses = new Set(['planned', 'active', 'paused', 'not-applicable']);
const allowedPriorities = new Set(['P0', 'P1', 'P2']);
for (const key of requiredModules) {
  const module = profile.modules?.[key];
  assert(module, `missing module ${key}`);
  assert(allowedStatuses.has(module.status), `invalid status for ${key}`);
  assert(allowedPriorities.has(module.priority), `invalid priority for ${key}`);
  assert(typeof module.description === 'string' && module.description.length >= 10, `missing description for ${key}`);
}

const signalByName = new Map((profile.measurement?.signals ?? []).map(signal => [signal.name, signal]));
assert(signalByName.get('evidence-state coverage')?.status === 'active', 'evidence metrics must be an active measured signal');
assert(signalByName.get('retrieval benchmark')?.status === 'active', 'retrieval benchmark must be an active measured signal');
assert(signalByName.get('search visibility')?.status === 'planned', 'search visibility must remain planned until source data exists');
assert(signalByName.get('AI citations and referrals')?.status === 'planned', 'AI citation visibility must remain planned until source data exists');
assert(profile.guardrails?.noReadinessScore === true, 'noReadinessScore guardrail must stay enabled');
assert(profile.guardrails?.noRankingClaimsWithoutEvidence === true, 'ranking evidence guardrail must stay enabled');

const aiExtension = siteProfile.extensions?.['io.github.dkharlanau/ai-search-profile'];
const localeExtension = siteProfile.extensions?.['io.github.dkharlanau/localized-llms'];
const trustExtension = siteProfile.extensions?.['io.github.dkharlanau/trust-center'];
assert(aiExtension?.profile === 'https://brali-lifeos.github.io/ai/ai-search-profile.json', 'site profile must link the ARWP AI search profile extension');
assert(aiExtension?.knowledgeGraph === 'https://brali-lifeos.github.io/knowledge/graph.json', 'AI search extension must link the knowledge graph');
assert(localeExtension?.manifest === 'https://brali-lifeos.github.io/ai/locales.json', 'site profile must link the locale manifest');
assert(trustExtension?.machine === 'https://brali-lifeos.github.io/trust/trust.json', 'site profile must link the machine-readable trust center');

assert(locales.canonicalLanguage === 'en' && locales.fallbackLanguage === 'en', 'locale manifest must preserve English canonical fallback');
assert(JSON.stringify(locales.agentRoutingLanguages) === JSON.stringify(['en']), 'do not claim unpublished locale routing');
assert(locales.evaluation?.retrievalBenchmarkLanguages?.includes('ru'), 'locale manifest should preserve multilingual benchmark disclosure');

assert(trust.measurement?.readinessScore === null, 'trust surface must not synthesize a readiness score');
assert(trust.measurement?.evidenceMetrics?.endsWith('/life-os/datasets/evidence-metrics.json'), 'trust surface must link canonical evidence metrics');
assert(trust.measurement?.retrievalBenchmark?.endsWith('/life-os/datasets/retrieval-benchmark.json'), 'trust surface must link canonical retrieval benchmark');
assert(Array.isArray(corrections.entries), 'corrections ledger entries must be an array');
assert(typeof corrections.emptyState === 'string' && corrections.emptyState.length > 40, 'corrections ledger needs explicit empty-state semantics');

assert(graph['@context'] === 'https://schema.org', 'knowledge graph must use schema.org context');
assert(Array.isArray(graph['@graph']) && graph['@graph'].length >= 5, 'knowledge graph is unexpectedly small');

for (const path of ['/ai/ai-search-profile.json', '/trust/', '/trust/trust.json', '/trust/corrections.json', '/knowledge/graph.json']) {
  assert(llms.includes(path), `llms.txt must expose ${path}`);
}
assert(trustHtml.includes('<link rel="canonical" href="https://brali-lifeos.github.io/trust/">'), 'trust page canonical link missing');
assert(trustHtml.includes('/life-os/datasets/retrieval-benchmark.json'), 'trust page must expose retrieval benchmark');

console.log('AI search profile check: PASS');
