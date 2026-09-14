const text = (value) => String(value ?? "");

export function invariant(condition, message) {
  if (!condition) throw new Error(`[locale-quality] ${message}`);
}

export function validateExactCoverage(canonicalSlugs, localizedRecords) {
  const canonical = new Set(canonicalSlugs);
  invariant(canonical.size === canonicalSlugs.length, "canonical corpus contains duplicate stable IDs");
  const seen = new Set();
  for (const record of localizedRecords) {
    invariant(record?.slug, "localized record is missing stable ID");
    invariant(!seen.has(record.slug), `duplicate localized stable ID: ${record.slug}`);
    invariant(canonical.has(record.slug), `localized phantom/obsolete stable ID: ${record.slug}`);
    seen.add(record.slug);
  }
  const missing = canonicalSlugs.filter((slug) => !seen.has(slug));
  invariant(missing.length === 0, `missing localized stable IDs: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " …" : ""}`);
  invariant(seen.size === canonical.size, `localized/canonical count mismatch: ${seen.size}/${canonical.size}`);
  return true;
}

export function validateSourceSnapshots(canonicalBySlug, localizedRecords, snapshot) {
  for (const record of localizedRecords) {
    const canonical = canonicalBySlug.get(record.slug);
    invariant(canonical, `source snapshot points to noncanonical stable ID: ${record.slug}`);
    const expected = snapshot(canonical);
    invariant(JSON.stringify(record.source) === JSON.stringify(expected), `stale source snapshot: ${record.slug}`);
  }
  return true;
}

export function validateLanguageRecords(records, profile) {
  invariant(profile?.locale, "language profile must declare locale");
  const fields = profile.required_fields || ["title", "subtitle", "description"];
  const exceptions = new Map((profile.exceptions || []).map((entry) => [entry.slug, new Set(entry.fragments || [])]));
  const titleOwners = new Map();

  for (const record of records) {
    const exceptionSet = exceptions.get(record.slug) || new Set();
    for (const field of fields) {
      const value = text(record[field]).normalize("NFC");
      invariant(value.trim().length > 0, `${record.slug}.${field} is empty`);
      if (profile.locale === "ru") invariant(/[А-Яа-яЁё]/.test(value), `${record.slug}.${field} lacks Russian copy`);
      for (const fragment of profile.discouraged_fragments || []) {
        if (exceptionSet.has(fragment)) continue;
        invariant(!value.toLocaleLowerCase(profile.locale).includes(fragment.toLocaleLowerCase(profile.locale)), `${record.slug}.${field} contains discouraged fragment ${JSON.stringify(fragment)}`);
      }
    }
    const key = text(record.title).normalize("NFC").toLocaleLowerCase(profile.locale).replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
    invariant(key.length > 0, `${record.slug}.title has no searchable text`);
    const previous = titleOwners.get(key);
    invariant(!previous, `localized title collision: ${previous} and ${record.slug}`);
    titleOwners.set(key, record.slug);
  }
  return true;
}

export function validateMachineEvidence(expectedEvidenceBySlug, machineEntries, { requireEligibility = false } = {}) {
  const seen = new Set();
  for (const item of machineEntries) {
    invariant(item?.slug && !seen.has(item.slug), `machine library duplicate/missing stable ID: ${item?.slug || "<missing>"}`);
    seen.add(item.slug);
    const expected = expectedEvidenceBySlug.get(item.slug);
    invariant(expected, `machine library phantom stable ID: ${item.slug}`);
    invariant(item.evidence_status === expected.status, `machine evidence status drift: ${item.slug}`);
    invariant(Boolean(item.sensitive) === Boolean(expected.sensitive), `machine sensitive flag drift: ${item.slug}`);
    if (requireEligibility) {
      const allowed = ["reviewed", "practical"].includes(expected.status) && !Boolean(expected.sensitive);
      invariant(item.recommendation_eligible === allowed, `machine recommendation eligibility drift: ${item.slug}`);
      invariant(item.fallback_to_canonical_required === false, `fully localized machine record must not require canonical-language fallback: ${item.slug}`);
    }
  }
  return true;
}

export function validateRouteGraph(routes, sitemapUrls, base = "https://brali-lifeos.github.io") {
  const paths = new Set();
  const urls = new Set();
  for (const route of routes) {
    invariant(route?.path?.startsWith("/"), `manifest route has invalid path: ${route?.path}`);
    invariant(!paths.has(route.path), `duplicate manifest path: ${route.path}`);
    invariant(!urls.has(route.url), `duplicate manifest URL: ${route.url}`);
    invariant(route.url === `${base}${route.path}`, `manifest URL/path mismatch: ${route.path}`);
    paths.add(route.path);
    urls.add(route.url);
  }
  const sitemap = new Set(sitemapUrls);
  invariant(sitemap.size === sitemapUrls.length, "localized sitemap contains duplicate URLs");
  for (const url of urls) invariant(sitemap.has(url), `localized sitemap missing manifest URL: ${url}`);
  for (const url of sitemap) invariant(urls.has(url), `localized sitemap contains undeclared URL: ${url}`);
  return true;
}

export function validateLocalizedHtml(html, route, base = "https://brali-lifeos.github.io") {
  const self = `${base}${route.path}`;
  const canonical = route.canonical_url || `${base}${route.canonical_path}`;
  invariant(html.includes('<html lang="ru">'), `${route.path} missing html lang=ru`);
  invariant(html.includes(`<link rel="canonical" href="${self}">`), `${route.path} has wrong self canonical`);
  invariant(html.includes(`<link rel="alternate" hreflang="ru" href="${self}">`), `${route.path} missing self hreflang`);
  invariant(html.includes(`<link rel="alternate" hreflang="en" href="${canonical}">`), `${route.path} missing canonical-locale hreflang`);
  invariant(html.includes(`<link rel="alternate" hreflang="x-default" href="${canonical}">`), `${route.path} missing x-default`);
  invariant(html.includes('"inLanguage":"ru"'), `${route.path} missing structured-data language`);
  return true;
}
