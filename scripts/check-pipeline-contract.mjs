import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const definition = JSON.parse(await readFile(path.join(root, 'data/pipeline-stages.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const fail = message => { throw new Error(`Pipeline contract check failed: ${message}`); };

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

const flattenCanonical = (groupId, phase) => definition.groups[groupId]
  .map(id => stageById.get(id))
  .flatMap(stage => {
    if (!stage.canonical_parity || stage.phase !== phase) fail(`${stage.id}: ${groupId} group contains non-canonical or wrong-phase stage`);
    return stage.commands;
  });
const canonicalBuild = flattenCanonical('build', 'build');
const canonicalCheck = flattenCanonical('check', 'check');
const packageBuild = splitChain(packageJson.scripts?.[definition.rules?.canonical_build_script]);
const packageCheck = splitChain(packageJson.scripts?.[definition.rules?.canonical_check_script]);

function compare(label, staged, canonical) {
  if (JSON.stringify(staged) === JSON.stringify(canonical)) return;
  const max = Math.max(staged.length, canonical.length);
  let first = 0;
  while (first < max && staged[first] === canonical[first]) first += 1;
  fail(`${label} parity drift near command ${first + 1}: staged=${staged[first] ?? '<missing>'}; package=${canonical[first] ?? '<missing>'}`);
}
compare('build', canonicalBuild, packageBuild);
compare('check', canonicalCheck, packageCheck);

for (const [label, commands] of [['build', canonicalBuild], ['check', canonicalCheck]]) {
  if (new Set(commands).size !== commands.length) {
    const duplicate = commands.find((command, index) => commands.indexOf(command) !== index);
    fail(`${label} command appears more than once: ${duplicate}`);
  }
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

console.log(`Pipeline contract verified: ${definition.stages.length} stages; build parity=${canonicalBuild.length} commands; check parity=${canonicalCheck.length} commands; supplemental=${definition.groups.supplemental.length} stages.`);
