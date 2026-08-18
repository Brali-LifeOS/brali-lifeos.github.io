import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const publicIndex = JSON.parse(await readFile(path.join(root, "life-os-index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const publicBySlug = new Map(publicIndex.map((entry) => [entry.slug, entry]));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const entriesByZone = new Map();
for (const entry of sourceIndex) {
  const list = entriesByZone.get(entry.zone.slug) ?? [];
  list.push(entry);
  entriesByZone.set(entry.zone.slug, list);
}

const summary = { zones: {}, areas: {}, total: { ready: 0, withheld: 0, all: sourceIndex.length } };

for (const [zoneSlug, entries] of entriesByZone) {
  const ready = entries.filter((entry) => evidenceBySlug.get(entry.slug)?.indexable === true);
  const withheld = entries.length - ready.length;
  summary.zones[zoneSlug] = { ready: ready.length, withheld, total: entries.length };
  summary.total.ready += ready.length;
  summary.total.withheld += withheld;

  const links = ready
    .sort((a, b) => (publicBySlug.get(a.slug)?.displayTitle || a.title).localeCompare(publicBySlug.get(b.slug)?.displayTitle || b.title))
    .map((entry) => {
      const title = publicBySlug.get(entry.slug)?.displayTitle || entry.title;
      const description = entry.description ? `<span>${escapeHtml(entry.description.slice(0, 180))}</span>` : "";
      return `<li><a href="/life-os/${entry.slug}/">${escapeHtml(title)}</a>${description}</li>`;
    })
    .join("");

  const reviewNote = withheld
    ? `<p class="meta">${withheld} additional ${withheld === 1 ? "entry is" : "entries are"} awaiting editorial review and are not listed in trusted navigation. <a href="/life-os/methodology/">How content review works</a>.</p>`
    : "";
  const listing = ready.length === 0
    ? '<p>No entry in this Growth Zone currently meets the discovery quality bar. The source material remains under editorial review.</p>'
    : `<ul class="article-list">${links}</ul>`;
  const section = `<section class="prose" data-trusted-zone-list="true"><h2>${ready.length} discovery-ready ${ready.length === 1 ? "protocol" : "protocols"}</h2>${listing}${reviewNote}</section>`;

  const file = path.join(root, "life-os", zoneSlug, "index.html");
  let html = await readFile(file, "utf8");
  const originalPattern = /<section class="prose"><h2>\d+ practical entries<\/h2><ul class="article-list">[\s\S]*?<\/ul><\/section>/;
  if (!originalPattern.test(html)) throw new Error(`Could not locate generated entry list for Growth Zone ${zoneSlug}.`);
  html = html.replace(originalPattern, section);
  await writeFile(file, html);
}

for (const area of areas) {
  const zoneStats = area.zones.map((slug) => summary.zones[slug] ?? { ready: 0, withheld: 0, total: 0 });
  const ready = zoneStats.reduce((sum, item) => sum + item.ready, 0);
  const withheld = zoneStats.reduce((sum, item) => sum + item.withheld, 0);
  const total = zoneStats.reduce((sum, item) => sum + item.total, 0);
  summary.areas[area.slug] = { ready, withheld, total, zones: area.zones.length };
}

const pagesToUpdate = [
  path.join(root, "life-os/index.html"),
  path.join(root, "life-os/areas/index.html"),
  ...areas.map((area) => path.join(root, "life-os/areas", area.slug, "index.html")),
];

for (const file of pagesToUpdate) {
  let html = await readFile(file, "utf8");
  for (const [zoneSlug, stats] of Object.entries(summary.zones)) {
    const zoneLink = `/life-os/${zoneSlug}/`;
    const escapedLink = zoneLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(<article class="card"><span class="card-label">)[^<]*(</span><h3><a href="${escapedLink}">)`);
    if (pattern.test(html)) {
      const label = stats.ready > 0 ? `${stats.ready} ready · ${stats.total} total` : `review pending · ${stats.total} total`;
      html = html.replace(pattern, `$1${label}$2`);
    }
  }
  for (const [areaSlug, stats] of Object.entries(summary.areas)) {
    const areaLink = `/life-os/areas/${areaSlug}/`;
    const escapedLink = areaLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(<article class="card"><span class="card-label">)[^<]*(</span><h3><a href="${escapedLink}">)`);
    if (pattern.test(html)) html = html.replace(pattern, `$1${stats.ready} ready · ${stats.total} total$2`);
  }
  if (file.endsWith(path.join("life-os", "index.html"))) {
    html = html.replace(/Browse \d+ Life OS entries across \d+ Growth Zones\./, `Browse ${summary.total.ready} discovery-ready protocols across ${Object.keys(summary.zones).length} Growth Zones.`);
  }
  const area = areas.find((item) => file.endsWith(path.join("life-os", "areas", item.slug, "index.html")));
  if (area) {
    const stats = summary.areas[area.slug];
    html = html.replace(/<section class="prose"><p>\d+ practical entries are organized across \d+ detailed Growth Zones\. Choose the zone that best matches what you want to try or understand next\.<\/p><\/section>/,
      `<section class="prose"><p>${stats.ready} discovery-ready protocols are available across ${stats.zones} detailed Growth Zones. ${stats.withheld} additional ${stats.withheld === 1 ? "entry remains" : "entries remain"} under editorial review and are not promoted in trusted navigation.</p></section>`);
  }
  await writeFile(file, html);
}

await writeFile(path.join(root, "life-os/datasets/navigation.json"), JSON.stringify({
  schema_version: 1,
  rule: "Trusted navigation lists only reviewed and practical entries. Pending-review and restricted entries keep stable URLs but are not promoted in Growth Zone navigation.",
  ...summary,
}, null, 2));

const manifestPath = path.join(root, "life-os/datasets/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files = [...new Set([...(manifest.files ?? []), "navigation.json"] )];
manifest.trusted_navigation = summary.total;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const datasetsPath = path.join(root, "life-os/datasets/index.html");
let datasetsHtml = await readFile(datasetsPath, "utf8");
if (!datasetsHtml.includes("/life-os/datasets/navigation.json")) {
  datasetsHtml = datasetsHtml.replace("</ul>", '<li><a href="/life-os/datasets/navigation.json">Trusted navigation coverage (JSON)</a></li></ul>');
  await writeFile(datasetsPath, datasetsHtml);
}

console.log(`Trusted navigation applied: ${summary.total.ready} discovery-ready entries listed; ${summary.total.withheld} withheld from human discovery navigation.`);
