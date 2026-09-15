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
  // Other site builders (for example Brali Bench) can legitimately add canonical
  // EN routes after the first localization build. Re-derive the generated search
  // graph from the current sitemap before validating the final locale artifacts;
  // do not let indexability.json become a second manually synchronized URL list.
  ["scripts/build-indexability-registry.mjs"],
  ["scripts/check-pages-localization-artifact.mjs"],
  ["scripts/check-indexability-contract.mjs"],
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
