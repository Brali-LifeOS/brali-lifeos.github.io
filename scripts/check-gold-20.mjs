import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { loadGoldReviewRegistry } from './lib/gold-review-registry.mjs';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(`Gold 20 check failed: ${message}`); };

const candidates = await readJson('data/gold-20-candidates.json');
const reviews = await loadGoldReviewRegistry(root);
const reviewSchema = await readJson('contracts/gold-protocol-review.schema.json');
const output = await readJson('life-os/datasets/gold-20.json');
const protocols = await readJson('life-os/datasets/protocols.json');
const manifest = await readJson('life-os/datasets/manifest.json');
const platform = await readJson('data/platform.json');
const apiOutput = await readJson(`api/${platform.api_version}/gold-20.json`);
const apiManifest = await readJson(`api/${platform.api_version}/manifest.json`);
const apiIndex = await readJson(`api/${platform.api_version}/index.json`);
const openapi = await readJson(`api/${platform.api_version}/openapi.json`);
const evaluationSuite = await readJson('data/agent-evaluation-suite.json');
const evaluationOutput = await readJson('life-os/datasets/agent-evaluation.json');

if (candidates.schema_version !== 1) fail(`candidate schema_version ${candidates.schema_version}`);
if (reviews.schema_version !== 1) fail(`review registry schema_version ${reviews.schema_version}`);
if (reviewSchema.$id !== 'https://brali-lifeos.github.io/contracts/gold-protocol-review.schema.json') fail('review contract identity drift');
if (candidates.target_count !== 20) fail(`target_count must remain 20, got ${candidates.target_count}`);
if ((candidates.candidates ?? []).length !== 20) fail(`expected exactly 20 candidates, got ${(candidates.candidates ?? []).length}`);
if (candidates.observed_user_demand_available !== false) fail('observed user demand cannot be marked available before outcome instrumentation exists');
if (!/not collected/i.test(candidates.selection_note ?? '')) fail('selection note must explicitly state that observed user demand is not collected');

const slugs = (candidates.candidates ?? []).map(item => item.slug);
const ranks = (candidates.candidates ?? []).map(item => item.rank);
if (new Set(slugs).size !== slugs.length) fail('candidate slugs must be unique');
if (new Set(ranks).size !== ranks.length) fail('candidate ranks must be unique');
for (let rank = 1; rank <= 20; rank += 1) if (!ranks.includes(rank)) fail(`candidate rank ${rank} is missing`);
for (const required of candidates.required_first_batch_protocols ?? []) if (!slugs.includes(required)) fail(`first-batch protocol missing from candidate set: ${required}`);
for (const exclusion of candidates.first_batch_exclusions ?? []) {
  if (slugs.includes(exclusion.slug)) fail(`explicitly excluded protocol is still a Gold candidate: ${exclusion.slug}`);
  if (!(exclusion.reason?.length >= 30)) fail(`Gold exclusion lacks a concrete reason: ${exclusion.slug}`);
}

const trustedSlugs = new Set((protocols.entries ?? []).map(item => item.slug));
for (const candidate of candidates.candidates ?? []) {
  if (!trustedSlugs.has(candidate.slug)) fail(`candidate is not in trusted Protocol Feed: ${candidate.slug}`);
  if (!(candidate.problem?.length >= 20)) fail(`${candidate.slug}: problem hypothesis is too vague`);
  if (!(candidate.selection_reasons?.length >= 2)) fail(`${candidate.slug}: selection reasons are incomplete`);
}

