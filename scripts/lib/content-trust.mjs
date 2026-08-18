export const sensitiveZones = new Set([
  "no-depression",
  "no-fears",
  "be-healthy",
  "fit-life",
  "cardio-doc",
  "psychodynamic",
  "metacognitive",
  "cognitive-analytic",
  "positive-psychotherapy",
  "body-oriented",
  "ericksonian",
  "gestalt",
  "exposure",
  "dbt",
  "act",
  "cbt",
]);

export const claimPattern = /\b(?:research|studies?|trial|pilot|participants?|randomi[sz]ed|systematic review|meta-analysis|evidence shows|clinically)\b|\b\d{1,3}(?:\.\d+)?%\b|\bn\s*=\s*\d+\b/i;
export const quantitativeClaimPattern = /\b\d{1,3}(?:\.\d+)?%\b|\bn\s*=\s*\d+\b/i;

export function isUsableSource(value) {
  if (!value) return false;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Boolean(text.trim()) && !/(?:metalhatscats|brali-lifeos\.github\.io\/life-os)/i.test(text);
}

function sourceUrlFrom(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (!value || typeof value !== "object") return null;
  const url = value.url || value.source_url || value.sourceUrl || value.reference_url || null;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

export function sourceDetails(article) {
  const original = article.lifeOsSource ?? {};
  const direct = [original.sourceUrl, article.sourceUrl, original.reference, article.reference]
    .filter(isUsableSource);
  const listed = [article.references, article.sources, article.citations]
    .filter(Array.isArray)
    .flat()
    .filter(isUsableSource);
  const all = [...direct, ...listed];
  const sourceUrl = all.map(sourceUrlFrom).find(Boolean) ?? null;
  const reference = all.find((value) => sourceUrlFrom(value) !== sourceUrl) ?? null;
  return {
    hasSource: all.length > 0,
    sourceCount: all.length,
    sourceUrl,
    reference,
    sources: all,
  };
}

export function publicClaimSurface(article = {}) {
  const original = article.lifeOsSource ?? {};
  return {
    title: article.title ?? null,
    subtitle: article.subtitle ?? null,
    description: article.description ?? null,
    action: original.whatYouDo ?? null,
    checkIn: original.checkIn ?? null,
    faq: (article.faq ?? []).map((item) => ({ question: item.question ?? null, answer: item.answer ?? null })),
    body: {
      intro: article.body?.intro?.html ?? null,
      markdown: article.body?.markdown ?? null,
      sections: (article.body?.sections ?? []).map((section) => ({ title: section.title ?? null, html: section.html ?? null })),
    },
  };
}

export function claimFlags(article) {
  const text = JSON.stringify(publicClaimSurface(article));
  return {
    evidenceLanguage: claimPattern.test(text),
    quantitative: quantitativeClaimPattern.test(text),
  };
}

export function classifyEvidence(article, entry, overrides = {}) {
  const source = sourceDetails(article);
  const claims = claimFlags(article);
  const sensitive = sensitiveZones.has(entry.zone?.slug);
  const override = overrides?.entries?.[entry.slug] ?? null;
  const allowed = new Set(["reviewed", "practical", "pending-review", "restricted"]);

  let status;
  let reason;

  if (override?.status && allowed.has(override.status)) {
    status = override.status;
    reason = "manual-review";
  } else if (sensitive && !source.hasSource) {
    status = "restricted";
    reason = "sensitive-without-usable-source";
  } else if (source.hasSource || claims.evidenceLanguage) {
    status = "pending-review";
    reason = source.hasSource ? "source-recorded-not-reviewed" : "evidence-like-claim-without-source";
  } else {
    status = "practical";
    reason = "low-risk-practical-guidance";
  }

  const indexable = status === "reviewed" || status === "practical";

  return {
    slug: entry.slug,
    zone: entry.zone?.slug ?? null,
    status,
    reason,
    sensitive,
    indexable,
    indexingReason: indexable ? "quality-bar-met" : "editorial-review-required",
    claims,
    source: {
      recorded: source.hasSource,
      count: source.sourceCount,
      url: source.sourceUrl,
      reference: source.reference ?? null,
    },
    review: {
      reviewedAt: override?.reviewed_at ?? null,
      reviewedBy: override?.reviewed_by ?? null,
      note: override?.note ?? null,
    },
  };
}
