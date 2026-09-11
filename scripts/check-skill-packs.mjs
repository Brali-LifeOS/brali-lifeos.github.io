import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "data/life-os-content");
const base = "https://brali-lifeos.github.io";
const trustedStates = new Set(["reviewed", "practical"]);
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const skillName = (slug) => {
  const raw = String(slug);
  return raw.length <= 64 ? raw : `${raw.slice(0, 55).replace(/-+$/, "")}-${sha256(raw).slice(0, 8)}`;
};

const sourceIndex = JSON.parse(await readFile(path.join(sourceRoot, "index.json"), "utf8"));
const evidenceDoc = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const feed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const library = JSON.parse(await readFile(path.join(root, "skill-packs/library.json"), "utf8"));
const catalog = JSON.parse(await readFile(path.join(root, "skill-packs/catalog.json"), "utf8"));
const evidenceBySlug = new Map((evidenceDoc.entries ?? []).map((entry) => [entry.slug, entry]));
const trustedBySlug = new Map((feed.entries ?? []).map((entry) => [entry.slug, entry]));
const libraryBySlug = new Map((library.entries ?? []).map((entry) => [entry.slug, entry]));
const catalogBySlug = new Map((catalog.entries ?? []).map((entry) => [entry.slug, entry]));
const failures = [];
const expectedCounts = { usable: 0, "review-required": 0, "restricted-reference": 0 };
const emittedNames = new Set();

const expectedMode = (trust, hasTrustedProtocol) => {
  if (hasTrustedProtocol && trustedStates.has(trust?.status) && trust?.indexable === true) return "usable";
  if (trust?.status === "pending-review") return "review-required";
  return "restricted-reference";
};

if (library.schema_version !== 2) failures.push("library schema_version must be 2");
if (catalog.schema_version !== 2) failures.push("catalog schema_version must be 2");
if (library.specification !== "https://agentskills.io/specification") failures.push("library Agent Skills specification missing");
if (catalog.specification !== "https://agentskills.io/specification") failures.push("catalog Agent Skills specification missing");
if (evidenceBySlug.size !== sourceIndex.length) failures.push(`evidence/source parity drift: ${evidenceBySlug.size}/${sourceIndex.length}`);
if (library.count !== sourceIndex.length || (library.entries ?? []).length !== sourceIndex.length) failures.push(`one-skill-per-hack coverage drift: library=${library.count}, hacks=${sourceIndex.length}`);
if (catalog.count !== trustedBySlug.size || (catalog.entries ?? []).length !== trustedBySlug.size) failures.push(`trusted catalog/feed drift: catalog=${catalog.count}, feed=${trustedBySlug.size}`);
if (catalog.total_skill_artifacts !== sourceIndex.length) failures.push("catalog total_skill_artifacts does not match hack count");
for (const host of ["Claude Code", "Hermes Agent", "OpenClaw"]) if (!(catalog.compatible_hosts ?? []).includes(host)) failures.push(`trusted catalog missing host ${host}`);

