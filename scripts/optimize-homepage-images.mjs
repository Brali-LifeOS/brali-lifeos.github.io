import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const imageRoot = path.join(root, "assets", "images");
const outputRoot = path.join(imageRoot, "optimized");
const pages = ["index.html", "ru/index.html", "de/index.html"];

const targets = [
  {
    file: "brali-mascot-pointing.png",
    widths: [480, 768, 1024],
    sizes: "(max-width: 760px) 88vw, 44vw",
    loading: "eager",
    fetchpriority: "high",
  },
  ...[
    "brali-category-focus.png",
    "brali-category-stress.png",
    "brali-category-memory.png",
    "brali-category-sleep.png",
    "brali-category-habits.png",
    "brali-category-learning.png",
    "brali-category-movement.png",
  ].map((file) => ({
    file,
    widths: [240, 360, 520],
    sizes: "(max-width: 720px) 42vw, (max-width: 1100px) 22vw, 260px",
    loading: "lazy",
    fetchpriority: "low",
  })),
  ...[
    "brali-audience-people.png",
    "brali-audience-research.png",
    "brali-audience-ai.png",
  ].map((file) => ({
    file,
    widths: [480, 768, 1200],
    sizes: "(max-width: 800px) 100vw, 33vw",
    loading: "lazy",
    fetchpriority: "low",
  })),
];

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const baseName = (file) => file.replace(/\.png$/i, "");

async function loadSharp() {
  if (process.env.BRALI_SHARP_MODULE) {
    const module = await import(pathToFileURL(process.env.BRALI_SHARP_MODULE).href);
    return module.default;
  }
  try {
    const module = await import("sharp");
    return module.default;
  } catch {
    throw new Error("Responsive image build requires sharp. Install it outside the Pages artifact and set BRALI_SHARP_MODULE to sharp/lib/index.js.");
  }
}

function setAttribute(tag, name, value) {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}=(?:"[^"]*"|'[^']*')`, "i");
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`);
  return tag.replace(/\s*\/>$|>$/, (ending) => ` ${name}="${value}"${ending.includes("/") ? " />" : ">"}`);
}

function pictureMarkup(target, widths, imgTag) {
  const base = baseName(target.file);
  const avif = widths.map((width) => `/assets/images/optimized/${base}-${width}.avif ${width}w`).join(", ");
  const webp = widths.map((width) => `/assets/images/optimized/${base}-${width}.webp ${width}w`).join(", ");
  let fallback = imgTag;
  fallback = setAttribute(fallback, "loading", target.loading);
  fallback = setAttribute(fallback, "decoding", "async");
  fallback = setAttribute(fallback, "fetchpriority", target.fetchpriority);
  return `<picture data-brali-responsive-image="${base}"><source type="image/avif" srcset="${avif}" sizes="${target.sizes}"><source type="image/webp" srcset="${webp}" sizes="${target.sizes}">${fallback}</picture>`;
}

const sharp = await loadSharp();
await mkdir(outputRoot, { recursive: true });

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  codec_policy: {
    webp: { quality: 82, effort: 6, smartSubsample: true },
    avif: { quality: 65, effort: 6, chromaSubsampling: "4:4:4" },
  },
  originals_total_bytes: 0,
  largest_webp_total_bytes: 0,
  largest_avif_total_bytes: 0,
  targets: [],
  pages: [],
};

for (const target of targets) {
  const sourcePath = path.join(imageRoot, target.file);
  await access(sourcePath);
  const sourceStats = await stat(sourcePath);
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Cannot read dimensions for ${target.file}`);

  const widths = [...new Set(target.widths.filter((width) => width <= metadata.width))];
  if (!widths.length) widths.push(metadata.width);
  const generated = [];

  for (const width of widths) {
    const base = baseName(target.file);
    const webpName = `${base}-${width}.webp`;
    const avifName = `${base}-${width}.avif`;
    const webpPath = path.join(outputRoot, webpName);
    const avifPath = path.join(outputRoot, avifName);

    await sharp(sourcePath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 6, smartSubsample: true })
      .toFile(webpPath);
    await sharp(sourcePath)
      .resize({ width, withoutEnlargement: true })
      .avif({ quality: 65, effort: 6, chromaSubsampling: "4:4:4" })
      .toFile(avifPath);

    generated.push({
      width,
      webp: { file: `assets/images/optimized/${webpName}`, bytes: (await stat(webpPath)).size },
      avif: { file: `assets/images/optimized/${avifName}`, bytes: (await stat(avifPath)).size },
    });
  }

  const largest = generated.at(-1);
  report.originals_total_bytes += sourceStats.size;
  report.largest_webp_total_bytes += largest.webp.bytes;
  report.largest_avif_total_bytes += largest.avif.bytes;
  report.targets.push({
    file: target.file,
    original_bytes: sourceStats.size,
    source_width: metadata.width,
    source_height: metadata.height,
    sizes: target.sizes,
    loading: target.loading,
    fetchpriority: target.fetchpriority,
    generated,
  });
}

for (const page of pages) {
  const pagePath = path.join(root, page);
  try { await access(pagePath); } catch { continue; }
  let html = await readFile(pagePath, "utf8");
  let replacements = 0;

  for (const target of targets) {
    const base = baseName(target.file);
    if (html.includes(`data-brali-responsive-image="${base}"`)) continue;
    const sourcePattern = new RegExp(`<img\\b[^>]*\\bsrc=(?:"|')/assets/images/${escapeRegExp(target.file)}(?:\\?[^"']*)?(?:"|')[^>]*>`, "g");
    const record = report.targets.find((item) => item.file === target.file);
    html = html.replace(sourcePattern, (imgTag) => {
      replacements += 1;
      return pictureMarkup(target, record.generated.map((item) => item.width), imgTag);
    });
  }

  if (replacements) await writeFile(pagePath, html);
  report.pages.push({ page, replacements });
}

report.webp_ratio = Number((report.largest_webp_total_bytes / report.originals_total_bytes).toFixed(4));
report.avif_ratio = Number((report.largest_avif_total_bytes / report.originals_total_bytes).toFixed(4));
await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`Responsive homepage images generated: ${targets.length} source PNGs; largest WebP set ${(report.largest_webp_total_bytes / 1024 / 1024).toFixed(2)} MiB vs ${(report.originals_total_bytes / 1024 / 1024).toFixed(2)} MiB source (${(report.webp_ratio * 100).toFixed(1)}%).`);
console.log(`Largest AVIF set: ${(report.largest_avif_total_bytes / 1024 / 1024).toFixed(2)} MiB (${(report.avif_ratio * 100).toFixed(1)}%).`);
