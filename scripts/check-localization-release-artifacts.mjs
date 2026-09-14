import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const releaseLocales = (profile.locales || []).filter((locale) =>
  locale.role === "human-interface" && ["reviewed-partial", "published"].includes(locale.status),
);
if (!releaseLocales.length) throw new Error("[localization-artifacts] no release-state human-interface locales declared");

function assert(condition, message) {
  if (!condition) throw new Error(`[localization-artifacts] ${message}`);
}

for (const locale of releaseLocales) {
  const prefix = locale.routePrefix.replace(/^\//, "").replace(/\/$/, "");
  const localeRoot = path.join(root, prefix);
  for (const relative of ["manifest.json", "library.json", "sitemap.xml", "llms.txt", "index.html"]) {
    await access(path.join(localeRoot, relative));
  }

  const manifest = JSON.parse(await readFile(path.join(localeRoot, "manifest.json"), "utf8"));
  const library = JSON.parse(await readFile(path.join(localeRoot, "library.json"), "utf8"));
  const sitemap = await readFile(path.join(localeRoot, "sitemap.xml"), "utf8");
  const llms = await readFile(path.join(localeRoot, "llms.txt"), "utf8");
  const home = await readFile(path.join(localeRoot, "index.html"), "utf8");

  assert(manifest.locale === locale.code, `${locale.code}: manifest locale drift`);
  assert(manifest.source_locale === profile.sourceLocale, `${locale.code}: manifest source locale drift`);
  assert(manifest.role === "human-interface", `${locale.code}: manifest role drift`);
  assert(manifest.status === locale.status, `${locale.code}: manifest status ${manifest.status} != registry ${locale.status}`);
  assert(manifest.search_publication === locale.searchPublication, `${locale.code}: manifest search publication ${manifest.search_publication} != registry ${locale.searchPublication}`);
  assert(manifest.no_silent_fallback === true, `${locale.code}: manifest must forbid silent fallback`);
  assert(Array.isArray(manifest.routes) && manifest.routes.length > 0, `${locale.code}: manifest has no routes`);
  assert(library.locale === locale.code && library.source_locale === profile.sourceLocale, `${locale.code}: library identity drift`);
  assert(Array.isArray(library.entries) && library.entries.length === library.count, `${locale.code}: library count drift`);
  if (locale.status === "published" && profile.releaseContract?.coverage === "exact-for-published-human-interface") {
    assert(library.coverage_mode === "exact", `${locale.code}: published locale must declare exact library coverage`);
    assert(library.count === library.canonical_count, `${locale.code}: published locale library is not exact`);
  }

  assert(new RegExp(`<html[^>]+lang=["']${locale.languageTag}["']`, "i").test(home), `${locale.code}: homepage html lang drift`);
  for (const route of manifest.routes) {
    assert(route.path.startsWith(locale.routePrefix), `${locale.code}: route escaped prefix: ${route.path}`);
    assert(sitemap.includes(`<loc>${route.url}</loc>`), `${locale.code}: sitemap missing ${route.path}`);
  }
  for (const token of [`Locale: ${locale.code}`, `Canonical locale: ${profile.sourceLocale}`, "No silent fallback: true"]) {
    assert(llms.includes(token), `${locale.code}: llms.txt missing ${token}`);
  }

  console.log(`[localization-artifacts] ${locale.code}: ${manifest.routes.length} routes; ${library.count}/${library.canonical_count} library; status=${locale.status}; search=${locale.searchPublication}`);
}

console.log(`[localization-artifacts] passed for ${releaseLocales.map((locale) => locale.code).join(", ")}`);
