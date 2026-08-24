import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const definition = JSON.parse(await readFile(path.join(root, 'data/pipeline-stages.json'), 'utf8'));
const stageById = new Map((definition.stages ?? []).map(stage => [stage.id, stage]));

function fail(message, code = 2) {
  console.error(`Staged pipeline error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = {
    group: null,
    stage: null,
    report: 'pipeline-report.json',
    dryRun: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--group') options.group = argv[++index];
    else if (arg === '--stage') options.stage = argv[++index];
    else if (arg === '--report') options.report = argv[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--list') options.list = true;
    else fail(`unknown argument ${arg}`);
  }
  return options;
}

function selectedStageIds(options) {
  if (options.stage && options.group) fail('choose either --stage or --group, not both');
  if (options.stage) return [options.stage];
  if (options.group) {
    const group = definition.groups?.[options.group];
    if (!Array.isArray(group)) fail(`unknown group ${options.group}`);
    return group;
  }
  return definition.groups?.all ?? [];
}

function durationMs(startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1_000_000;
}

async function writeReport(reportPath, report) {
  const absolute = path.resolve(root, reportPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`);
  return absolute;
}

async function appendSummary(report) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const rows = report.stages.map(stage => `| ${stage.id} | ${stage.status} | ${(stage.duration_ms / 1000).toFixed(2)} s | ${stage.commands_completed}/${stage.commands_total} |`).join('\n');
  const markdown = `\n## Brali staged pipeline\n\nStatus: **${report.status}**  \nMode: **${report.selection.type}:${report.selection.value}**  \nDuration: **${(report.duration_ms / 1000).toFixed(2)} s**\n\n| Stage | Status | Duration | Commands |\n|---|---:|---:|---:|\n${rows}\n`;
  await writeFile(summaryPath, markdown, { flag: 'a' });
}

const options = parseArgs(process.argv.slice(2));
if (options.list) {
  for (const stage of definition.stages ?? []) {
    console.log(`${stage.id}\t${stage.phase}\t${stage.commands.length}\t${stage.description}`);
  }
  process.exit(0);
}

const ids = selectedStageIds(options);
if (!ids.length) fail('no stages selected');
for (const id of ids) if (!stageById.has(id)) fail(`unknown stage ${id}`);

const reportStart = process.hrtime.bigint();
const report = {
  schema_version: definition.report_schema_version,
  pipeline_schema_version: definition.schema_version,
  name: definition.name,
  started_at: new Date().toISOString(),
  finished_at: null,
  duration_ms: 0,
  status: options.dryRun ? 'planned' : 'running',
  selection: options.stage
    ? { type: 'stage', value: options.stage }
    : { type: 'group', value: options.group || 'all' },
  fail_fast: definition.rules?.fail_fast === true,
  dry_run: options.dryRun,
  failed_stage: null,
  failed_command: null,
  stages: [],
};

for (const id of ids) {
  const stage = stageById.get(id);
  const stageStart = process.hrtime.bigint();
  const stageReport = {
    id: stage.id,
    phase: stage.phase,
    description: stage.description,
    canonical_parity: stage.canonical_parity,
    status: options.dryRun ? 'planned' : 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    duration_ms: 0,
    commands_total: stage.commands.length,
    commands_completed: 0,
    commands: [],
  };
  report.stages.push(stageReport);
  console.log(`\n=== ${stage.id}: ${stage.description} ===`);

  for (const command of stage.commands) {
    const commandStart = process.hrtime.bigint();
    const commandReport = {
      command,
      status: options.dryRun ? 'planned' : 'running',
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_ms: 0,
      exit_code: null,
    };
    stageReport.commands.push(commandReport);
    console.log(options.dryRun ? `[plan] ${command}` : `[run] ${command}`);

    if (options.dryRun) {
      commandReport.finished_at = new Date().toISOString();
      continue;
    }

    const result = spawnSync(command, {
      cwd: root,
      env: {
        ...process.env,
        BRALI_PIPELINE_STAGE: stage.id,
        BRALI_PIPELINE_COMMAND: command,
      },
      shell: true,
      stdio: 'inherit',
    });
    commandReport.duration_ms = Math.round(durationMs(commandStart));
    commandReport.finished_at = new Date().toISOString();
    commandReport.exit_code = Number.isInteger(result.status) ? result.status : 1;

    if (result.error || commandReport.exit_code !== 0) {
      commandReport.status = 'failed';
      stageReport.status = 'failed';
      stageReport.failed_command = command;
      stageReport.finished_at = new Date().toISOString();
      stageReport.duration_ms = Math.round(durationMs(stageStart));
      report.status = 'failed';
      report.failed_stage = stage.id;
      report.failed_command = command;
      report.finished_at = new Date().toISOString();
      report.duration_ms = Math.round(durationMs(reportStart));
      const absolute = await writeReport(options.report, report);
      await appendSummary(report);
      console.error(`\nFAILED ${stage.id}: ${command}`);
      console.error(`Pipeline report: ${absolute}`);
      process.exit(commandReport.exit_code || 1);
    }

    commandReport.status = 'passed';
    stageReport.commands_completed += 1;
  }

  stageReport.status = options.dryRun ? 'planned' : 'passed';
  stageReport.finished_at = new Date().toISOString();
  stageReport.duration_ms = Math.round(durationMs(stageStart));
  console.log(`${stage.id}: ${stageReport.status} in ${(stageReport.duration_ms / 1000).toFixed(2)} s`);
}

report.status = options.dryRun ? 'planned' : 'passed';
report.finished_at = new Date().toISOString();
report.duration_ms = Math.round(durationMs(reportStart));
const absolute = await writeReport(options.report, report);
await appendSummary(report);
console.log(`\nStaged pipeline ${report.status}: ${report.stages.length} stage(s), ${(report.duration_ms / 1000).toFixed(2)} s.`);
console.log(`Pipeline report: ${absolute}`);
