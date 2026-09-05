const GITHUB_ISSUES_NEW = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new';
const BASE = 'https://brali-lifeos.github.io';

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function newRunId() {
  return uuid();
}

function baseEvent({ runId, protocolId, datasetVersion, eventType, channel, occurredAt }) {
  return {
    schema_version: 1,
    event_id: uuid(),
    event_type: eventType,
    occurred_at: occurredAt || new Date().toISOString(),
    run_id: runId,
    protocol_id: protocolId,
    client: {
      category: 'browser-runner',
      runtime: 'Brali Protocol Runner'
    },
    dataset: {
      version: datasetVersion,
      manifest_sha256: null
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
      canonical_page: `${BASE}/run/`
    }
  };
}

export function buildRunEvents({ runId, protocolId, datasetVersion, startedAt, completedAt = null, helpful = null, channel }) {
  if (!['github-issue', 'native-share', 'download'].includes(channel)) throw new Error(`Unsupported export channel: ${channel}`);
  const events = [];
  if (startedAt) events.push(baseEvent({ runId, protocolId, datasetVersion, eventType: 'protocol_started', channel, occurredAt: startedAt }));
  if (completedAt) events.push(baseEvent({ runId, protocolId, datasetVersion, eventType: 'protocol_completed', channel, occurredAt: completedAt }));
  if (completedAt && helpful != null) {
    const positive = helpful === true;
    events.push({
      ...baseEvent({ runId, protocolId, datasetVersion, eventType: positive ? 'helpful_yes' : 'helpful_no', channel, occurredAt: new Date().toISOString() }),
      feedback: {
        reason: positive ? 'helpful' : 'not-helpful',
        note_included: false
      }
    });
  }
  return events;
}

export function buildRunBundle(options) {
  const events = buildRunEvents(options);
  return {
    bundle_schema_version: 1,
    type: 'brali-protocol-run-outcome',
    protocol_id: options.protocolId,
    run_id: options.runId,
    event_count: events.length,
    events
  };
}

export function bundleJson(bundle) {
  return JSON.stringify(bundle, null, 2);
}

export function downloadRunBundle(bundle) {
  const blob = new Blob([`${bundleJson(bundle)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `brali-run-${bundle.run_id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function shareRunBundle(bundle) {
  if (!navigator.share) return false;
  await navigator.share({ title: 'Brali protocol run outcome', text: bundleJson(bundle) });
  return true;
}

export function githubRunDraft(bundle, title) {
  const body = [
    '## Brali protocol run outcome',
    '',
    `Protocol: ${title}`,
    `Protocol ID: ${bundle.protocol_id}`,
    '',
    '### Privacy-light event bundle',
    '',
    '```json',
    bundleJson(bundle),
    '```',
    '',
    'Each event excludes the raw query, personal data and user identifiers. Please review this public draft before submitting it.',
    '',
    '<!-- Optional: add only context you are comfortable publishing. Do not include secrets or personal data. -->'
  ].join('\n');
  return `${GITHUB_ISSUES_NEW}?title=${encodeURIComponent(`Protocol outcome: ${title}`)}&body=${encodeURIComponent(body)}`;
}
