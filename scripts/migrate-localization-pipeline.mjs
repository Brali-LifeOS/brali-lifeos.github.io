import { readFile, writeFile } from "node:fs/promises";

const file = "package.json";
const pkg = JSON.parse(await readFile(file, "utf8"));
const legacyBuild = "node scripts/build-localizations.mjs && node scripts/build-ru-primary-pages.mjs && node scripts/build-ru-library.mjs && node scripts/patch-ru-discovery.mjs && node scripts/build-interface-locales.mjs";
const genericBuild = "node scripts/build-interface-locales.mjs";

if (!pkg.scripts?.build?.includes(legacyBuild)) {
  throw new Error("Expected legacy localization build chain was not found in npm build script.");
}
pkg.scripts.build = pkg.scripts.build.replace(legacyBuild, genericBuild);
if (pkg.scripts["localization:build"] !== legacyBuild) {
  throw new Error("Expected legacy localization:build command was not found.");
}
pkg.scripts["localization:build"] = genericBuild;

await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("Localization build pipeline converged on scripts/build-interface-locales.mjs.");
