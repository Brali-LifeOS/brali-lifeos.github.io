import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const homepages = ["index.html", "ru/index.html", "de/index.html"];
const maxEagerImageBytes = 1_500_000;
const failures = [];

const decode = (value = "") => String(value).replaceAll("&amp;", "&").replaceAll("&quot;", '"').trim();
function attrValue(tag = "", name = "") {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return decode(match?.[2] || "");
}
function imageTags(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
}
function localAssetPath(src) {
  if (!src.startsWith("/")) return null;
  const clean = src.split(/[?#]/, 1)[0].replace(/^\//, "");
  return path.join(root, clean);
}

for (const rel of homepages) {
  const html = await readFile(path.join(root, rel), "utf8");
  const tags = imageTags(html);
  const hero = tags.find((tag) => /\bhero-mascot\b/.test(tag));
  if (!hero) failures.push(`${rel}: missing hero mascot image`);
  else {
    if (attrValue(hero, "loading").toLowerCase() === "lazy") failures.push(`${rel}: LCP hero must not be lazy-loaded`);
    if (attrValue(hero, "fetchpriority").toLowerCase() !== "high") failures.push(`${rel}: LCP hero must use fetchpriority=high`);
    if (!attrValue(hero, "width") || !attrValue(hero, "height")) failures.push(`${rel}: LCP hero needs explicit width/height`);
    if (attrValue(hero, "decoding").toLowerCase() !== "async") failures.push(`${rel}: LCP hero must declare decoding=async`);
  }

  const belowFold = tags.filter((tag) => /brali-category-|brali-audience-/.test(attrValue(tag, "src")));
  if (belowFold.length < 10) failures.push(`${rel}: expected branded category/audience image set`);
  for (const tag of belowFold) {
    const src = attrValue(tag, "src");
    if (attrValue(tag, "loading").toLowerCase() !== "lazy") failures.push(`${rel}: below-fold image is not lazy: ${src}`);
    if (!attrValue(tag, "width") || !attrValue(tag, "height")) failures.push(`${rel}: below-fold image lacks width/height: ${src}`);
    if (attrValue(tag, "decoding").toLowerCase() !== "async") failures.push(`${rel}: below-fold image lacks decoding=async: ${src}`);
  }

  const shellBrandTags = tags.filter((tag) => /class=["'][^"']*brand/.test(tag) || /brali-mark\.svg/.test(attrValue(tag, "src")));
  if (!html.includes('/assets/images/brali-mark.svg')) failures.push(`${rel}: shared shell must use lightweight vector brand mark`);
  if (/<(?:header|footer)[\s\S]*?brali-logo\.png/i.test(html)) failures.push(`${rel}: heavy raster logo leaked into shared header/footer`);

  let eagerImageBytes = 0;
  const counted = new Set();
  for (const tag of tags) {
    if (attrValue(tag, "loading").toLowerCase() === "lazy") continue;
    const src = attrValue(tag, "src");
    const file = localAssetPath(src);
    if (!file || counted.has(file)) continue;
    counted.add(file);
    try { eagerImageBytes += (await stat(file)).size; } catch { /* other checks own missing assets */ }
  }
  if (eagerImageBytes > maxEagerImageBytes) failures.push(`${rel}: eager image payload ${eagerImageBytes} B exceeds ${maxEagerImageBytes} B budget`);
}

if (failures.length) {
  console.error(`Web performance contract failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Web performance contract passed for ${homepages.length} homepages: LCP priority/dimensions are explicit, below-fold branded media is lazy, shared branding is vector, and eager image payload stays within ${maxEagerImageBytes} B.`);
