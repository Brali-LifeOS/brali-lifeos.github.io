import { readFile, writeFile } from "node:fs/promises";

const file = "scripts/check-browser-localizations.mjs";
let source = await readFile(file, "utf8");
const oldBase = 'const base = (process.env.LOCALIZATION_LIVE_BASE || profile.site || "https://brali-lifeos.github.io/").replace(/\\/$/, "");';
const newBase = 'const publicBase = (process.env.LOCALIZATION_EXPECTED_BASE || profile.site || "https://brali-lifeos.github.io/").replace(/\\/$/, "");\nconst base = (process.env.LOCALIZATION_LIVE_BASE || publicBase).replace(/\\/$/, "");';
if (!source.includes("const publicBase =")) {
  if (!source.includes(oldBase)) throw new Error("Browser base declaration not found");
  source = source.replace(oldBase, newBase);
}
source = source.replace('if (!result.canonical.startsWith(base) || !result.canonical.includes(routePrefix)) fail(route, `self ${localeCode} canonical`, result.canonical);', 'if (!result.canonical.startsWith(publicBase) || !result.canonical.includes(routePrefix)) fail(route, `self ${localeCode} canonical`, result.canonical);');
source = source.replace('if (!localeAlt.startsWith(base) || !localeAlt.includes(routePrefix)) fail(route, `${languageTag} hreflang`, localeAlt);', 'if (!localeAlt.startsWith(publicBase) || !localeAlt.includes(routePrefix)) fail(route, `${languageTag} hreflang`, localeAlt);');
source = source.replace('if (!sourceAlt.startsWith(base)) fail(route, `${sourceLocale} hreflang`, sourceAlt);', 'if (!sourceAlt.startsWith(publicBase)) fail(route, `${sourceLocale} hreflang`, sourceAlt);');
if (!source.includes("result.canonical.startsWith(publicBase)") || !source.includes("localeAlt.startsWith(publicBase)") || !source.includes("sourceAlt.startsWith(publicBase)")) {
  throw new Error("Browser canonical/hreflang assertions were not migrated to publicBase");
}
await writeFile(file, source);
console.log("Browser localization checker now separates navigation base from expected public canonical base.");
