const BLOCKING_PATTERNS = [
  ["follow-up", /\bfollow[- ]?up\b/iu],
  ["power pose", /\bpower\s+pose\b/iu],
  ["reality check", /\breality\s+check\b/iu],
  ["test case", /\btest\s+case\b/iu],
  ["decision journal", /\bdecision\s+journal\b/iu],
  ["bottom line", /\bbottom\s+line\b/iu],
  ["таймбокс", /\bтаймбокс(?:а|е|ом|ы|ов|ами|ах)?\b/iu],
  ["чанкинг", /\bчанкинг(?:а|е|ом)?\b/iu],
  ["воркфлоу", /\bворкфлоу\b/iu],
  ["чекап", /\bчекап(?:а|е|ом|ы|ов)?\b/iu],
  ["паттерн", /\bпаттерн(?:а|е|ом|ы|ов|ами|ах)?\b/iu],
  ["тул", /\bтул(?:а|е|ом|ы|ов|ами|ах)?\b/iu],
];

const REVIEW_PATTERNS = [
  ["checkpoint", /\bcheckpoint\b/iu],
  ["shadowing", /\bshadowing\b/iu],
  ["cue", /\bcue\b/iu],
  ["task", /\btask\b/iu],
  ["output", /\boutput\b/iu],
  ["context", /\bcontext\b/iu],
  ["style", /\bstyle\b/iu],
  ["focus", /\bfocus\b/iu],
  ["signal", /\bsignal\b/iu],
  ["awareness", /\bawareness\b/iu],
  ["pattern", /\bpattern\b/iu],
  ["default", /\bdefault\b/iu],
  ["trigger", /\btrigger\b/iu],
  ["prompt", /\bprompt\b/iu],
  ["script", /\bscript\b/iu],
  ["status", /\bstatus\b/iu],
  ["workflow", /\bworkflow\b/iu],
  ["not enough", /\bnot\s+enough\b/iu],
  ["more than", /\bmore\s+than\b/iu],
  ["pain", /\bpain\b/iu],
];

const TECHNICAL_TOKENS = new Set([
  "AI", "API", "ACT", "CBT", "DBT", "NLP", "NSDR", "HIIT", "TRIZ", "QA", "SEO", "JSON", "JSON-LD",
  "MCP", "DOI", "URL", "HTML", "SMART", "SWOT", "TED", "Pomodoro", "Tabata", "Brali",
]);

function isAllowed(allowlist, location, term) {
  return (allowlist || []).some((entry) => {
    if (!entry || entry.term !== term) return false;
    if (entry.location === location) return true;
    if (entry.location?.endsWith("*") && location.startsWith(entry.location.slice(0, -1))) return true;
    return false;
  });
}

export function scanRussianText(text, { location = "unknown", allowlist = [] } = {}) {
  if (typeof text !== "string" || !text.trim()) return { blocking: [], review: [] };
  const blocking = [];
  const review = [];

  for (const [term, pattern] of BLOCKING_PATTERNS) {
    if (pattern.test(text) && !isAllowed(allowlist, location, term)) blocking.push(term);
  }
  for (const [term, pattern] of REVIEW_PATTERNS) {
    if (pattern.test(text) && !isAllowed(allowlist, location, term)) review.push(term);
  }

  return { blocking: [...new Set(blocking)], review: [...new Set(review)] };
}

export function scanRussianValue(value, { location = "root", allowlist = [] } = {}) {
  const findings = [];
  const visit = (node, path) => {
    if (typeof node === "string") {
      const result = scanRussianText(node, { location: path, allowlist });
      if (result.blocking.length || result.review.length) findings.push({ location: path, ...result });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        if (["source", "source_markers", "sourceFingerprint", "source_locale", "canonicalSource", "source_path", "source_route"].includes(key)) continue;
        visit(item, `${path}.${key}`);
      }
    }
  };
  visit(value, location);
  return findings;
}

export function findUnexpectedLatinRuns(text) {
  if (typeof text !== "string") return [];
  const runs = text.match(/\b[A-Za-z][A-Za-z0-9+.-]*(?:\s+[A-Za-z][A-Za-z0-9+.-]*)+\b/g) || [];
  return runs.filter((run) => {
    const tokens = run.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return false;
    return !tokens.every((token) => TECHNICAL_TOKENS.has(token));
  });
}

export const russianLanguageAuditTerms = {
  blocking: BLOCKING_PATTERNS.map(([term]) => term),
  review: REVIEW_PATTERNS.map(([term]) => term),
};
