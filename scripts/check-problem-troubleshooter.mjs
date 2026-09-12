import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGoldReviewRegistry } from './lib/gold-review-registry.mjs';
import { evaluateTroubleshooter } from '../assets/problem-troubleshooter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRUSTED = new Set(['reviewed', 'practical']);
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const cfg = read('data/problem-troubleshooters.json');
const applicability = read('data/protocol-applicability.json');
const problemSource = read('data/problem-collections.json');
const dataset = read('problems/index.json');
const platform = read('data/platform.json');
const api = read(`api/${platform.api_version}/problem-collections.json`);
const feed = read('life-os/datasets/protocols.json');
const { entries: goldReviews } = await loadGoldReviewRegistry(ROOT);
const sourceProblems = new Set((problemSource.collections ?? []).map(item => item.slug));
const feedBySlug = new Map((feed.entries ?? []).map(item => [item.slug, item]));
const datasetBySlug = new Map((dataset.collections ?? []).map(item => [item.slug, item]));
const apiBySlug = new Map((api.collections ?? []).map(item => [item.slug, item]));

if (!(cfg.troubleshooters ?? []).length) throw new Error('At least one problem troubleshooter is required.');
if (!applicability.policy?.source_rule || !applicability.policy?.unknown_rule || !applicability.policy?.trust_rule) throw new Error('Protocol applicability policy must state source, unknown and trust rules.');
for (const [slug, app] of Object.entries(applicability.entries ?? {})) {
  if (app.slug !== slug) throw new Error(`Applicability key/slug mismatch for ${slug}.`);
  const source = feedBySlug.get(slug);
  const gold = goldReviews[slug];
  if (!source || !TRUSTED.has(source.evidence?.status)) throw new Error(`Applicability record ${slug} is outside the trusted feed.`);
  if (!gold || gold.review_status !== 'gold-ready') throw new Error(`Applicability record ${slug} is not backed by a gold-ready manual review.`);
  if (app.protocol_id !== gold.protocol_id) throw new Error(`Applicability protocol_id drift for ${slug}.`);
  if (app.review_basis?.required_review_status !== gold.review_status || app.review_basis?.reviewed_at !== gold.reviewed_at) throw new Error(`Applicability review basis is stale for ${slug}.`);
  const constraintIds = new Set();
  for (const constraint of app.constraints ?? []) {
    if (!constraint.id || constraintIds.has(constraint.id)) throw new Error(`Duplicate or empty constraint id for ${slug}.`);
    constraintIds.add(constraint.id);
    if (!['eligibility', 'when_not_to_use'].includes(constraint.source_field)) throw new Error(`${slug}/${constraint.id} has invalid source_field.`);
    if (!(gold[constraint.source_field] ?? []).includes(constraint.source_text)) throw new Error(`${slug}/${constraint.id} source text drifted from Gold review.`);
    const options = constraint.options ?? [];
    const optionValues = new Set(options.map(option => option.value));
    if (options.length < 2 || optionValues.size !== options.length) throw new Error(`${slug}/${constraint.id} needs unique alternative options.`);
    if (!options.some(option => option.effect === 'allow') || !options.some(option => option.effect === 'reject')) throw new Error(`${slug}/${constraint.id} must contain both allow and reject outcomes.`);
    if (options.some(option => !['allow', 'reject'].includes(option.effect))) throw new Error(`${slug}/${constraint.id} has unsupported option effect.`);
    for (const option of options.filter(option => option.effect === 'reject')) if (!option.reason || option.reason.length < 20) throw new Error(`${slug}/${constraint.id} reject option lacks an explanatory reason.`);
  }
}

