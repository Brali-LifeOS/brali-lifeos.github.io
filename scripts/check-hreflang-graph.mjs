import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const sourceLocale = profile.sourceLocale;
const source = (profile.locales || []).find((entry) => entry.code === sourceLocale);
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && ["reviewed-partial", "published"].includes(entry.status));
const groups = new Map();

for (const locale of locales) {
  const manifest = JSON.parse(await readFile(path.join(root, locale.code, "manifest.json"), "utf8"));
  for (const route of manifest.routes || []) {
    if (!groups.has(route.canonical_path)) groups.set(route.canonical_path, { sourceUrl: route.canonical_url, localized: new Map() });
    groups.get(route.canonical_path).localized.set(locale.code, { locale, route });
  }
}

function fileFor(routePath) {
  if (routePath === "/") return path.join(root, "index.html");
  return path.join(root, routePath.replace(/^\//, ""), "index.html");
}

function alternateMap(html) {
  const map = new Map();
  const regex = /<link\s+[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(regex)) {
    if (map.has(match[1])) throw new Error(`[hreflang] duplicate ${match[1]} alternate`);
    map.set(match[1], match[2]);
  }
  return map;
}

let checked = 0;
for (const [canonicalPath, group] of groups) {
  const expected = new Map([[source.languageTag, group.sourceUrl], ["x-default", group.sourceUrl]]);
  for (const { locale, route } of group.localized.values()) expected.set(locale.languageTag, route.url);
  const targets = [{ code: sourceLocale, path: canonicalPath, selfTag: source.languageTag, selfUrl: group.sourceUrl }];
  for (const { locale, route } of group.localized.values()) targets.push({ code: locale.code, path: route.path, selfTag: locale.languageTag, selfUrl: route.url });

  for (const target of targets) {
    const html = await readFile(fileFor(target.path), "utf8");
    const alternates = alternateMap(html);
    for (const [tag, url] of expected) {
      if (alternates.get(tag) !== url) throw new Error(`[hreflang] ${target.path} expected ${tag}=${url}; got ${alternates.get(tag) || "missing"}`);
    }
    if (alternates.get(target.selfTag) !== target.selfUrl) throw new Error(`[hreflang] ${target.path} is missing self hreflang ${target.selfTag}`);
    const unexpected = [...alternates.keys()].filter((tag) => !expected.has(tag));
    if (unexpected.length) throw new Error(`[hreflang] ${target.path} has unexpected alternates: ${unexpected.join(", ")}`);
    checked += 1;
  }
}

console.log(`[hreflang] complete reciprocal graph passed for ${checked} rendered pages across ${groups.size} canonical route groups.`);
