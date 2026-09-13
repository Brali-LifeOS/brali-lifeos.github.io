const base = (process.env.BRALI_LIVE_BASE_URL || "https://brali-lifeos.github.io").replace(/\/$/, "");
const expectedSha = process.env.GITHUB_SHA || "unknown";
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
          "user-agent": "Brali-Live-Localization-Check/2.1",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return { text: await response.text(), headers: response.headers, url: response.url };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(1500 * attempt);
    }
  }
  throw new Error(`Could not fetch ${pathname}: ${lastError?.message || "unknown error"}`);
}

const assert = (condition, message) => {
  if (!condition) throw new Error(`[live-localization] ${message}`);
};

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const failures = [];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await worker(items[index], index);
      } catch (error) {
        failures.push(error);
      }
    }
  });
  await Promise.all(runners);
  if (failures.length) {
    const first = failures[0];
    throw new Error(`${first.message}${failures.length > 1 ? ` (+${failures.length - 1} more live localization failure(s))` : ""}`);
  }
}

const { text: manifestText } = await fetchText("/ru/manifest.json");
const manifest = JSON.parse(manifestText);
assert(manifest.locale === "ru", "live manifest locale must be ru");
assert(manifest.source_locale === "en", "live manifest source locale must be en");
assert(manifest.role === "human-interface", "live Russian role must be human-interface");
assert(["reviewed-partial", "published"].includes(manifest.status), "live Russian status must be a declared human-interface release state");
assert(manifest.no_silent_fallback === true, "live manifest must forbid silent fallback");
assert(["limited", "full"].includes(manifest.search_publication), "live Russian search publication state is invalid");
assert(Array.isArray(manifest.routes) && manifest.routes.length >= 13, "live manifest must declare localized human routes including primary product hubs");

const routePaths = manifest.routes.map((route) => route.path);
assert(new Set(routePaths).size === routePaths.length, "live manifest contains duplicate Russian routes");
const routeByPath = new Map(manifest.routes.map((route) => [route.path, route]));
const requiredRoutes = [
  "/ru/",
  "/ru/life-os/",
  "/ru/life-os/flagships/",
  "/ru/life-os/methodology/",
  "/ru/research/",
  "/ru/partners/",
  "/ru/for-ai/",
];
for (const required of requiredRoutes) {
  assert(routeByPath.has(required), `live manifest missing required route ${required}`);
}

const primaryHubCoverage = manifest.coverage?.primary_product_hubs;
assert(primaryHubCoverage?.state === "language-reviewed", "live primary product hubs must remain language-reviewed");
assert(primaryHubCoverage?.localized === 3 && primaryHubCoverage?.canonical === 3, "live primary product hub coverage must be 3/3");

const { text: libraryText } = await fetchText("/ru/library.json");
const library = JSON.parse(libraryText);
assert(library.locale === "ru" && library.source_locale === "en", "live Russian library identity drift");
assert(library.count === manifest.coverage?.library_entries?.localized, "live library count must match manifest coverage");
assert(library.canonical_count === manifest.coverage?.library_entries?.canonical, "live canonical library count must match manifest coverage");
assert(library.coverage_mode === manifest.coverage?.library_entries?.mode, "live library coverage mode must match manifest");
assert(Array.isArray(library.entries) && library.entries.length === library.count, "live Russian library entries/count drift");
for (const entry of library.entries) {
  assert(["reviewed", "practical", "pending-review", "restricted"].includes(entry.evidence_status), `invalid live evidence state for ${entry.slug}`);
  assert(["localized-draft", "language-reviewed", "editorial-reviewed"].includes(entry.localization_quality), `invalid live localization quality for ${entry.slug}`);
}

const primaryMarkers = new Map([
  ["/ru/research/", "Полезные исследования"],
  ["/ru/partners/", "Выберите формат сотрудничества"],
  ["/ru/for-ai/", "Используйте практические знания"],
]);
const primaryNavRoutes = ["/ru/life-os/", "/ru/life-os/methodology/", "/ru/research/", "/ru/partners/", "/ru/for-ai/"];

await mapLimit(manifest.routes, 16, async (route) => {
  const { text: html } = await fetchText(route.path, { attempts: 4 });
  assert(/<html lang="ru">/i.test(html), `${route.path} must publish html lang=ru`);
  assert(html.includes(`<link rel="canonical" href="${route.url}">`), `${route.path} must publish its self canonical`);
  assert(html.includes(`hreflang="ru" href="${route.url}"`), `${route.path} must publish ru hreflang`);
  assert(html.includes(`hreflang="en" href="${route.canonical_url}"`), `${route.path} must publish en hreflang`);
  assert(html.includes(`hreflang="x-default" href="${route.canonical_url}"`), `${route.path} must publish x-default`);
  assert(html.includes('"inLanguage":"ru"'), `${route.path} structured data must publish inLanguage=ru`);
  assert(!html.includes(">Skip to content<"), `${route.path} leaked English skip-link UI`);
  assert(!html.includes(">Explore<") && !html.includes(">Evidence<"), `${route.path} leaked English primary navigation UI`);
  for (const navRoute of primaryNavRoutes) {
    assert(html.includes(`href="${navRoute}"`), `${route.path} missing Russian primary navigation route ${navRoute}`);
  }
  const marker = primaryMarkers.get(route.path);
  if (marker) {
    assert(html.includes(marker), `${route.path} missing native Russian primary-hub marker ${JSON.stringify(marker)}`);
    assert(route.localization_quality === "language-reviewed", `${route.path} must declare language-reviewed localization quality`);
  }

  const { text: canonicalHtml } = await fetchText(route.canonical_path, { attempts: 4 });
  assert(canonicalHtml.includes(`hreflang="ru" href="${route.url}"`), `${route.canonical_path} must reciprocate Russian hreflang`);
  assert(canonicalHtml.includes(`lang="ru" hreflang="ru" href="${route.path}">Русский</a>`), `${route.canonical_path} must expose the Russian locale switch`);
});

const { text: sitemap } = await fetchText("/ru/sitemap.xml");
for (const route of manifest.routes) {
  assert(sitemap.includes(`<loc>${route.url}</loc>`), `live Russian sitemap missing ${route.path}`);
}

const { text: llms } = await fetchText("/ru/llms.txt");
for (const token of [
  "Locale: ru",
  "Canonical locale: en",
  "No silent fallback: true",
  `${base}/ru/library.json`,
  "## Основные русские хабы",
  `${base}/ru/research/`,
  `${base}/ru/partners/`,
  `${base}/ru/for-ai/`,
]) {
  assert(llms.includes(token), `live Russian llms.txt missing token: ${token}`);
}
if (library.coverage_mode === "exact") {
  assert(library.count === library.canonical_count, "exact live Russian coverage must match the canonical corpus");
  assert(llms.includes(`покрывает все ${library.canonical_count}`), "exact live llms.txt must declare full corpus coverage");
}

const { text: robots } = await fetchText("/robots.txt");
assert(robots.includes(`Sitemap: ${base}/ru/sitemap.xml`), "live robots.txt must advertise the Russian sitemap");

console.log(`Live Russian localization passed: ${manifest.routes.length} human routes; ${library.count}/${library.canonical_count} library entries; 3/3 primary hubs; mode=${library.coverage_mode}.`);
