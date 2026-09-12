import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const registryPath = path.join(root, "data/life-os-retirements.json");
const sourceIndexPath = path.join(root, "data/life-os-content/index.json");

if (!existsSync(registryPath)) process.exit(0);

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const sourceIndex = JSON.parse(await readFile(sourceIndexPath, "utf8"));
const bySlug = new Map(sourceIndex.map((entry) => [entry.slug, entry]));
const retirements = registry.entries ?? [];
const retiredSlugs = new Set(retirements.map((entry) => entry.slug));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const canonical = (slug) => `${base}/life-os/${slug}/`;

for (const retirement of retirements) {
  if (!retirement.slug || !retirement.replacement_slug) throw new Error("Retirement entries require slug and replacement_slug.");
  if (retirement.slug === retirement.replacement_slug) throw new Error(`Retirement cannot replace itself: ${retirement.slug}`);
  if (!bySlug.has(retirement.slug)) throw new Error(`Retired Growth Library slug does not exist: ${retirement.slug}`);
  if (!bySlug.has(retirement.replacement_slug)) throw new Error(`Replacement Growth Library slug does not exist: ${retirement.replacement_slug}`);
  if (retiredSlugs.has(retirement.replacement_slug)) throw new Error(`Retirement chains are not allowed: ${retirement.slug} -> ${retirement.replacement_slug}`);
}

let sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const publicEntries = [];

