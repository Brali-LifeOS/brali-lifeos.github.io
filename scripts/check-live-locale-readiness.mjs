const base = (process.env.BRALI_BASE_URL || "https://brali-lifeos.github.io").replace(/\/$/, "");
const buildSha = process.env.GITHUB_SHA || Date.now().toString();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchLive(pathname, { json = false, attempts = 6 } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const separator = pathname.includes("?") ? "&" : "?";
      const response = await fetch(`${base}${pathname}${separator}build=${encodeURIComponent(buildSha)}`, {
        redirect: "follow",
        cache: "no-store",
        headers: { "user-agent": "brali-localization-live-readiness/1" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return json ? await response.json() : await response.text();
    } catch (error) {
      last = error;
      if (attempt < attempts) await delay(3000);
    }
  }
  throw new Error(`Failed to fetch ${pathname}: ${last?.message || last}`);
}

const invariant = (condition, message) => {
  if (!condition) throw new Error(`[live-locale-readiness] ${message}`);
};

const [manifest, machine, sitemap, llms] = await Promise.all([
  fetchLive("/ru/manifest.json", { json: true }),
  fetchLive("/ru/library.json", { json: true }),
  fetchLive("/ru/sitemap.xml"),
  fetchLive("/ru/llms.txt"),
]);

invariant(machine.locale === "ru", "machine library locale drift");
invariant(machine.source_locale === "en" && machine.canonical_locale === "en", "machine library canonical-locale identity drift");
invariant(machine.locale_contract_version === 1, "machine library locale contract version drift");
invariant(machine.fallback_behavior?.human === "explicit-no-silent-fallback", "machine library lacks explicit human fallback semantics");
invariant(machine.fallback_behavior?.machine === "preserve-canonical-id-and-canonical-url", "machine library lacks machine fallback semantics");
invariant(Array.isArray(machine.recommendation_policy?.eligible_statuses), "machine library lacks recommendation policy");
invariant(machine.count === machine.canonical_count, `machine library coverage drift: ${machine.count}/${machine.canonical_count}`);
invariant((machine.entries || []).length === machine.count, "machine library count does not match entries");

const slugs = new Set();
for (const item of machine.entries || []) {
  invariant(item.slug && !slugs.has(item.slug), `duplicate/missing machine stable ID: ${item.slug || "<missing>"}`);
  slugs.add(item.slug);
  invariant(typeof item.recommendation_eligible === "boolean", `missing recommendation eligibility: ${item.slug}`);
  invariant(item.fallback_to_canonical_required === false, `fully localized record unexpectedly requires canonical-language fallback: ${item.slug}`);
  const expectedEligible = ["reviewed", "practical"].includes(item.evidence_status) && !Boolean(item.sensitive);
  invariant(item.recommendation_eligible === expectedEligible, `live recommendation eligibility drift: ${item.slug}`);
  invariant(item.canonical_url && item.localized_url, `machine record lacks canonical/localized URL: ${item.slug}`);
}

invariant(slugs.has("batch-non-urgent-notifications"), "known build-time content addition missing from deployed Russian machine corpus");
invariant(slugs.has("post-meal-walk"), "evidence-sensitive build-time content addition missing from deployed Russian machine corpus");

const routes = manifest.routes || [];
const routeUrls = new Set(routes.map((route) => route.url));
invariant(routeUrls.size === routes.length, "deployed manifest contains duplicate route URLs");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapSet = new Set(sitemapUrls);
invariant(sitemapSet.size === sitemapUrls.length, "deployed Russian sitemap contains duplicate URLs");
invariant(routeUrls.size === sitemapSet.size, `deployed manifest/sitemap route-count mismatch: ${routeUrls.size}/${sitemapSet.size}`);
for (const url of routeUrls) invariant(sitemapSet.has(url), `deployed Russian sitemap missing manifest URL: ${url}`);
for (const url of sitemapSet) invariant(routeUrls.has(url), `deployed Russian sitemap contains undeclared URL: ${url}`);

invariant(llms.includes("Locale: ru"), "deployed llms.txt locale declaration missing");
invariant(llms.includes("Canonical locale: en"), "deployed llms.txt canonical locale declaration missing");
invariant(llms.includes("No silent fallback: true"), "deployed llms.txt fallback declaration missing");

console.log(`Live mature locale readiness passed: ${machine.count}/${machine.canonical_count} machine records; ${routes.length} manifest routes; exact manifest/sitemap parity; build-time additions present.`);
