import { queryBrali, buildAgentContext, buildCitation } from './retrieval.mjs';
import { newQueryId, buildQueryFeedbackEvent, feedbackLabel, eventJson, downloadOutcomeEvent, shareOutcomeEvent, githubOutcomeDraft } from './outcome-feedback.js';

const $ = selector => document.querySelector(selector);
const form = $('#query-form');
const input = $('#question');
const statusEl = $('#status');
const resultsEl = $('#results');
const shareEl = $('#share-link');
const copyContext = $('#copy-context');
const copyCitation = $('#copy-citation');
const copyJson = $('#copy-json');
const outcomeChoices = [...document.querySelectorAll('[data-outcome-choice]')];
const outcomePreview = $('#outcome-preview');
const outcomeStatus = $('#outcome-feedback-status');
const outcomeEventPreview = $('#outcome-event-preview');
const includeQuery = $('#feedback-include-query');
const outcomeDownload = $('#outcome-download');
const outcomeShare = $('#outcome-share');
const outcomeGithub = $('#outcome-github');
let lastPacket = null;
let lastQuestion = '';
let lastQueryId = null;
let currentOutcomeChoice = null;
let previewEvent = null;
let apiData = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));

async function loadApi() {
  if (apiData) return apiData;
  statusEl.textContent = 'Loading Brali API…';
  const names = ['topics.json', 'identity.json', 'flagships.json', 'evidence-decisions.json'];
  const [topics, identity, flagships, decisions] = await Promise.all(names.map(async name => {
    const response = await fetch(`/api/v1/${name}`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${name} returned ${response.status}`);
    return response.json();
  }));
  apiData = { topics, identity, flagships, decisions };
  return apiData;
}

function setCopyState(enabled) {
  for (const button of [copyContext, copyCitation, copyJson]) button.disabled = !enabled;
}

function resetOutcomePreview() {
  currentOutcomeChoice = null;
  previewEvent = null;
  if (outcomePreview) outcomePreview.hidden = true;
  if (outcomeEventPreview) outcomeEventPreview.textContent = '';
  if (outcomeStatus) outcomeStatus.textContent = '';
  if (includeQuery) includeQuery.checked = false;
  if (outcomeDownload) outcomeDownload.disabled = true;
  if (outcomeShare) outcomeShare.disabled = true;
  if (outcomeGithub) outcomeGithub.href = 'https://github.com/Brali-LifeOS/brali-lifeos.github.io/issues/new';
}

function setOutcomeState(enabled) {
  for (const button of outcomeChoices) button.disabled = !enabled;
  if (!enabled) resetOutcomePreview();
}

function buildOutcome(channel) {
  if (!lastPacket || !lastQueryId || !currentOutcomeChoice) throw new Error('Run a Brali query and choose a feedback signal first.');
  return buildQueryFeedbackEvent({
    queryId: lastQueryId,
    packet: lastPacket,
    choice: currentOutcomeChoice,
    channel
  });
}

function refreshGithubDraft() {
  if (!currentOutcomeChoice || !outcomeGithub) return;
  const event = buildOutcome('github-issue');
  outcomeGithub.href = githubOutcomeDraft(event, {
    question: lastQuestion,
    includeQuery: includeQuery?.checked === true
  });
}

function chooseOutcome(choice) {
  currentOutcomeChoice = choice;
  previewEvent = buildOutcome('download');
  outcomePreview.hidden = false;
  outcomeEventPreview.textContent = eventJson(previewEvent);
  outcomeStatus.textContent = `${feedbackLabel(choice)} selected. Review the privacy-light envelope, then choose an export path. Nothing has been sent.`;
  outcomeDownload.disabled = false;
  outcomeShare.disabled = false;
  refreshGithubDraft();
}

function render(packet) {
  lastPacket = packet;
  setCopyState(true);
  const topicHtml = packet.route.topics.length
    ? packet.route.topics.map(topic => `<span class="query-pill">${escapeHtml(topic.title)} <code>${escapeHtml(topic.canonical_id)}</code></span>`).join('')
    : '<span class="muted">No normal Topic route.</span>';

  let body = `<div class="query-meta"><strong>Status:</strong> <code>${escapeHtml(packet.status)}</code>${packet.dataset_version ? ` · dataset <code>${escapeHtml(packet.dataset_version)}</code>` : ''}</div><div class="query-topics">${topicHtml}</div>`;

  if (packet.safety?.blocked) {
    body += `<div class="callout"><strong>Safety boundary</strong><p>${escapeHtml(packet.safety.reason)}</p><p>Brali does not convert this query into a normal self-help recommendation.</p></div>`;
  } else if (packet.status === 'boundary-only') {
    body += '<div class="callout"><strong>Evidence boundary only.</strong><p>Brali found reviewed evidence relevant to the claim, but it does not justify turning that evidence into a normal practical recommendation.</p></div>';
  } else if (!packet.recommendations.length) {
    body += '<div class="callout"><strong>No trusted Brali answer.</strong><p>The current reviewed/practical corpus does not provide a sufficiently grounded recommendation for this wording. That is a valid result, not a broken search box.</p></div>';
  } else {
    body += '<div class="query-results-grid">';
    for (const item of packet.recommendations) {
      const source = item.provenance.source_url ? `<a href="${escapeHtml(item.provenance.source_url)}" target="_blank" rel="noopener">Reviewed source</a>` : '<span class="muted">No direct reviewed-source link on this record</span>';
      body += `<article class="card query-result"><span class="card-label">${escapeHtml(item.evidence_state)}</span><h2>${escapeHtml(item.title)}</h2><p><code>${escapeHtml(item.canonical_id)}</code></p>${item.action ? `<p>${escapeHtml(item.action)}</p>` : ''}${item.check_in ? `<p><strong>Check-in:</strong> ${escapeHtml(item.check_in)}</p>` : ''}<p><a href="${escapeHtml(item.provenance.record_url)}">Open Brali record</a> · ${source}</p></article>`;
    }
    body += '</div>';
  }

  if (packet.evidence_boundaries.length) {
    body += '<section class="query-boundaries"><h2>Evidence boundaries</h2>';
    for (const boundary of packet.evidence_boundaries) {
      body += `<article class="callout"><p><code>${escapeHtml(boundary.canonical_id)}</code></p><p><strong>Supported:</strong> ${escapeHtml(boundary.supported_claim || boundary.decision)}</p>${boundary.unsupported_or_overstated_claims?.length ? `<p><strong>Do not claim:</strong> ${escapeHtml(boundary.unsupported_or_overstated_claims.join('; '))}</p>` : ''}${boundary.limitations?.length ? `<p><strong>Limitations:</strong> ${escapeHtml(boundary.limitations.join('; '))}</p>` : ''}${boundary.source_url ? `<p><a href="${escapeHtml(boundary.source_url)}" target="_blank" rel="noopener">Reviewed evidence source</a></p>` : ''}</article>`;
    }
    body += '</section>';
  }
  resultsEl.innerHTML = body;
  statusEl.textContent = packet.status === 'trusted-answer' ? `Found ${packet.recommendations.length} trusted Brali protocol${packet.recommendations.length === 1 ? '' : 's'}.` : packet.status === 'boundary-only' ? 'Reviewed evidence boundary returned; no normal recommendation.' : 'No normal trusted recommendation returned.';
}

async function run(question, push = true) {
  const q = String(question || '').trim();
  if (!q) return;
  input.value = q;
  lastQuestion = q;
  lastQueryId = newQueryId();
  setCopyState(false);
  setOutcomeState(false);
  resultsEl.innerHTML = '<p class="muted">Resolving Topic and high-trust Protocols…</p>';
  try {
    const data = await loadApi();
    const packet = queryBrali(q, data);
    render(packet);
    setOutcomeState(true);
    const url = new URL(location.href);
    url.searchParams.set('q', q);
    if (push) history.pushState({ q }, '', url);
    shareEl.href = url;
    shareEl.textContent = 'Copy/share this query URL';
  } catch (error) {
    statusEl.textContent = 'Could not load Brali API.';
    resultsEl.innerHTML = `<div class="callout"><strong>API error</strong><p>${escapeHtml(error.message)}</p></div>`;
    setOutcomeState(false);
  }
}

form.addEventListener('submit', event => { event.preventDefault(); run(input.value); });
for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click', () => run(button.dataset.example));
window.addEventListener('popstate', () => { const q = new URL(location.href).searchParams.get('q'); if (q) run(q, false); });

for (const button of outcomeChoices) {
  button.addEventListener('click', () => chooseOutcome(button.dataset.outcomeChoice));
}
if (includeQuery) includeQuery.addEventListener('change', refreshGithubDraft);
if (outcomeDownload) outcomeDownload.addEventListener('click', () => {
  if (!previewEvent) return;
  downloadOutcomeEvent(previewEvent);
  outcomeStatus.textContent = 'Event JSON downloaded locally. Brali still has not received or counted it.';
});
if (outcomeShare) outcomeShare.addEventListener('click', async () => {
  try {
    const event = buildOutcome('native-share');
    const shared = await shareOutcomeEvent(event);
    outcomeStatus.textContent = shared
      ? 'Your device share sheet was used. This does not become a reviewed Brali observation unless you deliberately send it to a review path.'
      : 'Native sharing is not available here. Download the event JSON or open the GitHub draft instead.';
  } catch (error) {
    outcomeStatus.textContent = `Nothing was sent. ${error?.message || 'Sharing was cancelled.'}`;
  }
});
if (outcomeGithub) outcomeGithub.addEventListener('click', refreshGithubDraft);

async function copy(text, button) {
  await navigator.clipboard.writeText(text);
  const prior = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = prior; }, 1200);
}
copyContext.addEventListener('click', () => lastPacket && copy(buildAgentContext(lastPacket), copyContext));
copyCitation.addEventListener('click', () => lastPacket && copy(buildCitation(lastPacket), copyCitation));
copyJson.addEventListener('click', () => lastPacket && copy(JSON.stringify(lastPacket, null, 2), copyJson));
shareEl.addEventListener('click', async event => {
  event.preventDefault();
  const url = shareEl.href || location.href;
  if (navigator.share) { try { await navigator.share({ title: 'Brali query', url }); return; } catch {} }
  await navigator.clipboard.writeText(url);
  shareEl.textContent = 'Query URL copied';
});

const initial = new URL(location.href).searchParams.get('q');
if (initial) run(initial, false);
else {
  statusEl.textContent = 'Ask about focus, sleep, memory, habits, stress, learning, movement, communication, or another covered Topic.';
  setCopyState(false);
  setOutcomeState(false);
}