for (const retirement of retirements) {
  const source = bySlug.get(retirement.slug);
  const replacement = bySlug.get(retirement.replacement_slug);
  const sourceUrl = canonical(retirement.slug);
  const replacementUrl = canonical(retirement.replacement_slug);
  const description = `This legacy Brali entry has been retired. ${replacement.title} now owns this practical speaking-practice intent.`;
  const handoff = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(source.title)} has moved — Brali</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${replacementUrl}"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"></head><body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt="Brali"><span>Brali</span></a><div class="links"><a href="/life-os/">Library</a><a href="/research/">Research</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a><a href="/faq/">FAQ</a></div></nav></header><main id="content" class="page wrap"><p class="eyebrow">Retired Growth Library entry</p><h1>${escapeHtml(source.title)} has moved.</h1><p class="lead">Brali no longer publishes this legacy AI-tracker concept as current guidance.</p><div class="prose"><p>The old page mixed a speaking-practice idea with product promises about AI feedback and tracking that Brali does not currently provide. Keeping it as a separate searchable protocol would duplicate the speaking-practice intent and overstate the product.</p><p><strong>${escapeHtml(replacement.title)}</strong> is the current Brali starting point for a short language-practice session. It stays focused on the action. Any language-structure handoff is owned separately by the curated Metkagram relation on that current page.</p><p><a class="button yellow" href="/life-os/${encodeURIComponent(retirement.replacement_slug)}/">Open the current Brali protocol</a></p></div></main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>Practical knowledge for people and machines.</small></div></div></footer></body></html>`;

  const pageDir = path.join(root, "life-os", retirement.slug);
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, "index.html"), handoff);

  const machinePath = path.join(pageDir, "index.json");
  if (existsSync(machinePath)) {
    const machine = JSON.parse(await readFile(machinePath, "utf8"));
    machine.content = {
      ...(machine.content ?? {}),
      current_guidance: false,
      display_state: "retired-handoff",
      search_role: "retired-replaced",
    };
    machine.discovery = {
      ...(machine.discovery ?? {}),
      search_indexable: false,
      search_role: "retired-replaced",
      trusted_protocol_feed: false,
      recommendation_eligible: false,
      agent_skill_eligible: false,
    };
    machine.retirement = {
      status: retirement.status ?? "retired-replaced",
      retired_at: retirement.retired_at ?? null,
      replacement_slug: retirement.replacement_slug,
      replacement_url: replacementUrl,
      reason: retirement.reason ?? null,
    };
    await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  }

  const zonePath = path.join(root, "life-os", source.zone.slug, "index.html");
  if (existsSync(zonePath)) {
    let zoneHtml = await readFile(zonePath, "utf8");
    const itemPattern = new RegExp(`<li><a href=["']/life-os/${escapeRegExp(retirement.slug)}/["'][^>]*>.*?</li>`, "gs");
    zoneHtml = zoneHtml.replace(itemPattern, "");
    const remaining = (zoneHtml.match(/<li><a href=["']\/life-os\/[a-z0-9-]+\/["']/g) ?? []).length;
    zoneHtml = zoneHtml.replace(/<h2>\d+ practical entries<\/h2>/, `<h2>${remaining} practical entries</h2>`);
    await writeFile(zonePath, zoneHtml);
  }

  const urlPattern = new RegExp(`\\s*<url>\\s*<loc>${escapeRegExp(sourceUrl)}</loc>(?:\\s*<lastmod>[^<]+</lastmod>)?\\s*</url>`, "g");
  sitemap = sitemap.replace(urlPattern, "");

  publicEntries.push({
    slug: retirement.slug,
    status: retirement.status ?? "retired-replaced",
    retired_at: retirement.retired_at ?? null,
    legacy_url: sourceUrl,
    replacement_slug: retirement.replacement_slug,
    replacement_url: replacementUrl,
    reason: retirement.reason ?? null,
  });
}

await writeFile(path.join(root, "sitemap.xml"), sitemap);

const publicRegistry = {
  schema_version: registry.schema_version ?? 1,
  updated_at: registry.updated_at ?? null,
  policy: registry.policy ?? null,
  entries: publicEntries,
};
const datasetDir = path.join(root, "life-os", "datasets");
await mkdir(datasetDir, { recursive: true });
await writeFile(path.join(datasetDir, "retirements.json"), `${JSON.stringify(publicRegistry, null, 2)}\n`);

const manifestPath = path.join(datasetDir, "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.retired_entries = publicEntries.length;
  manifest.active_entries = Math.max(0, Number(manifest.entries ?? sourceIndex.length) - publicEntries.length);
  manifest.files = Array.from(new Set([...(manifest.files ?? []), "retirements.json"]));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const indexingPath = path.join(datasetDir, "indexing.json");
if (existsSync(indexingPath)) {
  const indexing = JSON.parse(await readFile(indexingPath, "utf8"));
  const strip = (items) => (items ?? []).filter((slug) => !retiredSlugs.has(slug));
  indexing.indexable = strip(indexing.indexable);
  indexing.reference_indexable = strip(indexing.reference_indexable);
  indexing.withheld = strip(indexing.withheld);
  indexing.trusted_recommendations = strip(indexing.trusted_recommendations);
  indexing.review_required = strip(indexing.review_required);
  indexing.indexable_count = indexing.indexable.length;
  indexing.reference_indexable_count = indexing.reference_indexable.length;
  indexing.withheld_count = indexing.withheld.length;
  indexing.trusted_recommendation_count = indexing.trusted_recommendations.length;
  indexing.review_required_count = indexing.review_required.length;
  indexing.retired_count = publicEntries.length;
  indexing.retired = publicEntries.map((entry) => entry.slug);
  indexing.retirement_rule = "Retired/replaced legacy entries are excluded from search and recommendation surfaces. Their old URL remains a noindex handoff whose canonical points to the current Brali owner of that user intent.";
  await writeFile(indexingPath, `${JSON.stringify(indexing, null, 2)}\n`);
}

for (const llmsName of ["llms.txt", "llms-full.txt"]) {
  const llmsPath = path.join(root, llmsName);
  if (!existsSync(llmsPath)) continue;
  const lines = (await readFile(llmsPath, "utf8")).split("\n");
  const filtered = lines.filter((line) => !retirements.some((entry) => line.includes(`/life-os/${entry.slug}/`)));
  await writeFile(llmsPath, filtered.join("\n"));
}

console.log(`Growth Library retirements applied: ${publicEntries.length} retired/replaced entr${publicEntries.length === 1 ? "y" : "ies"}.`);
