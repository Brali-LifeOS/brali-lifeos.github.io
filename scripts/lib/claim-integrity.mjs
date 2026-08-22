const CATEGORY_ORDER = [
  'quantitative',
  'first-party',
  'research-appeal',
  'causal',
  'mechanism',
  'clinical',
  'guarantee'
];

const RULES = [
  {
    id: 'percentage-effect',
    category: 'quantitative',
    re: /\b(?:increase(?:d|s)?|decrease(?:d|s)?|improve(?:d|s)?|reduce(?:d|s)?|lower(?:ed|s)?|raise(?:d|s)?|boost(?:ed|s)?|drop(?:ped|s)?|gain(?:ed|s)?)\b[^.!?\n]{0,90}\b\d{1,3}(?:\.\d+)?\s*%/gi
  },
  {
    id: 'percentage-outcome',
    category: 'quantitative',
    re: /\b\d{1,3}(?:\.\d+)?\s*%\s+(?:improvement|reduction|increase|decrease|gain|drop|better|worse|faster|slower|more|less)\b/gi
  },
  {
    id: 'sample-size',
    category: 'quantitative',
    re: /\b(?:n\s*=\s*\d{2,}|sample(?:\s+size)?\s+(?:of\s+)?\d{2,}|\d{2,}\s+(?:participants?|subjects?|patients?|users?|testers?))\b/gi
  },
  {
    id: 'effect-statistic',
    category: 'quantitative',
    re: /\b(?:effect\s+size|cohen['’]?s\s+d|hedges['’]?\s*g|odds\s+ratio|risk\s+ratio|hazard\s+ratio|confidence\s+interval|p\s*[<=>]\s*0?\.\d+|r\s*=\s*-?0?\.\d+)\b/gi
  },
  {
    id: 'internal-study',
    category: 'first-party',
    re: /\b(?:in|during)\s+our\s+(?:pilot|trial|experiment|study|test|internal\s+review)\b|\bour\s+(?:pilot|trial|experiment|study|test)\s+(?:showed|found|suggested|demonstrated|resulted)\b/gi
  },
  {
    id: 'internal-observation',
    category: 'first-party',
    re: /\bwe\s+(?:observed|measured|found|saw|recorded|confirmed|demonstrated)\b|\bour\s+data\s+(?:showed|found|suggested|demonstrated|confirmed)\b/gi
  },
  {
    id: 'internal-participants',
    category: 'first-party',
    re: /\bour\s+(?:users|participants|testers|customers|cohort)\b/gi
  },
  {
    id: 'research-shows',
    category: 'research-appeal',
    re: /\b(?:research|studies?|evidence|clinical\s+trials?)\s+(?:clearly\s+)?(?:show|shows|prove|proves|demonstrate|demonstrates|confirm|confirms|establish|establishes)\b/gi
  },
  {
    id: 'scientifically-proven',
    category: 'research-appeal',
    re: /\b(?:scientifically|clinically)\s+(?:proven|validated|confirmed)\b/gi
  },
  {
    id: 'direct-causation',
    category: 'causal',
    re: /\b(?:causes?|caused|leads?\s+to|results?\s+in|produces?|drives?)\s+(?:a\s+|an\s+|the\s+)?(?:measurable|significant|lasting|permanent|better|worse|improved|reduced|increased|decreased|higher|lower|stress|anxiety|depression|pain|disease|memory|retention|performance|productivity|focus|health|recovery|weight\s+loss|symptom)\b/gi
  },
  {
    id: 'certain-outcome',
    category: 'causal',
    re: /\bwill\s+(?:improve|reduce|increase|decrease|prevent|eliminate|boost|lower|raise|restore|fix)\b/gi
  },
  {
    id: 'biological-mechanism',
    category: 'mechanism',
    re: /\b(?:increase(?:s|d)?|decrease(?:s|d)?|boost(?:s|ed)?|lower(?:s|ed)?|raise(?:s|d)?|release(?:s|d)?|activate(?:s|d)?|regulate(?:s|d)?|stimulate(?:s|d)?)\s+(?:dopamine|serotonin|cortisol|oxytocin|endorphins?|vagal\s+tone|the\s+parasympathetic\s+(?:system|nervous\s+system)|neuroplasticity)\b/gi
  },
  {
    id: 'clinical-treatment',
    category: 'clinical',
    re: /\b(?:treat(?:s|ed)?|cure(?:s|d)?|diagnos(?:e|es|ed)|prevent(?:s|ed)?)\s+(?:depression|anxiety|panic|trauma|ptsd|adhd|insomnia|dementia|disease|disorder|addiction|chronic\s+pain|migraine|hypertension)\b/gi
  },
  {
    id: 'guaranteed-result',
    category: 'guarantee',
    re: /\b(?:guaranteed|guarantees?|always\s+works?|works?\s+for\s+everyone|cannot\s+fail|fail-?proof)\b/gi
  },
  {
    id: 'universal-optimum',
    category: 'guarantee',
    re: /\b(?:optimal|perfect|best)\s+(?:dose|duration|frequency|interval|method|protocol)\b|\bone-size-fits-all\b/gi
  }
];

