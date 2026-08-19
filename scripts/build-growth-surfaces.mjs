import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/growth-surfaces.json'), 'utf8'));

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));
const write = (relative, content) => {
  const file = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const writeJson = (relative, value) => write(relative, `${JSON.stringify(value, null, 2)}\n`);
const nav = `<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/questions/">Questions</a><a href="/research/">Research</a><a href="/updates/">Updates</a><a href="/for-ai/">For AI</a></div></nav></header>`;
const footer = `<footer class="footer"><div class="wrap footer-row"><small>Brali · practical knowledge for people and machines</small><div class="footer-links"><a href="/life-os/">Library</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a></div></div></footer>`;
const head = ({ title, description, canonical, schema, robots = '' }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}">${robots ? `<meta name="robots" content="${esc(robots)}">` : ''}<link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${BASE}/assets/images/brali-logo.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script></head>`;

const questionGroups = data.question_groups ?? [];
const questionItems = questionGroups.flatMap(group => (group.questions ?? []).map(question => ({
  '@type': 'ListItem',
  name: question,
  url: `${BASE}${group.primary_url}`
})));
const questionSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Practical questions answered by the Brali knowledge library',
  description: 'Question-led entry points for focus, habits, learning, sleep, stress, movement, communication, and decisions.',
  url: `${BASE}/questions/`,
  mainEntity: { '@type': 'ItemList', itemListElement: questionItems }
};
const questionCards = questionGroups.map(group => {
  const questions = (group.questions ?? []).map(question => `<li>${esc(question)}</li>`).join('');
  const secondary = group.secondary_url ? ` · <a href="${esc(group.secondary_url)}">Related research</a>` : '';
  return `<article class="card"><span class="card-label">${esc(group.title)}</span><h2>${esc(group.title)}</h2><p>${esc(group.summary)}</p><ul>${questions}</ul><p><a href="${esc(group.primary_url)}">Explore the canonical Brali collection →</a>${secondary}</p></article>`;
}).join('');
write('questions/index.html', `${head({
  title: 'Practical questions: focus, habits, learning, sleep & more | Brali',
  description: 'Start with a real question, then jump to a canonical Brali topic, life area, research note, or query result instead of browsing a giant list of hacks.',
  canonical: `${BASE}/questions/`,
  schema: questionSchema
})}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Question-led discovery</p><h1>Start with the question you actually have.</h1><p class="lead">Brali contains many hacks, protocols, Growth Zones, Topics, and research notes. This page turns that depth into a smaller set of useful entry points instead of asking you to browse the archive like a determined librarian with poor life choices.</p><div class="callout"><strong>How this works:</strong> these questions are editorial navigation, not claims about measured search volume. Each one routes to a canonical Brali collection so the useful answer, evidence boundary, and related data stay in one place.</div><section><div class="grid two">${questionCards}</div></section><section class="prose"><h2>Ask Brali directly</h2><p>Want a narrower result? The <a href="/for-ai/query/">Query Playground</a> searches Brali's maintained knowledge and shows trust, evidence, and provenance alongside the result.</p><p>For research changes and emerging evidence, use <a href="/research/">Research & trends</a>. For what changed in Brali itself, use <a href="/updates/">Brali Updates</a>.</p></section></main>${footer}</body></html>\n`);
writeJson('questions/index.json', {
  schema_version: data.schema_version,
  updated_at: data.updated_at,
  policy: data.policy,
  groups: questionGroups
});

const reports = data.reports ?? [];
const reportCards = reports.map(report => `<article class="card"><span class="card-label">${esc(report.cadence)} · ${esc(report.status)} · ${esc(report.period_end)}</span><h2><a href="/updates/${esc(report.slug)}/">${esc(report.title)}</a></h2><p>${esc(report.summary)}</p></article>`).join('');
const updatesSchema = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Brali Updates',
  description: 'Weekly and monthly reports on Brali library quality, research, data, AI integrations, and product changes.',
  url: `${BASE}/updates/`,
  blogPost: reports.map(report => ({
    '@type': 'BlogPosting',
    headline: report.title,
    url: `${BASE}/updates/${report.slug}/`,
    datePublished: report.period_end,
    dateModified: data.updated_at
  }))
};
write('updates/index.html', `${head({
  title: 'Brali Updates — weekly and monthly progress reports',
  description: 'A living record of what changed in Brali: trusted protocols, research reviews, datasets, topic coverage, query tools, and AI integration surfaces.',
  canonical: `${BASE}/updates/`,
  schema: updatesSchema
})}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">Brali Updates</p><h1>What changed, what we learned, and what comes next.</h1><p class="lead">A short weekly report plus a month-to-date view. The point is useful freshness and a public audit trail, not publishing a ceremonial changelog nobody reads.</p><div class="callout"><strong>Metrics rule:</strong> this report uses verified repository, dataset, and research changes. Search traffic, rankings, and query-volume trends appear only when they come from named first-party or external data.</div><section><div class="grid two">${reportCards}</div></section><section class="prose"><h2>Related living surfaces</h2><p><a href="/research/">Research & trends</a> tracks evidence changes. <a href="/questions/">Practical questions</a> turns the library into problem-first entry points. <a href="/life-os/datasets/">Data</a> exposes machine-readable artifacts.</p></section></main>${footer}</body></html>\n`);

