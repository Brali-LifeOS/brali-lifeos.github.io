import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const writeJson = (rel, value) => fs.writeFileSync(path.join(ROOT, rel), `${JSON.stringify(value, null, 2)}\n`);

const citationPath = 'cite/index.json';
const citation = readJson(citationPath);

citation.schema_version = 2;
citation.canonical_vocabulary = [
  {
    term: 'Evidence Decision',
    definition: 'A reviewed record of how a source affects Brali guidance, including supported claims, unsupported or overstated claims, limitations and editorial outcome.',
    url: `${BASE}/evidence/`
  },
  {
    term: 'evidence state',
    definition: 'A Brali publication-state label: reviewed, practical, pending-review or restricted. It is not a universal scientific-certainty score.',
    url: `${BASE}/state/`
  },
  {
    term: 'canonical identity',
    definition: 'A stable Brali identifier in the form brali:<kind>:<local-id>; labels, URLs, localized terms and historical identifiers are aliases.',
    url: `${BASE}/ontology/`
  },
  {
    term: 'Topic',
    definition: "A concrete problem, capability or outcome used as Brali's primary retrieval target.",
    url: `${BASE}/ontology/`
  },
  {
    term: 'Protocol',
    definition: 'An executable sequence or personal experiment represented as a reusable Brali knowledge object.',
    url: `${BASE}/ontology/`
  },
  {
    term: 'Lens',
    definition: 'A transferable way of thinking that can connect multiple Topics; a Lens is not evidence by itself.',
    url: `${BASE}/ontology/`
  }
];

citation.machine_surfaces = {
  site_profile: `${BASE}/ai/site-profile.json`,
  ai_search_profile: `${BASE}/ai/ai-search-profile.json`,
  locale_manifest: `${BASE}/ai/locales.json`,
  knowledge_graph: `${BASE}/knowledge/graph.json`,
  trust_center: `${BASE}/trust/trust.json`,
  corrections_ledger: `${BASE}/trust/corrections.json`,
  evidence_decisions: `${BASE}/api/v1/evidence-decisions.json`,
  evidence_metrics: `${BASE}/life-os/datasets/evidence-metrics.json`,
  retrieval_benchmark: `${BASE}/life-os/datasets/retrieval-benchmark.json`,
  history_feed: `${BASE}/updates/feed.json`
};

citation.citation_guardrails = [
  'Do not infer scientific certainty from Brali publication states.',
  'Do not treat research candidates as evidence by themselves.',
  'Do not infer search visibility, AI citation, external authority or readiness from the existence of machine-readable surfaces.',
  'Preserve negative, unsupported and watch outcomes from Evidence Decisions when relevant.'
];

writeJson(citationPath, citation);

const citeHtmlPath = path.join(ROOT, 'cite/index.html');
if (fs.existsSync(citeHtmlPath)) {
  let html = fs.readFileSync(citeHtmlPath, 'utf8');
  if (!html.includes('data-brali-agent-citation-layer')) {
    const block = `<aside class="callout" data-brali-agent-citation-layer><h2>Machine-readable citation layer</h2><p>Canonical vocabulary, trust boundaries, evidence metrics, retrieval evaluation, correction history and agent-facing discovery surfaces are published separately so downstream systems can preserve meaning instead of collapsing everything into one score.</p><p><a href="/cite/index.json">Citation contract JSON</a> · <a href="/ai/ai-search-profile.json">AI Search &amp; Citation Profile</a> · <a href="/trust/">Trust Center</a> · <a href="/knowledge/graph.json">Knowledge graph</a></p></aside>`;
    html = html.replace('</main>', `${block}</main>`);
    fs.writeFileSync(citeHtmlPath, html);
  }
}

console.log(`Agent discovery layer enhanced: citation schema=${citation.schema_version}; vocabulary=${citation.canonical_vocabulary.length}; machine surfaces=${Object.keys(citation.machine_surfaces).length}.`);
