import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const navigation = JSON.parse(await readFile(path.join(root, "life-os/datasets/navigation.json"), "utf8"));
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const entriesByZone = new Map();
for (const entry of sourceIndex) {
  const list = entriesByZone.get(entry.zone.slug) ?? [];
  list.push(entry);
  entriesByZone.set(entry.zone.slug, list);
}

let failures = 0;
let verifiedLinks = 0;

for (const [zoneSlug, entries] of entriesByZone) {
  const expected = entries.filter((entry) => evidenceBySlug.get(entry.slug)?.indexable === true).map((entry) => entry.slug).sort();
  const withheld = entries.length - expected.length;
  const html = await readFile(path.join(root, "life-os", zoneSlug, "index.html"), "utf8");
  const section = html.match(/<section class="prose" data-trusted-zone-list="true">([\s\S]*?)<\/section>/);
  if (!section) {
    failures += 1;
    continue;
  }
  const actual = [...section[1].matchAll(/href="\/life-os\/([^/]+)\/"/g)]
    .map((match) => match[1])
    .filter((slug) => slug !== "methodology")
    .sort();
  const unique = [...new Set(actual)];
  if (actual.length !== unique.length) failures += 1;
  if (expected.length !== unique.length || expected.some((slug, index) => slug !== unique[index])) failures += 1;
  for (const slug of unique) if (evidenceBySlug.get(slug)?.indexable !== true) failures += 1;
  if (!section[1].includes(`${expected.length} discovery-ready ${expected.length === 1 ? "protocol" : "protocols"}`)) failures += 1;
  if (withheld > 0 && !section[1].includes(`${withheld} additional`)) failures += 1;

  const recorded = navigation.zones?.[zoneSlug];
  if (!recorded || recorded.ready !== expected.length || recorded.withheld !== withheld || recorded.total !== entries.length) failures += 1;
  verifiedLinks += unique.length;
}

const expectedReady = (evidence.entries ?? []).filter((record) => record.indexable === true).length;
const expectedWithheld = (evidence.entries ?? []).length - expectedReady;
if (navigation.total?.ready !== expectedReady || navigation.total?.withheld !== expectedWithheld || navigation.total?.all !== sourceIndex.length) failures += 1;

for (const area of areas) {
  const expectedZoneEntries = area.zones.flatMap((zone) => entriesByZone.get(zone) ?? []);
  const ready = expectedZoneEntries.filter((entry) => evidenceBySlug.get(entry.slug)?.indexable === true).length;
  const withheld = expectedZoneEntries.length - ready;
  const recorded = navigation.areas?.[area.slug];
  if (!recorded || recorded.ready !== ready || recorded.withheld !== withheld || recorded.total !== expectedZoneEntries.length || recorded.zones !== area.zones.length) failures += 1;

  const page = await readFile(path.join(root, "life-os/areas", area.slug, "index.html"), "utf8");
  if (!page.includes(`${ready} discovery-ready protocols are available across ${area.zones.length} detailed Growth Zones.`)) failures += 1;
  if (withheld > 0 && !page.includes(`${withheld} additional`)) failures += 1;
}

const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
if (!library.includes(`Browse ${expectedReady} discovery-ready protocols across ${entriesByZone.size} Growth Zones.`)) failures += 1;
const datasets = await readFile(path.join(root, "life-os/datasets/index.html"), "utf8");
if (!datasets.includes('/life-os/datasets/navigation.json')) failures += 1;

if (failures) throw new Error(`Trusted navigation validation failed with ${failures} problem(s).`);
console.log(`Trusted navigation verified: ${verifiedLinks} promoted protocol links across ${entriesByZone.size} Growth Zones; ${expectedWithheld} entries remain accessible but withheld from human discovery navigation.`);
