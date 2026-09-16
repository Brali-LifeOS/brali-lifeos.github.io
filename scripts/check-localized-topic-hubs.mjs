import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const canonical = JSON.parse(await readFile(path.join(root, "data", "topic-hubs.json"), "utf8"));
const canonicalDataset = JSON.parse(await readFile(path.join(root, "life-os", "datasets", "topic-hubs.json"), "utf8"));
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && ["reviewed-partial", "published"].includes(entry.status));

const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const exactKeys = (values) => [...values].sort().join("\n");
const sourceShape = (hub) => ({
  title: hub.title,
  question: hub.question,
  summary: hub.summary,
  primary_topic_ids: hub.primary_topic_ids || [],
  related_topic_ids: hub.related_topic_ids || [],
});
const fail = (message) => { throw new Error(`[localized-topic-hubs] ${message}`); };

const canonicalBySlug = new Map((canonical.hubs || []).map((hub) => [hub.slug, hub]));
const generatedBySlug = new Map((canonicalDataset.hubs || []).map((hub) => [hub.slug, hub]));
if (canonicalBySlug.size !== 7 || generatedBySlug.size !== canonicalBySlug.size) fail("canonical topic hub membership drift");

for (const localeEntry of locales) {
  const locale = localeEntry.code;
  const source = await readJson(`data/localization/${locale}/topic-hubs.json`);
  const manifest = await readJson(`${locale}/manifest.json`);
  if (source.locale !== locale || source.source_locale !== profile.sourceLocale || source.source_dataset !== "data/topic-hubs.json") {
    fail(`${locale}: invalid localization source metadata`);
  }
  if (source.quality_state !== "editorial-reviewed") fail(`${locale}: topic source must be editorial-reviewed`);
  const localizedBySlug = new Map((source.hubs || []).map((hub) => [hub.slug, hub]));
  if (localizedBySlug.size !== (source.hubs || []).length) fail(`${locale}: duplicate topic slug`);
  if (exactKeys(localizedBySlug.keys()) !== exactKeys(canonicalBySlug.keys())) fail(`${locale}: topic membership is not exact`);

  for (const [slug, localized] of localizedBySlug) {
    const canonicalHub = canonicalBySlug.get(slug);
    if (JSON.stringify(localized.source) !== JSON.stringify(sourceShape(canonicalHub))) fail(`${locale}/${slug}: stale source snapshot`);
    for (const field of ["title", "question", "summary"]) if (!String(localized[field] || "").trim()) fail(`${locale}/${slug}: missing ${field}`);
  }

  const expectedPaths = [`/${locale}/topics/`, ...[...canonicalBySlug.keys()].map((slug) => `/${locale}/topics/${slug}/`)];
  const routeMap = new Map((manifest.routes || []).map((route) => [route.path, route]));
  for (const localizedPath of expectedPaths) {
    const route = routeMap.get(localizedPath);
    if (!route) fail(`${locale}: manifest missing ${localizedPath}`);
    if (route.quality_state !== "editorial-reviewed") fail(`${locale}: ${localizedPath} quality state drift`);
    const relative = localizedPath.replace(/^\//, "").replace(/\/$/, "");
    await access(path.join(root, relative, "index.html"));
  }

  const coverage = manifest.coverage?.topic_hubs;
  if (coverage?.localized !== canonicalBySlug.size || coverage?.canonical !== canonicalBySlug.size || coverage?.mode !== "exact-declared") {
    fail(`${locale}: topic hub manifest coverage drift`);
  }

  const indexHtml = await readFile(path.join(root, locale, "topics", "index.html"), "utf8");
  if (!indexHtml.includes(`<html lang="${localeEntry.languageTag}"`)) fail(`${locale}: topic index html lang drift`);
  for (const slug of canonicalBySlug.keys()) {
    if (!indexHtml.includes(`/${locale}/topics/${slug}/`)) fail(`${locale}: topic index missing ${slug}`);
    const html = await readFile(path.join(root, locale, "topics", slug, "index.html"), "utf8");
    const localized = localizedBySlug.get(slug);
    const canonicalHub = canonicalBySlug.get(slug);
    const generated = generatedBySlug.get(slug);
    if (!html.includes(`<link rel="canonical" href="https://brali-lifeos.github.io/${locale}/topics/${slug}/">`)) fail(`${locale}/${slug}: self-canonical missing`);
    if (!html.includes(`>${localized.title}<`) || !html.includes(localized.question)) fail(`${locale}/${slug}: reviewed localized copy missing`);
    if (canonicalHub.question !== localized.question && html.includes(canonicalHub.question)) fail(`${locale}/${slug}: canonical English question leaked into localized page`);
    if (canonicalHub.summary !== localized.summary && html.includes(canonicalHub.summary)) fail(`${locale}/${slug}: canonical English summary leaked into localized page`);
    for (const protocol of generated.protocols || []) {
      if (!html.includes(`/${locale}/life-os/${protocol.slug}/`)) fail(`${locale}/${slug}: protocol link is not localized for ${protocol.slug}`);
    }
    const machine = await readJson(`${locale}/topics/${slug}/index.json`);
    if (machine.locale !== locale || machine.slug !== slug || machine.quality_state !== "editorial-reviewed") fail(`${locale}/${slug}: localized machine view drift`);
  }
}

console.log(`Localized topic hubs verified for ${locales.map((locale) => locale.code).join(", ")}: exact 7/7 membership per locale, editorial-reviewed source snapshots, localized protocol links and generated route parity.`);
