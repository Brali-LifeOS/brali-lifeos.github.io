import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { getLocalizationBuildSteps, validateLocalizationPipeline } from "./lib/localization-pipeline.mjs";

const root = process.cwd();
const profile = JSON.parse(await readFile(".arwp/localization.json", "utf8"));
const withConsent = process.argv.includes("--with-consent");
await validateLocalizationPipeline(root, profile);
const steps = getLocalizationBuildSteps(profile, { withConsent });

for (const script of steps) {
  console.log(`[localization-build] ${script}`);
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`[localization-build] ${script} failed with exit code ${result.status}`);
}

console.log(`[localization-build] completed ${steps.length} deterministic step(s)`);
