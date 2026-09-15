import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteOrigin = "https://brali-lifeos.github.io";
const excluded = new Set([".git", "node_modules", "_site", "artifacts"]);

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, output);
    else if (entry.isFile() && entry.name.endsWith(".html")) output.push(full);
  }
  return output;
}

function normalizeReference(raw, sourceFile) {
  const value = String(raw || "").trim();
  if (!value || value.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(value) || value.startsWith("//")) return null;
  let pathname = value;
  if (/^https?:/i.test(value)) {
    let parsed;
    try { parsed = new URL(value); } catch { return null; }
    if (parsed.origin !== siteOrigin) return null;
    pathname = parsed.pathname;
  } else {
    pathname = value.split("#")[0].split("?")[0];
  }
  try { pathname = decodeURI(pathname); } catch { /* keep raw path */ }
  if (!pathname) return null;
  const sourceRelative = path.relative(root, sourceFile).split(path.sep).join("/");
  const sourceDirectory = `/${path.posix.dirname(sourceRelative)}/`;
  const resolved = pathname.startsWith("/") ? path.posix.normalize(pathname) : path.posix.resolve(sourceDirectory, pathname);
  return resolved;
}

function candidatesFor(webPath) {
  const relative = webPath.replace(/^\/+/, "");
  if (!relative || webPath.endsWith("/")) return [path.join(root, relative, "index.html")];
  const exact = path.join(root, relative);
  return path.posix.extname(webPath) ? [exact] : [exact, path.join(exact, "index.html")];
}

async function exists(webPath) {
  for (const candidate of candidatesFor(webPath)) {
    try {
      await access(candidate);
      return true;
    } catch {
      // try the next representation
    }
  }
  return false;
}

const failures = [];
let checked = 0;
const files = await walk(root);
for (const file of files) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/\b(?:href|src)=(['"])([^'"]+)\1/gi)) {
    const webPath = normalizeReference(match[2], file);
    if (!webPath) continue;
    checked += 1;
    if (!(await exists(webPath))) {
      failures.push({
        page: `/${path.relative(root, file).split(path.sep).join("/")}`,
        reference: match[2],
        resolved: webPath,
      });
    }
  }
}

if (failures.length) {
  console.error(`[internal-links] ${failures.length} broken internal reference(s) found across ${files.length} HTML files:`);
  for (const failure of failures.slice(0, 100)) console.error(`  ${failure.page} -> ${failure.reference} (${failure.resolved})`);
  if (failures.length > 100) console.error(`  ... ${failures.length - 100} more`);
  process.exitCode = 1;
} else {
  console.log(`[internal-links] passed: ${checked} internal href/src reference(s) resolved across ${files.length} HTML files.`);
}
