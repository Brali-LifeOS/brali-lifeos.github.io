const definitions = [
  {
    id: 'quantitative',
    enforced: true,
    decision_required: true,
    description: 'Percentages, explicit sample sizes, participant counts, or named effect estimates that require precise source support.',
    patterns: [
      /\b\d{1,3}(?:\.\d+)?\s*%\b/i,
      /\bn\s*=\s*\d+\b/i,
      /\b(?:sample|cohort)\s+of\s+\d+\b/i,
      /\b\d+\s+(?:participants|users|testers|subjects)\b/i,
      /\b(?:cohen'?s?\s+d|hedges'?s?\s+g|odds\s+ratio|risk\s+ratio|hazard\s+ratio)\s*(?:=|:)?\s*-?\d+(?:\.\d+)?\b/i,
      /\b(?:OR|RR|HR)\s*=\s*-?\d+(?:\.\d+)?\b/,
      /\br\s*=\s*-?0?\.\d+\b/i,
    ],
  },
  {
    id: 'first-party-result',
    enforced: true,
    decision_required: true,
    description: 'Claims about Brali, author, user, pilot, trial, experiment, or internal data results.',
    patterns: [
      /\b(?:in|during)\s+our\s+(?:pilot|trial|experiment|test)\b/i,
      /\bour\s+(?:pilot|trial|experiment|test|data)\s+(?:showed|found|suggested|demonstrated|resulted)\b/i,
      /\bwe\s+(?:observed|measured|found|saw|recorded)\b/i,
      /\bour\s+(?:users|participants|testers)\b/i,
    ],
  },
  {
    id: 'guarantee',
    enforced: true,
    decision_required: true,
    description: 'Guarantees, universal effectiveness, or unsupported proof language.',
    patterns: [
      /\b(?:we|this\s+(?:method|protocol|technique|system)|the\s+(?:method|protocol|technique|system))\s+guarantee(?:d|s)?\b/i,
      /\bguaranteed\s+(?:results?|outcomes?|success|improvement)\b/i,
      /\bguarantee(?:s)?\s+(?:a\s+|an\s+|the\s+)?(?:result|results|outcome|outcomes|success|improvement)\b/i,
      /\bworks?\s+every\s+time\b/i,
      /\bwill\s+(?:always|definitely)\b/i,
      /\bscientifically\s+proven\b/i,
      /\bproven\s+(?:method|technique|way|system)\b/i,
    ],
  },
  {
    id: 'clinical-outcome',
    enforced: true,
    decision_required: true,
    description: 'High-confidence diagnosis, treatment, cure, prevention, symptom, or disease outcome language.',
    patterns: [
      /\b(?:diagnos(?:e|es|ed)|treat(?:s|ed)?|cure(?:s|d)?|prevent(?:s|ed)?)\s+(?:depression|anxiety|insomnia|pain|disease|disorder|symptoms?)\b/i,
      /\b(?:reduces?|eliminates?|prevents?)\s+(?:the\s+)?(?:risk\s+of|symptoms?\s+of)\b/i,
      /\b(?:clinical|therapeutic)\s+(?:outcome|benefit|effect|improvement)\b/i,
    ],
  },
  {
    id: 'causal-effect',
    enforced: false,
    decision_required: true,
    description: 'Causal or effect language that needs an explicit reviewed decision before trusted discovery.',
    patterns: [
      /\b(?:has|have|was|were)\s+shown\s+to\b/i,
      /\bis\s+proven\s+to\b/i,
      /\bleads?\s+to\b/i,
      /\b(?:this|that|it|which|the\s+(?:method|protocol|practice|intervention|technique|change|behavior|action|approach))\s+results?\s+in\b/i,
      /\bcauses?\s+(?:an?\s+|the\s+)?(?:increase|decrease|change|improvement|decline|effect|response|symptom|risk|problem|benefit|harm)\b/i,
      /\b(?:reduces?|increases?|improves?|boosts?|lowers?|raises?)\s+(?:the\s+)?(?:risk|likelihood|level|rate|performance|memory|focus|mood|stress|anxiety|pain|sleep)\b/i,
    ],
  },
  {
    id: 'mechanism',
    enforced: false,
    decision_required: true,
    description: 'Biological or neurological mechanism language that needs an explicit reviewed decision before trusted discovery.',
    patterns: [
      /\b(?:dopamine|serotonin|cortisol|neuroplasticity|brain\s+chemistry|blood\s+flow|inflammation)\b/i,
      /\b(?:parasympathetic|sympathetic)\s+(?:system|response)\b/i,
      /\b(?:vagus|vagal)\s+(?:nerve|tone|response)\b/i,
    ],
  },
  {
    id: 'research-language',
    enforced: false,
    decision_required: false,
    description: 'Study and evidence language that remains visible for review prioritization but is not automatically claim-specific.',
    patterns: [
      /\b(?:research|studies?|trial|pilot|participants?|randomi[sz]ed|systematic\s+review|meta-analysis|evidence\s+shows|clinically)\b/i,
      /\b(?:research|evidence|studies?)\s+(?:shows?|suggests?|demonstrates?|proves?)\b/i,
    ],
  },
];

export const claimCategoryDefinitions = definitions.map(({ patterns, ...definition }) => ({ ...definition }));

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

function examplesFor(text, patterns, limit) {
  const examples = [];
  const seen = new Set();

  for (const pattern of patterns) {
    const flags = [...new Set(`${pattern.flags.replace(/g/g, '')}g`.split(''))].join('');
    const matcher = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(matcher)) {
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
    const examples = examplesFor(text, definition.patterns, exampleLimitPerCategory);
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
    decisionRequiredCategories: markers
      .filter(marker => definitions.find(definition => definition.id === marker.category)?.decision_required)
      .map(marker => marker.category),
    markers,
  };
}

export function claimDefinition(category) {
  return claimCategoryDefinitions.find(item => item.id === category) ?? null;
}
