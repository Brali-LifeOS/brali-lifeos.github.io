const panel = document.querySelector('[data-outcome-feedback]');
const actionPanel = document.querySelector('[data-outcome-actions]');
const status = document.querySelector('#outcome-status');
const preview = document.querySelector('#outcome-preview');
const githubButton = document.querySelector('#outcome-github');
const shareButton = document.querySelector('#outcome-share');
const downloadButton = document.querySelector('#outcome-download');
const copyButton = document.querySelector('#outcome-copy');

const issueBase = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new';
let context = window.BraliQueryOutcomeContext || null;
let selected = null;

const choices = {
  helpful: { eventType: 'helpful_yes', reason: 'helpful', label: 'Helpful' },
  'not-helpful': { eventType: 'helpful_no', reason: 'not-helpful', label: 'Not helpful' },
  'bad-match': { eventType: 'bad_match', reason: 'bad-match', label: 'Bad match' },
  'missing-knowledge': { eventType: 'missing_knowledge', reason: 'missing-knowledge', label: 'Missing knowledge' },
};

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildEvent(channel, reviewedBeforeShare) {
  if (!context || !selected) return null;
  const choice = choices[selected];
  return {
    schema_version: 1,
    event_id: randomUuid(),
    event_type: choice.eventType,
    occurred_at: new Date().toISOString(),
    query_id: context.query_id,
    client: {
      category: 'browser-query',
      runtime: 'Ask Brali',
    },
    dataset: {
      version: context.dataset_version,
      manifest_sha256: context.manifest_sha256 || null,
    },
    result: {
      state: context.result_state,
      topic_ids: context.topic_ids || [],
      protocol_ids: context.protocol_ids || [],
      evidence_states: context.evidence_states || [],
    },
    feedback: {
      reason: choice.reason,
      note_included: false,
    },
    consent: {
      explicit: true,
      channel,
      reviewed_before_share: reviewedBeforeShare,
    },
    privacy: {
      raw_query_included: false,
      personal_data_included: false,
      user_identifier_included: false,
    },
    metadata: {
      language: context.language || 'en',
      canonical_page: 'https://brali-lifeos.github.io/for-ai/query/',
    },
  };
}

function eventText(event) {
  return `${JSON.stringify(event, null, 2)}\n`;
}

function renderSelection() {
  if (!context || !selected) {
    actionPanel.hidden = true;
    preview.textContent = '';
    return;
  }
  actionPanel.hidden = false;
  const event = buildEvent('download', false);
  preview.textContent = eventText(event);
  status.textContent = `${choices[selected].label} selected. No event has been sent. Review it, then choose a share channel.`;
}

function resetForContext(nextContext) {
  context = nextContext;
  selected = null;
  panel?.removeAttribute('data-outcome-disabled');
  actionPanel.hidden = true;
  preview.textContent = '';
  status.textContent = 'No automatic telemetry is used. Choose feedback only after reviewing the result.';
  panel?.querySelectorAll('[data-outcome-choice]').forEach(button => {
    button.disabled = false;
    button.removeAttribute('aria-pressed');
  });
}

function selectChoice(value) {
  if (!context || !choices[value]) return;
  selected = value;
  panel.querySelectorAll('[data-outcome-choice]').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.outcomeChoice === value ? 'true' : 'false');
  });
  renderSelection();
}

function githubIssueBody(event) {
  return [
    '## Brali outcome feedback',
    '',
    `Feedback: ${choices[selected].label}`,
    '',
    'The privacy-light event below omits the raw query, personal data and user identifiers.',
    '',
    '```json',
    JSON.stringify(event, null, 2),
    '```',
    '',
    'Optional note about what helped, failed or was missing:',
    '',
    'Do not add personal prompts, credentials, customer data or private system details.',
  ].join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

panel?.querySelectorAll('[data-outcome-choice]').forEach(button => {
  button.disabled = !context;
  button.addEventListener('click', () => selectChoice(button.dataset.outcomeChoice));
});

githubButton?.addEventListener('click', () => {
  const event = buildEvent('github-issue', true);
  if (!event) return;
  const title = `Brali outcome: ${event.event_type}`;
  const url = `${issueBase}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(githubIssueBody(event))}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  status.textContent = 'GitHub issue draft opened. Nothing is submitted until you review and submit it there.';
});

shareButton?.addEventListener('click', async () => {
  const event = buildEvent('native-share', true);
  if (!event) return;
  const text = eventText(event);
  if (navigator.share) {
    await navigator.share({ title: `Brali outcome: ${event.event_type}`, text });
    status.textContent = 'The operating system share sheet was opened. Brali did not select a destination.';
  } else {
    await copyText(text);
    status.textContent = 'Native share is unavailable, so the event JSON was copied instead.';
  }
});

copyButton?.addEventListener('click', async () => {
  const event = buildEvent('manual-import', true);
  if (!event) return;
  await copyText(eventText(event));
  status.textContent = 'Event JSON copied. Copying is not collection; share it only after reviewing the destination.';
});

downloadButton?.addEventListener('click', () => {
  const event = buildEvent('download', true);
  if (!event) return;
  const blob = new Blob([eventText(event)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `brali-outcome-${event.event_id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  status.textContent = 'Event JSON downloaded locally. Downloading is not collection.';
});

window.addEventListener('brali:query-result', event => resetForContext(event.detail));

if (context) resetForContext(context);
else if (panel) {
  panel.setAttribute('data-outcome-disabled', 'true');
  status.textContent = 'Run a query before preparing outcome feedback.';
}
