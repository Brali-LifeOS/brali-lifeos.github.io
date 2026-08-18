import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const fail = (message) => { throw new Error(`Flagship 100 validation failed: ${message}`); };

const policy = read("data/flagship-100-policy.json");
const startHere = read(policy.anchor_source);
const areas = read("data/life-areas.json");
const core = read("life-os/datasets/flagship-100.json");
const candidates = read("life-os/datasets/flagship-100-candidates.json");
const protocols = read("life-os/datasets/protocols.json");
const platform = read("data/platform.json");
const api = read(`api/${platform.api_version}/flagships.json`);
const apiIndex = read(`api/${platform.api_version}/index.json`);
const openapi = read(`api/${platform.api_version}/openapi.json`);
const manifest = read("life-os/datasets/manifest.json");
const page = fs.readFileSync(path.join(ROOT, "life-os/flagships/100/index.html"), "utf8");
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");

const target = Number(policy.target_count || 100);
if (core.count !== target || core.entries?.length !== target || core.target_met !== true) fail(`expected exactly ${target} selected protocols`);
if (candidates.summary?.selected !== target) fail("candidate queue selected count differs from core");
if (candidates.summary?.eligible < target) fail("candidate queue has fewer eligible protocols than target");
const selectedCandidates = (candidates.entries || []).filter((entry) => entry.selected);
if (selectedCandidates.length !== target) fail("candidate selected flags do not match target");

const trusted = new Set(policy.trusted_states || []);
const protocolSlugs = new Set((protocols.entries || []).map((entry) => entry.slug));
const selectedSlugs = new Set();
for (const entry of core.entries || []) {
  if (selectedSlugs.has(entry.slug)) fail(`duplicate selected protocol ${entry.slug}`);
  selectedSlugs.add(entry.slug);
  if (!protocolSlugs.has(entry.slug)) fail(`${entry.slug} is absent from the trusted Protocol Feed`);
  if (!trusted.has(entry.evidence?.status)) fail(`${entry.slug} has untrusted evidence state ${entry.evidence?.status}`);
  for (const field of ["canonical_id", "protocol_id", "slug", "url", "title", "description", "action", "life_area"]) {
    const value = field === "life_area" ? entry.life_area?.slug : entry[field];
    if (!value) fail(`${entry.slug}: missing ${field}`);
  }
  if (entry.sensitive && !(entry.evidence?.status === "reviewed" && entry.evidence?.source_url)) {
    fail(`${entry.slug}: safety-sensitive item lacks reviewed source`);
  }
  const queueEntry = (candidates.entries || []).find((candidate) => candidate.slug === entry.slug);
  if (!queueEntry?.eligible || !queueEntry?.selected) fail(`${entry.slug}: selected without eligible candidate record`);
  if (!page.includes(`/life-os/${entry.slug}/`)) fail(`${entry.slug}: missing from Flagship 100 page`);
}

for (const slug of Object.values(startHere.areas || {})) if (!selectedSlugs.has(slug)) fail(`manual Start Here anchor ${slug} is missing`);
for (const area of areas) if (!(core.summary?.life_areas?.[area.slug] > 0)) fail(`Life Area ${area.slug} has no Flagship 100 coverage`);

if (JSON.stringify(api) !== JSON.stringify(core)) fail("API flagships endpoint differs from canonical Flagship 100 dataset");
if (!(apiIndex.endpoints || []).includes("flagships.json")) fail("API index does not expose flagships.json");
if (!openapi.paths?.[`/api/${platform.api_version}/flagships.json`]) fail("OpenAPI does not describe flagships endpoint");

for (const rel of ["life-os/datasets/flagships.json", "life-os/datasets/flagship-100.json", "life-os/datasets/flagship-100-candidates.json", "data/flagship-100-policy.json"]) {
  const item = (manifest.files || []).find((entry) => entry.path === rel);
  if (!item) fail(`manifest missing ${rel}`);
  if (!exists(rel)) fail(`missing ${rel}`);
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (item.sha256 !== hash(text)) fail(`manifest checksum mismatch for ${rel}`);
}
if (JSON.stringify(read(`api/${platform.api_version}/manifest.json`)) !== JSON.stringify(manifest)) fail("API manifest drift after Flagship 100 build");
if (!sitemap.includes("<loc>https://brali-lifeos.github.io/life-os/flagships/100/</loc>")) fail("sitemap lacks Flagship 100 page");

console.log(`Flagship 100 verified: ${target} unique trusted protocols, all 7 Start Here anchors retained, ${core.summary.topic_mapped} topic-mapped, ${core.summary.source_linked} source-linked.`);
