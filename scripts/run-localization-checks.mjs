import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { getLocalizationCheckSteps, validateLocalizationPipeline } from "./lib/localization-pipeline.mjs";

const root = process.cwd();
const profile = JSON.parse(await readFile(".arwp/localization.json", "utf8"));
await validateLocalizationPipeline(root, profile);
const checks = getLocalizationCheckSteps(profile);

for (const { script, args } of checks) {
  console.log(`[localization-check] ${script}${args.length ? ` ${args.join(" ")}` : ""}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`[localization-check] ${script} failed with exit code ${result.status}`);
}

console.log(`[localization-check] passed ${checks.length} localization gate(s)`);
