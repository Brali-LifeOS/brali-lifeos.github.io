import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadProtocolOverrides } from "./lib/protocol-overrides.mjs";

const root = process.cwd();
const config = JSON.parse(await readFile(path.join(root, "data/flagship-protocols.json"), "utf8"));
const areas = JSON.parse(await readFile(path.join(root, "data/life-areas.json"), "utf8"));
const dataset = JSON.parse(await readFile(path.join(root, "life-os/datasets/flagships.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const curated = await loadProtocolOverrides(root);
const page = await readFile(path.join(root, "life-os/flagships/index.html"), "utf8");
const homepage = await readFile(path.join(root, "index.html"), "utf8");
const library = await readFile(path.join(root, "life-os/index.html"), "utf8");
const areaPage = await readFile(path.join(root, "life-os/areas/index.html"), "utf8");
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const evidenceBySlug = new Map((evidence.entries ?? []).map((entry) => [entry.slug, entry]));
const feedSlugs = new Set((protocols.entries ?? []).map((entry) => entry.slug));
const failures = [];

if (dataset.count !== areas.length || (dataset.entries ?? []).length !== areas.length) failures.push("flagship count does not match Life Areas");
if (Object.keys(config.areas ?? {}).length !== areas.length) failures.push("flagship config does not cover every Life Area");
const seenAreas = new Set();
const seenProtocols = new Set();
for (const entry of dataset.entries ?? []) {
  if (seenAreas.has(entry.life_area?.slug) || seenProtocols.has(entry.slug)) failures.push(`${entry.slug}: duplicate area or protocol`);
  seenAreas.add(entry.life_area?.slug);
  seenProtocols.add(entry.slug);
  if (!areas.some((area) => area.slug === entry.life_area?.slug)) failures.push(`${entry.slug}: unknown Life Area`);
  if (config.areas?.[entry.life_area?.slug] !== entry.slug) failures.push(`${entry.slug}: does not match flagship config`);
  if (!curated.entries?.[entry.slug]) failures.push(`${entry.slug}: is not curated`);
  if (evidenceBySlug.get(entry.slug)?.indexable !== true) failures.push(`${entry.slug}: is not indexable`);
  if (!feedSlugs.has(entry.slug)) failures.push(`${entry.slug}: missing from trusted protocol feed`);
  if (!page.includes(`/life-os/${entry.slug}/`)) failures.push(`${entry.slug}: missing from flagship page`);
}
for (const area of areas) if (!seenAreas.has(area.slug)) failures.push(`${area.slug}: has no flagship protocol`);
for (const [name, surface] of [["homepage", homepage], ["library", library], ["areas", areaPage]]) {
  if (!surface.includes('/life-os/flagships/')) failures.push(`${name}: missing flagship link`);
}
if (!homepage.includes('Start with 7 selected protocols')) failures.push("homepage lacks the simple flagship CTA");
if (!sitemap.includes('<loc>https://brali-lifeos.github.io/life-os/flagships/</loc>')) failures.push("sitemap lacks flagship collection");

if (failures.length) throw new Error(`Flagship collection validation failed with ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
const reviewed = (dataset.entries ?? []).filter((entry) => entry.evidence_status === "reviewed").length;
console.log(`Flagship collection verified: ${dataset.entries.length} selected starting protocols cover all ${areas.length} Life Areas; ${reviewed} source-reviewed flagship(s).`);
