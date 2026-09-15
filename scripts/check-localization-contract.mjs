import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { validateLocalizationProfile } from "./lib/localization-contract.mjs";

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

console.log(`Reusable localization contract passed for ${profile.locales.length} locale registry entries and ${(profile.surfaces || []).length} declared surfaces; library parity and release indexability are explicit.`);