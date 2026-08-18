import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));

const sensitiveZones = new Set([
  "no-depression",
  "no-fears",
  "be-healthy",
  "fit-life",
  "cardio-doc",
  "psychodynamic",
  "metacognitive",
  "cognitive-analytic",
  "positive-psychotherapy",
  "body-oriented",
  "ericksonian",
  "gestalt",
  "exposure",
  "dbt",
  "act",
  "cbt",
]);

function hasSource(article) {
  const original = article.lifeOsSource ?? {};
  const directSources = [
    original.reference,
    original.sourceUrl,
    article.reference,
    article.sourceUrl,
  ].filter(Boolean);
  const sourceLists = [article.references, article.sources, article.citations]
    .filter(Array.isArray)
    .flat()
    .filter(Boolean);
  return directSources.length > 0 || sourceLists.length > 0;
}

function cleanLegacyBrand(html) {
  return html
    .replaceAll("https://metalhatscats.com/life-os", "https://brali-lifeos.github.io/life-os")
    .replaceAll("http://metalhatscats.com/life-os", "https://brali-lifeos.github.io/life-os")
    .replaceAll("https://metalhatscats.com", "https://brali-lifeos.github.io")
    .replaceAll("http://metalhatscats.com", "https://brali-lifeos.github.io")
    .replaceAll("MetalHatsCats × Brali LifeOS", "Brali LifeOS")
    .replaceAll("MetalHatsCats / Brali LifeOS", "Brali LifeOS")
    .replaceAll("MetalHatsCats Team", "Brali LifeOS")
    .replaceAll("MetalHatsCats", "Brali");
}

let changed = 0;
let protectedSensitive = 0;

for (const entry of index) {
  const htmlPath = path.join(root, "life-os", entry.slug, "index.html");
  const articlePath = path.join(contentRoot, `${entry.slug}.json`);
  const article = JSON.parse(await readFile(articlePath, "utf8"));
  let html = await readFile(htmlPath, "utf8");
  const before = html;

  html = cleanLegacyBrand(html);

  if (sensitiveZones.has(entry.zone?.slug) && !hasSource(article)) {
    if (!/<meta\s+name=["']robots["']/i.test(html)) {
      html = html.replace(
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,follow\">",
      );
    }

    const note = '<div class="prose"><p><strong>Evidence note:</strong> This health or mental-health entry is pending source review. Treat it as a general reflection prompt, not medical advice or a substitute for professional care.</p></div>';
    if (!html.includes("This health or mental-health entry is pending source review")) {
      html = html.replace('<main id="content" class="page wrap">', `<main id="content" class="page wrap">${note}`);
    }
    protectedSensitive += 1;
  }

  if (html !== before) {
    await writeFile(htmlPath, html);
    changed += 1;
  }
}

console.log(`Generated content sanitized: ${changed} pages changed; ${protectedSensitive} unsourced sensitive pages protected from indexing.`);
