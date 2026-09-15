import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const excluded = new Set([".git", "node_modules", "_site", "artifacts"]);
const aliases = new Map([
  ["/evidence/methodology.html", "/life-os/methodology/"],
  ["/methodology/", "/life-os/methodology/"],
]);

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, output);
    else if (entry.isFile() && entry.name.endsWith(".html")) output.push(full);
  }
  return output;
}

function cleanHref(value) {
  try {
    return decodeURI(String(value || "").split("#")[0].split("?")[0]);
  } catch {
    return String(value || "").split("#")[0].split("?")[0];
  }
}

function candidatePaths(href, sourceFile) {
  const cleaned = cleanHref(href);
  if (!cleaned || cleaned.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(cleaned) || cleaned.startsWith("//")) return [];
  const sourceRelative = path.relative(root, sourceFile).split(path.sep).join("/");
  const sourceDirectory = `/${path.posix.dirname(sourceRelative)}/`;
  const webPath = cleaned.startsWith("/") ? path.posix.normalize(cleaned) : path.posix.resolve(sourceDirectory, cleaned);
  const relative = webPath.replace(/^\/+/, "");
  if (!relative || webPath.endsWith("/")) return [path.join(root, relative, "index.html")];
  const exact = path.join(root, relative);
  const ext = path.posix.extname(webPath);
  return ext ? [exact] : [exact, path.join(exact, "index.html")];
}

async function targetExists(href, sourceFile) {
  for (const candidate of candidatePaths(href, sourceFile)) {
    try {
      await access(candidate);
      return true;
    } catch {
      // keep trying
    }
  }
  return false;
}

const files = await walk(root);
let aliasRepairs = 0;
let unpublishedProtocolRefs = 0;
let changedFiles = 0;
const unresolved = new Set();

for (const file of files) {
  const original = await readFile(file, "utf8");
  let html = original;

  for (const [from, to] of aliases) {
    const pattern = new RegExp(`href=(["'])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`, "g");
    html = html.replace(pattern, (match, quote) => {
      aliasRepairs += 1;
      return `href=${quote}${to}${quote}`;
    });
  }

  const anchors = [...html.matchAll(/<a\b([^>]*\bhref=(['"])([^'"]+)\2[^>]*)>([\s\S]*?)<\/a>/gi)];
  if (anchors.length) {
    let cursor = 0;
    let rebuilt = "";
    let changed = false;
    for (const match of anchors) {
      const [full, attrs, , href, inner] = match;
      rebuilt += html.slice(cursor, match.index);
      const cleaned = cleanHref(href);
      const protocolMatch = cleaned.match(/^\/life-os\/([a-z0-9-]+)\/$/i);
      if (protocolMatch && !(await targetExists(cleaned, file))) {
        const slug = protocolMatch[1];
        rebuilt += `<span class="unpublished-protocol-reference" data-unpublished-protocol="${slug}">${inner}</span>`;
        unpublishedProtocolRefs += 1;
        unresolved.add(cleaned);
        changed = true;
      } else {
        rebuilt += full;
      }
      cursor = match.index + full.length;
    }
    rebuilt += html.slice(cursor);
    if (changed) html = rebuilt;
  }

  if (html !== original) {
    await writeFile(file, html, "utf8");
    changedFiles += 1;
  }
}

console.log(`[internal-links] repaired ${aliasRepairs} known alias link(s) and converted ${unpublishedProtocolRefs} references to ${unresolved.size} unpublished protocol target(s) into honest non-links across ${changedFiles} file(s).`);
if (unresolved.size) console.log(`[internal-links] unpublished targets: ${[...unresolved].sort().join(", ")}`);
