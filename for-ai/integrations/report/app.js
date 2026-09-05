const GITHUB_ISSUES_NEW = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new';
const form = document.querySelector('#integration-report-form');
const clientSelect = document.querySelector('#integration-client');
const statusEl = document.querySelector('#integration-report-status');
const previewWrap = document.querySelector('#integration-report-preview');
const previewEl = document.querySelector('#integration-event-json');
const downloadButton = document.querySelector('#integration-download');
const shareButton = document.querySelector('#integration-share');
const githubLink = document.querySelector('#integration-github');
let datasetVersion = null;
let currentEvent = null;

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

async function loadDatasetVersion() {
  if (datasetVersion) return datasetVersion;
  const response = await fetch('/life-os/datasets/manifest.json', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`manifest.json returned ${response.status}`);
  const manifest = await response.json();
  datasetVersion = manifest.dataset_version || '1.0.0';
  return datasetVersion;
}

function buildEvent(channel) {
  if (!datasetVersion) throw new Error('Dataset version is not loaded yet.');
  return {
    schema_version: 1,
    event_id: uuid(),
    event_type: 'integration_reported',
    occurred_at: new Date().toISOString(),
    client: {
      category: clientSelect.value,
      runtime: 'Brali integration outcome form'
    },
    dataset: {
      version: datasetVersion,
      manifest_sha256: null
    },
    feedback: {
      reason: 'integration',
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
      language: document.documentElement.lang || navigator.language || 'en',
      canonical_page: 'https://brali-lifeos.github.io/for-ai/integrations/report/'
    }
  };
}

function json(event) {
  return JSON.stringify(event, null, 2);
}

function githubDraft(event) {
  const body = [
    '## Brali integration outcome',
    '',
    '### Privacy-light event envelope',
    '',
    '```json',
    json(event),
    '```',
    '',
    'This event intentionally excludes prompts, API keys, personal data, and user identifiers.',
    '',
    '### Optional public context',
    '',
    '<!-- Which public integration did you exercise? What worked or failed? Remove anything you do not want to publish. -->'
  ].join('\n');
  return `${GITHUB_ISSUES_NEW}?title=${encodeURIComponent('Brali integration outcome')}&body=${encodeURIComponent(body)}`;
}

function download(event) {
  const blob = new Blob([`${json(event)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `brali-integration-${event.event_id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  statusEl.textContent = 'Loading current Brali dataset version…';
  try {
    await loadDatasetVersion();
    currentEvent = buildEvent('download');
    previewEl.textContent = json(currentEvent);
    githubLink.href = githubDraft(buildEvent('github-issue'));
    previewWrap.hidden = false;
    statusEl.textContent = 'Local integration event created. Nothing has been sent.';
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

downloadButton.addEventListener('click', () => {
  if (!currentEvent) return;
  download(currentEvent);
  statusEl.textContent = 'Event JSON downloaded locally. Brali has not received or counted it.';
});

shareButton.addEventListener('click', async () => {
  if (!navigator.share) {
    statusEl.textContent = 'Native sharing is unavailable here. Download the JSON or open the GitHub draft instead.';
    return;
  }
  try {
    const event = buildEvent('native-share');
    await navigator.share({ title: 'Brali integration outcome', text: json(event) });
    statusEl.textContent = 'Share sheet opened. This is not a reviewed Brali observation unless you deliberately send it to a review path.';
  } catch (error) {
    statusEl.textContent = `Nothing was sent. ${error?.message || 'Sharing was cancelled.'}`;
  }
});

githubLink.addEventListener('click', () => {
  if (!datasetVersion) return;
  githubLink.href = githubDraft(buildEvent('github-issue'));
});