const suiteById = new Map((evaluationSuite.cases ?? []).map(item => [item.id, item]));
const evaluationById = new Map((evaluationOutput.cases ?? []).map(item => [item.id, item]));
if (output.schema_version !== 1 || output.name !== 'Brali Gold 20 readiness registry') fail('generated registry identity drift');
if (output.candidate_count !== 20 || (output.entries ?? []).length !== 20) fail('generated candidate count drift');
if (output.target_count !== 20) fail('generated target count drift');
if (output.observed_user_demand_available !== false) fail('generated output invents observed user demand');
if (JSON.stringify(output.review_registry_sources ?? []) !== JSON.stringify(reviews.registry_sources ?? [])) fail('generated Gold review registry source list drift');
const outputBySlug = new Map((output.entries ?? []).map(item => [item.slug, item]));
for (const candidate of candidates.candidates ?? []) {
  const item = outputBySlug.get(candidate.slug);
  if (!item) fail(`generated registry missing ${candidate.slug}`);
  if (item.rank !== candidate.rank) fail(`${candidate.slug}: rank drift`);
  if (!['reviewed', 'practical'].includes(item.evidence_status)) fail(`${candidate.slug}: non-trusted evidence status ${item.evidence_status}`);
  const review = reviews.entries?.[candidate.slug] ?? null;
  if (!review && item.manual_review_status !== 'not-reviewed') fail(`${candidate.slug}: generated manual-review status drift`);
  if (!review && item.gold_ready) fail(`${candidate.slug}: candidate was promoted without a manual Gold review`);
  if (review?.review_status === 'gold-ready') {
    for (const field of reviewSchema.required ?? []) {
      const value = review[field];
      const present = Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
      if (!present) fail(`${candidate.slug}: gold-ready review missing ${field}`);
    }
    if (!item.gold_ready) fail(`${candidate.slug}: complete gold-ready review was not reflected in generated registry`);
    for (const decisionId of review.evidence_boundary?.source_decision_ids ?? []) {
      if (!(item.evidence_decision_ids ?? []).includes(decisionId)) fail(`${candidate.slug}: Gold review cites missing Evidence Decision ${decisionId}`);
    }

    const evaluationCaseIds = review.evaluation_case_ids ?? [];
    if (!evaluationCaseIds.length) fail(`${candidate.slug}: Gold-ready review has no retrieval/evaluation coverage`);
    let passingCoverage = 0;
    for (const caseId of evaluationCaseIds) {
      if (!suiteById.has(caseId)) fail(`${candidate.slug}: Gold review references missing evaluation case ${caseId}`);
      const result = evaluationById.get(caseId);
      if (!result) fail(`${candidate.slug}: generated evaluation output missing ${caseId}`);
      if (!(result.structured_brali?.protocol_slugs ?? []).includes(candidate.slug)) {
        fail(`${candidate.slug}: evaluation case ${caseId} does not actually retrieve the Gold protocol in structured Brali results`);
      }
      if (result.pass === true) passingCoverage += 1;
    }
    if (passingCoverage < 1) {
      fail(`${candidate.slug}: Gold-ready protocol has no passing evaluation case among its ${evaluationCaseIds.length} retrieval coverage case(s)`);
    }
  }
}

const calculatedReady = (output.entries ?? []).filter(item => item.gold_ready).length;
if (calculatedReady !== output.gold_ready_count) fail('gold_ready_count drift');
if (output.gold_ready_count > output.candidate_count) fail('gold_ready_count exceeds candidate count');
const datasetPath = 'life-os/datasets/gold-20.json';
const manifestFile = (manifest.files ?? []).find(item => item?.path === datasetPath);
if (!manifestFile) fail(`manifest does not expose ${datasetPath}`);
const datasetText = await readFile(path.join(root, datasetPath), 'utf8');
if (manifestFile.sha256 !== sha256(datasetText) || manifestFile.bytes !== Buffer.byteLength(datasetText) || manifestFile.count !== output.entries.length) {
  fail('Gold dataset manifest checksum/size/count drift');
}
if (manifest.gold_20?.candidate_count !== output.candidate_count || manifest.gold_20?.gold_ready_count !== output.gold_ready_count) fail('manifest Gold 20 summary drift');
if (JSON.stringify(apiManifest) !== JSON.stringify(manifest)) fail('API manifest differs from canonical manifest after Gold publication');
if (JSON.stringify(apiOutput) !== JSON.stringify(output)) fail('Gold API endpoint differs from canonical dataset');
if (!(apiIndex.endpoints ?? []).includes('gold-20.json')) fail('API index does not expose gold-20.json');
if (!openapi.paths?.[`/api/${platform.api_version}/gold-20.json`]) fail('OpenAPI does not describe Gold 20 endpoint');

console.log(`Gold 20 verified: ${output.candidate_count} trusted candidates; ${output.gold_ready_count} manually Gold-ready from ${reviews.registry_sources.length} review registry file(s); every Gold evaluation reference retrieves its protocol and each Gold-ready protocol has passing coverage; observed demand remains unclaimed.`);