import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const maintainerLine = "Maintained by MetalHatsCats.";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const sourceLocale = (profile.locales || []).find((entry) => entry.code === profile.sourceLocale);
if (!sourceLocale) throw new Error("[localization-cluster] canonical source locale is not registered");

const humanLocales = (profile.locales || []).filter((entry) => entry.role === "human-interface");
const releaseLocales = humanLocales.filter((entry) =>
  ["reviewed-partial", "published"].includes(entry.status) && entry.searchPublication !== "none"
);
const allLanguageTags = new Set([sourceLocale.languageTag, ...humanLocales.map((entry) => entry.languageTag), "x-default"]);
const buildSha = process.env.GITHUB_SHA || null;

const canonicalUrl = (pathname) => `${base}${pathname.endsWith("/") ? pathname : `${pathname}/`}`;
const routeFile = (pathname) => pathname === "/"
  ? path.join(root, "index.html")
  : path.join(root, pathname.replace(/^\//, "").replace(/\/$/, ""), "index.html");

function stripLanguageAlternates(html) {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const hreflang = tag.match(/\bhreflang=["']([^"']+)["']/i)?.[1];
    return rel === "alternate" && hreflang && allLanguageTags.has(hreflang) ? "" : tag;
  });
}

function alternateMarkup(canonicalPath, variants) {
  const lines = [
    `<link rel="alternate" hreflang="${sourceLocale.languageTag}" href="${canonicalUrl(canonicalPath)}">`,
  ];
  for (const variant of variants) {
    lines.push(`<link rel="alternate" hreflang="${variant.locale.languageTag}" href="${variant.route.url}">`);
  }
  lines.push(`<link rel="alternate" hreflang="x-default" href="${canonicalUrl(canonicalPath)}">`);
  return `${lines.join("\n")}\n`;
}

function stripLocaleAnchors(fragment) {
  return fragment.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (tag) => {
    const hreflang = tag.match(/\bhreflang=["']([^"']+)["']/i)?.[1];
    return hreflang && allLanguageTags.has(hreflang) ? "" : tag;
  });
}

function switchMarkup(currentCode, canonicalPath, variants) {
  const links = [];
  if (currentCode !== sourceLocale.code) {
    links.push(`<a lang="${sourceLocale.languageTag}" hreflang="${sourceLocale.languageTag}" href="${canonicalPath}">${sourceLocale.label}</a>`);
  }
  for (const variant of variants) {
    if (variant.locale.code === currentCode) continue;
    links.push(`<a lang="${variant.locale.languageTag}" hreflang="${variant.locale.languageTag}" href="${variant.route.path}">${variant.locale.label}</a>`);
  }
  return links.join("");
}

function normalizeSwitchContainer(html, className, currentCode, canonicalPath, variants) {
  const pattern = new RegExp(`(<div\\s+class=["']${className}["']>)([\\s\\S]*?)(<\\/div>)`, "i");
  if (!pattern.test(html)) return { html, found: false };
  return {
    found: true,
    html: html.replace(pattern, (_all, open, body, close) => `${open}${stripLocaleAnchors(body)}${switchMarkup(currentCode, canonicalPath, variants)}${close}`),
  };
}

function ensureMaintainerAttribution(html) {
  if (html.includes(maintainerLine)) return html;
  const footerIndex = html.indexOf('<footer class="footer">');
  if (footerIndex < 0) throw new Error("[localization-cluster] missing site footer while applying maintainer attribution");
  const head = html.slice(0, footerIndex);
  const footer = html.slice(footerIndex);
  const marker = '</div><div class="footer-links">';
  if (!footer.includes(marker)) throw new Error("[localization-cluster] footer structure drifted while applying maintainer attribution");
  return `${head}${footer.replace(marker, `<small>${maintainerLine}</small></div><div class="footer-links">`)}`;
}

