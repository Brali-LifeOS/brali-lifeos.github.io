import { readFile } from 'node:fs/promises';

const [homepage, matcher, focusRaw] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('homepage.js', 'utf8'),
  readFile('.arwp/site-focus.json', 'utf8')
]);

const focus = JSON.parse(focusRaw);

if (focus.version !== '0.3' || focus.homepage?.primaryLane !== 'find') {
  throw new Error('Site Focus v0.3 must keep the homepage on the Find lane.');
}

for (const id of ['protocol-trust', 'protocol-source', 'protocol-limit']) {
  if (!homepage.includes(`id="${id}"`)) {
    throw new Error(`Homepage protocol matcher lacks dynamic ${id} metadata.`);
  }
}

for (const staleClaim of ['Evidence Score', '27 studies']) {
  if (homepage.includes(staleClaim)) {
    throw new Error(`Homepage contains protocol-specific evidence metadata that can become stale: ${staleClaim}`);
  }
}

for (const field of ['trust', 'source', 'limit']) {
  if (!matcher.includes(`${field}.textContent = protocol.${field}`)) {
    throw new Error(`Homepage matcher does not update protocol ${field} metadata.`);
  }
}

if (!matcher.includes("fetch('/homepage-matcher.json'")) {
  throw new Error('Homepage matcher must load the generated canonical homepage payload.');
}
if (matcher.includes('const protocols = {')) {
  throw new Error('Homepage matcher must not ship duplicated hardcoded protocol records.');
}
if (!matcher.includes('No fallback recommendation is substituted without its evidence state and provenance.')) {
  throw new Error('Homepage matcher must fail closed when canonical protocol metadata is unavailable.');
}

const problemFirst = homepage.indexOf('Start with the problem');
const evidence = homepage.indexOf('Evidence without theatre');
const reuse = homepage.indexOf('aria-label="Ways to inspect or reuse Brali"');
if (!(problemFirst >= 0 && evidence > problemFirst && reuse > evidence)) {
  throw new Error('Homepage must show problem-first discovery and evidence before Research/AI reuse surfaces.');
}

if (!homepage.includes('not a diagnosis, treatment, or guaranteed outcome')) {
  throw new Error('Homepage lost its explicit bounded-use statement.');
}

console.log(JSON.stringify({
  ok: true,
  contract: 'Cite Goose Site Focus v0.3',
  primaryLane: focus.homepage.primaryLane,
  dynamicEvidenceMetadata: true,
  canonicalMatcherPayload: true,
  failClosedWithoutCanonicalData: true,
  staleUniversalEvidenceClaims: false,
  secondaryReuseAfterEvidence: true
}, null, 2));
