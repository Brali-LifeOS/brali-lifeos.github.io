import { newRunId, buildRunBundle, bundleJson, downloadRunBundle, shareRunBundle, githubRunDraft } from './outcome-run.js';

const $ = selector => document.querySelector(selector);
const statusEl = $('#runner-status');
const card = $('#protocol-card');
const controls = $('#runner-controls');
const errorBox = $('#runner-error');
const evidenceEl = $('#protocol-evidence');
const titleEl = $('#protocol-title');
const descriptionEl = $('#protocol-description');
const actionEl = $('#protocol-action');
const checkInEl = $('#protocol-check-in');
const recordLink = $('#protocol-source-page');
const sourceWrap = $('#protocol-source-wrap');
const sourceLink = $('#protocol-source');
const startButton = $('#run-start');
const completeButton = $('#run-complete');
const runStateCopy = $('#run-state-copy');
const checkInCard = $('#check-in-card');
const helpfulButton = $('#run-helpful');
const notHelpfulButton = $('#run-not-helpful');
const exportCard = $('#run-export-card');
const preview = $('#run-event-preview');
const downloadButton = $('#run-download');
const shareButton = $('#run-share');
const githubLink = $('#run-github');
const exportStatus = $('#run-export-status');

let protocol = null;
let datasetVersion = null;
let runId = null;
let startedAt = null;
let completedAt = null;
let helpful = null;

function slugFromParam(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('brali:protocol:')) return raw.slice('brali:protocol:'.length);
  if (raw.startsWith('brali:')) return raw.slice('brali:'.length);
  if (/^https:\/\/brali-lifeos\.github\.io\/life-os\//.test(raw)) {
    return raw.replace(/^https:\/\/brali-lifeos\.github\.io\/life-os\//, '').replace(/\/$/, '');
  }
  return raw.replace(/^\/+|\/+$/g, '');
}

function canonicalProtocolId(entry) {
  return `brali:protocol:${entry.slug}`;
}

function runnerUrl(entry) {
  const url = new URL('/run/', location.origin);
  url.searchParams.set('protocol', canonicalProtocolId(entry));
  return url;
}

async function loadData() {
  const [protocolResponse, manifestResponse] = await Promise.all([
    fetch('/life-os/datasets/protocols.json', { headers: { accept: 'application/json' } }),
    fetch('/life-os/datasets/manifest.json', { headers: { accept: 'application/json' } })
  ]);
  if (!protocolResponse.ok) throw new Error(`protocols.json returned ${protocolResponse.status}`);
  if (!manifestResponse.ok) throw new Error(`manifest.json returned ${manifestResponse.status}`);
  const [protocols, manifest] = await Promise.all([protocolResponse.json(), manifestResponse.json()]);
  return { protocols, manifest };
}

function resetRun() {
  runId = null;
  startedAt = null;
  completedAt = null;
  helpful = null;
  startButton.disabled = false;
  completeButton.disabled = true;
  helpfulButton.disabled = true;
  notHelpfulButton.disabled = true;
  checkInCard.hidden = true;
  exportCard.hidden = true;
  preview.textContent = '';
  exportStatus.textContent = 'Nothing has been sent.';
  runStateCopy.textContent = 'Start when you are actually ready to try the action. Opening this page does not count as doing it.';
  statusEl.textContent = 'Ready';
}

function renderProtocol(entry) {
  evidenceEl.textContent = entry.evidence?.status || 'trusted';
  titleEl.textContent = entry.title;
  descriptionEl.textContent = entry.description || '';
  actionEl.textContent = entry.action || 'Open the full Brali record for the current action.';
  checkInEl.textContent = entry.check_in || 'What happened when you tried the action?';
  recordLink.href = entry.url;
  if (entry.evidence?.status === 'reviewed' && entry.evidence?.source_url) {
    sourceWrap.hidden = false;
    sourceLink.href = entry.evidence.source_url;
  } else {
    sourceWrap.hidden = true;
    sourceLink.removeAttribute('href');
  }
  card.hidden = false;
  controls.hidden = false;
  errorBox.hidden = true;
  history.replaceState({}, '', runnerUrl(entry));
  resetRun();
}

