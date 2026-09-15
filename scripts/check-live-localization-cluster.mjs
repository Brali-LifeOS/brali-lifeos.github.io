import { readFile } from "node:fs/promises";

const profile = JSON.parse(await readFile(".arwp/localization.json", "utf8"));
const base = (process.env.BRALI_LIVE_BASE_URL || profile.site || "https://brali-lifeos.github.io/").replace(/\/$/, "");
const expectedSha = process.env.GITHUB_SHA || null;
const source = (profile.locales || []).find((entry) => entry.code === profile.sourceLocale);
if (!source) throw new Error("[live-localization-cluster] source locale missing");
const releaseLocales = (profile.locales || []).filter((entry) =>
  entry.role === "human-interface"
  && ["reviewed-partial", "published"].includes(entry.status)
  && entry.searchPublication !== "none"
);
const expectedCodes = [source.code, ...releaseLocales.map((entry) => entry.code)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(pathname, attempts = 6) {
  const separator = pathname.includes("?") ? "&" : "?";
  const url = `${base}${pathname}${separator}verify=${encodeURIComponent(expectedSha || "unknown")}`;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
          "user-agent": "Brali-Live-Localization-Cluster/1.0",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(1500 * attempt);
    }
  }
  throw new Error(`[live-localization-cluster] could not fetch ${pathname}: ${lastError?.message || "unknown"}`);
}

const cluster = JSON.parse(await fetchText("/localization-cluster.json"));
const actualCodes = (cluster.locales || []).map((entry) => entry.code);
if (JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes)) {
  throw new Error(`[live-localization-cluster] deployed locale set drift: expected ${expectedCodes.join(",")}; got ${actualCodes.join(",")}`);
}
if (expectedSha && expectedSha !== "unknown" && cluster.build_sha !== expectedSha) {
  throw new Error(`[live-localization-cluster] deployed artifact SHA ${cluster.build_sha || "missing"} != expected ${expectedSha}`);
}
if (cluster.source_locale !== profile.sourceLocale) throw new Error("[live-localization-cluster] source locale drift");

function parseAlternates(html) {
  const result = new Map();
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const language = tag.match(/\bhreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (rel !== "alternate" || !language || !href) continue;
    const values = result.get(language) || [];
    values.push(href);
    result.set(language, values);
  }
  return result;
}

async function verifyRoute(pathname, row) {
  const html = await fetchText(pathname, 4);
  const alternates = parseAlternates(html);
  for (const [language, href] of Object.entries(row.alternates || {})) {
    const values = alternates.get(language) || [];
    if (values.length !== 1 || values[0] !== href) {
      throw new Error(`[live-localization-cluster] ${pathname}: ${language} must resolve uniquely to ${href}; got ${values.join(",") || "missing"}`);
    }
  }
}

const routeRows = cluster.routes || [];
if (!routeRows.length) throw new Error("[live-localization-cluster] deployed cluster contains no routes");
const byCanonical = new Map(routeRows.map((row) => [row.canonical_path, row]));
const representativePaths = ["/", "/life-os/", "/life-os/flagships/", "/life-os/methodology/", "/research/", "/partners/", "/for-ai/"];
const articleRows = routeRows.filter((row) => /^\/life-os\/[^/]+\/$/.test(row.canonical_path));
for (const index of [0, Math.floor(articleRows.length / 2), Math.max(0, articleRows.length - 1)]) {
  if (articleRows[index]) representativePaths.push(articleRows[index].canonical_path);
}

for (const canonicalPath of [...new Set(representativePaths)]) {
  const row = byCanonical.get(canonicalPath);
  if (!row) throw new Error(`[live-localization-cluster] representative cluster row missing ${canonicalPath}`);
  if (row.alternates?.[source.languageTag] !== row.canonical_url || row.alternates?.["x-default"] !== row.canonical_url) {
    throw new Error(`[live-localization-cluster] ${canonicalPath}: source/x-default drift`);
  }
  await verifyRoute(canonicalPath, row);
  for (const locale of releaseLocales) {
    const url = row.alternates?.[locale.languageTag];
    if (!url) throw new Error(`[live-localization-cluster] ${canonicalPath}: missing ${locale.languageTag} alternate`);
    const pathname = new URL(url).pathname;
    await verifyRoute(pathname, row);
  }
}

console.log(`[live-localization-cluster] exact deployed SHA ${cluster.build_sha || "unavailable"}; verified ${[...new Set(representativePaths)].length} reciprocal route clusters for ${expectedCodes.join(", ")}`);
