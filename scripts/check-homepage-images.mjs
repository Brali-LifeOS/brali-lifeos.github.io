import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "assets", "images", "optimized", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const fail = (message) => { throw new Error(`homepage_image_gate:${message}`); };

if (manifest.schema_version !== 1) fail("unsupported manifest schema");
if (manifest.targets?.length !== 11) fail(`expected 11 optimized homepage sources, found ${manifest.targets?.length ?? 0}`);
if (!(manifest.originals_total_bytes > 0)) fail("source-byte accounting is empty");
if (!(manifest.webp_ratio > 0 && manifest.webp_ratio < 0.5)) fail(`largest WebP set is not materially smaller than source PNGs: ratio=${manifest.webp_ratio}`);
if (!(manifest.avif_ratio > 0 && manifest.avif_ratio < 0.5)) fail(`largest AVIF set is not materially smaller than source PNGs: ratio=${manifest.avif_ratio}`);

for (const target of manifest.targets) {
  if (!target.generated?.length) fail(`${target.file}: no responsive variants generated`);
  let previousWidth = 0;
  for (const variant of target.generated) {
    if (!(variant.width > previousWidth)) fail(`${target.file}: srcset widths are not strictly increasing`);
    previousWidth = variant.width;
    for (const format of ["webp", "avif"]) {
      const record = variant[format];
      if (!record?.file || !(record.bytes > 0)) fail(`${target.file}: invalid ${format} variant at ${variant.width}w`);
      const file = path.join(root, record.file);
      await access(file);
      const actual = (await stat(file)).size;
      if (actual !== record.bytes) fail(`${target.file}: ${format} byte accounting drift at ${variant.width}w`);
      if (actual >= target.original_bytes) fail(`${target.file}: ${format} ${variant.width}w is not smaller than the PNG source`);
    }
  }
}

const pageRecords = manifest.pages ?? [];
const homeRecord = pageRecords.find((item) => item.page === "index.html");
if (!homeRecord || homeRecord.replacements !== 11) fail(`homepage must upgrade all 11 heavy images, replaced ${homeRecord?.replacements ?? 0}`);

for (const pageRecord of pageRecords) {
  const html = await readFile(path.join(root, pageRecord.page), "utf8");
  for (const target of manifest.targets) {
    const base = target.file.replace(/\.png$/i, "");
    const marker = `data-brali-responsive-image="${base}"`;
    if (pageRecord.replacements > 0 && !html.includes(marker)) fail(`${pageRecord.page}: missing responsive picture for ${target.file}`);
    if (!html.includes(marker)) continue;
    const picture = html.match(new RegExp(`<picture\\b[^>]*${base}[\\s\\S]*?<\\/picture>`, "i"))?.[0] || "";
    if (!picture.includes('type="image/avif"') || !picture.includes('type="image/webp"')) fail(`${pageRecord.page}: ${target.file} lacks AVIF/WebP sources`);
    if (!picture.includes("srcset=") || !picture.includes("sizes=")) fail(`${pageRecord.page}: ${target.file} lacks responsive srcset/sizes`);
    if (!picture.includes('decoding="async"')) fail(`${pageRecord.page}: ${target.file} lacks async decoding`);
    if (target.fetchpriority === "high") {
      if (!picture.includes('fetchpriority="high"') || !picture.includes('loading="eager"')) fail(`${pageRecord.page}: hero priority contract missing`);
    } else if (!picture.includes('fetchpriority="low"') || !picture.includes('loading="lazy"')) {
      fail(`${pageRecord.page}: below-fold lazy/low priority contract missing for ${target.file}`);
    }
  }
}

console.log(`Homepage image gate passed: 11 PNG sources upgraded to AVIF/WebP srcsets; WebP ${(manifest.webp_ratio * 100).toFixed(1)}% and AVIF ${(manifest.avif_ratio * 100).toFixed(1)}% of source bytes at the largest generated widths.`);
