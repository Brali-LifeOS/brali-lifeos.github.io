import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { validateLocalizationProfile } from "./lib/localization-contract.mjs";
import { validateLocalizationPipeline } from "./lib/localization-pipeline.mjs";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const { byCode } = validateLocalizationProfile(profile);

function assert(condition, message) {
  if (!condition) throw new Error(`[localization-contract] ${message}`);
}

assert(profile.sitemapManifestPattern === "{locale}/sitemap.xml", "sitemapManifestPattern must be locale-generic");
assert(profile.localeManifestPattern === "{locale}/manifest.json", "localeManifestPattern must be locale-generic");
assert(profile.localeLlmsPattern === "{locale}/llms.txt", "localeLlmsPattern must be locale-generic");
assert(profile.releaseContract?.coverage === "exact-for-published-human-interface", "published human-interface locales must use exact coverage");
assert(profile.releaseContract?.qualityStateIndependentFromEvidence === true, "localization quality must remain independent from evidence state");
assert(profile.releaseContract?.realBrowserRequired === true, "published human-interface locales require a real-browser gate");
assert(profile.releaseContract?.noSilentHumanFallback === true, "published human-interface locales must forbid silent fallback");

const librarySurface = (profile.surfaces || []).find((surface) => surface.id === "library-content");
assert(librarySurface?.membership === "exact", "library-content must declare exact stable-ID membership for release locales");

const problemSurface = (profile.surfaces || []).find((surface) => surface.id === "problem-guides");
assert(problemSurface?.kind === "json-record-set", "problem-guides must be a governed json-record-set surface");
assert(problemSurface?.canonicalSource === "data/problem-collections.json", "problem-guides must bind to the canonical problem graph");
assert(problemSurface?.localePattern === "data/localization/{locale}/problem-collections.json", "problem-guides must use the locale-generic source pattern");
assert(problemSurface?.stableIdField === "slug", "problem-guides must preserve stable slug identity");
assert(problemSurface?.membership === "exact", "problem-guides must declare exact stable-ID membership for release locales");
for (const requiredCheck of ["exact-id-parity", "source-current", "native-localized-copy", "protocol-edge-parity", "no-silent-fallback"]) {
  assert(problemSurface?.checks?.includes(requiredCheck), `problem-guides must require ${requiredCheck}`);
}
const problemImpact = (profile.impactRules || []).find((rule) => rule.paths?.includes("data/problem-collections.json"));
assert(problemImpact?.surfaces?.includes("problem-guides"), "canonical problem graph changes must impact the problem-guides localization surface");
assert(problemImpact?.surfaces?.includes("seo-search"), "canonical problem graph changes must trigger search/indexability review");

const topicSurface = (profile.surfaces || []).find((surface) => surface.id === "topic-hubs");
assert(topicSurface?.kind === "json-record-set", "topic-hubs must be a governed json-record-set surface");
assert(topicSurface?.canonicalSource === "data/topic-hubs.json", "topic-hubs must bind to the canonical topic configuration");
assert(topicSurface?.localePattern === "data/localization/{locale}/topic-hubs.json", "topic-hubs must use the locale-generic source pattern");
assert(topicSurface?.stableIdField === "slug", "topic-hubs must preserve stable slug identity");
assert(topicSurface?.membership === "exact", "topic-hubs must declare exact stable-ID membership for release locales");
for (const requiredCheck of ["exact-id-parity", "source-current", "native-localized-copy", "trusted-protocol-links-localized", "explicit-human-fallback", "no-silent-fallback"]) {
  assert(topicSurface?.checks?.includes(requiredCheck), `topic-hubs must require ${requiredCheck}`);
}
const topicImpact = (profile.impactRules || []).find((rule) => rule.paths?.includes("data/topic-hubs.json"));
assert(topicImpact?.surfaces?.includes("topic-hubs"), "canonical topic config changes must impact the topic-hubs localization surface");
assert(topicImpact?.surfaces?.includes("seo-search"), "canonical topic config changes must trigger search/indexability review");

for (const surface of profile.surfaces || []) {
  if (!surface.requiredForRoles?.includes("human-interface")) continue;
  if (surface.localePattern) assert(surface.localePattern.includes("{locale}"), `${surface.id}.localePattern must use {locale}`);
}

for (const locale of byCode.values()) {
  if (locale.role !== "human-interface") continue;
  await access(path.join(root, locale.datasetRoot));
  assert(Array.isArray(locale.requiredGates) && locale.requiredGates.length > 0, `${locale.code}.requiredGates[] is required`);
  for (const gate of locale.requiredGates) assert(typeof gate === "string" && gate.startsWith("scripts/"), `${locale.code} has invalid gate path ${gate}`);
  if (locale.searchPublication !== "none") {
    assert(locale.requiredGates.includes("scripts/check-indexability-contract.mjs"), `${locale.code} release search publication must require the indexability contract`);
  }
  if (locale.status === "published") {
    for (const required of ["contract", "corpus", "language", "rendered", "browser", "live"]) {
      assert(locale.releaseProof?.includes(required), `${locale.code} published release proof must include ${required}`);
    }
  }
}

await validateLocalizationPipeline(root, profile);

console.log(`Reusable localization contract passed for ${profile.locales.length} locale registry entries and ${(profile.surfaces || []).length} declared surfaces; registry-to-pipeline wiring, exact library/problem/topic parity and release indexability are explicit.`);
