import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const definition = JSON.parse(await readFile(path.join(root, 'data/pipeline-stages.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const fail = message => { throw new Error(`Pipeline definition check failed: ${message}`); };

const splitChain = value => String(value ?? '')
  .split(/\s*&&\s*/)
  .map(command => command.trim())
  .filter(Boolean);
const stageById = new Map();

if (definition.schema_version !== 1) fail(`unexpected schema_version ${definition.schema_version}`);
if (definition.report_schema_version !== 1) fail(`unexpected report_schema_version ${definition.report_schema_version}`);
if (!(definition.stages?.length >= 10)) fail('expected at least ten named stages');

for (const stage of definition.stages) {
  if (!stage.id || stageById.has(stage.id)) fail(`missing or duplicate stage id ${stage.id}`);
  stageById.set(stage.id, stage);
  if (!['build', 'check', 'supplemental'].includes(stage.phase)) fail(`${stage.id}: invalid phase ${stage.phase}`);
  if (typeof stage.canonical_parity !== 'boolean') fail(`${stage.id}: canonical_parity must be boolean`);
  if (!(stage.description?.length >= 30)) fail(`${stage.id}: description is too weak`);
  if (!(stage.commands?.length >= 1)) fail(`${stage.id}: commands are required`);
  if (new Set(stage.commands).size !== stage.commands.length) fail(`${stage.id}: duplicate command within stage`);
}

for (const [groupId, stageIds] of Object.entries(definition.groups ?? {})) {
  if (!Array.isArray(stageIds) || !stageIds.length) fail(`${groupId}: group is empty`);
  if (new Set(stageIds).size !== stageIds.length) fail(`${groupId}: duplicate stage in group`);
  for (const stageId of stageIds) if (!stageById.has(stageId)) fail(`${groupId}: unknown stage ${stageId}`);
}

const expectedAll = [
  ...(definition.groups?.build ?? []),
  ...(definition.groups?.check ?? []),
  ...(definition.groups?.supplemental ?? []),
];
if (JSON.stringify(definition.groups?.all) !== JSON.stringify(expectedAll)) fail('all group does not preserve build -> check -> supplemental order');

const canonicalBuild = definition.groups.build
  .map(id => stageById.get(id))
  .flatMap(stage => {
    if (!stage.canonical_parity || stage.phase !== 'build') fail(`${stage.id}: build group contains non-canonical stage`);
    return stage.commands;
  });
const canonicalCheck = definition.groups.check
  .map(id => stageById.get(id))
  .flatMap(stage => {
    if (!stage.canonical_parity || stage.phase !== 'check') fail(`${stage.id}: check group contains non-canonical stage`);
    return stage.commands;
  });
const packageBuild = splitChain(packageJson.scripts?.[definition.rules?.canonical_build_script]);
const packageCheck = splitChain(packageJson.scripts?.[definition.rules?.canonical_check_script]);

if (JSON.stringify(canonicalBuild) !== JSON.stringify(packageBuild)) {
  const first = Math.max(0, canonicalBuild.findIndex((command, index) => command !== packageBuild[index]));
  fail(`build parity drift near command ${first + 1}: staged=${canonicalBuild[first] ?? '<missing>'}; package=${packageBuild[first] ?? '<missing>'}`);
}
if (JSON.stringify(canonicalCheck) !== JSON.stringify(packageCheck)) {
  const first = Math.max(0, canonicalCheck.findIndex((command, index) => command !== packageCheck[index]));
  fail(`check parity drift near command ${first + 1}: staged=${canonicalCheck[first] ?? '<missing>'}; package=${packageCheck[first] ?? '<missing>'}`);
}

const allCanonicalCommands = [...canonicalBuild, ...canonicalCheck];
if (new Set(allCanonicalCommands).size !== allCanonicalCommands.length) {
  const duplicate = allCanonicalCommands.find((command, index) => allCanonicalCommands.indexOf(command) !== index);
  fail(`canonical command appears more than once across build/check: ${duplicate}`);
}

for (const stage of definition.stages) {
  for (const command of stage.commands) {
    const tokens = command.split(/\s+/);
    let rel = null;
    if ((tokens[0] === 'node' || tokens[0] === 'python3') && tokens[1] === '--check') rel = tokens[2];
    else if (tokens[0] === 'node' || tokens[0] === 'python3') rel = tokens[1];
    if (rel && !rel.startsWith('-')) {
      try {
        await access(path.join(root, rel));
      } catch {
        fail(`${stage.id}: command target does not exist: ${rel}`);
      }
    }
  }
}

for (const required of ['check-outcomes', 'check-control-plane']) {
  const stage = stageById.get(required);
  if (!stage || stage.canonical_parity || stage.phase !== 'supplemental') fail(`${required}: required supplemental stage is malformed`);
}
if (definition.rules?.fail_fast !== true || definition.rules?.preserve_command_order !== true) fail('fail-fast and ordering rules must remain enabled');
if (definition.rules?.supplemental_checks_may_not_replace_canonical_commands !== true) fail('supplemental replacement guard is missing');

console.log(`Pipeline definition verified: ${definition.stages.length} stages; build parity=${canonicalBuild.length} commands; check parity=${canonicalCheck.length} commands; supplemental=${definition.groups.supplemental.length} stages.`);
