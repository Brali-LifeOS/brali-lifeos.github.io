import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const trustedStates = new Set(["reviewed", "practical"]);
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const skillName = (slug) => {
  const raw = String(slug);
  if (raw.length <= 64) return raw;
  return `${raw.slice(0, 55).replace(/-+$/, "")}-${sha256(raw).slice(0, 8)}`;
};
const expectedMode = (machine, trustedFeedSlugs) => {
  const state = machine.evidence?.status ?? "unknown";
  const trusted = trustedStates.has(state) && trustedFeedSlugs.has(machine.slug) && machine.discovery?.trusted_protocol_feed === true;
  if (trusted) return "usable";
  if (state === "pending-review") return "review-required";
  return "restricted-reference";
};

const sourceIndex = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const feed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const library = JSON.parse(await readFile(path.join(root, "skill-packs/library.json"), "utf8"));
const catalog = JSON.parse(await readFile(path.join(root, "skill-packs/catalog.json"), "utf8"));
const trustedFeedSlugs = new Set((feed.entries ?? []).filter((entry) => trustedStates.has(entry.evidence?.status)).map((entry) => entry.slug));
const failures = [];

if (library.schema_version !== 2) failures.push("library schema_version must be 2");
if (catalog.schema_version !== 2) failures.push("catalog schema_version must be 2");
if (library.specification !== "https://agentskills.io/specification") failures.push("library Agent Skills specification URL missing");
if (catalog.specification !== "https://agentskills.io/specification") failures.push("catalog Agent Skills specification URL missing");
if (library.count !== sourceIndex.length) failures.push(`full skill coverage drift: library=${library.count}, hacks=${sourceIndex.length}`);
if (!Array.isArray(library.entries) || library.entries.length !== sourceIndex.length) failures.push("library entries do not match full hack corpus count");
if (catalog.count !== trustedFeedSlugs.size) failures.push(`trusted catalog count ${catalog.count} != trusted feed ${trustedFeedSlugs.size}`);
if (!Array.isArray(catalog.entries) || catalog.entries.length !== trustedFeedSlugs.size) failures.push("catalog entries do not match trusted feed count");
if (catalog.total_skill_artifacts !== sourceIndex.length) failures.push("catalog total_skill_artifacts does not match full hack corpus");
for (const host of ["Claude Code", "Hermes Agent", "OpenClaw"]) {
  if (!(catalog.compatible_hosts ?? []).includes(host)) failures.push(`catalog compatible_hosts missing ${host}`);
}

const libraryBySlug = new Map((library.entries ?? []).map((entry) => [entry.slug, entry]));
const catalogBySlug = new Map((catalog.entries ?? []).map((entry) => [entry.slug, entry]));
const emittedNames = new Set();
const expectedCounts = { usable: 0, "review-required": 0, "restricted-reference": 0 };

