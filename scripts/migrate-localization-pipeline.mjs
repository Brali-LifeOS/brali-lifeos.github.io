import { readFile, writeFile } from "node:fs/promises";

const file = "package.json";
const pkg = JSON.parse(await readFile(file, "utf8"));
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

await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("Localization build pipeline now renders interface and locale-owned machine surfaces generically.");
