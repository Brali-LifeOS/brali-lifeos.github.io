import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "data", "localization", "consent.json"), "utf8"));
const fields = ["aria", "title", "body", "allow", "deny"];

function fail(message) {
  throw new Error(`[localized-consent] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function routeFile(route) {
  const relative = route.replace(/^\//, "").replace(/\/$/, "");
  return path.join(root, relative, "index.html");
}

assert(registry.schema_version === 1, "consent registry must use schema_version 1");
assert(registry.source_locale === profile.sourceLocale, "consent registry source locale drift");
assert(registry.locales && typeof registry.locales === "object", "consent registry locales object is required");

const sourceCopy = registry.locales[profile.sourceLocale];
assert(sourceCopy, `missing source-locale consent copy for ${profile.sourceLocale}`);
for (const field of fields) assert(typeof sourceCopy[field] === "string" && sourceCopy[field].trim(), `missing ${profile.sourceLocale}.${field}`);

let checkedPages = 0;
for (const locale of (profile.locales || []).filter((entry) => entry.role === "human-interface")) {
  const copy = registry.locales[locale.code];
  assert(copy, `missing consent copy for declared human-interface locale ${locale.code}`);
  for (const field of fields) {
    assert(typeof copy[field] === "string" && copy[field].trim(), `missing ${locale.code}.${field}`);
    assert(copy[field] === copy[field].normalize("NFC"), `${locale.code}.${field} is not NFC`);
    assert(copy[field] !== sourceCopy[field], `${locale.code}.${field} silently falls back to ${profile.sourceLocale}`);
  }

  const manifest = JSON.parse(await readFile(path.join(root, locale.code, "manifest.json"), "utf8"));
  assert(manifest.locale === locale.code && Array.isArray(manifest.routes) && manifest.routes.length > 0, `${locale.code} manifest is missing routes`);

  for (const route of manifest.routes) {
    const html = await readFile(routeFile(route.path), "utf8");
    assert(html.includes("brali-consent-analytics"), `${route.path} is missing consent analytics marker`);
    for (const field of fields) assert(html.includes(copy[field]), `${route.path} missing localized consent field ${field}`);
    for (const field of fields) assert(!html.includes(sourceCopy[field]), `${route.path} leaked source-locale consent field ${profile.sourceLocale}.${field}`);
    checkedPages += 1;
  }
}

console.log(`Localized analytics consent passed: ${checkedPages} pages across ${(profile.locales || []).filter((entry) => entry.role === "human-interface").length} human-interface locale(s).`);
