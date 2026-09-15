import { access, readFile, readdir } from "node:fs/promises";
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

for (const surface of profile.surfaces || []) {
  if (!surface.requiredForRoles?.includes("human-interface")) continue;
  if (surface.localePattern) assert(surface.localePattern.includes("{locale}"), `${surface.id}.localePattern must use {locale}`);
}

const localizationRoot = path.join(root, "data", "localization");
const declaredHumanLocales = new Set([...byCode.values()].filter((locale) => locale.role === "human-interface").map((locale) => locale.code));
for (const entry of await readdir(localizationRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(entry.name)) continue;
  assert(declaredHumanLocales.has(entry.name), `orphan locale directory data/localization/${entry.name}; register it or remove it`);
}

for (const locale of byCode.values()) {
  if (locale.role !== "human-interface") continue;
  await access(path.join(root, locale.datasetRoot));
  for (const requiredSource of ["site.json", "zones.json", "flagships.json", "library"]) {
    await access(path.join(root, locale.datasetRoot, requiredSource));
  }
  assert(Array.isArray(locale.requiredGates) && locale.requiredGates.length > 0, `${locale.code}.requiredGates[] is required`);
  for (const gate of locale.requiredGates) {
    assert(typeof gate === "string" && gate.startsWith("scripts/"), `${locale.code} has invalid gate path ${gate}`);
    await access(path.join(root, gate));
  }
  if (locale.status === "published") {
    for (const required of ["contract", "corpus", "language", "rendered", "browser", "live"]) {
      assert(locale.releaseProof?.includes(required), `${locale.code} published release proof must include ${required}`);
    }
  }
}

console.log(`Reusable localization contract passed for ${profile.locales.length} locale registry entries and ${(profile.surfaces || []).length} declared surfaces; required locale sources present; no orphan locale directories.`);
