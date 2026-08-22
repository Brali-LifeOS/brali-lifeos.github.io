const definitions = [
  {
    id: 'quantitative',
    enforced: true,
    description: 'Percentages, sample sizes, participant counts, or effect estimates that require precise source support.',
    patterns: [
      /\b\d{1,3}(?:\.\d+)?\s*%/i,
      /\bn\s*=\s*\d+\b/i,
      /\b(?:sample|cohort)\s+of\s+\d+\b/i,
      /\b\d+\s+(?:participants|users|testers|subjects|patients)\b/i,
      /\b(?:effect\s+size|cohen['’]?s\s+d|hedges['’]?\s*g|odds\s+ratio|risk\s+ratio|hazard\s+ratio|confidence\s+interval)\b/i,
      /\bp\s*[<=>]\s*0?\.\d+\b/i,
    ],
  },
  {
    id: 'first-party-result',
    enforced: true,
    description: 'Claims about Brali, author, user, pilot, trial, experiment, or internal data results.',
    patterns: [
      /\b(?:in|during)\s+our\s+(?:pilot|trial|experiment|test|study)\b/i,
      /\bour\s+(?:pilot|trial|experiment|test|study|data)\s+(?:showed|found|suggested|demonstrated|resulted|confirmed)\b/i,
      /\bwe\s+(?:observed|measured|found|saw|recorded|confirmed)\b/i,
      /\bour\s+(?:users|participants|testers|cohort)\b/i,
    ],
  },
  {
    id: 'guarantee',
    enforced: true,
    description: 'Guarantees, universal effectiveness, or unsupported proof language.',
    patterns: [
      /\b(?:we|this\s+(?:method|protocol|technique|system)|the\s+(?:method|protocol|technique|system))\s+guarantee(?:d|s)?\b/i,
      /\bguaranteed\s+(?:results?|outcomes?|success|improvement)\b/i,
      /\bguarantee(?:s)?\s+(?:a\s+|an\s+|the\s+)?(?:result|results|outcome|outcomes|success|improvement)\b/i,
      /\bworks?\s+(?:every\s+time|for\s+everyone)\b/i,
      /\bwill\s+(?:always|definitely)\b/i,
      /\bscientifically\s+proven\b/i,
      /\bproven\s+(?:method|technique|way|system)\b/i,
    ],
    excludePatterns: [
      /\b(?:not|isn['’]t|cannot|can['’]t)\s+guaranteed\b/i,
      /\bno\s+guarantee\b/i,
    ],
  },
  {
    id: 'clinical-outcome',
    enforced: true,
    description: 'High-confidence diagnosis, treatment, cure, prevention, symptom, or disease outcome language.',
    patterns: [
      /\b(?:diagnos(?:e|es|ed)|treat(?:s|ed)?|cure(?:s|d)?|prevent(?:s|ed)?)\s+(?:depression|anxiety|insomnia|pain|disease|disorder|symptoms?|ptsd|adhd|dementia)\b/i,
      /\b(?:reduces?|eliminates?|prevents?)\s+(?:the\s+)?(?:risk\s+of|symptoms?\s+of)\b/i,
      /\b(?:clinical|therapeutic)\s+(?:outcome|benefit|effect|improvement)\b/i,
    ],
    excludePatterns: [
      /\b(?:not|isn['’]t|does\s+not|doesn['’]t|cannot|can['’]t)\b[^.!?]{0,45}\b(?:diagnos|treat|cure|prevent|reduce|eliminate)\w*\b/i,
      /\bnot\s+(?:a\s+)?(?:treatment|diagnosis|cure)\b/i,
    ],
  },
  {
    id: 'causal-effect',
    enforced: true,
    description: 'High-confidence causal or certain-effect language that needs source-bounded review before trusted discovery.',
    patterns: [
      /\b(?:has|have|was|were)\s+shown\s+to\b/i,
      /\bis\s+proven\s+to\b/i,
      /\b(?:causes?|leads?\s+to|results?\s+in)\s+(?:a\s+|an\s+|the\s+)?(?:measurable|significant|lasting|permanent|better|worse|improved|reduced|increased|decreased|higher|lower|stress|anxiety|depression|pain|disease|memory|retention|performance|productivity|focus|health|recovery|weight\s+loss|symptoms?)\b/i,
      /\bwill\s+(?:improve|reduce|increase|decrease|prevent|eliminate|boost|lower|raise|restore|fix)\b/i,
      /\b(?:reduces?|increases?|improves?|boosts?|lowers?|raises?)\s+(?:the\s+)?(?:risk|likelihood|level|rate|performance|memory|focus|mood|stress|anxiety|pain|sleep)\b/i,
    ],
    excludePatterns: [
      /\b(?:not|does\s+not|doesn['’]t|do\s+not|don['’]t|did\s+not|cannot|can['’]t)\b[^.!?]{0,55}\b(?:cause|lead|result|shown|proven|improve|reduce|increase|decrease|boost|lower|raise|prevent)\w*\b/i,
      /\b(?:no|insufficient|limited|weak)\s+evidence\b[^.!?]{0,60}\b(?:that|for|to)\b/i,
      /\bassociation\b[^.!?]{0,70}\bdoes\s+not\s+establish\s+causality\b/i,
    ],
  },
  {
    id: 'mechanism',
    enforced: false,
    description: 'Biological or neurological mechanism language that can create unsupported scientific authority.',
    patterns: [
      /\b(?:dopamine|serotonin|cortisol|neuroplasticity|brain\s+chemistry|blood\s+flow|inflammation)\b/i,
      /\b(?:parasympathetic|sympathetic)\s+(?:system|response|nervous\s+system)\b/i,
      /\b(?:vagus|vagal)\s+(?:nerve|tone|response)\b/i,
    ],
  },
  {
    id: 'research-language',
    enforced: false,
    description: 'Study and evidence language that requires traceable review before it supports a public claim.',
    patterns: [
      /\b(?:research|stud(?:y|ies)|trial|pilot|participants?|randomi[sz]ed|systematic\s+review|meta-analysis|evidence\s+shows|clinically)\b/i,
      /\b(?:research|evidence|stud(?:y|ies))\s+(?:shows?|suggests?|demonstrates?|proves?)\b/i,
    ],
  },
];

export const claimCategoryDefinitions = definitions.map(({ patterns, excludePatterns, ...definition }) => ({ ...definition }));

export function normalizeClaimText(value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceAround(text, index, length) {
  const left = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('!', index), text.lastIndexOf('?', index), -1) + 1;
  const candidates = [text.indexOf('.', index + length), text.indexOf('!', index + length), text.indexOf('?', index + length)].filter(value => value >= 0);
  const right = candidates.length ? Math.min(...candidates) + 1 : text.length;
  return text.slice(left, right).trim();
}

function examplesFor(text, patterns, excludePatterns = [], limit) {
  const examples = [];
  const seen = new Set();

  for (const pattern of patterns) {
    const flags = [...new Set(`${pattern.flags.replace(/g/g, '')}g`.split(''))].join('');
    const matcher = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(matcher)) {
      const sentence = sentenceAround(text, match.index ?? 0, match[0].length);
      if (excludePatterns.some(exclusion => exclusion.test(sentence))) continue;
      const start = Math.max(0, (match.index ?? 0) - 70);
      const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 70);
      const sample = text.slice(start, end).trim();
      if (!seen.has(sample)) {
        seen.add(sample);
        examples.push(sample);
      }
      if (examples.length >= limit) return examples;
    }
  }

  return examples;
}

export function inspectClaims(value, { exampleLimitPerCategory = 3 } = {}) {
  const text = normalizeClaimText(value);
  const markers = [];

  for (const definition of definitions) {
    const examples = examplesFor(text, definition.patterns, definition.excludePatterns ?? [], exampleLimitPerCategory);
    if (examples.length) {
      markers.push({
        category: definition.id,
        enforced: definition.enforced,
        examples,
      });
    }
  }

  return {
    categories: markers.map(marker => marker.category),
    enforcedCategories: markers.filter(marker => marker.enforced).map(marker => marker.category),
    markers,
  };
}

export function claimDefinition(category) {
  return claimCategoryDefinitions.find(item => item.id === category) ?? null;
}
