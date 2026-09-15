import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const canonical = JSON.parse(await readFile(path.join(root, "life-os", "datasets", "flagships.json"), "utf8"));
const base = "https://brali-lifeos.github.io";
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => { result[key] = canonicalize(value[key]); return result; }, {});
};
const sourceShape = (entry) => ({
  life_area: { slug: entry.life_area.slug, title: entry.life_area.title, subtitle: entry.life_area.subtitle },
  slug: entry.slug,
  title: entry.title,
  description: entry.description,
  action: entry.action,
  check_in: entry.check_in,
  evidence_status: entry.evidence_status,
  reviewed_at: entry.reviewed_at,
});
const fingerprint = (entry) => createHash("sha256").update(JSON.stringify(canonicalize(sourceShape(entry)))).digest("hex");
const canonicalBySlug = new Map(canonical.entries.map((entry) => [entry.slug, entry]));

const labelsByLocale = {
  de: {
    action: "Was ausprobieren",
    check: "Danach prüfen",
    boundary: "Wo die Empfehlung endet",
    alternative: "Wenn das nicht passt",
    status: "Evidenzstatus",
    reviewed: "Überprüft am",
    quality: "Redaktionell lokalisierter Einstiegspunkt",
    collectionCta: "Protokoll öffnen",
  },
};

