#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { answerWithBrali } from './reference-agent-lib.mjs';

const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const scenarioId = value('--scenario');
const apiBase = value('--api-base');
const root = path.resolve(value('--root') || process.cwd());
let question = value('--question');

if (!question && scenarioId) {
  const scenarios = JSON.parse(await fs.readFile(path.join(root, 'data/reference-agent-scenarios.json'), 'utf8'));
  const scenario = (scenarios.scenarios || []).find(item => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  question = scenario.question;
}
if (!question && args.length && !args[0].startsWith('--')) question = args[0];
if (!question) {
  console.error('Usage: node examples/javascript/reference-agent.mjs --scenario sleep [--api-base https://brali-lifeos.github.io/api/v1]');
  console.error('   or: node examples/javascript/reference-agent.mjs --question "How can I use active recall?"');
  process.exit(2);
}
const packet = await answerWithBrali(question, { root, apiBase });
console.log(JSON.stringify(packet, null, 2));