for (const sourceEntry of sourceIndex) {
  const machine = JSON.parse(await readFile(path.join(root, "life-os", sourceEntry.slug, "index.json"), "utf8"));
  const mode = expectedMode(machine, trustedFeedSlugs);
  const trusted = mode === "usable";
  expectedCounts[mode] += 1;
  const skill = libraryBySlug.get(sourceEntry.slug);
  if (!skill) {
    failures.push(`${sourceEntry.slug}: missing from complete skill library`);
    continue;
  }

  const expectedName = skillName(sourceEntry.slug);
  if (!namePattern.test(skill.name) || skill.name.length > 64) failures.push(`${sourceEntry.slug}: invalid skill name`);
  if (skill.name !== expectedName) failures.push(`${sourceEntry.slug}: deterministic skill name mismatch`);
  if (emittedNames.has(skill.name)) failures.push(`${sourceEntry.slug}: duplicate generated skill name ${skill.name}`);
  emittedNames.add(skill.name);
  if (skill.protocol_id !== machine.protocol_id) failures.push(`${sourceEntry.slug}: protocol ID mismatch`);
  if (skill.canonical_protocol_url !== machine.canonical_url) failures.push(`${sourceEntry.slug}: canonical URL mismatch`);
  if (skill.machine_record_url !== machine.machine_url) failures.push(`${sourceEntry.slug}: machine record URL mismatch`);
  if (skill.evidence_state !== machine.evidence?.status) failures.push(`${sourceEntry.slug}: evidence state mismatch`);
  if (skill.skill_mode !== mode) failures.push(`${sourceEntry.slug}: skill mode ${skill.skill_mode} != ${mode}`);
  if (Boolean(skill.recommendation_eligible) !== trusted || Boolean(skill.operational_guidance) !== trusted) failures.push(`${sourceEntry.slug}: trust behavior mismatch`);
  if (skill.verification?.status !== "brali-ci-verified") failures.push(`${sourceEntry.slug}: verification status missing`);
  if (!sha256Pattern.test(skill.verification?.sha256 ?? "")) failures.push(`${sourceEntry.slug}: invalid verification SHA-256`);
  if (skill.verification?.source_protocol_id !== machine.protocol_id) failures.push(`${sourceEntry.slug}: verification source protocol mismatch`);
  if (!skill.install?.claude_code?.personal_path || !skill.install?.hermes_agent?.command || !skill.install?.openclaw?.global_path) failures.push(`${sourceEntry.slug}: host install metadata incomplete`);

  if (trusted) {
    if (!catalogBySlug.has(sourceEntry.slug)) failures.push(`${sourceEntry.slug}: usable skill missing from trusted catalog`);
  } else if (catalogBySlug.has(sourceEntry.slug)) {
    failures.push(`${sourceEntry.slug}: review-gated skill leaked into trusted catalog`);
  }

  const directory = path.join(root, "skill-packs", sourceEntry.slug);
  const mdPath = path.join(directory, "SKILL.md");
  const pagePath = path.join(directory, "index.html");
  const jsonPath = path.join(directory, "skill.json");
  try {
    await Promise.all([access(mdPath), access(pagePath), access(jsonPath)]);
  } catch {
    failures.push(`${sourceEntry.slug}: generated skill files missing`);
    continue;
  }

  const markdown = await readFile(mdPath, "utf8");
  const page = await readFile(pagePath, "utf8");
  const metadata = JSON.parse(await readFile(jsonPath, "utf8"));
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  if (!frontmatter.includes(`name: ${expectedName}\n`)) failures.push(`${sourceEntry.slug}: SKILL.md name mismatch`);
  for (const marker of ["description: ", "license: ", "compatibility: ", "metadata:\n", "brali-evidence-state: ", "brali-skill-mode: ", "brali-recommendation-eligible: ", "brali-verification: ", "agent-skills-spec: "]) {
    if (!frontmatter.includes(marker)) failures.push(`${sourceEntry.slug}: SKILL.md missing ${marker.trim()}`);
  }
  if (!markdown.includes(machine.protocol_id) || !markdown.includes(machine.canonical_url)) failures.push(`${sourceEntry.slug}: provenance missing from SKILL.md`);
  if (!markdown.includes("Never upgrade a pending-review or restricted record into trusted guidance")) failures.push(`${sourceEntry.slug}: trust-state guardrail missing`);
  if (mode === "usable" && !markdown.includes("## Protocol\n")) failures.push(`${sourceEntry.slug}: usable skill missing protocol section`);
  if (mode === "review-required" && !markdown.includes("## Draft action under review\n")) failures.push(`${sourceEntry.slug}: pending-review skill missing review-only draft section`);
  if (mode === "restricted-reference" && (markdown.includes("## Protocol\n") || markdown.includes("## Draft action under review\n"))) failures.push(`${sourceEntry.slug}: restricted skill leaked operational steps`);

  const actualHash = sha256(markdown);
  if (skill.verification?.sha256 !== actualHash) failures.push(`${sourceEntry.slug}: library SHA-256 mismatch`);
  if (metadata.verification?.sha256 !== actualHash) failures.push(`${sourceEntry.slug}: skill.json SHA-256 mismatch`);
  if (metadata.name !== expectedName || metadata.slug !== sourceEntry.slug || metadata.protocol_id !== machine.protocol_id) failures.push(`${sourceEntry.slug}: skill.json identity mismatch`);
  if (metadata.skill_mode !== mode || Boolean(metadata.recommendation_eligible) !== trusted) failures.push(`${sourceEntry.slug}: skill.json trust mode mismatch`);
  if (!page.includes(`<link rel="canonical" href="https://brali-lifeos.github.io/skill-packs/${sourceEntry.slug}/">`)) failures.push(`${sourceEntry.slug}: canonical skill page URL missing`);
  if (!page.includes("./SKILL.md") || !page.includes(machine.canonical_url)) failures.push(`${sourceEntry.slug}: skill page does not link artifact/canonical record`);
  if (!page.includes("Claude Code") || !page.includes("Hermes Agent") || !page.includes("OpenClaw")) failures.push(`${sourceEntry.slug}: host installation guidance missing`);
  if (!page.includes("Brali CI verified") || !page.includes(actualHash)) failures.push(`${sourceEntry.slug}: visible verification details missing`);
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(page);
  if (trusted && noindex) failures.push(`${sourceEntry.slug}: usable skill page is unexpectedly noindex`);
  if (!trusted && !noindex) failures.push(`${sourceEntry.slug}: review-gated skill page must be noindex`);
}

for (const [mode, count] of Object.entries(expectedCounts)) {
  if (library.counts_by_mode?.[mode] !== count) failures.push(`library ${mode} count ${library.counts_by_mode?.[mode]} != expected ${count}`);
}
for (const slug of libraryBySlug.keys()) if (!sourceIndex.some((entry) => entry.slug === slug)) failures.push(`${slug}: library contains skill outside current hack corpus`);
for (const slug of catalogBySlug.keys()) if (!trustedFeedSlugs.has(slug)) failures.push(`${slug}: trusted catalog contains non-trusted skill`);

if (failures.length) {
  throw new Error(`Agent Skill validation failed (${failures.length}):\n${failures.slice(0, 100).join("\n")}${failures.length > 100 ? `\n... ${failures.length - 100} more` : ""}`);
}
console.log(`Agent Skills verified: ${sourceIndex.length}/${sourceIndex.length} hacks covered; usable=${expectedCounts.usable}, review-required=${expectedCounts["review-required"]}, restricted-reference=${expectedCounts["restricted-reference"]}; trusted catalog=${trustedFeedSlugs.size}; one-skill-per-hack invariant enforced.`);
