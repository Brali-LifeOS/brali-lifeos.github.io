import { readFile, writeFile } from "node:fs/promises";

const packageFile = "package.json";
const pkg = JSON.parse(await readFile(packageFile, "utf8"));
const currentBuild = "node scripts/build-interface-locales.mjs";
const targetBuild = "node scripts/build-interface-locales.mjs && node scripts/build-localized-machine-surfaces.mjs";

if (!pkg.scripts?.build?.includes(currentBuild)) {
  throw new Error("Expected generic localization build step was not found in npm build script.");
}
if (!pkg.scripts.build.includes(targetBuild)) {
  pkg.scripts.build = pkg.scripts.build.replace(currentBuild, targetBuild);
}
if (pkg.scripts["localization:build"] === currentBuild) {
  pkg.scripts["localization:build"] = targetBuild;
} else if (pkg.scripts["localization:build"] !== targetBuild) {
  throw new Error("Unexpected localization:build command.");
}
await writeFile(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

const checkerFile = "scripts/check-interface-locales.mjs";
let checker = await readFile(checkerFile, "utf8");
const oldLoad = "const [config, site, zones, flagships, primary, manifest, machine] = await Promise.all([\n    readJson(`${sourceRoot}/library-manifest.json`),\n    readJson(`${sourceRoot}/site.json`),";
const newLoad = "const [config, site, machineCopy, zones, flagships, primary, manifest, machine] = await Promise.all([\n    readJson(`${sourceRoot}/library-manifest.json`),\n    readJson(`${sourceRoot}/site.json`),\n    readJson(`${sourceRoot}/machine.json`),";
if (!checker.includes("machineCopy")) {
  if (!checker.includes(oldLoad)) throw new Error("Expected interface checker source-loading block was not found.");
  checker = checker.replace(oldLoad, newLoad);
}
const oldContract = "assert(locale, config.locale === locale && site.locale === locale && zones.locale === locale && flagships.locale === locale && primary.locale === locale, \"source locale declarations disagree\");";
const newContract = "assert(locale, config.locale === locale && site.locale === locale && machineCopy.locale === locale && zones.locale === locale && flagships.locale === locale && primary.locale === locale, \"source locale declarations disagree\");\n  assert(locale, machineCopy.source_locale === profile.sourceLocale, \"machine copy source locale drift\");";
if (!checker.includes("machine copy source locale drift")) {
  if (!checker.includes(oldContract)) throw new Error("Expected interface checker locale contract was not found.");
  checker = checker.replace(oldContract, newContract);
}
const oldExact = "if (config.coverage_mode === \"exact\") assert(locale, llms.includes(`alle ${canonicalIndex.length} kanonischen`), \"exact llms.txt must declare full coverage\");";
const newExact = "if (config.coverage_mode === \"exact\") {\n    const exactCoverage = machineCopy.coverage_exact.replace(\"{canonical_count}\", String(canonicalIndex.length));\n    assert(locale, llms.includes(exactCoverage), \"exact llms.txt must declare full localized coverage using locale-owned copy\");\n  }";
if (!checker.includes("locale-owned copy")) {
  if (!checker.includes(oldExact)) throw new Error("Expected German-specific exact coverage assertion was not found.");
  checker = checker.replace(oldExact, newExact);
}
await writeFile(checkerFile, checker);

console.log("Localization pipeline now renders and validates locale-owned machine surfaces generically.");
