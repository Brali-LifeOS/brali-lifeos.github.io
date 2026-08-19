import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://brali-lifeos.github.io';
const page = path.join(ROOT, 'for-ai', 'query', 'index.html');
if (!fs.existsSync(page)) throw new Error('Missing for-ai/query/index.html');

const forAiPath = path.join(ROOT, 'for-ai', 'index.html');
let forAi = fs.readFileSync(forAiPath, 'utf8');
if (!forAi.includes('/for-ai/query/')) {
  const card = '<article class="card"><span class="card-label">Try it</span><h3>Ask Brali</h3><p>Run a zero-install evidence-aware query in your browser, then copy the grounded packet into your agent.</p><p><a href="/for-ai/query/">Open Query Playground →</a></p></article>';
  forAi = forAi.replace('<div class="grid two">', `<div class="grid two">${card}`);
  fs.writeFileSync(forAiPath, forAi);
}

const llmsPath = path.join(ROOT, 'llms.txt');
let llms = fs.readFileSync(llmsPath, 'utf8');
if (!llms.includes('/for-ai/query/')) {
  llms += `\n## Zero-install Query Playground\n- Human/browser entry: ${BASE}/for-ai/query/\n- Shareable query form: ${BASE}/for-ai/query/?q=<URL-encoded-question>\n- The page reads API v1 in-browser, filters normal recommendations to reviewed/practical protocols, preserves evidence state/provenance, and returns no normal recommendation for safety-sensitive requests.\n`;
  fs.writeFileSync(llmsPath, llms);
}

const adoptionPath = path.join(ROOT, 'data', 'adoption.json');
if (fs.existsSync(adoptionPath)) {
  const adoption = JSON.parse(fs.readFileSync(adoptionPath, 'utf8'));
  adoption.query_playground = `${BASE}/for-ai/query/`;
  adoption.adoption_checklist ||= [];
  const item = 'Try the zero-install Query Playground before writing custom integration code; copy its agent context or JSON packet to inspect the contract.';
  if (!adoption.adoption_checklist.includes(item)) adoption.adoption_checklist.splice(1, 0, item);
  fs.writeFileSync(adoptionPath, `${JSON.stringify(adoption, null, 2)}\n`);
}

console.log('Query playground discovery wired: /for-ai/, llms.txt, and adoption contract updated.');
