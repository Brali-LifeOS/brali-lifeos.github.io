const CYRILLIC_PATTERN = /[\p{Script=Cyrillic}]/u;

const ENGLISH_FUNCTION_WORDS = new Set([
  "a", "and", "are", "as", "at", "be", "before", "between", "but", "by", "each", "every",
  "for", "from", "how", "if", "into", "is", "it", "of", "on", "or", "that", "the", "their",
  "then", "this", "to", "when", "while", "with", "without", "you", "your",
]);

const KNOWN_NAMED_TERMS = [
  /^ACT$/u,
  /^AI$/u,
  /^API$/u,
  /^CBT$/u,
  /^DBT$/u,
  /^DEAR MAN$/u,
  /^Golden Circle$/iu,
  /^HIIT$/u,
  /^JSON(?:-LD)?$/u,
  /^MCP$/u,
  /^NLP$/u,
  /^NSDR$/u,
  /^OODA(?: Loop)?$/iu,
  /^Pomodoro(?: Technique)?$/iu,
  /^QA$/u,
  /^SEO$/u,
  /^SMART$/u,
  /^SWOT$/u,
  /^Tabata(?: Training| Protocol)?$/iu,
  /^TRIZ$/u,
];

function words(value) {
  return String(value || "").match(/[\p{Script=Latin}][\p{Script=Latin}'’.-]*/gu) || [];
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[“”„‟'’`´]/gu, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isKnownNamedTerm(value) {
  const text = String(value || "").trim();
  return KNOWN_NAMED_TERMS.some((pattern) => pattern.test(text));
}

function englishFunctionWordScore(value) {
  return words(value).reduce((score, token) => score + (ENGLISH_FUNCTION_WORDS.has(token.toLocaleLowerCase("en")) ? 1 : 0), 0);
}

export function scanGermanText(text, { source = "", field = "text" } = {}) {
  const blocking = [];
  const review = [];
  const value = String(text || "").trim();
  const sourceValue = String(source || "").trim();

  if (!value) {
    blocking.push("empty-localized-field");
    return { blocking, review };
  }

  if (CYRILLIC_PATTERN.test(value)) blocking.push("cyrillic-leak");

  const tokenCount = words(value).length;
  const sourceTokenCount = words(sourceValue).length;
  if (
    sourceValue &&
    sourceTokenCount >= 2 &&
    normalize(value) === normalize(sourceValue) &&
    !isKnownNamedTerm(value)
  ) {
    review.push(`exact-source-fallback:${field}`);
  }

  if (tokenCount >= 7 && englishFunctionWordScore(value) >= 4) review.push(`english-prose:${field}`);

  return {
    blocking: [...new Set(blocking)],
    review: [...new Set(review)],
  };
}

export function germanSourceSimilarity(localized, source) {
  const left = new Set(words(normalize(localized)).map((token) => token.toLocaleLowerCase("en")));
  const right = new Set(words(normalize(source)).map((token) => token.toLocaleLowerCase("en")));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

export function scanGermanLocalizedRecord(record) {
  const localized = record?.localized && typeof record.localized === "object" ? record.localized : record;
  const source = record?.source && typeof record.source === "object" ? record.source : {};
  const findings = [];

  for (const field of ["title", "subtitle", "description"]) {
    const result = scanGermanText(localized?.[field], { source: source?.[field], field });
    if (result.blocking.length || result.review.length) findings.push({ field, ...result });

    const sourceTokens = words(source?.[field]).length;
    if (
      sourceTokens >= 8 &&
      germanSourceSimilarity(localized?.[field], source?.[field]) >= 0.82 &&
      normalize(localized?.[field]) !== normalize(source?.[field])
    ) {
      findings.push({ field, blocking: [], review: [`high-source-overlap:${field}`] });
    }
  }

  return findings;
}
