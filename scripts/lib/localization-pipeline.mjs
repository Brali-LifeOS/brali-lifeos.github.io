import { access } from "node:fs/promises";
import path from "node:path";

const GENERATOR_BUILD_STEPS = new Map([
  ["reference-v1", [
    "scripts/build-localizations.mjs",
    "scripts/build-ru-primary-pages.mjs",
    "scripts/build-ru-library.mjs",
    "scripts/patch-ru-discovery.mjs",
  ]],
  ["generic-v1", ["scripts/build-interface-locales.mjs"]],
]);

const COMMON_BUILD_STEPS = [
  "scripts/build-localized-problem-collections.mjs",
  "scripts/build-localized-topic-hubs.mjs",
  "scripts/finalize-interface-locales.mjs",
  "scripts/finalize-localized-discovery-llms.mjs",
];
const CONSENT_BUILD_STEPS = [
  "scripts/inject-consent-analytics.mjs",
  "scripts/finalize-hack-lifecycle-discovery.mjs",
];
const FINAL_BUILD_STEPS = [
  "scripts/finalize-localization-cluster.mjs",
  "scripts/build-indexability-registry.mjs",
];

const CHECK_FIRST = ["scripts/check-localization-contract.mjs"];
const CHECK_BEFORE_GRAPH = [
  "scripts/check-localization-quality-states.mjs",
  "scripts/check-localization-quality-debt.mjs",
  "scripts/check-localized-consent.mjs",
  "scripts/check-localization-cluster.mjs",
];
const CHECK_GRAPH_BUILD = ["scripts/build-indexability-registry.mjs"];
const CHECK_AFTER_GRAPH = [
  "scripts/check-pages-localization-artifact.mjs",
  "scripts/check-indexability-contract.mjs",
  "scripts/check-localization-faults.mjs",
];
const CROSS_LOCALE_REQUIRED_GATES = new Set([
  "scripts/check-localization-contract.mjs",
  "scripts/check-localization-cluster.mjs",
  "scripts/check-pages-localization-artifact.mjs",
  "scripts/check-indexability-contract.mjs",
]);
const RELEASE_ONLY_GATES = new Set([
  "scripts/check-browser-localizations.mjs",
  "scripts/check-live-localizations.mjs",
]);

// Transitional adapters stay explicit until gate arguments themselves move into
// the locale registry. Release-state checks must preserve the strictness of the
// previous hand-written orchestration.
const CHECK_ARGS = new Map([
  ["scripts/check-de-library-contract.mjs", ["--complete"]],
  ["scripts/audit-de-library-language.mjs", ["--strict"]],
]);

function unique(values) {
  return [...new Set(values)];
}

function humanInterfaceLocales(profile) {
  return (profile.locales || []).filter((locale) => locale.role === "human-interface");
}

function generatorFor(locale) {
  if (typeof locale.generator === "string" && locale.generator.trim()) return locale.generator;
  throw new Error(`[localization-pipeline] ${locale.code} has no explicit generator`);
}

function step(script) {
  return { script, args: CHECK_ARGS.get(script) || [] };
}

export function getLocalizationBuildSteps(profile, { withConsent = false } = {}) {
  const generators = unique(humanInterfaceLocales(profile).map(generatorFor));
  const adapterSteps = [];
  for (const generator of generators) {
    const scripts = GENERATOR_BUILD_STEPS.get(generator);
    if (!scripts) throw new Error(`[localization-pipeline] unsupported localization generator: ${generator}`);
    adapterSteps.push(...scripts);
  }

  return unique([
    ...adapterSteps,
    ...COMMON_BUILD_STEPS,
    ...(withConsent ? CONSENT_BUILD_STEPS : []),
    ...FINAL_BUILD_STEPS,
  ]);
}

export function getLocalizationCheckSteps(profile) {
  const localeSpecific = [];
  for (const locale of humanInterfaceLocales(profile)) {
    for (const gate of locale.requiredGates || []) {
      if (CROSS_LOCALE_REQUIRED_GATES.has(gate) || RELEASE_ONLY_GATES.has(gate)) continue;
      localeSpecific.push(gate);
    }
  }

  return [
    ...CHECK_FIRST.map(step),
    ...unique(localeSpecific).map(step),
    ...CHECK_BEFORE_GRAPH.map(step),
    ...CHECK_GRAPH_BUILD.map(step),
    ...CHECK_AFTER_GRAPH.map(step),
  ];
}

export async function validateLocalizationPipeline(root, profile) {
  const buildScripts = getLocalizationBuildSteps(profile);
  const allBuildScripts = getLocalizationBuildSteps(profile, { withConsent: true });
  const checkSteps = getLocalizationCheckSteps(profile);
  const coveredChecks = new Set(checkSteps.map(({ script }) => script));
  const releaseOnly = new Set(RELEASE_ONLY_GATES);
  const scripts = new Set([...allBuildScripts, ...coveredChecks, ...releaseOnly]);

  for (const locale of humanInterfaceLocales(profile)) {
    generatorFor(locale);
    for (const gate of locale.requiredGates || []) {
      if (!coveredChecks.has(gate) && !releaseOnly.has(gate)) {
        throw new Error(`[localization-pipeline] ${locale.code}.requiredGates includes ${gate}, but the deterministic or release pipeline does not execute it`);
      }
      scripts.add(gate);
    }
  }

  for (const script of scripts) {
    try {
      await access(path.join(root, script));
    } catch {
      throw new Error(`[localization-pipeline] configured script does not exist: ${script}`);
    }
  }

  return {
    buildScripts,
    checkSteps,
    releaseOnlyGates: [...releaseOnly],
  };
}
