import { spawnSync } from "node:child_process";

const checks = [
  ["scripts/check-localization-contract.mjs"],
  ["scripts/check-localizations.mjs"],
  ["scripts/check-ru-library.mjs"],
  ["scripts/audit-ru-language.mjs"],
  ["scripts/check-ru-primary-pages.mjs"],
  ["scripts/check-interface-locale-sources.mjs"],
  ["scripts/check-de-library-contract.mjs", "--complete"],
  ["scripts/audit-de-library-language.mjs", "--strict"],
  ["scripts/audit-de-language.mjs"],
  ["scripts/check-interface-locales.mjs"],
  ["scripts/check-localized-consent.mjs"],
  ["scripts/check-localization-cluster.mjs"],
  ["scripts/check-pages-localization-artifact.mjs"],
  ["scripts/check-localization-faults.mjs"],
];

for (const [script, ...args] of checks) {
  console.log(`[localization-check] ${script}${args.length ? ` ${args.join(" ")}` : ""}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`[localization-check] ${script} failed with exit code ${result.status}`);
}

console.log(`[localization-check] passed ${checks.length} localization gate(s)`);