async function normalizePage(file, currentCode, canonicalPath, variants) {
  let html = await readFile(file, "utf8");
  html = stripLanguageAlternates(html);
  if (!html.includes("</head>")) throw new Error(`[localization-cluster] missing </head> in ${path.relative(root, file)}`);
  // Stripped alternate links leave their newline separators behind; collapse
  // blank-line runs inside the head only (head whitespace is insignificant)
  // so repeated builds cannot accumulate empty lines before re-injection.
  html = html.replace(/<head[\s\S]*?<\/head>/i, (head) => head.replace(/\n{3,}/g, "\n\n"));
  html = html.replace("</head>", `${alternateMarkup(canonicalPath, variants)}</head>`);

  const nav = normalizeSwitchContainer(html, "links", currentCode, canonicalPath, variants);
  html = nav.html;
  if (!nav.found) throw new Error(`[localization-cluster] missing primary navigation switch container in ${path.relative(root, file)}`);
  const footer = normalizeSwitchContainer(html, "footer-links", currentCode, canonicalPath, variants);
  html = footer.html;
  html = ensureMaintainerAttribution(html);
  if (!html.includes(maintainerLine)) throw new Error(`[localization-cluster] maintainer attribution missing in ${path.relative(root, file)}`);
  await writeFile(file, html);
}

const manifests = new Map();
const routeMaps = new Map();
for (const locale of humanLocales) {
  const manifest = JSON.parse(await readFile(path.join(root, locale.code, "manifest.json"), "utf8"));
  if (manifest.locale !== locale.code) throw new Error(`[localization-cluster] ${locale.code} manifest locale drift`);
  manifests.set(locale.code, manifest);
  routeMaps.set(locale.code, new Map((manifest.routes || []).map((route) => [route.canonical_path, route])));
}

const allCanonicalPaths = new Set();
for (const manifest of manifests.values()) {
  for (const route of manifest.routes || []) allCanonicalPaths.add(route.canonical_path);
}

const clusterRoutes = [];
for (const canonicalPath of [...allCanonicalPaths].sort()) {
  const variants = releaseLocales
    .map((locale) => ({ locale, route: routeMaps.get(locale.code)?.get(canonicalPath) }))
    .filter((entry) => entry.route);

  const canonicalFile = routeFile(canonicalPath);
  await normalizePage(canonicalFile, sourceLocale.code, canonicalPath, variants);
  for (const variant of variants) {
    await normalizePage(routeFile(variant.route.path), variant.locale.code, canonicalPath, variants);
  }

  if (variants.length) {
    clusterRoutes.push({
      canonical_path: canonicalPath,
      canonical_url: canonicalUrl(canonicalPath),
      alternates: {
        [sourceLocale.languageTag]: canonicalUrl(canonicalPath),
        ...Object.fromEntries(variants.map((variant) => [variant.locale.languageTag, variant.route.url])),
        "x-default": canonicalUrl(canonicalPath),
      },
    });
  }
}

const cluster = {
  schema_version: 1,
  build_sha: buildSha,
  source_locale: profile.sourceLocale,
  locales: [
    { code: sourceLocale.code, language_tag: sourceLocale.languageTag, status: sourceLocale.status, search_publication: sourceLocale.searchPublication },
    ...releaseLocales.map((locale) => ({
      code: locale.code,
      language_tag: locale.languageTag,
      status: locale.status,
      search_publication: locale.searchPublication,
    })),
  ],
  routes: clusterRoutes,
};
await writeFile(path.join(root, "localization-cluster.json"), `${JSON.stringify(cluster, null, 2)}\n`);

const robotsPath = path.join(root, "robots.txt");
let robots = await readFile(robotsPath, "utf8");
for (const locale of humanLocales) {
  const line = `Sitemap: ${base}${locale.routePrefix}sitemap.xml`;
  robots = robots.split("\n").filter((item) => item.trim() !== line).join("\n");
}
robots = robots.trimEnd();
for (const locale of releaseLocales) robots += `\nSitemap: ${base}${locale.routePrefix}sitemap.xml`;
robots += "\n";
await writeFile(robotsPath, robots);

console.log(`[localization-cluster] finalized ${clusterRoutes.length} reciprocal route cluster(s) for ${[sourceLocale.code, ...releaseLocales.map((locale) => locale.code)].join(", ")}; maintainer=${maintainerLine}`);
