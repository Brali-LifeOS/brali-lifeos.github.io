import { spawnSync } from "node:child_process";

const withConsent = process.argv.includes("--with-consent");
const steps = [
  "scripts/build-localizations.mjs",
  "scripts/build-ru-primary-pages.mjs",
  "scripts/build-ru-library.mjs",
  "scripts/patch-ru-discovery.mjs",
  "scripts/build-interface-locales.mjs",
  "scripts/finalize-interface-locales.mjs",
  ...(withConsent ? ["scripts/inject-consent-analytics.mjs"] : []),
  "scripts/finalize-localization-cluster.mjs",
  "scripts/build-indexability-registry.mjs",
];

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
