import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));

const suite = read('data/agent-evaluation-suite.json');
const report = read('life-os/datasets/agent-evaluation.json');
const platform = read('data/platform.json');
const adoption = read('data/adoption.json');
if (report.summary?.cases !== suite.cases?.length) throw new Error('Brali Bench cannot package a report whose case count differs from the suite.');
if (report.dataset_version !== platform.dataset_version) throw new Error('Brali Bench dataset version drift.');

const layers = adoption.evaluation?.comparison_layers || [];
const gates = adoption.evaluation?.required_gates || [];
const manifest = {
  schema_version: 1,
  name: 'Brali Bench',
  bench_version: suite.suite_version,
  dataset_version: platform.dataset_version,
  case_count: suite.cases.length,
  scope: 'Deterministic evaluation of Brali retrieval, grounding, provenance, evidence boundaries, and conservative no-answer behavior.',
  not_a_claim: 'This is not a benchmark of an unpinned language model and does not measure general model intelligence.',
  comparison_layers: layers,
  required_gates: gates,
  reproduce: {
    build: 'npm run build',
    verify: 'npm run evaluate:check',
    runner: 'scripts/run-agent-evaluation.mjs',
    checker: 'scripts/check-agent-evaluation.mjs'
  },
  artifacts: {
    cases: 'cases.json',
    results: 'results.json',
    methodology: 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/blob/main/docs/AGENT_EVALUATION.md',
    canonical_page: `${BASE}/bench/`
  },
  license: 'CC-BY-NC-SA-4.0',
  citation: 'Dzmitryi Kharlanau. Brali Practical Knowledge Library, pinned data-v release.'
};

writeJson('bench/cases.json', suite);
writeJson('bench/results.json', report);
writeJson('bench/manifest.json', manifest);
const summary = report.summary || {};
write('bench/README.md', `# Brali Bench\n\nBrali Bench is the portable evaluation surface for Brali retrieval and grounding. It packages the same checked source cases and results used by the repository; it is not a benchmark of an unpinned language model.\n\n## Scope\n\n- ${suite.cases.length} deterministic cases.\n- Comparison layers: ${layers.map(item => `\`${item.id}\``).join(', ')}.\n- Safety/no-answer, evidence-state, provenance and Evidence Decision boundaries are checked.\n- Reproduce with \`npm run build\` and verify with \`npm run evaluate:check\`.\n\n## Files\n\n- \`manifest.json\` — scope, version, layers, gates and reproduction contract.\n- \`cases.json\` — source cases.\n- \`results.json\` — current deterministic report.\n\nFor reproducible external use, pin the matching \`data-v*\` release rather than following \`main\`.\n`);
write('bench/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brali Bench — grounded practical-knowledge retrieval evaluation</title><meta name="description" content="A reproducible ${suite.cases.length}-case evaluation for practical-knowledge retrieval, provenance, evidence boundaries and conservative no-answer behavior."><link rel="canonical" href="${BASE}/bench/"><link rel="stylesheet" href="/styles.css"></head><body><header class="site-header"><nav class="wrap nav"><a class="brand" href="/"><span>Brali</span></a><div class="links"><a href="/for-ai/">For AI</a><a href="/for-ai/evaluation/">Evaluation</a><a href="/cite/">Cite</a></div></nav></header><main class="page wrap"><p class="eyebrow">Open evaluation artifact</p><h1>Brali Bench</h1><p class="lead">A portable ${suite.cases.length}-case suite for checking whether practical-knowledge retrieval preserves relevance, provenance, evidence boundaries, and deliberate no-answer behavior.</p><div class="callout"><strong>Boundary:</strong> this evaluates Brali retrieval and grounded packets. It is not an unpinned language-model benchmark.</div><section class="prose"><h2>Current checked report</h2><ul><li>${esc(summary.passed)}/${esc(summary.cases)} cases pass.</li><li>Structured Topic hit rate: ${esc(summary.structured_topic_hit_rate)}.</li><li>Evidence Decision recall: ${esc(summary.evidence_decision_recall)}.</li><li>Safety/no-answer pass rate: ${esc(summary.safety_no_answer_pass_rate)}.</li><li>Unsupported evidence claims: ${esc(summary.unsupported_evidence_claims)}.</li></ul><h2>Reproduce</h2><pre><code>git clone https://github.com/Brali-LifeOS/brali-lifeos.github.io.git\ncd brali-lifeos.github.io\nnpm run build\nnpm run evaluate:check</code></pre><h2>Portable files</h2><p><a href="/bench/manifest.json">Manifest</a> · <a href="/bench/cases.json">Cases</a> · <a href="/bench/results.json">Results</a> · <a href="https://github.com/Brali-LifeOS/brali-lifeos.github.io/blob/main/docs/AGENT_EVALUATION.md">Methodology</a></p><h2>Comparison layers</h2><ul>${layers.map(layer => `<li><code>${esc(layer.id)}</code> — ${esc(layer.purpose)}</li>`).join('')}</ul><h2>Reuse correctly</h2><p>Pin a <code>data-v*</code> release for research or integration claims. Preserve the Brali dataset version, source cases, methodology, and trust boundaries when publishing derived results.</p></section></main></body></html>`);

const datasetManifest = read('life-os/datasets/manifest.json');
const published = ['bench/manifest.json','bench/cases.json','bench/results.json'];
datasetManifest.files = (datasetManifest.files || []).filter(item => !published.includes(typeof item === 'string' ? item : item.path));
for (const rel of published) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  datasetManifest.files.push({ path: rel, sha256: hash(text), bytes: Buffer.byteLength(text), count: rel.endsWith('cases.json') ? suite.cases.length : null });
}
datasetManifest.files.sort((a, b) => String(a.path || a).localeCompare(String(b.path || b)));
datasetManifest.counts ||= {};
datasetManifest.counts.bench_cases = suite.cases.length;
writeJson('life-os/datasets/manifest.json', datasetManifest);
writeJson(`api/${platform.api_version}/manifest.json`, datasetManifest);

const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemap.includes(`<loc>${BASE}/bench/</loc>`)) {
    sitemap = sitemap.replace('</urlset>', `  <url><loc>${BASE}/bench/</loc></url>\n</urlset>`);
    fs.writeFileSync(sitemapPath, sitemap);
  }
}
const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes(`${BASE}/bench/`)) llms += `\n## Brali Bench\n- Evaluation artifact: ${BASE}/bench/\n- Cases: ${BASE}/bench/cases.json\n- Results: ${BASE}/bench/results.json\n- Scope: retrieval, grounding, provenance, evidence boundaries, and no-answer behavior; not an unpinned-model benchmark.\n`;
  fs.writeFileSync(llmsPath, llms);
}
const integrationPath = path.join(ROOT, 'for-ai/integrations/index.html');
if (fs.existsSync(integrationPath)) {
  let html = fs.readFileSync(integrationPath, 'utf8');
  if (!html.includes('data-brali-bench')) {
    const block = '<aside class="callout" data-brali-bench><h2>Reuse the evaluation, not just the API</h2><p>Brali Bench packages the checked source cases, comparison layers, results, and model-benchmark boundary as a portable artifact.</p><a class="button" href="/bench/">Open Brali Bench</a></aside>';
    html = html.replace('</main>', `${block}</main>`);
    fs.writeFileSync(integrationPath, html);
  }
}
console.log(`Brali Bench built: ${suite.cases.length} cases; ${summary.passed}/${summary.cases} passing; dataset ${platform.dataset_version}.`);
