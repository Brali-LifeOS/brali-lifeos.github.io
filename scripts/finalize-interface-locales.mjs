import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const locales = (profile.locales || []).filter((entry) => entry.role === "human-interface" && entry.generator === "generic-v1");
const buildSha = process.env.GITHUB_SHA || null;

const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function routeFile(route) {
  const relative = route.replace(/^\//, "").replace(/\/$/, "");
  return path.join(root, relative, "index.html");
}

function formatDate(iso, locale) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(iso || "");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(locale.browserLocale || locale.languageTag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function normalizeRobotsMeta(html, locale) {
  html = html.replace(/<meta\b[^>]*name=["']robots["'][^>]*>\s*/gi, "");
  if (locale.searchPublication === "none") {
    if (!html.includes("</head>")) throw new Error(`[${locale.code}-finalize] cannot add noindex: missing </head>`);
    html = html.replace("</head>", `<meta name="robots" content="noindex,follow">\n</head>`);
  }
  return html;
}

async function normalizeRobotsSitemap(locale) {
  const robotsPath = path.join(root, "robots.txt");
  const sitemapLine = `Sitemap: ${base}${locale.routePrefix}sitemap.xml`;
  const robots = await readFile(robotsPath, "utf8");
  const lines = robots.split(/\r?\n/).filter((line) => line.trim() !== sitemapLine);
  if (locale.searchPublication !== "none") lines.push(sitemapLine);
  await writeFile(robotsPath, `${lines.filter((line, index, all) => line || index < all.length - 1).join("\n").trimEnd()}\n`);
}

for (const locale of locales) {
  const site = await readJson(`${locale.datasetRoot}/site.json`);
  if (site.locale !== locale.code) throw new Error(`[${locale.code}-finalize] site locale drift`);
  if (site.status !== locale.status) {
    throw new Error(`[${locale.code}-finalize] site status ${site.status} must match registry status ${locale.status}`);
  }

  const manifestPath = path.join(root, locale.code, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.locale !== locale.code) throw new Error(`[${locale.code}-finalize] manifest locale drift`);

  manifest.language_tag = locale.languageTag;
  manifest.direction = locale.direction || "ltr";
  manifest.role = locale.role;
  manifest.status = locale.status;
  manifest.search_publication = locale.searchPublication;
  manifest.route_prefix = locale.routePrefix;
  manifest.generator = locale.generator;
  manifest.build_sha = buildSha;
  manifest.release_proof = Array.isArray(locale.releaseProof) ? locale.releaseProof : [];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const library = await readJson(`${locale.code}/library.json`);
  const llms = `# Brali — ${locale.label}\n\nLocale: ${locale.code}\nLanguage tag: ${locale.languageTag}\nCanonical locale: ${profile.sourceLocale}\nStatus: ${locale.status}\nSearch publication: ${locale.searchPublication}\nNo silent fallback: true\nCoverage mode: ${library.coverage_mode}\nLocalized entries: ${library.count}\nCanonical entries: ${library.canonical_count}\n\n## Machine-readable surfaces\n- ${base}${locale.routePrefix}manifest.json\n- ${base}${locale.routePrefix}library.json\n- ${base}${locale.routePrefix}sitemap.xml\n\nCanonical IDs, slugs, evidence state and provenance remain owned by the canonical locale. Localization quality never promotes canonical trust state.\n`;
  await writeFile(path.join(root, locale.code, "llms.txt"), llms);

  const langPattern = new RegExp(`<html\\s+lang=["']${escapeRegExp(locale.languageTag)}["'][^>]*>`, "i");
  for (const route of manifest.routes || []) {
    const file = routeFile(route.path);
    let html = await readFile(file, "utf8");
    html = html.replace(langPattern, (tag) => {
      if (/\bdir=["']/i.test(tag)) return tag.replace(/\bdir=["'][^"']*["']/i, `dir="${locale.direction || "ltr"}"`);
      return tag.replace(/>$/, ` dir="${locale.direction || "ltr"}">`);
    });
    html = normalizeRobotsMeta(html, locale);
    html = html.replace(/>Locale manifest</g, ">manifest.json<");
    html = html.replace(/<time\b([^>]*?)datetime=["'](\d{4}-\d{2}-\d{2})["']([^>]*)>[\s\S]*?<\/time>/gi, (_whole, before, iso, after) => (
      `<time${before}datetime="${iso}"${after}>${formatDate(iso, locale)}</time>`
    ));
    await writeFile(file, html);
  }

  await normalizeRobotsSitemap(locale);
  console.log(`[${locale.code}-finalize] normalized ${manifest.routes?.length || 0} routes; status=${locale.status}; search=${locale.searchPublication}`);
}
