#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { answerWithBrali, buildMcpPlan } from './reference-agent-lib.mjs';

const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const root = path.resolve(value('--root') || process.cwd());
const scenarioId = value('--scenario') || 'memory';
const scenarios = JSON.parse(await fs.readFile(path.join(root, 'data/reference-agent-scenarios.json'), 'utf8'));
const scenario = (scenarios.scenarios || []).find(item => item.id === scenarioId);
if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
const packet = await answerWithBrali(scenario.question, { root });
console.log(JSON.stringify(buildMcpPlan(packet), null, 2));
