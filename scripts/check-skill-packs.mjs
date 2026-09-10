import { readFile, access } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const trustedStates = new Set(["reviewed", "practical"]);
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skillName = (slug) => String(slug).slice(0, 64).replace(/-+$/, "");
const feed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const catalog = JSON.parse(await readFile(path.join(root, "skill-packs/catalog.json"), "utf8"));
const trusted = (feed.entries ?? []).filter((entry) => trustedStates.has(entry.evidence?.status));
const failures = [];

if (catalog.schema_version !== 1) failures.push("catalog schema_version must be 1");
if (catalog.count !== trusted.length) failures.push(`catalog count ${catalog.count} != trusted feed ${trusted.length}`);
if (!Array.isArray(catalog.entries) || catalog.entries.length !== trusted.length) failures.push("catalog entries do not match trusted feed count");

const bySlug = new Map((catalog.entries ?? []).map((entry) => [entry.slug ?? entry.name, entry]));
for (const protocol of trusted) {
  const skill = bySlug.get(protocol.slug);
  if (!skill) {
    failures.push(`${protocol.slug}: missing from skill catalog`);
    continue;
  }
  if (!namePattern.test(skill.name) || skill.name.length > 64) failures.push(`${protocol.slug}: invalid skill name`);
  if (skill.name !== skillName(protocol.slug)) failures.push(`${protocol.slug}: deterministic skill name mismatch`);
  if (skill.protocol_id !== protocol.protocol_id) failures.push(`${protocol.slug}: protocol ID mismatch`);
  if (skill.canonical_protocol_url !== protocol.url) failures.push(`${protocol.slug}: canonical URL mismatch`);
  if (skill.evidence_state !== protocol.evidence?.status) failures.push(`${protocol.slug}: evidence state mismatch`);
  if (!trustedStates.has(skill.evidence_state)) failures.push(`${protocol.slug}: non-trusted skill emitted`);

  const directory = path.join(root, "skill-packs", protocol.slug);
  const mdPath = path.join(directory, "SKILL.md");
  const pagePath = path.join(directory, "index.html");
  const jsonPath = path.join(directory, "skill.json");
  try {
    await Promise.all([access(mdPath), access(pagePath), access(jsonPath)]);
  } catch {
    failures.push(`${protocol.slug}: generated files missing`);
    continue;
  }

  const markdown = await readFile(mdPath, "utf8");
  const page = await readFile(pagePath, "utf8");
  const metadata = JSON.parse(await readFile(jsonPath, "utf8"));
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  if (!frontmatter.includes(`name: ${skillName(protocol.slug)}\n`)) failures.push(`${protocol.slug}: SKILL.md name mismatch`);
  if (!frontmatter.includes("description: ")) failures.push(`${protocol.slug}: SKILL.md description missing`);
  if (!frontmatter.includes("license: ")) failures.push(`${protocol.slug}: SKILL.md license missing`);
  if (!frontmatter.includes("metadata:\n")) failures.push(`${protocol.slug}: SKILL.md provenance metadata missing`);
  for (const forbidden of ["canonical_id:", "canonical_url:", "evidence_state:"]) {
    if (frontmatter.split("\n").some((line) => line.startsWith(forbidden))) failures.push(`${protocol.slug}: custom field ${forbidden} must live under metadata`);
  }
  if (!markdown.includes(protocol.protocol_id) || !markdown.includes(protocol.url)) failures.push(`${protocol.slug}: provenance missing from SKILL.md`);
  if (!page.includes(`<link rel="canonical" href="https://brali-lifeos.github.io/skill-packs/${protocol.slug}/">`)) failures.push(`${protocol.slug}: canonical skill page URL missing`);
  if (!page.includes("./SKILL.md") || !page.includes(protocol.url)) failures.push(`${protocol.slug}: skill page does not link artifact/protocol`);
  if (!page.includes('meta name="robots" content="index,follow')) failures.push(`${protocol.slug}: skill page is not explicitly indexable`);
  if (metadata.name !== skillName(protocol.slug) || metadata.slug !== protocol.slug || metadata.protocol_id !== protocol.protocol_id) failures.push(`${protocol.slug}: skill.json mismatch`);
}

const catalogSlugs = [...bySlug.keys()];
const trustedSlugs = new Set(trusted.map((entry) => entry.slug));
for (const slug of catalogSlugs) {
  if (!trustedSlugs.has(slug)) failures.push(`${slug}: catalog contains a record outside the trusted feed`);
}

if (failures.length) {
  throw new Error(`Skill pack validation failed (${failures.length}):\n${failures.slice(0, 60).join("\n")}`);
}
console.log(`Skill packs verified: ${trusted.length} stable indexable pages, portable Agent Skills files, and provenance records; pending/restricted emitted=0.`);