const BOUNDARY_PATTERNS = [
  /\b(?:not|isn['’]t|aren['’]t|does\s+not|doesn['’]t|do\s+not|don['’]t|cannot|can['’]t)\b[^.!?\n]{0,45}\b(?:treat|cure|diagnos|prevent|caus|guarantee|prove|establish|show)\w*\b/i,
  /\b(?:no|insufficient|limited|weak)\s+evidence\b[^.!?\n]{0,55}\b(?:for|that|to)\b/i,
  /\b(?:does\s+not|cannot|can['’]t)\b[^.!?\n]{0,45}\b(?:establish|support|prove|show|justify)\b/i,
  /\b(?:not\s+medical\s+advice|not\s+a\s+treatment|not\s+a\s+diagnosis|not\s+guaranteed)\b/i
];

const ENTITY_MAP = new Map([
  ['&nbsp;', ' '],
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&ndash;', '–'],
  ['&mdash;', '—'],
  ['&rsquo;', '’'],
  ['&lsquo;', '‘'],
  ['&ldquo;', '“'],
  ['&rdquo;', '”']
]);

function decodeHtml(value = '') {
  return String(value)
    .replace(/&(nbsp|amp|lt|gt|quot|apos|ndash|mdash|rsquo|lsquo|ldquo|rdquo|#39);/gi, token => ENTITY_MAP.get(token.toLowerCase()) ?? token)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function extractPublicText(html = '') {
  let text = String(html);
  const main = text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) text = main[1];
  text = text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|footer|nav)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|li|h[1-6]|section|article|aside|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ');
  return decodeHtml(text)
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text = '') {
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isBoundarySentence(sentence) {
  return BOUNDARY_PATTERNS.some(pattern => pattern.test(sentence));
}

function excerptFor(sentence, start, length) {
  const radius = 105;
  const from = Math.max(0, start - radius);
  const to = Math.min(sentence.length, start + length + radius);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < sentence.length ? '…' : '';
  return `${prefix}${sentence.slice(from, to).trim()}${suffix}`;
}

export function detectClaimMarkers(text = '') {
  const markers = [];
  for (const sentence of splitSentences(text)) {
    const boundary = isBoundarySentence(sentence);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const match of sentence.matchAll(rule.re)) {
        if (boundary && ['research-appeal', 'causal', 'clinical', 'guarantee'].includes(rule.category)) continue;
        markers.push({
          id: rule.id,
          category: rule.category,
          match: match[0].replace(/\s+/g, ' ').trim(),
          excerpt: excerptFor(sentence, match.index ?? 0, match[0].length),
          normalized_excerpt: sentence.toLowerCase().replace(/\s+/g, ' ').trim()
        });
      }
    }
  }

  const unique = new Map();
  for (const marker of markers) {
    const key = `${marker.id}:${marker.normalized_excerpt}`;
    if (!unique.has(key)) unique.set(key, marker);
  }
  return [...unique.values()].sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
    a.id.localeCompare(b.id) ||
    a.excerpt.localeCompare(b.excerpt)
  );
}

function canonicalTargets(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const withoutPrefix = raw.replace(/^brali:(?:protocol:)?/, '').replace(/^brali:/, '');
  return [...new Set([raw, withoutPrefix, `brali:${withoutPrefix}`, `brali:protocol:${withoutPrefix}`])];
}

export function mappedEvidenceDecisions({ slug, protocolId, decisions = [] } = {}) {
  const targets = new Set([...canonicalTargets(slug), ...canonicalTargets(protocolId)]);
  return decisions.filter(decision => {
    if (!decision?.source_reviewed || !String(decision.supported_claim || '').trim()) return false;
    const declared = [
      ...(decision.target_protocol_ids || []),
      ...(decision.target_hack_ids || [])
    ].flatMap(canonicalTargets);
    return declared.some(target => targets.has(target));
  });
}

function registryApproval({ marker, slug, registry = {}, decisions = [] }) {
  const approvals = registry.entries || [];
  for (const approval of approvals) {
    if (approval.slug !== slug) continue;
    if (!(approval.categories || []).includes(marker.category)) continue;
    if ((approval.marker_ids || []).length && !(approval.marker_ids || []).includes(marker.id)) continue;
    const exactExcerpt = String(approval.approved_excerpt || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!exactExcerpt || !marker.normalized_excerpt.includes(exactExcerpt)) continue;
    const decisionIds = new Set(decisions.map(item => item.id));
    if (!(approval.evidence_decision_ids || []).length) continue;
    if (!(approval.evidence_decision_ids || []).every(id => decisionIds.has(id))) continue;
    return approval;
  }
  return null;
}

export function resolveMarkerSupport({ marker, slug, protocolId, evidenceRecord, decisions = [], registry = {} } = {}) {
  const explicit = registryApproval({ marker, slug, registry, decisions });
  if (explicit) {
    return {
      supported: true,
      route: 'claim-review-registry',
      approval_id: explicit.id,
      evidence_decision_ids: explicit.evidence_decision_ids || []
    };
  }

  const mapped = mappedEvidenceDecisions({ slug, protocolId, decisions });
  const decisionEligibleCategories = new Set(['research-appeal', 'causal', 'mechanism']);
  if (evidenceRecord?.status === 'reviewed' && decisionEligibleCategories.has(marker.category) && mapped.length) {
    return {
      supported: true,
      route: 'mapped-evidence-decision',
      approval_id: null,
      evidence_decision_ids: mapped.map(item => item.id)
    };
  }

  return {
    supported: false,
    route: evidenceRecord?.indexable ? 'unsupported-indexable' : 'withheld-review-debt',
    approval_id: null,
    evidence_decision_ids: mapped.map(item => item.id)
  };
}

export function claimCategoryOrder() {
  return [...CATEGORY_ORDER];
}

export function claimRules() {
  return RULES.map(({ id, category }) => ({ id, category }));
}
