import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://brali-lifeos.github.io';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const write = (rel, value) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const writeJson = (rel, value) => write(rel, `${JSON.stringify(value, null, 2)}\n`);
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const esc = value => clean(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const escAttr = esc;
const uniq = values => [...new Set(values.filter(Boolean))];
const clampDescription = value => {
  const normalized = clean(value);
  if (normalized.length <= 158) return normalized;
  const slice = normalized.slice(0, 155);
  const boundary = slice.lastIndexOf(' ');
  return `${slice.slice(0, boundary > 110 ? boundary : 155).replace(/[,:;\-\s]+$/, '')}…`;
};

const sourceIndex = read('data/life-os-content/index.json');
const publicIndex = read('life-os-index.json');
const zones = read('data/life-os-zones.json');
const areas = read('data/life-areas.json');
const evidence = read('life-os/datasets/evidence.json');
const protocols = read('life-os/datasets/protocols.json');
const researchGaps = read('research/gaps/index.json');

const publicBySlug = new Map(publicIndex.map(item => [item.slug, item]));
const evidenceBySlug = new Map((evidence.entries ?? []).map(item => [item.slug, item]));
const protocolBySlug = new Map((protocols.entries ?? []).map(item => [item.slug, item]));
const gapByTopic = new Map((researchGaps.entries ?? []).map(item => [item.topic_id, item]));
const areaByZone = new Map();
for (const area of areas) for (const zoneSlug of area.zones ?? []) areaByZone.set(zoneSlug, area);
const entriesByZone = new Map(zones.map(zone => [zone.slug, []]));
for (const entry of sourceIndex) {
  if (!entriesByZone.has(entry.zone?.slug)) entriesByZone.set(entry.zone?.slug, []);
  entriesByZone.get(entry.zone?.slug).push(entry);
}

const statusLabel = status => ({
  reviewed: 'Reviewed',
  practical: 'Practical',
  'pending-review': 'Pending review',
  restricted: 'Restricted'
}[status] ?? clean(status));

const topicItems = ontology => (ontology?.topics ?? []).map(item => ({ id: item.id, title: item.title || item.id }));
const domainItems = ontology => (ontology?.domains ?? []).map(item => ({ id: item.id, title: item.title || item.id }));
const researchForOntology = ontology => topicItems(ontology).map(item => gapByTopic.get(item.id)).filter(Boolean);

function replaceMetaDescription(html, description) {
  const safe = escAttr(clampDescription(description));
  const meta = `<meta name="description" content="${safe}">`;
  const og = `<meta property="og:description" content="${safe}">`;
  html = /<meta\s+name=["']description["'][^>]*>/i.test(html)
    ? html.replace(/<meta\s+name=["']description["'][^>]*>/i, meta)
    : html.replace('</title>', `</title>${meta}`);
  html = /<meta\s+property=["']og:description["'][^>]*>/i.test(html)
    ? html.replace(/<meta\s+property=["']og:description["'][^>]*>/i, og)
    : html.replace('</head>', `${og}</head>`);
  return html;
}

function ensureAlternateJson(html, href) {
  if (html.includes(`rel="alternate" type="application/json" href="${href}"`)) return html;
  return html.replace('</head>', `<link rel="alternate" type="application/json" href="${href}"></head>`);
}

function removeNoindex(html) {
  return html.replace(/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*>/ig, '');
}

function articleDescription(entry, record) {
  const zone = entry.zone?.title || 'Growth Library';
  const base = clean(entry.description || entry.subtitle || publicBySlug.get(entry.slug)?.description || 'A practical Brali library entry.');
  if (base.length >= 75) return base;
  return `${base} Brali practical guidance in ${zone}; current evidence state: ${statusLabel(record?.status)}.`;
}

function articleContext(entry, record, protocol) {
  const topics = topicItems(record?.ontology);
  const domains = domainItems(record?.ontology);
  const gaps = researchForOntology(record?.ontology);
  const topicLinks = topics.length
    ? topics.map(item => `<a href="/ontology/topics/${esc(item.id)}/">${esc(item.title)}</a>`).join(' · ')
    : 'Topic classification pending';
  const domainLinks = domains.length
    ? domains.map(item => `<a href="/ontology/domains/${esc(item.id)}/">${esc(item.title)}</a>`).join(' · ')
    : 'Domain pending';
  const gapLinks = gaps.length
    ? `<p><strong>Research agenda:</strong> ${gaps.map(gap => `<a href="/research/gaps/${esc(gap.topic_id)}/">${esc(gap.topic_title)} · ${esc(gap.stage_label)}</a>`).join(' · ')}</p>`
    : '';
  const machineUse = protocol
    ? '<a href="/life-os/datasets/protocols.json">Included in the trusted Protocol Feed</a> for AI and retrieval use.'
    : 'Not included in the trusted Protocol Feed. Preserve the review boundary rather than treating this page as a recommendation.';
  return `<aside class="callout library-context" data-sitewide-quality-context="true"><span class="card-label">Library context · ${esc(statusLabel(record?.status))}</span><p><strong>Growth Zone:</strong> <a href="/life-os/${esc(entry.zone?.slug)}/">${esc(entry.zone?.title)}</a> · <strong>Domain:</strong> ${domainLinks}</p><p><strong>Topic:</strong> ${topicLinks}</p><p><strong>AI use:</strong> ${machineUse}</p>${gapLinks}<p><a href="/life-os/${esc(entry.slug)}/index.json">Machine-readable page record →</a></p></aside>`;
}

function articleMachineRecord(entry, record, protocol) {
  const publicEntry = publicBySlug.get(entry.slug) ?? entry;
  const gaps = researchForOntology(record?.ontology);
  return {
    schema_version: 1,
    type: 'brali-library-entry',
    protocol_id: protocol?.protocol_id ?? `brali:${entry.slug}`,
    slug: entry.slug,
    title: clean(publicEntry.displayTitle || entry.title),
    description: clean(entry.description),
    canonical_url: `${BASE}/life-os/${entry.slug}/`,
    machine_url: `${BASE}/life-os/${entry.slug}/index.json`,
    growth_zone: { slug: entry.zone?.slug, title: entry.zone?.title },
    life_area: protocol?.life_area ?? (areaByZone.get(entry.zone?.slug) ? { slug: areaByZone.get(entry.zone.slug).slug, title: areaByZone.get(entry.zone.slug).title } : null),
    evidence: {
      status: record?.status ?? null,
      indexable: Boolean(record?.indexable),
      search_indexable: true,
      sensitive: Boolean(record?.sensitive),
      source_recorded: Boolean(record?.source?.recorded),
      source_url: record?.status === 'reviewed' ? (record?.source?.url ?? null) : null,
      reviewed_at: protocol?.evidence?.reviewed_at ?? null
    },
    ontology: record?.ontology ?? null,
    discovery: {
      search_indexable: true,
      trusted_protocol_feed: Boolean(protocol),
      research_gaps: gaps.map(gap => ({ topic_id: gap.topic_id, stage: gap.stage, url: gap.canonical_url }))
    },
    trusted_protocol: protocol ?? null
  };
}

function transformArticle(entry) {
  const htmlPath = path.join(ROOT, 'life-os', entry.slug, 'index.html');
  const record = evidenceBySlug.get(entry.slug);
  const protocol = protocolBySlug.get(entry.slug) ?? null;
  let html = fs.readFileSync(htmlPath, 'utf8');
  const before = html;
  html = replaceMetaDescription(html, articleDescription(entry, record));
  html = ensureAlternateJson(html, `/life-os/${entry.slug}/index.json`);
  if (!html.includes('data-sitewide-quality-context="true"')) {
    const block = articleContext(entry, record, protocol);
    html = html.includes('<section class="prose related-protocols"')
      ? html.replace('<section class="prose related-protocols"', `${block}<section class="prose related-protocols"`)
      : html.replace('</main>', `${block}</main>`);
  }
  html = removeNoindex(html);
  if (html !== before) fs.writeFileSync(htmlPath, html);
  writeJson(`life-os/${entry.slug}/index.json`, articleMachineRecord(entry, record, protocol));
  return html !== before;
}

function zoneSummary(zone) {
  const entries = [...(entriesByZone.get(zone.slug) ?? [])].sort((a, b) => {
    const at = clean(publicBySlug.get(a.slug)?.displayTitle || a.title);
    const bt = clean(publicBySlug.get(b.slug)?.displayTitle || b.title);
    return at.localeCompare(bt);
  });
  const trusted = (protocols.entries ?? []).filter(item => item.growth_zone?.slug === zone.slug);
  const statuses = { reviewed: 0, practical: 0, 'pending-review': 0, restricted: 0 };
  const topicCounts = new Map();
  for (const entry of entries) {
    const record = evidenceBySlug.get(entry.slug);
    if (record?.status in statuses) statuses[record.status] += 1;
    for (const topic of topicItems(record?.ontology)) {
      const current = topicCounts.get(topic.id) ?? { id: topic.id, title: topic.title, count: 0 };
      current.count += 1;
      topicCounts.set(topic.id, current);
    }
  }
  const topics = [...topicCounts.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  const gaps = topics.map(topic => gapByTopic.get(topic.id)).filter(Boolean);
  const area = areaByZone.get(zone.slug) ?? null;
  return { zone, entries, trusted, statuses, topics, gaps, area, indexable: true, trustedCoverage: trusted.length > 0 };
}

function zoneDescription(summary) {
  const base = clean(summary.zone.subtitle || `Browse the ${summary.zone.title} Growth Zone.`);
  return `${base} ${summary.trusted.length} trusted protocols across ${summary.entries.length} library entries, with evidence status and research context.`;
}

function zoneMachineRecord(summary) {
  return {
    schema_version: 1,
    type: 'brali-growth-zone',
    slug: summary.zone.slug,
    title: summary.zone.title,
    description: summary.zone.subtitle,
    canonical_url: `${BASE}/life-os/${summary.zone.slug}/`,
    machine_url: `${BASE}/life-os/${summary.zone.slug}/index.json`,
    indexable: summary.indexable,
    trusted_coverage: summary.trustedCoverage,
    life_area: summary.area ? { slug: summary.area.slug, title: summary.area.title } : null,
    counts: {
      library_entries: summary.entries.length,
      trusted_protocols: summary.trusted.length,
      reviewed: summary.statuses.reviewed,
      practical: summary.statuses.practical,
      pending_review: summary.statuses['pending-review'],
      restricted: summary.statuses.restricted,
      mapped_topics: summary.topics.length,
      research_gaps: summary.gaps.length
    },
    topics: summary.topics.map(topic => ({ ...topic, url: `${BASE}/ontology/topics/${topic.id}/` })),
    research_gaps: summary.gaps.map(gap => ({ topic_id: gap.topic_id, title: gap.topic_title, stage: gap.stage, url: gap.canonical_url })),
    trusted_protocols: summary.trusted.map(protocol => ({ slug: protocol.slug, title: protocol.title, url: protocol.url, evidence_status: protocol.evidence?.status ?? null })),
    entries: summary.entries.map(entry => {
      const record = evidenceBySlug.get(entry.slug);
      return {
        slug: entry.slug,
        title: clean(publicBySlug.get(entry.slug)?.displayTitle || entry.title),
        url: `${BASE}/life-os/${entry.slug}/`,
        evidence_status: record?.status ?? null,
        indexable: Boolean(record?.indexable)
      };
    })
  };
}

function zoneOverview(summary) {
  const trustedList = summary.trusted.length
    ? `<ul class="article-list">${summary.trusted.slice(0, 10).map(protocol => `<li><a href="/life-os/${esc(protocol.slug)}/">${esc(protocol.title)}</a><span>${esc(protocol.action || protocol.description || '')}</span><small>${esc(statusLabel(protocol.evidence?.status))}</small></li>`).join('')}</ul>${summary.trusted.length > 10 ? `<p><small>${summary.trusted.length - 10} more trusted protocols are available in the full archive below.</small></p>` : ''}`
    : '<p>No entry in this zone currently meets the trusted Protocol Feed bar. The archive is search-visible and evidence-labelled, but its entries remain excluded from normal trusted recommendations until review is complete.</p>';
  const topicLinks = summary.topics.slice(0, 8).map(topic => `<a href="/ontology/topics/${esc(topic.id)}/">${esc(topic.title)} (${topic.count})</a>`).join(' · ');
  const gapLinks = summary.gaps.length
    ? `<p><strong>Research gaps:</strong> ${summary.gaps.slice(0, 8).map(gap => `<a href="/research/gaps/${esc(gap.topic_id)}/">${esc(gap.topic_title)} · ${esc(gap.stage_label)}</a>`).join(' · ')}</p>`
    : '<p><strong>Research gaps:</strong> none from the current 24-topic baseline are mapped to this zone.</p>';
  return `<section data-zone-quality="true"><div class="grid three"><article class="card"><span class="card-label">Library</span><h2>${summary.entries.length}</h2><p>Total entries in this Growth Zone.</p></article><article class="card"><span class="card-label">Trusted feed</span><h2>${summary.trusted.length}</h2><p>${summary.statuses.reviewed} reviewed · ${summary.statuses.practical} practical.</p></article><article class="card"><span class="card-label">Review queue</span><h2>${summary.statuses['pending-review'] + summary.statuses.restricted}</h2><p>${summary.statuses['pending-review']} pending · ${summary.statuses.restricted} restricted.</p></article></div><div class="callout"><p><strong>Life Area:</strong> ${summary.area ? `<a href="/life-os/areas/${esc(summary.area.slug)}/">${esc(summary.area.title)}</a>` : 'Compatibility mapping pending'}.</p><p><strong>Topics:</strong> ${topicLinks || 'Topic classification pending for this zone.'}</p>${gapLinks}<p><a href="/life-os/${esc(summary.zone.slug)}/index.json">Machine-readable zone record →</a></p></div><section class="prose"><h2>Start with trusted protocols</h2><p>These entries currently meet Brali's reviewed/practical retrieval bar. “Trusted” is a publication state, not a promise that every protocol has equal scientific support.</p>${trustedList}</section></section>`;
}

function archiveList(summary) {
  return `<ul class="article-list">${summary.entries.map(entry => {
    const record = evidenceBySlug.get(entry.slug);
    const title = clean(publicBySlug.get(entry.slug)?.displayTitle || entry.title);
    const description = clean(entry.description).slice(0, 180);
    return `<li><a href="/life-os/${esc(entry.slug)}/">${esc(title)}</a>${description ? `<span>${esc(description)}</span>` : ''}<small>${esc(statusLabel(record?.status))}${record?.indexable ? ' · trusted retrieval' : ' · editorial review required'}</small></li>`;
  }).join('')}</ul>`;
}

function transformZone(zone) {
  const summary = zoneSummary(zone);
  const htmlPath = path.join(ROOT, 'life-os', zone.slug, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const before = html;
  html = replaceMetaDescription(html, zoneDescription(summary));
  html = ensureAlternateJson(html, `/life-os/${zone.slug}/index.json`);
  html = html.replace(new RegExp(`<h2>${summary.entries.length} practical entries<\\/h2>`, 'i'), `<h2>${summary.entries.length} library entries</h2><p>Full archive below. Evidence states differ; use the trusted list above for normal retrieval and recommendation.</p>`);
  const listPattern = /<ul class="article-list">[\s\S]*?<\/ul>/;
  if (listPattern.test(html)) html = html.replace(listPattern, archiveList(summary));
  if (!html.includes('data-zone-quality="true"')) {
    const block = zoneOverview(summary);
    const archive = '<section class="prose"><h2>';
    html = html.includes(archive) ? html.replace(archive, `${block}${archive}`) : html.replace('</main>', `${block}</main>`);
  }
  html = removeNoindex(html);
  if (html !== before) fs.writeFileSync(htmlPath, html);
  writeJson(`life-os/${zone.slug}/index.json`, zoneMachineRecord(summary));
  return { changed: html !== before, summary };
}

const passChanges = [];
let zoneSummaries = [];
for (let pass = 1; pass <= 3; pass += 1) {
  let changed = 0;
  for (const entry of sourceIndex) if (transformArticle(entry)) changed += 1;
  const currentZones = [];
  for (const zone of zones) {
    const result = transformZone(zone);
    if (result.changed) changed += 1;
    currentZones.push(result.summary);
  }
  zoneSummaries = currentZones;
  passChanges.push(changed);
  if (changed === 0) break;
}
const converged = passChanges.at(-1) === 0;
if (!converged) throw new Error(`Site-wide quality loop did not converge after ${passChanges.length} passes: ${passChanges.join(', ')}`);

let sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const summary of zoneSummaries) {
  const loc = `<loc>${BASE}/life-os/${summary.zone.slug}/</loc>`;
  if (!sitemap.includes(loc)) {
    sitemap = sitemap.replace('</urlset>', `  <url>${loc}</url>\n</urlset>`);
  }
}
if (!sitemap.includes(`<loc>${BASE}/state/quality/</loc>`)) sitemap = sitemap.replace('</urlset>', `  <url><loc>${BASE}/state/quality/</loc></url>\n</urlset>`);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

const localTarget = href => {
  let value = href;
  if (value.startsWith(BASE)) value = value.slice(BASE.length) || '/';
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  value = value.split('#')[0].split('?')[0];
  if (!value) return null;
  const rel = value.replace(/^\//, '');
  if (!rel) return 'index.html';
  if (value.endsWith('/')) return path.join(rel, 'index.html');
  return rel;
};
const hrefs = html => [...html.matchAll(/href=["']([^"']+)["']/gi)].map(match => match[1]);
const issues = [];
const addIssue = (severity, kind, page, detail) => issues.push({ severity, kind, page, detail });

function auditCommon(html, pathname, jsonHref) {
  const canonical = `${BASE}${pathname}`;
  const h1s = (html.match(/<h1(?:\s[^>]*)?>/gi) ?? []).length;
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) addIssue('error', 'canonical', pathname, `Expected ${canonical}`);
  if (!/<meta\s+name=["']description["']\s+content=["'][^"']{40,}["']/i.test(html)) addIssue('error', 'meta-description', pathname, 'Missing or too-short meta description.');
  if (h1s !== 1) addIssue('error', 'h1-count', pathname, `Expected one H1, found ${h1s}.`);
  if (!html.includes('application/ld+json')) addIssue('error', 'structured-data', pathname, 'Missing JSON-LD.');
  if (!html.includes(`rel="alternate" type="application/json" href="${jsonHref}"`)) addIssue('error', 'alternate-json', pathname, `Missing ${jsonHref}.`);
  for (const href of hrefs(html)) {
    const target = localTarget(href);
    if (!target) continue;
    if (!fs.existsSync(path.join(ROOT, target))) addIssue('error', 'broken-internal-link', pathname, href);
  }
}

for (const entry of sourceIndex) {
  const pathname = `/life-os/${entry.slug}/`;
  const html = fs.readFileSync(path.join(ROOT, 'life-os', entry.slug, 'index.html'), 'utf8');
  const record = evidenceBySlug.get(entry.slug);
  auditCommon(html, pathname, `/life-os/${entry.slug}/index.json`);
  if (!html.includes('data-protocol-summary="true"')) addIssue('error', 'protocol-summary', pathname, 'Missing protocol summary.');
  if (!html.includes('data-related-protocols="true"')) addIssue('error', 'related-protocols', pathname, 'Missing trusted related protocols.');
  if (!html.includes('data-sitewide-quality-context="true"')) addIssue('error', 'quality-context', pathname, 'Missing library context.');
  if (!html.includes(`/life-os/${entry.zone?.slug}/`)) addIssue('error', 'zone-backlink', pathname, 'Missing Growth Zone backlink.');
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  if (noindex) addIssue('error', 'indexing-alignment', pathname, 'Public hack page must not contain noindex.');
  const inSitemap = sitemap.includes(`<loc>${BASE}${pathname}</loc>`);
  if (!inSitemap) addIssue('error', 'sitemap-alignment', pathname, 'Public hack page is missing from sitemap.');
}

for (const summary of zoneSummaries) {
  const pathname = `/life-os/${summary.zone.slug}/`;
  const html = fs.readFileSync(path.join(ROOT, 'life-os', summary.zone.slug, 'index.html'), 'utf8');
  auditCommon(html, pathname, `/life-os/${summary.zone.slug}/index.json`);
  if (!html.includes('data-zone-quality="true"')) addIssue('error', 'zone-quality', pathname, 'Missing trust-first zone overview.');
  if (!html.includes(`${summary.entries.length} library entries`)) addIssue('error', 'zone-archive', pathname, 'Archive heading does not reflect full library count.');
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  if (noindex) addIssue('error', 'zone-indexing', pathname, 'Public Growth Zone must not contain noindex.');
  const inSitemap = sitemap.includes(`<loc>${BASE}${pathname}</loc>`);
  if (!inSitemap) addIssue('error', 'zone-sitemap', pathname, 'Public Growth Zone is missing from sitemap.');
}

const errors = issues.filter(issue => issue.severity === 'error');
const indexableZones = zoneSummaries.length;
const trustedRecommendationEntries = (evidence.entries ?? []).filter(item => item.indexable).length;
const report = {
  schema_version: 1,
  name: 'Brali Site-wide Page & Zone Quality Cycle',
  scope: 'Every generated Growth Library entry page and every Growth Zone page.',
  loop: {
    max_passes: 3,
    passes_run: passChanges.length,
    changed_pages_by_pass: passChanges,
    converged
  },
  coverage: {
    entry_pages_checked: sourceIndex.length,
    zone_pages_checked: zones.length,
    total_pages_checked: sourceIndex.length + zones.length,
    machine_readable_page_records: sourceIndex.length + zones.length,
    trusted_protocols: protocols.count ?? (protocols.entries ?? []).length,
    indexable_entry_pages: sourceIndex.length,
    withheld_entry_pages: 0,
    trusted_recommendation_entries: trustedRecommendationEntries,
    review_required_entry_pages: sourceIndex.length - trustedRecommendationEntries,
    indexable_zones: indexableZones,
    withheld_zones: 0,
    zones_without_trusted_protocols: zoneSummaries.filter(item => !item.trustedCoverage).length,
    open_research_gaps: researchGaps.current_open_gap_count,
    resolved_research_gaps: researchGaps.resolved_gap_count
  },
  rules: [
    'Every entry and zone must have canonical, descriptive metadata, one H1, JSON-LD, and an alternate JSON record.',
    'Every entry exposes evidence state, ontology context, trusted-feed eligibility, and linked research gaps where applicable.',
    'Every zone presents trusted protocols first and labels the full archive by evidence state.',
    'All public entries and zones are crawlable; evidence state separately gates normal trusted recommendations.',
    'All internal links on the 947 entry pages and 49 zone pages must resolve to a generated local target.',
    'The automatic loop must converge: a second pass should make zero additional HTML changes.'
  ],
  issues,
  error_count: errors.length,
  zones: zoneSummaries.map(summary => ({
    slug: summary.zone.slug,
    title: summary.zone.title,
    indexable: summary.indexable,
    trusted_coverage: summary.trustedCoverage,
    library_entries: summary.entries.length,
    trusted_protocols: summary.trusted.length,
    reviewed: summary.statuses.reviewed,
    practical: summary.statuses.practical,
    pending_review: summary.statuses['pending-review'],
    restricted: summary.statuses.restricted,
    topics: summary.topics.length,
    research_gaps: summary.gaps.length,
    url: `${BASE}/life-os/${summary.zone.slug}/`
  }))
};
writeJson('state/quality/index.json', report);

const cards = [
  ['Pages cycled', report.coverage.total_pages_checked, `${sourceIndex.length} entries + ${zones.length} zones.`],
  ['Search-visible entries', report.coverage.indexable_entry_pages, 'Every public hack page is crawlable and included in the sitemap.'],
  ['Trusted recommendations', report.coverage.trusted_recommendation_entries, `${report.coverage.review_required_entry_pages} pages remain outside normal trusted recommendations.`],
  ['Research gaps', `${report.coverage.open_research_gaps} open`, `${report.coverage.resolved_research_gaps} resolved in the current research agenda.`],
  ['Loop convergence', passChanges.join(' → '), `${passChanges.length} pass(es); final pass changed zero pages.`],
  ['Technical errors', report.error_count, report.error_count ? 'See the issue list below.' : 'All enforced page and zone checks passed.']
].map(([label, value, detail]) => `<article class="card"><span class="card-label">${esc(label)}</span><h2>${esc(value)}</h2><p>${esc(detail)}</p></article>`).join('');
const zoneRows = report.zones.map(zone => `<tr><td><a href="/life-os/${esc(zone.slug)}/">${esc(zone.title)}</a></td><td>${zone.library_entries}</td><td>${zone.trusted_protocols}</td><td>${zone.pending_review}</td><td>${zone.restricted}</td><td>${zone.research_gaps}</td><td>index · ${zone.trusted_coverage ? 'trusted subset available' : 'review-gated archive'}</td></tr>`).join('');
const issueRows = issues.length ? `<h2>Unresolved issues</h2><table><thead><tr><th>Severity</th><th>Type</th><th>Page</th><th>Detail</th></tr></thead><tbody>${issues.slice(0, 200).map(issue => `<tr><td>${esc(issue.severity)}</td><td>${esc(issue.kind)}</td><td>${esc(issue.page)}</td><td>${esc(issue.detail)}</td></tr>`).join('')}</tbody></table>` : '<div class="callout"><strong>No enforced issues remain after convergence.</strong> Content evidence review is a separate editorial backlog and is not silently “fixed” by this technical loop.</div>';
const qualitySchema = { '@context':'https://schema.org', '@type':'Dataset', name:report.name, description:report.scope, url:`${BASE}/state/quality/`, measurementTechnique:'Deterministic build-time checks across every generated Growth Library entry and Growth Zone page' };
const qualityHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page & Zone Quality Cycle | Brali</title><meta name="description" content="Deterministic site-wide quality cycle across all Brali Growth Library entry pages and Growth Zones, including trust, indexing, internal links, metadata, and machine-readable records."><link rel="canonical" href="${BASE}/state/quality/"><meta property="og:type" content="website"><meta property="og:title" content="Brali Page & Zone Quality Cycle"><meta property="og:description" content="A reproducible quality pass across every Growth Library entry and zone."><meta property="og:url" content="${BASE}/state/quality/"><link rel="alternate" type="application/json" href="/state/quality/index.json"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(qualitySchema).replace(/</g, '\\u003c')}</script></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/state/">State</a><a href="/research/gaps/">Research Gaps</a><a href="/evidence/">Evidence</a><a href="/for-ai/">For AI</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">State · Site-wide quality cycle</p><h1>Every entry. Every zone. Repeat until the safe fixes converge.</h1><p class="lead">This build-time loop walks all ${sourceIndex.length} Growth Library entry pages and all ${zones.length} Growth Zones. It fixes deterministic presentation and discovery issues, then checks the final pages again. Evidence review remains human/editorial work rather than being cosmetically declared complete.</p><div class="grid two">${cards}</div>${issueRows}<section class="prose"><h2>Zone coverage</h2><table><thead><tr><th>Growth Zone</th><th>Entries</th><th>Trusted</th><th>Pending</th><th>Restricted</th><th>Research gaps</th><th>Search</th></tr></thead><tbody>${zoneRows}</tbody></table><h2>Machine-readable result</h2><p><a href="/state/quality/index.json">Quality-cycle JSON →</a> · <a href="/life-os/datasets/evidence.json">Evidence index →</a> · <a href="/life-os/datasets/protocols.json">Trusted Protocol Feed →</a></p></section></main><footer class="footer"><div class="wrap footer-row"><small>Brali · measurable quality instead of a ceremonial audit</small></div></footer></body></html>\n`;
write('state/quality/index.html', qualityHtml);

const statePath = path.join(ROOT, 'state/index.html');
if (fs.existsSync(statePath)) {
  let stateHtml = fs.readFileSync(statePath, 'utf8');
  if (!stateHtml.includes('data-sitewide-quality-cycle')) {
    stateHtml = stateHtml.replace('</main>', `<aside class="callout" data-sitewide-quality-cycle><h3>Page & Zone Quality Cycle</h3><p>Every build checks ${sourceIndex.length} entry pages and ${zones.length} Growth Zones, publishes per-page JSON, keeps all public pages crawlable, and separately gates trusted recommendations by evidence state.</p><a class="button" href="/state/quality/">Open site-wide quality report</a></aside></main>`);
    fs.writeFileSync(statePath, stateHtml);
  }
}
const stateJsonPath = path.join(ROOT, 'state/index.json');
if (fs.existsSync(stateJsonPath)) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  state.sitewide_quality = { url: `${BASE}/state/quality/`, machine_url: `${BASE}/state/quality/index.json`, ...report.coverage, error_count: report.error_count, converged };
  fs.writeFileSync(stateJsonPath, `${JSON.stringify(state, null, 2)}\n`);
}
const llmsPath = path.join(ROOT, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('Page & Zone Quality Cycle:')) llms += `\n- Page & Zone Quality Cycle: ${BASE}/state/quality/\n- Page & Zone Quality JSON: ${BASE}/state/quality/index.json\n`;
  fs.writeFileSync(llmsPath, llms);
}

if (errors.length) throw new Error(`Site-wide quality cycle finished with ${errors.length} enforced error(s). See /state/quality/index.json.`);
console.log(`Site-wide quality cycle: ${sourceIndex.length} entries + ${zones.length} zones; passes ${passChanges.join(' -> ')}; all public pages indexable; ${trustedRecommendationEntries} trusted recommendation entries; ${errors.length} enforced errors.`);
