import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function validateProductIdentity() {
  const identity = json('data/site-identity.json');
  const adoption = json('data/adoption.json');
  const readme = read('README.md');
  const expectedSteps = ['ask', 'decide', 'inspect', 'act', 'reuse'];
  const expectedRoutes = ['/for-ai/query/', '/problems/', '/life-os/', '/run/', '/for-ai/'];

  assert(identity.siteName === 'Brali', 'Public product name must remain Brali.');
  assert(/evidence-informed decision/i.test(identity.homepageTitle), 'Homepage title must explain Brali as an evidence-informed decision layer.');
  assert(/start with a real problem/i.test(identity.homepageDescription), 'Homepage description must begin from a real problem rather than generic content breadth.');
  assert(adoption.product_identity?.publisher === 'MetalHatsCats', 'Product identity must be maintained by MetalHatsCats.');
  assert(adoption.product_identity?.human_contract === 'Problem -> bounded recommendation -> protocol -> action', 'Human product contract drifted.');
  assert(/canonical problem/i.test(adoption.product_identity?.machine_contract || ''), 'Machine product contract must route through canonical Problems.');
  assert((adoption.human_funnel ?? []).length === expectedSteps.length, 'Human adoption funnel must keep five deliberate stages.');
  assert(JSON.stringify(adoption.human_funnel.map(item => item.step)) === JSON.stringify(expectedSteps), 'Human adoption funnel stage order drifted.');
  assert(JSON.stringify(adoption.human_funnel.map(item => item.route)) === JSON.stringify(expectedRoutes), 'Human adoption funnel routes drifted.');
  assert(readme.includes('evidence-informed decision layer'), 'README must state the product identity directly.');
  assert(readme.includes('Problem -> bounded recommendation -> Protocol -> action'), 'README must expose the human adoption contract.');
  assert(readme.includes('/problems/'), 'README must expose the canonical Problem Discovery Graph.');
  assert(readme.includes('MetalHatsCats, Brali Practical Knowledge Library'), 'README citation must match the maintained public entity identity.');
  assert(!readme.includes('Dzmitryi Kharlanau'), 'README must not drift back to former personal public attribution.');

  return { publisher: adoption.product_identity.publisher, funnel_steps: expectedSteps.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateProductIdentity();
  console.log(`Product identity verified: publisher=${result.publisher}; human funnel=${result.funnel_steps} stages; problem-first human and machine contracts aligned.`);
}