function currentBundle(channel) {
  if (!protocol || !runId || !startedAt) throw new Error('Start the protocol first.');
  return buildRunBundle({
    runId,
    protocolId: canonicalProtocolId(protocol),
    datasetVersion,
    startedAt,
    completedAt,
    helpful,
    channel
  });
}

function refreshExport() {
  if (!runId || !startedAt) return;
  const bundle = currentBundle('download');
  preview.textContent = bundleJson(bundle);
  exportCard.hidden = false;
  const githubBundle = currentBundle('github-issue');
  githubLink.href = githubRunDraft(githubBundle, protocol.title);
}

function startRun() {
  runId = newRunId();
  startedAt = new Date().toISOString();
  completedAt = null;
  helpful = null;
  startButton.disabled = true;
  completeButton.disabled = false;
  checkInCard.hidden = true;
  helpfulButton.disabled = true;
  notHelpfulButton.disabled = true;
  statusEl.textContent = 'In progress';
  runStateCopy.textContent = 'The run started. Try the actual action; the page is only a guide.';
  refreshExport();
}

function completeRun() {
  if (!runId || !startedAt) return;
  completedAt = new Date().toISOString();
  completeButton.disabled = true;
  checkInCard.hidden = false;
  helpfulButton.disabled = false;
  notHelpfulButton.disabled = false;
  statusEl.textContent = 'Completed — check the signal';
  runStateCopy.textContent = 'Done is recorded locally for this run. Now answer the check-in before judging the protocol.';
  refreshExport();
}

function setHelpful(value) {
  if (!completedAt) return;
  helpful = value;
  helpfulButton.disabled = true;
  notHelpfulButton.disabled = true;
  statusEl.textContent = value ? 'Completed · Helpful' : 'Completed · Not helpful';
  exportStatus.textContent = value
    ? 'Helpful selected. The bundle is still local until you choose an export path.'
    : 'Not helpful selected. That is useful evidence too. The bundle is still local until you choose an export path.';
  refreshExport();
}

startButton.addEventListener('click', startRun);
completeButton.addEventListener('click', completeRun);
helpfulButton.addEventListener('click', () => setHelpful(true));
notHelpfulButton.addEventListener('click', () => setHelpful(false));
downloadButton.addEventListener('click', () => {
  try {
    const bundle = currentBundle('download');
    downloadRunBundle(bundle);
    exportStatus.textContent = 'Run JSON downloaded locally. Brali has not received or counted it.';
  } catch (error) {
    exportStatus.textContent = error.message;
  }
});
shareButton.addEventListener('click', async () => {
  try {
    const bundle = currentBundle('native-share');
    const shared = await shareRunBundle(bundle);
    exportStatus.textContent = shared
      ? 'Your device share sheet opened. This still does not become a reviewed Brali observation unless you deliberately send it to a review path.'
      : 'Native share is unavailable here. Download the bundle or open the GitHub draft instead.';
  } catch (error) {
    exportStatus.textContent = `Nothing was sent. ${error?.message || 'Sharing was cancelled.'}`;
  }
});
githubLink.addEventListener('click', () => {
  if (!protocol || !runId) return;
  githubLink.href = githubRunDraft(currentBundle('github-issue'), protocol.title);
});

async function init() {
  const requested = slugFromParam(new URL(location.href).searchParams.get('protocol'));
  if (!requested) {
    statusEl.textContent = 'Choose a trusted protocol first';
    errorBox.hidden = false;
    return;
  }
  try {
    const { protocols, manifest } = await loadData();
    datasetVersion = manifest.dataset_version || '1.0.0';
    protocol = (protocols.entries || []).find(entry =>
      entry.slug === requested ||
      entry.protocol_id === requested ||
      canonicalProtocolId(entry) === `brali:protocol:${requested}`
    );
    if (!protocol || !['reviewed', 'practical'].includes(protocol.evidence?.status)) {
      statusEl.textContent = 'No trusted runnable protocol';
      errorBox.hidden = false;
      return;
    }
    renderProtocol(protocol);
  } catch (error) {
    statusEl.textContent = 'Could not load the trusted protocol feed';
    errorBox.hidden = false;
    errorBox.querySelector('p').textContent = error.message;
  }
}

init();
