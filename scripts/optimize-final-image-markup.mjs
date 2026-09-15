import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
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

function localImagePath(src, htmlFile) {
  const clean = String(src || "").split("#")[0].split("?")[0];
  if (!clean || /^(?:https?:|data:|\/\/)/i.test(clean)) return null;
  const relativeHtml = path.relative(root, htmlFile).split(path.sep).join("/");
  const baseDir = `/${path.posix.dirname(relativeHtml)}/`;
  const webPath = clean.startsWith("/") ? path.posix.normalize(clean) : path.posix.resolve(baseDir, clean);
  return path.join(root, webPath.replace(/^\/+/, ""));
}

async function pngDimensions(file) {
  try {
    const buffer = await readFile(file);
    if (buffer.length < 24) return null;
    if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } catch {
    return null;
  }
}

const dimensionCache = new Map();
let filesChanged = 0;
let dimensionsAdded = 0;
let lazyAdded = 0;
let decodingAdded = 0;

for (const file of await walk(root)) {
  const original = await readFile(file, "utf8");
  let changed = false;
  let html = original;
  const matches = [...original.matchAll(/<img\b[^>]*>/gi)];
  if (!matches.length) continue;
  let cursor = 0;
  let rebuilt = "";
  for (const match of matches) {
    rebuilt += original.slice(cursor, match.index);
    let tag = match[0];
    const srcMatch = tag.match(/\bsrc=(['"])([^'"]+)\1/i);
    if (srcMatch) {
      const local = localImagePath(srcMatch[2], file);
      const isPng = local && /\.png$/i.test(local);
      if (isPng && (!/\bwidth=['"]/i.test(tag) || !/\bheight=['"]/i.test(tag))) {
        let dims = dimensionCache.get(local);
        if (dims === undefined) {
          dims = await pngDimensions(local);
          dimensionCache.set(local, dims);
        }
        if (dims?.width && dims?.height) {
          if (!/\bwidth=['"]/i.test(tag)) tag = tag.replace(/\s*\/?>(?=$)/, ` width="${dims.width}"$&`);
          if (!/\bheight=['"]/i.test(tag)) tag = tag.replace(/\s*\/?>(?=$)/, ` height="${dims.height}"$&`);
          dimensionsAdded += 1;
          changed = true;
        }
      }
      const priority = /\bfetchpriority=(['"])high\1/i.test(tag) || /brali-logo/i.test(srcMatch[2]);
      if (!priority && !/\bloading=['"]/i.test(tag)) {
        tag = tag.replace(/\s*\/?>(?=$)/, ` loading="lazy"$&`);
        lazyAdded += 1;
        changed = true;
      }
      if (!/\bdecoding=['"]/i.test(tag)) {
        tag = tag.replace(/\s*\/?>(?=$)/, ` decoding="async"$&`);
        decodingAdded += 1;
        changed = true;
      }
    }
    rebuilt += tag;
    cursor = match.index + match[0].length;
  }
  rebuilt += original.slice(cursor);
  if (changed && rebuilt !== original) {
    await writeFile(file, rebuilt, "utf8");
    filesChanged += 1;
  }
}

console.log(`[images] optimized markup in ${filesChanged} HTML file(s): dimensions=${dimensionsAdded}, lazy=${lazyAdded}, decoding=${decodingAdded}.`);
