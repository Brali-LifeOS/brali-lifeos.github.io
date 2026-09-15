import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const sourceLocale = profile.sourceLocale;
const source = (profile.locales || []).find((entry) => entry.code === sourceLocale);
const releaseLocales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && ["reviewed-partial", "published"].includes(entry.status));

const groups = new Map();
for (const locale of releaseLocales) {
  const manifestPath = path.join(root, locale.code, "manifest.json");
  try { await access(manifestPath); } catch { throw new Error(`[hreflang] missing manifest for release locale ${locale.code}`); }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const route of manifest.routes || []) {
    if (!groups.has(route.canonical_path)) groups.set(route.canonical_path, { sourceUrl: route.canonical_url, locales: new Map() });
    const group = groups.get(route.canonical_path);
    if (group.sourceUrl !== route.canonical_url) throw new Error(`[hreflang] canonical URL drift for ${route.canonical_path}`);
    group.locales.set(locale.code, { locale, path: route.path, url: route.url });
  }
}

function htmlFileFor(routePath) {
  if (routePath === "/") return path.join(root, "index.html");
  return path.join(root, routePath.replace(/^\//, ""), "index.html");
}

function stripLanguageAlternates(html) {
  return html
    .replace(/<!--\s*brali-localization:[\s\S]*?-->/gi, "")
    .replace(/<link\s+[^>]*rel=["']alternate["'][^>]*hreflang=["'][^"']+["'][^>]*>\s*/gi, "")
    .replace(/<link\s+[^>]*hreflang=["'][^"']+["'][^>]*rel=["']alternate["'][^>]*>\s*/gi, "");
}

function alternateMarkup(group) {
  const items = [{ code: sourceLocale, tag: source.languageTag, url: group.sourceUrl }];
  for (const locale of releaseLocales) {
    const route = group.locales.get(locale.code);
    if (route) items.push({ code: locale.code, tag: locale.languageTag, url: route.url });
  }
  const deduped = [...new Map(items.map((item) => [item.tag, item])).values()];
  return `${deduped.map((item) => `<link rel="alternate" hreflang="${item.tag}" href="${item.url}">`).join("")}<link rel="alternate" hreflang="x-default" href="${group.sourceUrl}">`;
}

function injectAlternates(html, markup) {
  const cleaned = stripLanguageAlternates(html);
  const canonical = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  if (!canonical.test(cleaned)) throw new Error("[hreflang] page has no canonical link");
  return cleaned.replace(canonical, (match) => `${match}${markup}`);
}

function updateVisibleSwitcher(html, { currentCode, group }) {
  const alternatives = [];
  if (currentCode !== sourceLocale) alternatives.push({ code: sourceLocale, tag: source.languageTag, label: source.label, href: new URL(group.sourceUrl).pathname });
  for (const locale of releaseLocales) {
    if (locale.code === currentCode) continue;
    const route = group.locales.get(locale.code);
    if (route) alternatives.push({ code: locale.code, tag: locale.languageTag, label: locale.label, href: route.path });
  }
  const markup = alternatives.map((item) => `<a lang="${item.tag}" hreflang="${item.tag}" href="${item.href}">${item.label}</a>`).join("");
  if (!markup) return html;
  return html.replace(/(<header\s+class=["']site-header["'][\s\S]*?<div\s+class=["']links["']>)([\s\S]*?)(<\/div><\/nav><\/header>)/i, (_, open, links, close) => {
    const withoutMarkers = links
      .replace(/<!--\s*brali-localization-switch:[\s\S]*?-->/gi, "")
      .replace(/<a\s+[^>]*lang=["'](?:en|ru|de)["'][^>]*hreflang=["'](?:en|ru|de)["'][^>]*>[\s\S]*?<\/a>/gi, "");
    return `${open}${withoutMarkers}${markup}${close}`;
  });
}

let pages = 0;
for (const [canonicalPath, group] of groups) {
  const targets = [{ code: sourceLocale, path: canonicalPath }];
  for (const [code, route] of group.locales) targets.push({ code, path: route.path });
  const markup = alternateMarkup(group);
  for (const target of targets) {
    const file = htmlFileFor(target.path);
    try { await access(file); } catch { throw new Error(`[hreflang] missing rendered page ${target.path}`); }
    let html = await readFile(file, "utf8");
    html = injectAlternates(html, markup);
    html = updateVisibleSwitcher(html, { currentCode: target.code, group });
    await writeFile(file, html, "utf8");
    pages += 1;
  }
}

console.log(`[hreflang] normalized ${pages} rendered pages across ${groups.size} canonical route groups and ${releaseLocales.length + 1} declared languages.`);
