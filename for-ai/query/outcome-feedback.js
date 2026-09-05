const GITHUB_ISSUES_NEW = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new';
const BASE = 'https://brali-lifeos.github.io';

const choiceMap = {
  helpful: { event_type: 'helpful_yes', reason: 'helpful', title: 'Helpful' },
  'not-helpful': { event_type: 'helpful_no', reason: 'not-helpful', title: 'Not helpful' },
  'bad-match': { event_type: 'bad_match', reason: 'bad-match', title: 'Bad match' },
  'missing-knowledge': { event_type: 'missing_knowledge', reason: 'missing-knowledge', title: 'Missing knowledge' }
};

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function newQueryId() {
  return uuid();
}

function canonicalIds(items = []) {
  return [...new Set(items.map(item => item?.canonical_id).filter(Boolean))];
}

function resultState(packet) {
  if (packet?.status === 'trusted-answer') return 'trusted_match';
  if (packet?.status === 'no-trusted-answer' || packet?.status === 'boundary-only') return 'no_trusted_answer';
  return 'not_applicable';
}

function languageTag() {
  const value = document.documentElement.lang || navigator.language || 'en';
  return String(value).slice(0, 24);
}

export function buildQueryFeedbackEvent({ queryId, packet, choice, channel }) {
  const definition = choiceMap[choice];
  if (!definition) throw new Error(`Unknown feedback choice: ${choice}`);
  if (!['github-issue', 'native-share', 'download'].includes(channel)) throw new Error(`Unsupported feedback channel: ${channel}`);
  if (!queryId) throw new Error('Missing queryId');

  const topics = canonicalIds(packet?.route?.topics);
  const protocols = canonicalIds(packet?.recommendations);
  const evidenceStates = [...new Set((packet?.recommendations ?? []).map(item => item?.evidence_state).filter(Boolean))];

  return {
    schema_version: 1,
    event_id: uuid(),
    event_type: definition.event_type,
    occurred_at: new Date().toISOString(),
    query_id: queryId,
    client: {
      category: 'browser-query',
      runtime: 'Ask Brali'
    },
    dataset: {
      version: packet?.dataset_version || '1.0.0',
      manifest_sha256: null
    },
    result: {
      state: resultState(packet),
      topic_ids: topics,
      protocol_ids: protocols,
      evidence_states: evidenceStates
    },
    feedback: {
      reason: definition.reason,
      note_included: false
    },
    consent: {
      explicit: true,
      channel,
      reviewed_before_share: true
    },
    privacy: {
      raw_query_included: false,
      personal_data_included: false,
      user_identifier_included: false
    },
    metadata: {
      language: languageTag(),
      canonical_page: `${BASE}/for-ai/query/`
    }
  };
}

export function feedbackLabel(choice) {
  return choiceMap[choice]?.title ?? choice;
}

export function eventJson(event) {
  return JSON.stringify(event, null, 2);
}

export function downloadOutcomeEvent(event) {
  const blob = new Blob([`${eventJson(event)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `brali-outcome-${event.event_type}-${event.event_id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function shareOutcomeEvent(event) {
  if (!navigator.share) return false;
  await navigator.share({
    title: 'Brali outcome feedback',
    text: eventJson(event)
  });
  return true;
}

export function githubOutcomeDraft(event, { question = '', includeQuery = false } = {}) {
  const lines = [
    '## Brali outcome feedback',
    '',
    `Feedback: ${feedbackLabel(Object.keys(choiceMap).find(key => choiceMap[key].event_type === event.event_type) || event.event_type)}`,
    '',
    '### Privacy-light event envelope',
    '',
    '```json',
    eventJson(event),
    '```',
    '',
    'The event envelope intentionally excludes the raw query, personal data and user identifiers.'
  ];
  if (includeQuery && question) {
    lines.push('', '### Query text shared separately by me', '', String(question), '', 'I reviewed this text before opening the public issue draft.');
  }
  lines.push('', '### Optional context', '', '<!-- Explain what was useful, wrong, or missing. Remove anything you do not want to publish. -->');
  const title = `Brali feedback: ${event.feedback.reason}`;
  return `${GITHUB_ISSUES_NEW}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
