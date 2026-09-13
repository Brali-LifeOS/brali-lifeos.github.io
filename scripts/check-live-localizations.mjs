import { readFile } from "node:fs/promises";

const base = (process.env.BRALI_LIVE_BASE_URL || "https://brali-lifeos.github.io").replace(/\/$/, "");
const expectedSha = process.env.GITHUB_SHA || "unknown";
const canonical = JSON.parse(await readFile("life-os/datasets/flagships.json", "utf8"));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(pathname, { attempts = 6 } = {}) {
  const url = `${base}${pathname}${pathname.includes("?") ? "&" : "?"}verify=${encodeURIComponent(expectedSha)}`;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
          "user-agent": "Brali-Live-Localization-Check/1.0",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return { text: await response.text(), headers: response.headers, url: response.url };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(2500 * attempt);
    }
  }
  throw new Error(`Could not fetch ${pathname}: ${lastError?.message || "unknown error"}`);
}

const assert = (condition, message) => {
  if (!condition) throw new Error(`[live-localization] ${message}`);
};

const { text: manifestText } = await fetchText("/ru/manifest.json");
const manifest = JSON.parse(manifestText);
assert(manifest.locale === "ru", "live manifest locale must be ru");
assert(manifest.source_locale === "en", "live manifest source locale must be en");
assert(manifest.role === "human-interface", "live Russian role must be human-interface");
assert(manifest.status === "reviewed-partial", "live Russian status must remain reviewed-partial");
assert(manifest.no_silent_fallback === true, "live manifest must forbid silent fallback");
assert(manifest.search_publication === "limited", "partial Russian release must keep limited search publication");
assert(manifest.coverage?.flagship_protocols?.localized === canonical.entries.length, "live manifest flagship localized count drift");
assert(manifest.coverage?.flagship_protocols?.canonical === canonical.entries.length, "live manifest flagship canonical count drift");

const expectedPaths = [
  "/ru/",
  "/ru/life-os/flagships/",
  "/ru/life-os/methodology/",
  ...canonical.entries.map((entry) => `/ru/life-os/${entry.slug}/`),
];
const manifestPaths = manifest.routes.map((route) => route.path).sort();
assert(JSON.stringify(manifestPaths) === JSON.stringify([...expectedPaths].sort()), "live manifest route membership drift");

const routeByPath = new Map(manifest.routes.map((route) => [route.path, route]));
for (const pathname of expectedPaths) {
  const route = routeByPath.get(pathname);
  assert(route, `live manifest missing route ${pathname}`);
  const { text: html } = await fetchText(pathname);
  assert(/<html lang="ru">/i.test(html), `${pathname} must publish html lang=ru`);
  assert(html.includes(`<link rel="canonical" href="${route.url}">`), `${pathname} must publish its self canonical`);
  assert(html.includes(`hreflang="ru" href="${route.url}"`), `${pathname} must publish ru hreflang`);
  assert(html.includes(`hreflang="en" href="${route.canonical_url}"`), `${pathname} must publish en hreflang`);
  assert(html.includes(`hreflang="x-default" href="${route.canonical_url}"`), `${pathname} must publish x-default`);
  assert(html.includes('"inLanguage":"ru"'), `${pathname} structured data must publish inLanguage=ru`);
  assert(!html.includes(">Skip to content<"), `${pathname} leaked English skip-link UI`);
  assert(!html.includes(">Explore<") && !html.includes(">Evidence<"), `${pathname} leaked English primary navigation UI`);

  const { text: canonicalHtml } = await fetchText(route.canonical_path);
  assert(canonicalHtml.includes(`hreflang="ru" href="${route.url}"`), `${route.canonical_path} must reciprocate Russian hreflang`);
  assert(canonicalHtml.includes(`lang="ru" hreflang="ru" href="${route.path}">Русский</a>`), `${route.canonical_path} must expose the Russian locale switch`);
}

const { text: sitemap } = await fetchText("/ru/sitemap.xml");
for (const pathname of expectedPaths) {
  const route = routeByPath.get(pathname);
  assert(sitemap.includes(`<loc>${route.url}</loc>`), `live Russian sitemap missing ${pathname}`);
}

const { text: llms } = await fetchText("/ru/llms.txt");
for (const token of [
  "Locale: ru",
  "Role: human-interface",
  "Status: reviewed-partial",
  "Canonical locale: en",
  "No silent fallback: true",
  "Остальная библиотека НЕ считается локализованной",
]) {
  assert(llms.includes(token), `live Russian llms.txt missing token: ${token}`);
}

const { text: robots } = await fetchText("/robots.txt");
assert(robots.includes(`Sitemap: ${base}/ru/sitemap.xml`), "live robots.txt must advertise the Russian sitemap");

console.log(`Live Russian localization passed: ${expectedPaths.length} human routes + reciprocal EN links + manifest/sitemap/llms/robots.`);
