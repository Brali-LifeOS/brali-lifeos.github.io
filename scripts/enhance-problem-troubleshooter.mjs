import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGoldReviewRegistry } from './lib/gold-review-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const TRUSTED = new Set(['reviewed', 'practical']);
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, content) => { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
const writeJson = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

const cfg = read('data/problem-troubleshooters.json');
const applicability = read('data/protocol-applicability.json');
const problemSource = read('data/problem-collections.json');
const feed = read('life-os/datasets/protocols.json');
const publicDataset = read('problems/index.json');
const platform = read('data/platform.json');
const apiDataset = read(`api/${platform.api_version}/problem-collections.json`);
const { entries: goldReviews } = await loadGoldReviewRegistry(ROOT);
const sourceProblemBySlug = new Map((problemSource.collections ?? []).map(item => [item.slug, item]));
const publicBySlug = new Map((publicDataset.collections ?? []).map(item => [item.slug, item]));
const apiBySlug = new Map((apiDataset.collections ?? []).map(item => [item.slug, item]));
const feedBySlug = new Map((feed.entries ?? []).map(item => [item.slug, item]));

const validateConstraintSource = (slug, gold, constraint) => {
  if (!['eligibility', 'when_not_to_use'].includes(constraint.source_field)) throw new Error(`${slug}/${constraint.id} has unsupported source_field ${constraint.source_field}.`);
  if (!(gold[constraint.source_field] ?? []).includes(constraint.source_text)) throw new Error(`${slug}/${constraint.id} source_text no longer matches the Gold manual review.`);
};
const buildCandidate = slug => {
  const gold = goldReviews[slug];
  const source = feedBySlug.get(slug);
  const app = applicability.entries?.[slug];
  if (!gold) throw new Error(`Troubleshooter candidate ${slug} has no Gold manual review.`);
  if (gold.review_status !== 'gold-ready') throw new Error(`Troubleshooter candidate ${slug} is not gold-ready.`);
  if (!source || !TRUSTED.has(source.evidence?.status)) throw new Error(`Troubleshooter candidate ${slug} is outside the trusted protocol feed.`);
  if (!app) throw new Error(`Troubleshooter candidate ${slug} has no reviewed applicability record.`);
  if (app.protocol_id !== gold.protocol_id) throw new Error(`Applicability protocol_id drift for ${slug}.`);
  if (app.review_basis?.required_review_status !== gold.review_status || app.review_basis?.reviewed_at !== gold.reviewed_at) throw new Error(`Applicability review basis is stale for ${slug}.`);
  if (!(app.constraints ?? []).length) throw new Error(`Troubleshooter candidate ${slug} has no decision-changing constraints.`);
  for (const constraint of app.constraints) validateConstraintSource(slug, gold, constraint);
  return {
    protocol_id: gold.protocol_id,
    slug,
    title: source.title,
    canonical_url: source.url || `${BASE}/life-os/${slug}/`,
    evidence_status: source.evidence.status,
    gold_review_status: gold.review_status,
    first_action: gold.first_action,
    review_horizon: gold.review_horizon,
    observable_signal: gold.observable_signal,
    stop_or_change_rule: gold.stop_or_change_rule,
    fallback: gold.fallback,
    evidence_boundary: gold.evidence_boundary,
    limitations: gold.limitations,
    citation: gold.citation,
    constraints: app.constraints
  };
};
const buildModel = spec => ({
  schema_version: 1,
  problem_slug: spec.problem_slug,
  canonical_url: `${BASE}/problems/${spec.problem_slug}/`,
  title: spec.title,
  summary: spec.summary,
  abstention_message: spec.abstention_message,
  trust_note: cfg.policy.interpretation_rule,
  candidate_protocols: spec.candidate_protocol_slugs.map(buildCandidate)
});
const renderQuestion = constraint => `<fieldset class="card"><legend><strong>${esc(constraint.question)}</strong></legend>${constraint.options.map(option => `<label style="display:block;margin:.75rem 0"><input type="radio" name="${esc(constraint.id)}" value="${esc(option.value)}"${constraint.required ? ' required' : ''}> ${esc(option.label)}</label>`).join('')}</fieldset>`;
const renderTroubleshooter = model => {
  const constraints = [];
  const seen = new Set();
  for (const candidate of model.candidate_protocols) for (const constraint of candidate.constraints ?? []) if (!seen.has(constraint.id)) { seen.add(constraint.id); constraints.push(constraint); }
  return `<section data-brali-troubleshooter><p class="eyebrow">Constraint-aware fit check</p><h2>${esc(model.title)}</h2><p>${esc(model.summary)}</p><div class="callout"><strong>What this can tell you:</strong> ${esc(model.trust_note)} It checks only the constraints shown below; missing context remains unknown.</div><form data-brali-troubleshooter-form><div class="grid two">${constraints.map(renderQuestion).join('')}</div><p><button class="button" type="submit">Check fit</button></p></form><div data-brali-troubleshooter-result aria-live="polite"></div><details><summary>Machine-readable decision packet</summary><pre data-brali-troubleshooter-packet>Run the check to generate a decision packet.</pre><button class="button" type="button" data-brali-troubleshooter-copy disabled>Copy decision packet</button></details><script type="application/json" data-brali-troubleshooter-model>${safeJson(model)}</script><script type="module" src="/assets/problem-troubleshooter.mjs"></script></section>`;
};

for (const spec of cfg.troubleshooters ?? []) {
  if (!sourceProblemBySlug.has(spec.problem_slug)) throw new Error(`Troubleshooter references unknown problem collection ${spec.problem_slug}.`);
  if (!Array.isArray(spec.candidate_protocol_slugs) || spec.candidate_protocol_slugs.length === 0) throw new Error(`Troubleshooter ${spec.problem_slug} has no candidates.`);
  const model = buildModel(spec);
  const publicCollection = publicBySlug.get(spec.problem_slug);
  const apiCollection = apiBySlug.get(spec.problem_slug);
  if (!publicCollection || !apiCollection) throw new Error(`Troubleshooter target ${spec.problem_slug} has not been generated.`);
  publicCollection.troubleshooter = model;
  apiCollection.troubleshooter = model;
  writeJson(`problems/${spec.problem_slug}/index.json`, publicCollection);
  const pagePath = `problems/${spec.problem_slug}/index.html`;
  let html = fs.readFileSync(path.join(ROOT, pagePath), 'utf8');
  const anchor = '<section><h2>Choose the bottleneck first</h2>';
  if (!html.includes(anchor)) throw new Error(`Cannot locate insertion point in ${pagePath}.`);
  html = html.replace(anchor, `${renderTroubleshooter(model)}${anchor}`);
  write(pagePath, html);
}
writeJson('problems/index.json', publicDataset);
writeJson('life-os/datasets/problem-collections.json', publicDataset);
writeJson(`api/${platform.api_version}/problem-collections.json`, apiDataset);
console.log(`Problem troubleshooters enhanced: ${(cfg.troubleshooters ?? []).length} canonical problem page(s).`);