for (const summary of sourceIndex) {
  const source = JSON.parse(await readFile(path.join(sourceRoot, `${summary.slug}.json`), "utf8"));
  const trust = evidenceBySlug.get(summary.slug);
  if (!trust) {
    failures.push(`${summary.slug}: missing evidence record`);
    continue;
  }
  const trustedProtocol = trustedBySlug.get(summary.slug) ?? null;
  const mode = expectedMode(trust, Boolean(trustedProtocol));
  const trusted = mode === "usable";
  expectedCounts[mode] += 1;
  const expectedProtocolId = trustedProtocol?.protocol_id || summary.protocolId || source.protocolId || `brali:${summary.slug}`;
  const expectedCanonical = trustedProtocol?.url || `${base}/life-os/${summary.slug}/`;
  const expectedMachine = `${base}/life-os/${summary.slug}/index.json`;
  const skill = libraryBySlug.get(summary.slug);
  if (!skill) {
    failures.push(`${summary.slug}: missing from complete skill library`);
    continue;
  }

  const expectedName = skillName(summary.slug);
  if (!namePattern.test(skill.name) || skill.name.length > 64) failures.push(`${summary.slug}: invalid skill name`);
  if (skill.name !== expectedName) failures.push(`${summary.slug}: deterministic skill name mismatch`);
  if (emittedNames.has(skill.name)) failures.push(`${summary.slug}: duplicate generated skill name ${skill.name}`);
  emittedNames.add(skill.name);
  if (skill.protocol_id !== expectedProtocolId) failures.push(`${summary.slug}: protocol ID mismatch`);
  if (skill.canonical_protocol_url !== expectedCanonical) failures.push(`${summary.slug}: canonical URL mismatch`);
  if (skill.machine_record_url !== expectedMachine) failures.push(`${summary.slug}: machine URL mismatch`);
  if (skill.evidence_state !== trust.status) failures.push(`${summary.slug}: evidence state mismatch`);
  if (skill.skill_mode !== mode) failures.push(`${summary.slug}: skill mode ${skill.skill_mode} != ${mode}`);
  if (Boolean(skill.recommendation_eligible) !== trusted || Boolean(skill.operational_guidance) !== trusted) failures.push(`${summary.slug}: recommendation behavior mismatch`);
  if (skill.verification?.status !== "brali-ci-verified" || !sha256Pattern.test(skill.verification?.sha256 ?? "")) failures.push(`${summary.slug}: invalid verification metadata`);
  if (skill.verification?.source_protocol_id !== expectedProtocolId) failures.push(`${summary.slug}: verification protocol ID mismatch`);
  if (!skill.install?.claude_code?.personal_path || !skill.install?.hermes_agent?.command || !skill.install?.openclaw?.global_path) failures.push(`${summary.slug}: host install metadata incomplete`);

  if (trusted && !catalogBySlug.has(summary.slug)) failures.push(`${summary.slug}: usable skill missing from trusted catalog`);
  if (!trusted && catalogBySlug.has(summary.slug)) failures.push(`${summary.slug}: review-gated skill leaked into trusted catalog`);

  const dir = path.join(root, "skill-packs", summary.slug);
  const mdPath = path.join(dir, "SKILL.md");
  const pagePath = path.join(dir, "index.html");
  const jsonPath = path.join(dir, "skill.json");
  try {
    await Promise.all([access(mdPath), access(pagePath), access(jsonPath)]);
  } catch {
    failures.push(`${summary.slug}: generated files missing`);
    continue;
  }

  const markdown = await readFile(mdPath, "utf8");
  const page = await readFile(pagePath, "utf8");
  const metadata = JSON.parse(await readFile(jsonPath, "utf8"));
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  for (const marker of [`name: ${expectedName}\n`, "description: ", "license: ", "compatibility: ", "metadata:\n", "brali-evidence-state: ", "brali-skill-mode: ", "brali-recommendation-eligible: ", "brali-verification: ", "agent-skills-spec: "]) {
    if (!frontmatter.includes(marker)) failures.push(`${summary.slug}: SKILL.md missing ${marker.trim()}`);
  }
  if (!markdown.includes(String(expectedProtocolId)) || !markdown.includes(expectedCanonical)) failures.push(`${summary.slug}: provenance missing from SKILL.md`);
  if (!markdown.includes("Never upgrade a pending-review or restricted record into trusted guidance")) failures.push(`${summary.slug}: trust guardrail missing`);
  if (mode === "usable" && !markdown.includes("## Protocol\n")) failures.push(`${summary.slug}: usable skill missing protocol section`);
  if (mode === "review-required" && !markdown.includes("## Draft action under review\n")) failures.push(`${summary.slug}: review-required skill missing draft review section`);
  if (mode === "restricted-reference" && (markdown.includes("## Protocol\n") || markdown.includes("## Draft action under review\n"))) failures.push(`${summary.slug}: restricted skill leaked operational steps`);

  const actualHash = sha256(markdown);
  if (skill.verification?.sha256 !== actualHash || metadata.verification?.sha256 !== actualHash) failures.push(`${summary.slug}: SHA-256 mismatch`);
  if (metadata.name !== expectedName || metadata.slug !== summary.slug || metadata.protocol_id !== expectedProtocolId || metadata.skill_mode !== mode) failures.push(`${summary.slug}: skill.json identity/mode mismatch`);
  if (!page.includes(`<link rel="canonical" href="${base}/skill-packs/${summary.slug}/">`)) failures.push(`${summary.slug}: stable skill canonical missing`);
  if (!page.includes("./SKILL.md") || !page.includes(expectedCanonical)) failures.push(`${summary.slug}: skill page artifact/canonical links missing`);
  if (!page.includes("Claude Code") || !page.includes("Hermes Agent") || !page.includes("OpenClaw")) failures.push(`${summary.slug}: host guidance missing`);
  if (!page.includes("Brali CI verified") || !page.includes(actualHash)) failures.push(`${summary.slug}: visible verification missing`);
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(page);
  if (trusted && noindex) failures.push(`${summary.slug}: usable skill page unexpectedly noindex`);
  if (!trusted && !noindex) failures.push(`${summary.slug}: review-gated skill page must be noindex`);
}

for (const [mode, count] of Object.entries(expectedCounts)) if (library.counts_by_mode?.[mode] !== count) failures.push(`library ${mode} count ${library.counts_by_mode?.[mode]} != expected ${count}`);
const currentSlugs = new Set(sourceIndex.map((entry) => entry.slug));
for (const slug of libraryBySlug.keys()) if (!currentSlugs.has(slug)) failures.push(`${slug}: library contains stale skill outside current corpus`);
for (const slug of catalogBySlug.keys()) if (!trustedBySlug.has(slug)) failures.push(`${slug}: trusted catalog contains non-trusted skill`);

if (failures.length) throw new Error(`Agent Skill validation failed (${failures.length}):\n${failures.slice(0, 100).join("\n")}${failures.length > 100 ? `\n... ${failures.length - 100} more` : ""}`);
console.log(`Agent Skills verified: ${sourceIndex.length}/${sourceIndex.length} hacks covered; usable=${expectedCounts.usable}, review-required=${expectedCounts["review-required"]}, restricted-reference=${expectedCounts["restricted-reference"]}; trusted catalog=${trustedBySlug.size}; one-skill-per-hack invariant enforced.`);
