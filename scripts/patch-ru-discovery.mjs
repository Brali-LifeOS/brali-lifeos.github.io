import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "./patch-localized-responsive-css.mjs";

const root = process.cwd();
const ruRoot = path.join(root, "ru");
const site = JSON.parse(await readFile(path.join(root, "data", "localization", "ru", "site.json"), "utf8"));
const labels = {
  library: site.shell?.nav_library || "Библиотека",
  flagships: site.shell?.nav_flagships || "7 стартовых протоколов",
  methodology: site.shell?.nav_methodology || "Как мы проверяем",
  research: site.shell?.nav_research || "Исследования",
  partners: site.shell?.nav_partners || "Партнёрства",
  forAi: site.shell?.nav_for_ai || "Для AI",
};
const primaryCta = site.home?.primary_cta || "Открыть русскую библиотеку";

function russianPlural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

function fixRussianCounters(html) {
  return html
    .replace(/(\d+) русских записей/g, (_, rawCount) => {
      const count = Number(rawCount);
      return `${count} ${russianPlural(count, "русская запись", "русские записи", "русских записей")}`;
    })
    .replace(/(\d+) локализованных записей/g, (_, rawCount) => {
      const count = Number(rawCount);
      return `${count} ${russianPlural(count, "локализованная запись", "локализованные записи", "локализованных записей")}`;
    });
}

function assertCounterGrammar(html, file) {
  const checks = [
    { pattern: /(\d+) (русская запись|русские записи|русских записей)/g, forms: ["русская запись", "русские записи", "русских записей"] },
    { pattern: /(\d+) (локализованная запись|локализованные записи|локализованных записей)/g, forms: ["локализованная запись", "локализованные записи", "локализованных записей"] },
  ];
  for (const { pattern, forms } of checks) {
    for (const match of html.matchAll(pattern)) {
      const count = Number(match[1]);
      const expected = russianPlural(count, ...forms);
      if (match[2] !== expected) {
        throw new Error(`Russian counter grammar drift in ${file}: ${match[0]} (expected ${count} ${expected})`);
      }
    }
  }
}

function routeForFile(file) {
  const relative = path.relative(ruRoot, path.dirname(file)).replaceAll(path.sep, "/");
  return relative === "" ? "/ru/" : `/ru/${relative}/`;
}

function navLink(href, label, currentRoute, { button = false } = {}) {
  const className = button ? ' class="button"' : "";
  const current = href === currentRoute ? ' aria-current="page"' : "";
  return `<a${className} href="${href}"${current}>${label}</a>`;
}

function englishPath(html) {
  const alternate = html.match(/<link rel="alternate" hreflang="en" href="https:\/\/brali-lifeos\.github\.io([^\"]+)">/);
  if (alternate) return alternate[1];
  const switchLink = html.match(/<a lang="en" hreflang="en" href="([^\"]+)">English<\/a>/);
  return switchLink?.[1] || "/";
}

function unifiedHeaderLinks(currentRoute, enPath) {
  return `<div class="links">${navLink("/ru/life-os/", labels.library, currentRoute)}${navLink("/ru/life-os/methodology/", labels.methodology, currentRoute)}${navLink("/ru/research/", labels.research, currentRoute)}${navLink("/ru/partners/", labels.partners, currentRoute)}${navLink("/ru/for-ai/", labels.forAi, currentRoute, { button: true })}<a lang="en" hreflang="en" href="${enPath}">${site.shell.language_switch}</a></div>`;
}

function unifiedFooterLinks(enPath) {
  return `<div class="footer-links"><a href="/ru/life-os/">${labels.library}</a><a href="/ru/life-os/flagships/">${labels.flagships}</a><a href="/ru/research/">${labels.research}</a><a href="/ru/for-ai/">${labels.forAi}</a><a href="/ru/partners/">${labels.partners}</a><a href="/ru/life-os/methodology/">${labels.methodology}</a><a href="/ru/llms.txt">llms.txt</a><a lang="en" hreflang="en" href="${enPath}">English</a></div>`;
}

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
let counterPages = 0;

for (const file of files) {
  let html = await readFile(file, "utf8");
  const isLegacyRuShell = html.includes('data-brali-cluster="localized-ru"');
  const isRuLibraryShell = html.includes('data-brali-cluster="localized-ru-library"');
  const isRuPrimaryShell = html.includes('data-brali-cluster="localized-ru-primary"');
  if (!isLegacyRuShell && !isRuLibraryShell && !isRuPrimaryShell) continue;

  const before = html;
  const currentRoute = routeForFile(file);
  const enPath = englishPath(html);

  if (!/<html\b[^>]*\bdir=["'][^"']+["'][^>]*>/i.test(html)) {
    html = html.replace(/<html\b([^>]*)>/i, '<html$1 dir="ltr">');
  }

  html = html.replace(/<div class="links">[\s\S]*?<\/div><\/nav><\/header>/, `${unifiedHeaderLinks(currentRoute, enPath)}</nav></header>`);
  html = html.replace(/<div class="footer-links">[\s\S]*?<\/div><\/div><\/footer>/, `${unifiedFooterLinks(enPath)}</div></footer>`);

  if (isLegacyRuShell) {
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
  }

  if (isRuLibraryShell) {
    const corrected = fixRussianCounters(html);
    if (corrected !== html) counterPages += 1;
    html = corrected;
    assertCounterGrammar(html, path.relative(root, file));
  }

  if (html !== before) {
    await writeFile(file, html);
    patched += 1;
  }
}

const manifestPath = path.join(ruRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.language_tag = "ru";
manifest.direction = "ltr";
manifest.route_prefix = "/ru/";
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const home = await readFile(path.join(ruRoot, "index.html"), "utf8");
for (const [href, label] of [
  ["/ru/life-os/", labels.library],
  ["/ru/life-os/methodology/", labels.methodology],
  ["/ru/research/", labels.research],
  ["/ru/partners/", labels.partners],
  ["/ru/for-ai/", labels.forAi],
]) {
  if (!home.includes(`href="${href}"`) || !home.includes(`>${label}</a>`)) {
    throw new Error(`Russian homepage navigation must expose ${label} (${href})`);
  }
}
if (!home.includes(`<a class="button yellow" href="/ru/life-os/">${primaryCta}</a>`)) {
  throw new Error("Russian homepage primary CTA must open the localized library");
}

console.log(`Patched Russian discovery/localization UX on ${patched} page(s); corrected counters on ${counterPages} page(s).`);
