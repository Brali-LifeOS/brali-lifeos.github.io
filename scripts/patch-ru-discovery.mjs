import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ruRoot = path.join(root, "ru");
const site = JSON.parse(await readFile(path.join(root, "data", "localization", "ru", "site.json"), "utf8"));
const libraryLabel = site.shell?.nav_library || "Библиотека";
const primaryCta = site.home?.primary_cta || "Открыть русскую библиотеку";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile() && entry.name === "index.html") files.push(target);
  }
  return files;
}

const files = await walk(ruRoot);
let patched = 0;

for (const file of files) {
  let html = await readFile(file, "utf8");
  if (!html.includes('data-brali-cluster="localized-ru"')) continue;

  const before = html;
  if (!html.includes('<div class="links"><a href="/ru/life-os/">')) {
    html = html.replace(
      '<div class="links"><a href="/ru/life-os/flagships/">',
      `<div class="links"><a href="/ru/life-os/">${libraryLabel}</a><a href="/ru/life-os/flagships/">`,
    );
  }
  if (!html.includes('<div class="footer-links"><a href="/ru/life-os/">')) {
    html = html.replace(
      '<div class="footer-links"><a href="/ru/life-os/flagships/">',
      `<div class="footer-links"><a href="/ru/life-os/">${libraryLabel}</a><a href="/ru/life-os/flagships/">`,
    );
  }

  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  if (relative === "ru/index.html") {
    html = html.replace(
      `<a class="button yellow" href="/ru/life-os/flagships/">${primaryCta}</a>`,
      `<a class="button yellow" href="/ru/life-os/">${primaryCta}</a>`,
    );
  }
  if (relative === "ru/life-os/methodology/index.html") {
    html = html
      .replace('>Russian locale manifest</a>', '>Manifest русской локали</a>')
      .replace('>Russian llms.txt</a>', '>Русский llms.txt</a>');
  }

  if (html !== before) {
    await writeFile(file, html);
    patched += 1;
  }
}

const home = await readFile(path.join(ruRoot, "index.html"), "utf8");
if (!home.includes(`<a href="/ru/life-os/">${libraryLabel}</a>`)) {
  throw new Error("Russian homepage navigation must expose the localized library");
}
if (!home.includes(`<a class="button yellow" href="/ru/life-os/">${primaryCta}</a>`)) {
  throw new Error("Russian homepage primary CTA must open the localized library");
}

console.log(`Patched Russian discovery shell on ${patched} page(s).`);