let sawSelected = false;
let sawAbstain = false;
for (const spec of cfg.troubleshooters) {
  if (!sourceProblems.has(spec.problem_slug)) throw new Error(`Troubleshooter references unknown problem ${spec.problem_slug}.`);
  const collection = datasetBySlug.get(spec.problem_slug);
  const apiCollection = apiBySlug.get(spec.problem_slug);
  if (!collection?.troubleshooter) throw new Error(`${spec.problem_slug} has no generated troubleshooter model.`);
  if (!apiCollection?.troubleshooter) throw new Error(`${spec.problem_slug} API has no troubleshooter model.`);
  if (JSON.stringify(collection.troubleshooter) !== JSON.stringify(apiCollection.troubleshooter)) throw new Error(`${spec.problem_slug} page/API troubleshooter drift.`);
  const pageJson = read(`problems/${spec.problem_slug}/index.json`);
  if (JSON.stringify(collection.troubleshooter) !== JSON.stringify(pageJson.troubleshooter)) throw new Error(`${spec.problem_slug} page JSON troubleshooter drift.`);
  const model = collection.troubleshooter;
  const modelSlugs = model.candidate_protocols.map(candidate => candidate.slug);
  if (JSON.stringify(modelSlugs) !== JSON.stringify(spec.candidate_protocol_slugs)) throw new Error(`${spec.problem_slug} candidate order/content drift.`);
  for (const candidate of model.candidate_protocols) {
    if (!TRUSTED.has(candidate.evidence_status)) throw new Error(`${spec.problem_slug} exposes non-trusted candidate ${candidate.slug}.`);
    if (candidate.gold_review_status !== 'gold-ready') throw new Error(`${spec.problem_slug} exposes non-gold-ready candidate ${candidate.slug}.`);
    const expectedSkillPage = `${BASE}/skill-packs/${candidate.slug}/`;
    const expectedSkillMarkdown = `${BASE}/skill-packs/${candidate.slug}/SKILL.md`;
    if (candidate.skill_page_url !== expectedSkillPage || candidate.skill_markdown_url !== expectedSkillMarkdown) throw new Error(`${spec.problem_slug}/${candidate.slug} skill links drifted from the canonical skill route.`);
    const skillPath = `skill-packs/${candidate.slug}/skill.json`;
    if (!fs.existsSync(path.join(ROOT, skillPath))) throw new Error(`${spec.problem_slug}/${candidate.slug} has no generated skill verification record.`);
    const skill = read(skillPath);
    if (skill.skill_page_url !== candidate.skill_page_url || skill.skill_markdown_url !== candidate.skill_markdown_url) throw new Error(`${spec.problem_slug}/${candidate.slug} troubleshooter/skill URL parity failed.`);
    if (skill.skill_mode !== 'usable' || skill.recommendation_eligible !== true) throw new Error(`${spec.problem_slug}/${candidate.slug} links a non-usable Agent Skill.`);
  }
  const html = fs.readFileSync(path.join(ROOT, 'problems', spec.problem_slug, 'index.html'), 'utf8');
  for (const marker of ['data-brali-troubleshooter', 'data-brali-troubleshooter-model', '/assets/problem-troubleshooter.mjs', 'Machine-readable decision packet']) if (!html.includes(marker)) throw new Error(`${spec.problem_slug} HTML lacks ${marker}.`);
  for (const example of spec.examples ?? []) {
    const decision = evaluateTroubleshooter(model, example.answers);
    if (decision.status !== example.expected_status) throw new Error(`${spec.problem_slug}/${example.id} expected ${example.expected_status}, got ${decision.status}.`);
    if (example.expected_protocol_slug && decision.selected?.slug !== example.expected_protocol_slug) throw new Error(`${spec.problem_slug}/${example.id} selected ${decision.selected?.slug ?? 'nothing'} instead of ${example.expected_protocol_slug}.`);
    if (decision.status === 'selected') {
      sawSelected = true;
      if (!decision.packet.selected_protocol?.skill_page_url || !decision.packet.selected_protocol?.skill_markdown_url) throw new Error(`${spec.problem_slug}/${example.id} selected packet lacks Agent Skill links.`);
    }
    if (decision.status === 'abstain') sawAbstain = true;
  }
}
if (!datasetBySlug.get('resume-after-interruption')?.troubleshooter) throw new Error('The #193 resume-after-interruption pilot is missing.');
if (!sawSelected || !sawAbstain) throw new Error('Troubleshooter fixtures must cover both selection and safe abstention.');
console.log(`Problem troubleshooter verified: ${cfg.troubleshooters.length} flow(s), with trusted selection, Agent Skill parity and safe-abstention regression cases.`);