for (const report of reports) {
  const canonical = `${BASE}/updates/${report.slug}/`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: report.title,
    description: report.summary,
    url: canonical,
    datePublished: report.period_end,
    dateModified: data.updated_at,
    publisher: { '@type': 'Organization', name: 'Brali', url: BASE },
    isPartOf: { '@type': 'Blog', name: 'Brali Updates', url: `${BASE}/updates/` }
  };
  const highlights = (report.highlights ?? []).map(item => {
    const external = String(item.url || '').startsWith('http');
    const link = item.url ? `<p><a href="${esc(item.url)}"${external ? ' rel="noopener"' : ''}>Source / related page →</a></p>` : '';
    return `<article class="card"><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p>${link}</article>`;
  }).join('');
  const next = (report.next ?? []).map(item => `<li>${esc(item)}</li>`).join('');
  write(`updates/${report.slug}/index.html`, `${head({
    title: `${report.title} | Brali Updates`,
    description: report.summary,
    canonical,
    schema
  })}<body><a class="skip" href="#content">Skip to content</a>${nav}<main id="content" class="page wrap"><p class="eyebrow">${esc(report.cadence)} · ${esc(report.status)} · ${esc(report.period_start)} to ${esc(report.period_end)}</p><h1>${esc(report.title)}</h1><p class="lead">${esc(report.summary)}</p><section><div class="grid two">${highlights}</div></section><section class="prose"><h2>Next</h2><ul>${next}</ul><h2>Why publish this?</h2><p>Brali is changing quickly. A dated report makes additions, corrections, and platform work discoverable without pretending every code change deserves a standalone article.</p><p><a href="/updates/">All Brali updates →</a> · <a href="/questions/">Browse by question →</a> · <a href="/research/">Research & trends →</a></p></section></main>${footer}</body></html>\n`);
}
writeJson('updates/feed.json', {
  schema_version: data.schema_version,
  updated_at: data.updated_at,
  reports
});

const changelogSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Brali changelog moved to Brali Updates',
  url: `${BASE}/changelog/`,
  mainEntity: { '@type': 'WebPage', url: `${BASE}/updates/` }
};
write('changelog/index.html', `${head({
  title: 'Brali changelog → Brali Updates',
  description: 'Brali project changes are now published as readable weekly and monthly updates with links to research, data, and repository sources.',
  canonical: `${BASE}/updates/`,
  schema: changelogSchema,
  robots: 'noindex,follow'
})}<body>${nav}<main class="page wrap"><p class="eyebrow">Changelog</p><h1>Project updates now live in Brali Updates.</h1><div class="prose"><p>The old changelog was an app-release placeholder. Brali is now primarily a knowledge project, so weekly and monthly reports cover library quality, research, data, AI integration, and notable releases in one useful place.</p><p><a class="button yellow" href="/updates/">Open Brali Updates</a></p></div></main>${footer}</body></html>\n`);

const inject = (relative, marker, block) => {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(marker)) return false;
  html = html.replace('</main>', `${block}</main>`);
  fs.writeFileSync(file, html);
  return true;
};
const homeBlock = `<section class="section" data-brali-growth-surfaces><div class="wrap"><div class="section-intro"><p class="eyebrow">Fresh entry points</p><h2>Ask a question or see what changed.</h2><p>The library is large. These surfaces make it easier to enter by problem, evidence change, or recent project work.</p></div><div class="grid three"><article class="card"><span class="card-label">Discover</span><h3>Practical questions</h3><p>Natural-language questions mapped to canonical Brali topics and life areas.</p><p><a href="/questions/">Browse questions →</a></p></article><article class="card"><span class="card-label">Freshness</span><h3>Weekly & monthly updates</h3><p>See what changed in the library, research layer, data, and AI integrations.</p><p><a href="/updates/">Read Brali Updates →</a></p></article><article class="card"><span class="card-label">Evidence</span><h3>Research & trends</h3><p>Follow new evidence, corrections, contradictions, and open questions.</p><p><a href="/research/">Research notes →</a></p></article></div></div></section>`;
const lifeOsBlock = `<aside class="callout" data-brali-growth-surfaces><h3>Not sure where to start?</h3><p>Browse <a href="/questions/">practical questions</a> instead of scanning the whole library, or see <a href="/updates/">what changed recently</a>.</p></aside>`;
const researchBlock = `<aside class="callout" data-brali-growth-surfaces><h3>Follow the project, not just the papers.</h3><p><a href="/updates/">Brali Updates</a> summarizes weekly and monthly changes across research, trusted protocols, datasets, and AI access.</p></aside>`;
const touched = [
  inject('index.html', 'data-brali-growth-surfaces', homeBlock),
  inject('life-os/index.html', 'data-brali-growth-surfaces', lifeOsBlock),
  inject('research/index.html', 'data-brali-growth-surfaces', researchBlock)
].filter(Boolean).length;

console.log(`Growth surfaces built: ${questionGroups.length} question groups, ${reports.length} reports, ${touched} navigation surfaces updated.`);