function replaceMain(html, body) {
  const pattern = /<main\s+id=["']content["']\s+class=["']page wrap["']>[\s\S]*?<\/main>/i;
  if (!pattern.test(html)) throw new Error("[profile-flagships] rendered page is missing the expected main container");
  return html.replace(pattern, `<main id="content" class="page wrap">${body}</main>`);
}

let enrichedLocales = 0;
for (const locale of profile.locales || []) {
  if (locale.role !== "human-interface" || locale.code === profile.releaseContract?.referenceImplementation) continue;
  const sourcePath = path.join(root, "data", "localization", locale.code, "flagships.json");
  try { await access(sourcePath); } catch { continue; }
  const localized = JSON.parse(await readFile(sourcePath, "utf8"));
  const labels = labelsByLocale[locale.code];
  if (!labels) throw new Error(`[profile-flagships] no localized rendering labels configured for ${locale.code}`);
  if (localized.locale !== locale.code || localized.source_locale !== profile.sourceLocale) throw new Error(`[profile-flagships] locale/source identity mismatch for ${locale.code}`);
  if (!Array.isArray(localized.entries) || localized.entries.length !== canonical.entries.length) throw new Error(`[profile-flagships] ${locale.code} must cover exactly ${canonical.entries.length} flagship entries`);
  const localizedBySlug = new Map(localized.entries.map((entry) => [entry.slug, entry]));
  if (localizedBySlug.size !== canonicalBySlug.size || [...canonicalBySlug.keys()].some((slug) => !localizedBySlug.has(slug))) throw new Error(`[profile-flagships] ${locale.code} flagship membership drift`);

  for (const [slug, entry] of localizedBySlug) {
    const source = canonicalBySlug.get(slug);
    if (entry.sourceFingerprint !== fingerprint(source)) throw new Error(`[profile-flagships] stale source fingerprint for ${locale.code}/${slug}`);
    if (entry.evidence_status !== source.evidence_status) throw new Error(`[profile-flagships] evidence status drift for ${locale.code}/${slug}`);
    if (entry.reviewed_at !== source.reviewed_at) throw new Error(`[profile-flagships] reviewed_at drift for ${locale.code}/${slug}`);
    for (const field of ["title", "description", "action", "check_in", "boundary", "alternative", "evidence_label"]) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) throw new Error(`[profile-flagships] ${locale.code}/${slug}.${field} is required`);
    }

    const file = path.join(root, locale.code, "life-os", slug, "index.html");
    let html = await readFile(file, "utf8");
    const body = `<p class="eyebrow">${escapeHtml(entry.life_area.title)} · ${escapeHtml(locale.label)}</p><h1>${escapeHtml(entry.title)}</h1><p class="lead">${escapeHtml(entry.description)}</p><div class="grid two"><article class="card"><span class="card-label">${escapeHtml(labels.status)}</span><h3>${escapeHtml(entry.evidence_label)}</h3><p><code>${escapeHtml(entry.evidence_status)}</code> · <time datetime="${escapeHtml(entry.reviewed_at)}">${escapeHtml(entry.reviewed_at)}</time></p></article><article class="card"><span class="card-label">${escapeHtml(labels.quality)}</span><h3>${escapeHtml(entry.life_area.title)}</h3><p>${escapeHtml(entry.life_area.subtitle)}</p></article></div><section class="prose"><h2>${escapeHtml(labels.action)}</h2><p>${escapeHtml(entry.action)}</p><h2>${escapeHtml(labels.check)}</h2><p>${escapeHtml(entry.check_in)}</p><h2>${escapeHtml(labels.boundary)}</h2><p>${escapeHtml(entry.boundary)}</p><h2>${escapeHtml(labels.alternative)}</h2><p>${escapeHtml(entry.alternative)}</p></section><aside class="callout"><a class="button" lang="en" hreflang="en" href="/life-os/${escapeHtml(slug)}/">English source</a> <a class="button quiet" href="/${escapeHtml(locale.code)}/life-os/flagships/">${escapeHtml(locale.label)} Flagships</a></aside>`;
    html = replaceMain(html, body);
    await writeFile(file, html, "utf8");
  }

  const collectionFile = path.join(root, locale.code, "life-os", "flagships", "index.html");
  let collectionHtml = await readFile(collectionFile, "utf8");
  const cards = localized.entries.map((entry) => `<article class="card"><span class="card-label">${escapeHtml(entry.life_area.title)} · ${escapeHtml(entry.evidence_label)}</span><h2><a href="/${escapeHtml(locale.code)}/life-os/${escapeHtml(entry.slug)}/">${escapeHtml(entry.title)}</a></h2><p>${escapeHtml(entry.description)}</p><p><a href="/${escapeHtml(locale.code)}/life-os/${escapeHtml(entry.slug)}/">${escapeHtml(labels.collectionCta)} →</a></p></article>`).join("");
  const collectionBody = `<p class="eyebrow">${escapeHtml(locale.label)} · Flagships</p><h1>${escapeHtml(locale.label)} Flagship-Protokolle</h1><p class="lead">Sieben redaktionell lokalisierte Einstiegspunkte mit Handlung, Check-in und expliziten Grenzen.</p><div class="grid three">${cards}</div>`;
  collectionHtml = replaceMain(collectionHtml, collectionBody);
  await writeFile(collectionFile, collectionHtml, "utf8");

  const libraryPath = path.join(root, locale.code, "library.json");
  const library = JSON.parse(await readFile(libraryPath, "utf8"));
  for (const entry of library.entries || []) {
    const flagship = localizedBySlug.get(entry.slug);
    if (!flagship) continue;
    entry.title = flagship.title;
    entry.description = flagship.description;
    entry.localization_quality = "editorial-reviewed";
  }
  await writeFile(libraryPath, `${JSON.stringify(library, null, 2)}\n`, "utf8");

  const manifestPath = path.join(root, locale.code, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.coverage.flagship_protocols = { state: "editorial-reviewed-exact", localized: canonical.entries.length, canonical: canonical.entries.length };
  for (const route of manifest.routes || []) {
    if (localizedBySlug.has(route.slug)) route.localization_quality = "editorial-reviewed";
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  enrichedLocales += 1;
  console.log(`[profile-flagships] ${locale.code}: exact ${localized.entries.length}/${canonical.entries.length} flagship parity rendered and fingerprint-checked.`);
}

console.log(`[profile-flagships] enriched ${enrichedLocales} supplemental locale(s).`);
