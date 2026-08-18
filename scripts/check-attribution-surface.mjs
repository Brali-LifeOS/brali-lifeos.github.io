import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const mustContain = async (file, values) => {
  const text = await readFile(path.join(root, file), 'utf8');
  for (const value of values) if (!text.includes(value)) throw new Error(`${file} missing attribution/discovery marker: ${value}`);
};

await mustContain('CITATION.cff', ['Dzmitryi', 'Kharlanau', 'Brali Practical Knowledge Library']);
await mustContain('ATTRIBUTION.md', ['Brali — Dzmitryi Kharlanau', 'canonical Brali URL']);
await mustContain('index.html', ['/for-ai/quickstart/', '/citation/', 'AI agents can cite']);
await mustContain('for-ai/index.html', ['/for-ai/quickstart/', 'Brali — Dzmitryi Kharlanau', '/citation/']);
await mustContain('for-ai/agent-instruction.txt', ['canonical Brali ID', 'Dzmitryi Kharlanau', 'evidence status']);
await mustContain('llms.txt', ['Citation and attribution', 'Dzmitryi Kharlanau', '/api/v1/']);

const protocolFeed = JSON.parse(await readFile(path.join(root, 'life-os/datasets/protocols.json'), 'utf8'));
if (protocolFeed.creator !== 'Dzmitryi Kharlanau' || !protocolFeed.citation_url?.endsWith('/citation/')) throw new Error('Protocol feed attribution metadata missing.');
const apiIndex = JSON.parse(await readFile(path.join(root, 'api/v1/index.json'), 'utf8'));
if (apiIndex.attribution?.creator !== 'Dzmitryi Kharlanau') throw new Error('API attribution metadata missing.');
const manifest = JSON.parse(await readFile(path.join(root, 'life-os/datasets/manifest.json'), 'utf8'));
if (manifest.attribution?.creator !== 'Dzmitryi Kharlanau') throw new Error('Dataset manifest attribution metadata missing.');

console.log('Attribution and AI discovery surface verified.');
