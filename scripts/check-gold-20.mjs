import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const fail = message => { throw new Error(`Gold 20 check failed: ${message}`); };

const candidates = await readJson('data/gold-20-candidates.json');
const reviews = await readJson('data/gold-20-reviews.json');
const reviewSchema = await readJson('contracts/gold-protocol-review.schema.json');
const output = await readJson('life-os/datasets/gold-20.json');
const protocols = await readJson('life-os/datasets/protocols.json');
const manifest = await readJson('life-os/datasets/manifest.json');

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

if (output.schema_version !== 1 || output.name !== 'Brali Gold 20 readiness registry') fail('generated registry identity drift');
if (output.candidate_count !== 20 || (output.entries ?? []).length !== 20) fail('generated candidate count drift');
if (output.target_count !== 20) fail('generated target count drift');
if (output.observed_user_demand_available !== false) fail('generated output invents observed user demand');
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
  }
}

const calculatedReady = (output.entries ?? []).filter(item => item.gold_ready).length;
if (calculatedReady !== output.gold_ready_count) fail('gold_ready_count drift');
if (output.gold_ready_count > output.candidate_count) fail('gold_ready_count exceeds candidate count');
const manifestFile = (manifest.files ?? []).find(item => (typeof item === 'string' ? item : item.path) === 'gold-20.json');
if (!manifestFile) fail('manifest does not expose gold-20.json');
if (manifest.gold_20?.candidate_count !== output.candidate_count || manifest.gold_20?.gold_ready_count !== output.gold_ready_count) fail('manifest Gold 20 summary drift');

console.log(`Gold 20 verified: ${output.candidate_count} trusted candidates; ${output.gold_ready_count} manually Gold-ready; observed demand remains unclaimed.`);
