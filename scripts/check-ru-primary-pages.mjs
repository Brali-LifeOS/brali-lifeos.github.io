import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const config = JSON.parse(await readFile(path.join(root, "data", "localization", "ru", "primary-pages.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "ru", "manifest.json"), "utf8"));
const sitemap = await readFile(path.join(root, "ru", "sitemap.xml"), "utf8");

const absolute = (route) => `${base}${route}`;
const humanEnglishPrefixes = ["/research/", "/partners/", "/for-ai/", "/skill-packs/", "/contact/", "/evidence/", "/agents/", "/topics/", "/updates/", "/trends/", "/media/", "/cite/", "/observatory/", "/crawler-matrix/"];

function outputFile(route) {
  const relative = route.replace(/^\/ru\//, "").replace(/\/$/, "");
  return path.join(root, "ru", relative, "index.html");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const page of config.pages) {
  const source = await readFile(path.join(root, page.source_path), "utf8");
  const html = await readFile(outputFile(page.route), "utf8");
  const fragment = await readFile(path.join(root, page.fragment), "utf8");

  for (const marker of page.source_markers || []) {
    assert(source.includes(marker), `Canonical source marker drift for ${page.id}: ${JSON.stringify(marker)}`);
  }

  assert(html.includes('<html lang="ru">'), `Missing lang=ru for ${page.id}`);
  assert(html.includes('data-brali-cluster="localized-ru"'), `Missing generic RU locale cluster marker for ${page.id}`);
  assert(/[А-Яа-яЁё]/.test(html), `No Cyrillic rendered for ${page.id}`);
  assert(html.includes(`<link rel="canonical" href="${absolute(page.route)}">`), `Wrong canonical for ${page.id}`);
  assert(html.includes(`<link rel="alternate" hreflang="ru" href="${absolute(page.route)}">`), `Missing RU hreflang for ${page.id}`);
  assert(html.includes(`<link rel="alternate" hreflang="en" href="${absolute(page.source_route)}">`), `Missing EN hreflang for ${page.id}`);
  assert(html.includes(`<link rel="alternate" hreflang="x-default" href="${absolute(page.source_route)}">`), `Missing x-default for ${page.id}`);
  assert(html.includes('"inLanguage":"ru"'), `Structured data language drift for ${page.id}`);
  assert(html.includes(`lang="en" hreflang="en" href="${page.source_route}"`), `Explicit English language switch missing for ${page.id}`);
  assert(!html.includes("Skip to content"), `English skip-link leak for ${page.id}`);
  assert(!html.includes('aria-label="Main navigation"'), `English navigation aria leak for ${page.id}`);

  assert(source.includes(`hreflang="ru" href="${absolute(page.route)}"`), `Canonical page lacks reciprocal RU hreflang for ${page.id}`);
  assert(source.includes(`lang="ru" hreflang="ru" href="${page.route}">Русский</a>`), `Canonical page lacks explicit RU switch for ${page.id}`);

  const route = (manifest.routes || []).find((candidate) => candidate.path === page.route);
  assert(route, `RU manifest missing ${page.route}`);
  assert(route.kind === "primary-hub", `RU manifest route kind drift for ${page.id}`);
  assert(route.canonical_path === page.source_route, `RU manifest canonical route drift for ${page.id}`);
  assert(route.id === page.id, `RU manifest primary-page identity drift for ${page.id}`);
  assert(sitemap.includes(`<loc>${absolute(page.route)}</loc>`), `RU sitemap missing ${page.route}`);

  for (const match of fragment.matchAll(/<a\s+([^>]*?)href="([^"]+)"([^>]*)>/g)) {
    const attributes = `${match[1]} ${match[3]}`;
    const href = match[2];
    if (href.startsWith("/ru/") || href.endsWith(".json") || href.endsWith(".md") || href.startsWith("/api/")) continue;
    if (!humanEnglishPrefixes.some((prefix) => href.startsWith(prefix))) continue;
    assert(/\blang="en"/.test(attributes), `Silent human fallback in ${page.id}: ${href} must declare lang=en`);
  }
}

const coverage = manifest.coverage?.primary_pages;
assert(coverage?.mode === "exact-declared", "RU primary-page coverage mode drifted");
assert(coverage?.localized === config.pages.length && coverage?.canonical === config.pages.length, "RU primary-page coverage counts drifted");

console.log(`Russian primary product hubs passed: ${config.pages.length}/${config.pages.length}; generic manifest contract.`);
