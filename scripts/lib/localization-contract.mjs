const LOCALE_CODE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const RELEASE_STATES = new Set(["draft", "reviewed-partial", "published"]);
const ROLES = new Set(["canonical", "human-interface"]);
const DIRECTIONS = new Set(["ltr", "rtl"]);

function fail(message) {
  throw new Error(`[localization-contract] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

export function validateLocalizationProfile(profile) {
  assert(profile && typeof profile === "object", "profile must be an object");
  assert(typeof profile.sourceLocale === "string", "sourceLocale is required");
  assert(typeof profile.defaultLocale === "string", "defaultLocale is required");
  assert(Array.isArray(profile.locales) && profile.locales.length > 0, "locales[] is required");

  const seenCodes = new Set();
  const seenRoots = new Set();
  const byCode = new Map();

  for (const locale of profile.locales) {
    assert(LOCALE_CODE.test(locale.code || ""), `invalid locale code: ${locale.code}`);
    assert(!seenCodes.has(locale.code), `duplicate locale code: ${locale.code}`);
    seenCodes.add(locale.code);
    byCode.set(locale.code, locale);

    assert(typeof locale.label === "string" && locale.label.trim(), `${locale.code}.label is required`);
    assert(ROLES.has(locale.role), `${locale.code}.role is invalid: ${locale.role}`);
    assert(RELEASE_STATES.has(locale.status), `${locale.code}.status is invalid: ${locale.status}`);
    assert(LANGUAGE_TAG.test(locale.languageTag || ""), `${locale.code}.languageTag is required and must be BCP-47-like`);
    assert(DIRECTIONS.has(locale.direction), `${locale.code}.direction must be ltr or rtl`);
    assert(typeof locale.routePrefix === "string" && locale.routePrefix.startsWith("/") && locale.routePrefix.endsWith("/"), `${locale.code}.routePrefix must be an absolute slash-delimited prefix`);
    assert(!seenRoots.has(locale.routePrefix), `duplicate locale routePrefix: ${locale.routePrefix}`);
    seenRoots.add(locale.routePrefix);

    if (locale.role === "human-interface") {
      assert(locale.code !== profile.sourceLocale, `${locale.code} cannot be both sourceLocale and human-interface locale`);
      assert(typeof locale.datasetRoot === "string" && locale.datasetRoot === `data/localization/${locale.code}`, `${locale.code}.datasetRoot must be data/localization/${locale.code}`);
      assert(locale.routePrefix === `/${locale.code}/`, `${locale.code}.routePrefix must be /${locale.code}/`);
    }
  }

  const source = byCode.get(profile.sourceLocale);
  assert(source?.role === "canonical", "sourceLocale must resolve to a canonical locale entry");
  assert(byCode.has(profile.defaultLocale), "defaultLocale must resolve to a declared locale");
  assert(source.routePrefix === "/", "canonical source locale must own the root route prefix /");

  return { byCode, source };
}

export function validateLocalizedRecordSet({
  locale,
  canonicalRecords,
  localizedRecords,
  allowedQualityStates,
  requiredTextFields = ["title"],
  sourceSnapshot = null,
  isAuthoritative = () => true,
  languageCheck = null,
  exact = true,
}) {
  assert(typeof locale === "string" && locale.length > 0, "locale is required for record-set validation");
  assert(Array.isArray(canonicalRecords), "canonicalRecords must be an array");
  assert(Array.isArray(localizedRecords), "localizedRecords must be an array");
  assert(allowedQualityStates instanceof Set && allowedQualityStates.size > 0, "allowedQualityStates must be a non-empty Set");

  const canonicalBySlug = new Map();
  for (const record of canonicalRecords) {
    assert(record?.slug, "canonical record without slug");
    assert(!canonicalBySlug.has(record.slug), `duplicate canonical slug ${record.slug}`);
    canonicalBySlug.set(record.slug, record);
  }

  const localizedBySlug = new Map();
  for (const record of localizedRecords) {
    assert(record?.slug, `${locale} localized record without slug`);
    assert(!localizedBySlug.has(record.slug), `duplicate localized slug ${record.slug}`);
    const canonical = canonicalBySlug.get(record.slug);
    assert(canonical, `unknown canonical slug ${record.slug}`);
    assert(isAuthoritative(record, canonical) !== false, `non-authoritative localized record ${record.slug}`);
    assert(allowedQualityStates.has(record.quality_state), `invalid quality state ${record.slug}: ${record.quality_state}`);

    for (const field of requiredTextFields) {
      assert(typeof record[field] === "string" && record[field].trim(), `${record.slug}.${field} is required`);
    }

    if (sourceSnapshot) {
      const expected = sourceSnapshot(canonical);
      assert(record.source && typeof record.source === "object", `${record.slug}.source is required`);
      for (const [field, value] of Object.entries(expected)) {
        assert(record.source[field] === value, `source mismatch ${record.slug}.${field}`);
      }
    }

    if (languageCheck) {
      const problems = languageCheck(record) || [];
      assert(problems.length === 0, `${record.slug} failed ${locale} language check: ${problems.join("; ")}`);
    }

    localizedBySlug.set(record.slug, record);
  }

  if (exact) {
    const missing = [...canonicalBySlug.keys()].filter((slug) => !localizedBySlug.has(slug));
    const extra = [...localizedBySlug.keys()].filter((slug) => !canonicalBySlug.has(slug));
    assert(missing.length === 0, `exact ${locale} coverage missing: ${missing.slice(0, 20).join(", ")}`);
    assert(extra.length === 0, `exact ${locale} coverage contains unknown entries: ${extra.slice(0, 20).join(", ")}`);
  }

  return localizedBySlug;
}

export function expectLocalizationFailure(label, fn, expectedPattern) {
  let failed = false;
  try {
    fn();
  } catch (error) {
    failed = true;
    if (expectedPattern && !expectedPattern.test(String(error?.message || error))) {
      fail(`${label} failed for the wrong reason: ${error?.message || error}`);
    }
  }
  if (!failed) fail(`${label} did not fail as required`);
}
