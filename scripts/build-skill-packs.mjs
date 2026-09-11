import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const skillRoot = path.join(root, "skill-packs");
const sourceRoot = path.join(root, "data/life-os-content");
const licenseUrl = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const licenseId = "CC-BY-NC-SA-4.0";
const specUrl = "https://agentskills.io/specification";
const trustedStates = new Set(["reviewed", "practical"]);
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const clean = (value = "") => String(value ?? "").replace(/\s+/g, " ").trim();
const escapeHtml = (value = "") => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]);
const yamlString = (value = "") => JSON.stringify(clean(value));
const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const titles = (items = []) => items.map((item) => clean(item?.title)).filter(Boolean);

function skillName(slug) {
  const raw = String(slug);
  if (raw.length <= 64) return raw;
  return `${raw.slice(0, 55).replace(/-+$/, "")}-${sha256(raw).slice(0, 8)}`;
}

function skillMode(entry) {
  if (entry.trusted) return "usable";
  if (entry.evidence.status === "pending-review") return "review-required";
  return "restricted-reference";
}

function skillDescription(entry) {
  const mode = skillMode(entry);
  const title = clean(entry.title);
  const body = clean(entry.description);
  let prefix;
  let suffix;
  if (mode === "usable") {
    prefix = `Use this Brali skill when the user's situation matches the bounded protocol "${title}". `;
    suffix = " Preserve the canonical source, evidence state, limitations, and check-in.";
  } else if (mode === "review-required") {
    prefix = `Use this Brali review-required skill only when an agent needs to inspect the unreviewed record "${title}". `;
    suffix = " Do not present its draft action as trusted guidance; preserve the pending-review state and route practical recommendations to trusted alternatives.";
  } else {
    prefix = `Use this Brali restricted-reference skill only to identify or review the restricted record "${title}". `;
    suffix = " Do not operationalize or recommend the underlying technique; preserve the restriction and route practical guidance to trusted alternatives.";
  }
  const room = Math.max(0, 1024 - prefix.length - suffix.length);
  return `${prefix}${body.slice(0, room)}${suffix}`.slice(0, 1024);
}

function modeSection(entry) {
  const mode = skillMode(entry);
  if (mode === "usable") {
    return `## Skill mode
**Usable trusted skill.** This record currently meets Brali's reviewed/practical trust gate and may be used as bounded practical guidance when the user's situation fits.

## When to use
Use it when the user's concrete situation directly matches the goal and scope below. Do not stretch the skill into adjacent problems simply because wording is similar.

## Goal
${clean(entry.description)}

## Protocol
${clean(entry.action)}

## Check-in
${clean(entry.check_in)}`;
  }
  if (mode === "review-required") {
    return `## Skill mode
**Review required. Not trusted practical guidance.** This skill exists so the Brali library has one skill artifact per hack while preserving the record's review state.

## Review target
${clean(entry.description)}

## Draft action under review
${clean(entry.action)}

Do not recommend or execute the draft action merely because it appears in a SKILL.md file. Use it only for editorial review, comparison, provenance inspection, or to explain what the archived proposal contains. For practical user guidance, choose a reviewed/practical Brali skill instead.

## Review check-in
${clean(entry.check_in)}`;
  }
  return `## Skill mode
**Restricted reference. Do not operationalize.** This artifact preserves one-skill-per-hack coverage and stable machine identity for a restricted Brali record. It is not an executable practical protocol.

## Record summary
${clean(entry.description)}

## What the agent should do
- Preserve the restricted state and canonical identity.
- Do not reproduce hidden steps as practical instructions, recommend the technique, or infer safety/effectiveness from its presence in the library.
- If the user needs practical help, select a reviewed/practical skill that addresses the underlying goal instead.
- Use the canonical record only for controlled editorial, provenance, taxonomy, or historical review.`;
}

function skillMarkdown(entry) {
  const state = entry.evidence.status;
  const mode = skillMode(entry);
  const topics = titles(entry.ontology?.topics);
  const methods = titles(entry.ontology?.methods);
  const lenses = titles(entry.ontology?.lenses);
  const verificationUrl = `${base}/skill-packs/${entry.slug}/skill.json`;
  const sourceBoundary = state === "reviewed"
    ? (entry.evidence.source_url
      ? `Reviewed source attached to the canonical Brali record: ${entry.evidence.source_url}`
      : "This record is reviewed. Inspect the canonical Brali page for the exact source boundary before making evidence claims.")
    : state === "practical"
      ? "This is an eligible practical record. Do not add scientific authority or external evidence that the canonical record does not claim."
      : state === "pending-review"
        ? "This record is pending review. Its presence in the skill library is coverage, not validation. Do not convert the draft action into trusted advice."
        : "This record is restricted. The skill is a reference shell only; do not operationalize or recommend the underlying technique.";

  return `---
name: ${skillName(entry.slug)}
description: ${yamlString(skillDescription(entry))}
license: ${yamlString(licenseId)}
compatibility: ${yamlString(`Portable AgentSkills.io SKILL.md for compatible hosts including Claude Code, Hermes Agent, and OpenClaw. Brali mode: ${mode}.`)}
metadata:
  brali-protocol-id: ${yamlString(entry.protocol_id)}
  brali-canonical-url: ${yamlString(entry.url)}
  brali-evidence-state: ${yamlString(state)}
  brali-skill-mode: ${yamlString(mode)}
  brali-recommendation-eligible: ${entry.trusted ? "true" : "false"}
  brali-source-library: ${yamlString(`${base}/skill-packs/library.json`)}
  brali-trusted-feed: ${yamlString(`${base}/life-os/datasets/protocols.json`)}
  brali-verification: ${yamlString(verificationUrl)}
  agent-skills-spec: ${yamlString(specUrl)}
---

# ${clean(entry.title)}

${modeSection(entry)}

## Evidence boundary
Evidence state: **${state}**.${entry.evidence.reviewed_at ? `\nLast Brali review recorded: ${entry.evidence.reviewed_at}.` : ""}
${sourceBoundary}${topics.length ? `\nTopics: ${topics.join(", ")}` : ""}${methods.length ? `\nMethods: ${methods.join(", ")}` : ""}${lenses.length ? `\nLenses: ${lenses.join(", ")}` : ""}

## Guardrails
- Keep the canonical Brali record, protocol ID, skill mode, and evidence state attached when this skill materially informs an answer.
- Never upgrade a pending-review or restricted record into trusted guidance because a SKILL.md file exists for it.
- Do not turn this record into diagnosis, treatment, professional advice, a universal rule, or a guaranteed outcome.
- Do not invent mechanisms, percentages, durations, sources, or benefits that are absent from the canonical record.
- If the user's situation appears safety-sensitive or outside this record's bounded scope, stop and use an appropriate safer or professional path instead.
- Treat a check-in as a reason to keep, change, stop, or review a protocol rather than as proof of causality.

## Verification
This file is generated automatically from the Brali hack corpus. Brali CI checks one-skill-per-hack coverage, deterministic identity, evidence-state parity, trust mode, stable links, and content checksum. "Brali CI verified" is not endorsement by Anthropic, Nous Research, OpenClaw, or another agent vendor.

## Canonical record
Record: ${entry.url}
Machine-readable record: ${entry.machine_url}
Skill verification record: ${verificationUrl}
Full skill library: ${base}/skill-packs/library.json
Trusted recommendation catalog: ${base}/skill-packs/catalog.json
Agent Skills specification: ${specUrl}
Citation guidance: ${base}/cite/
License and commercial terms: ${base}/terms/
`;
}

function installInfo(entry) {
  const name = skillName(entry.slug);
  const markdownUrl = `${base}/skill-packs/${entry.slug}/SKILL.md`;
  return {
    generic: { artifact_url: markdownUrl, directory_name: name },
    claude_code: {
      personal_path: `~/.claude/skills/${name}/SKILL.md`,
      project_path: `.claude/skills/${name}/SKILL.md`,
      docs: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview",
    },
    hermes_agent: {
      command: `hermes skills install ${markdownUrl}`,
      docs: "https://hermes-agent.nousresearch.com/docs/guides/work-with-skills",
    },
    openclaw: {
      workspace_path: `<workspace>/skills/${name}/SKILL.md`,
      global_path: `~/.openclaw/skills/${name}/SKILL.md`,
      docs: "https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md",
    },
  };
}

function skillJson(entry, markdown) {
  return {
    schema_version: 2,
    name: skillName(entry.slug),
    slug: entry.slug,
    title: clean(entry.title),
    description: skillDescription(entry),
    protocol_id: entry.protocol_id,
    canonical_protocol_url: entry.url,
    machine_record_url: entry.machine_url,
    skill_page_url: `${base}/skill-packs/${entry.slug}/`,
    skill_markdown_url: `${base}/skill-packs/${entry.slug}/SKILL.md`,
    skill_mode: skillMode(entry),
    recommendation_eligible: entry.trusted,
    operational_guidance: entry.trusted,
    evidence_state: entry.evidence.status,
    sensitive: Boolean(entry.evidence.sensitive),
    reviewed_at: entry.evidence.reviewed_at || null,
    topics: titles(entry.ontology?.topics),
    methods: titles(entry.ontology?.methods),
    lenses: titles(entry.ontology?.lenses),
    license: licenseId,
    source_library: `${base}/skill-packs/library.json`,
    trusted_feed: `${base}/life-os/datasets/protocols.json`,
    format: { name: "Agent Skills", specification: specUrl, artifact: "SKILL.md" },
    compatible_hosts: ["Claude Code", "Hermes Agent", "OpenClaw", "AgentSkills.io-compatible hosts"],
    install: installInfo(entry),
    verification: {
      status: "brali-ci-verified",
      scope: "one-skill-per-hack coverage + format + evidence-state parity + provenance + stable links + SHA-256; not third-party vendor endorsement",
      sha256: sha256(markdown),
      trust_gate: entry.evidence.status,
      source_protocol_id: entry.protocol_id,
    },
  };
}

function installCards(data) {
  const name = escapeHtml(data.name);
  const mdUrl = escapeHtml(data.skill_markdown_url);
  const qualifier = data.recommendation_eligible
    ? "Install for normal use."
    : data.skill_mode === "review-required"
      ? "Install only for review, provenance inspection, or editorial work."
      : "Install only for restricted-record review; this skill is deliberately non-operational.";
  return `<p class="mode-note"><strong>${escapeHtml(qualifier)}</strong></p><div class="install-grid">
    <article class="install-card"><span class="card-label">Claude Code</span><h3>Drop into a skill folder</h3><p>Personal: <code>~/.claude/skills/${name}/SKILL.md</code><br>Project: <code>.claude/skills/${name}/SKILL.md</code></p><p><a href="https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview">Claude Agent Skills docs</a></p></article>
    <article class="install-card"><span class="card-label">Hermes Agent</span><h3>Install directly from this URL</h3><pre><code>hermes skills install ${mdUrl}</code></pre><p><a href="https://hermes-agent.nousresearch.com/docs/guides/work-with-skills">Hermes skills docs</a></p></article>
    <article class="install-card"><span class="card-label">OpenClaw</span><h3>Place in a discovered skill root</h3><p>Workspace: <code>&lt;workspace&gt;/skills/${name}/SKILL.md</code><br>Global: <code>~/.openclaw/skills/${name}/SKILL.md</code></p><p><a href="https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md">OpenClaw skills docs</a></p></article>
  </div>`;
}

function skillPage(entry, markdown) {
  const data = skillJson(entry, markdown);
  const trusted = data.recommendation_eligible;
  const mode = data.skill_mode;
  const robots = trusted ? "index,follow,max-image-preview:large" : "noindex,follow";
  const titleSuffix = trusted ? "Agent Skill" : mode === "review-required" ? "Review Skill" : "Restricted Reference Skill";
  const modeCopy = trusted
    ? `<section class="skill-contract"><p class="card-label">Portable instruction</p><h2>What the agent should do</h2><p>${escapeHtml(entry.action)}</p><h3>Check-in</h3><p>${escapeHtml(entry.check_in)}</p></section>`
    : mode === "review-required"
      ? `<section class="skill-contract warning"><p class="card-label">Review required</p><h2>This draft exists for inspection, not recommendation.</h2><p>${escapeHtml(entry.description)}</p><h3>Draft action under review</h3><p>${escapeHtml(entry.action)}</p><p>Do not present this action as trusted Brali guidance until the canonical record is promoted to reviewed/practical.</p></section>`
      : `<section class="skill-contract warning"><p class="card-label">Restricted reference</p><h2>This skill intentionally contains no executable protocol.</h2><p>${escapeHtml(entry.description)}</p><p>Use it for identity, provenance, taxonomy or editorial review only. For practical guidance, choose a reviewed/practical skill.</p></section>`;
  const labels = ["AgentSkills.io", data.evidence_state, mode, ...data.topics].slice(0, 8)
    .map((label) => `<span class="skill-chip">${escapeHtml(label)}</span>`).join("");
  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `${data.title} — ${titleSuffix}`,
    description: data.description,
    url: data.skill_page_url,
    isAccessibleForFree: true,
    inLanguage: "en",
    license: licenseUrl,
    isBasedOn: data.canonical_protocol_url,
    creativeWorkStatus: trusted ? "Published" : mode === "review-required" ? "Pending review" : "Restricted reference",
    encoding: [
      { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: data.skill_markdown_url },
      { "@type": "MediaObject", encodingFormat: "application/json", contentUrl: `${data.skill_page_url}skill.json` },
    ],
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(data.title)} ${escapeHtml(titleSuffix)} | Brali</title><meta name="description" content="${escapeHtml(data.description.slice(0, 240))}"><link rel="canonical" href="${escapeHtml(data.skill_page_url)}"><link rel="alternate" type="text/markdown" href="${escapeHtml(data.skill_markdown_url)}" title="SKILL.md"><link rel="alternate" type="application/json" href="${escapeHtml(data.skill_page_url)}skill.json" title="Skill metadata and verification"><meta name="robots" content="${robots}"><meta property="og:type" content="article"><meta property="og:site_name" content="Brali"><meta property="og:title" content="${escapeHtml(data.title)} — ${escapeHtml(titleSuffix)}"><meta property="og:description" content="${escapeHtml(data.description.slice(0, 240))}"><meta property="og:url" content="${escapeHtml(data.skill_page_url)}"><meta property="og:image" content="${base}/assets/images/brali-mascot-hero.png"><link rel="icon" href="/assets/images/brali-logo.png"><link rel="stylesheet" href="/styles.css"><link rel="license" href="${licenseUrl}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script><style>.skill-detail{max-width:1040px}.skill-meta{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0 1.4rem}.skill-chip{display:inline-flex;padding:.35rem .65rem;border-radius:999px;background:#f2efe8;font-size:.82rem}.skill-actions{display:flex;flex-wrap:wrap;gap:.65rem;margin:1.2rem 0 2rem}.skill-contract,.install-card{border:1px solid var(--border,#d9d5ca);border-radius:20px;padding:1.2rem;background:var(--surface,#fff)}.skill-contract{margin:1.2rem 0}.warning,.mode-note{border-left:5px solid #e7a61a}.install-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:1rem 0 2rem}.install-card pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#171717;color:#f6f4ee;border-radius:12px;padding:.8rem}.skill-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.verification-line{font-size:.9rem;opacity:.82}@media(max-width:850px){.install-grid{grid-template-columns:1fr}}</style></head>
<body><a class="skip" href="#content">Skip to content</a><header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/" aria-label="Brali home"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/life-os/">Explore</a><a href="/life-os/methodology/">Evidence</a><a href="/for-ai/">For AI</a><a class="button" href="/skill-packs/">Agent Skills</a></div></nav></header><main id="content" class="page wrap skill-detail"><p class="eyebrow">Brali Agent Skill · ${escapeHtml(data.evidence_state)} · ${escapeHtml(mode)}</p><h1>${escapeHtml(data.title)}</h1><p class="lead">${escapeHtml(entry.description)}</p><div class="skill-meta">${labels}</div><div class="skill-actions"><a class="button yellow" href="./SKILL.md">Open SKILL.md</a><a class="button quiet" href="${escapeHtml(data.canonical_protocol_url)}">Canonical record</a><a href="./skill.json">Verification JSON</a><a href="/skill-packs/">All Agent Skills</a></div>${modeCopy}<section><p class="eyebrow">Install</p><h2>One portable file, host-specific location.</h2><p>Inspect <a href="./SKILL.md">SKILL.md</a> first. The evidence state and skill mode are part of the contract.</p>${installCards(data)}</section><section class="skill-contract"><p class="card-label">Brali verification</p><h2>Coverage and trust state are checked together.</h2><p>Canonical ID: <code>${escapeHtml(data.protocol_id)}</code><br>Evidence state: <strong>${escapeHtml(data.evidence_state)}</strong><br>Skill mode: <strong>${escapeHtml(mode)}</strong><br>Recommendation eligible: <strong>${trusted ? "yes" : "no"}</strong><br>SHA-256: <code class="skill-code">${data.verification.sha256}</code></p><p class="verification-line">Brali CI verified. This means identity, state, mode, provenance and file integrity matched the generated corpus. It is not third-party vendor endorsement.</p></section><section class="prose"><h2>Why every hack gets a skill</h2><p>Brali keeps a one-to-one machine surface: one hack record, one stable skill identity. Trust state determines what the skill is allowed to do.</p><h2>License</h2><p>Original Brali knowledge is available for non-commercial reuse under <a rel="license" href="${licenseUrl}">CC BY-NC-SA 4.0</a>. Keep attribution, canonical record link, evidence state and skill mode.</p></section></main><footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a></div><div class="footer-links"><a href="/life-os/">Explore</a><a href="/for-ai/">For AI</a><a href="/skill-packs/">Agent Skills</a><a href="/cite/">Cite</a></div></div></footer></body></html>`;
}

async function readPreviousEntries() {
  const bySlug = new Map();
  for (const filename of ["library.json", "catalog.json"]) {
    try {
      const doc = JSON.parse(await readFile(path.join(skillRoot, filename), "utf8"));
      for (const entry of doc.entries ?? []) if (entry?.slug) bySlug.set(entry.slug, entry);
    } catch {}
  }
  return [...bySlug.values()];
}

const sourceIndex = JSON.parse(await readFile(path.join(sourceRoot, "index.json"), "utf8"));
const evidenceDoc = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const trustedFeed = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const evidenceBySlug = new Map((evidenceDoc.entries ?? []).map((entry) => [entry.slug, entry]));
const trustedBySlug = new Map((trustedFeed.entries ?? []).map((entry) => [entry.slug, entry]));
if (!sourceIndex.length) throw new Error("Agent Skill build requires at least one Brali hack record.");
if (evidenceBySlug.size !== sourceIndex.length) throw new Error(`Agent Skill build requires evidence parity before generation: evidence=${evidenceBySlug.size}, hacks=${sourceIndex.length}.`);
await mkdir(skillRoot, { recursive: true });

const previousEntries = await readPreviousEntries();
const currentSlugs = new Set(sourceIndex.map((entry) => entry.slug));
for (const oldEntry of previousEntries) if (oldEntry?.slug && !currentSlugs.has(oldEntry.slug)) await rm(path.join(skillRoot, oldEntry.slug), { recursive: true, force: true });

const libraryEntries = [];
const trustedCatalogEntries = [];
const emittedNames = new Set();
const counts = { usable: 0, "review-required": 0, "restricted-reference": 0 };

for (const summary of sourceIndex) {
  if (!skillNamePattern.test(summary.slug)) throw new Error(`Invalid hack slug for Agent Skill generation: ${summary.slug}`);
  const source = JSON.parse(await readFile(path.join(sourceRoot, `${summary.slug}.json`), "utf8"));
  const trust = evidenceBySlug.get(summary.slug);
  if (!trust) throw new Error(`Missing evidence record for Agent Skill: ${summary.slug}`);
  const trustedProtocol = trustedBySlug.get(summary.slug) ?? null;
  const trusted = Boolean(trustedProtocol) && trustedStates.has(trust.status) && trust.indexable === true;
  const original = source.lifeOsSource ?? {};
  const entry = {
    slug: summary.slug,
    protocol_id: clean(trustedProtocol?.protocol_id || summary.protocolId || source.protocolId) || `brali:${summary.slug}`,
    title: clean(trustedProtocol?.title || source.title || summary.title),
    description: clean(trustedProtocol?.description || source.description || summary.description),
    url: clean(trustedProtocol?.url) || `${base}/life-os/${summary.slug}/`,
    machine_url: `${base}/life-os/${summary.slug}/index.json`,
    action: clean(trustedProtocol?.action || original.whatYouDo || original.hack || source.description || summary.description || "Inspect the canonical Brali record."),
    check_in: clean(trustedProtocol?.check_in || original.checkIn || source.checkIn || "Review what changed, what was difficult, and whether the next attempt should be kept, changed, stopped, or sent for further review."),
    evidence: {
      status: clean(trust.status || "unknown"),
      sensitive: Boolean(trust.sensitive),
      source_url: trust.status === "reviewed" ? (trust.source?.url ?? null) : null,
      reviewed_at: trust.review?.reviewedAt ?? null,
    },
    ontology: trust.ontology ?? trustedProtocol?.ontology ?? {},
    trusted,
  };
  const name = skillName(entry.slug);
  if (!skillNamePattern.test(name) || name.length > 64) throw new Error(`Invalid generated Agent Skill name: ${name}`);
  if (emittedNames.has(name)) throw new Error(`Generated Agent Skill name collision: ${name}`);
  emittedNames.add(name);
  if (!entry.title || !entry.description || !entry.action) throw new Error(`Incomplete hack cannot become a skill: ${entry.slug}`);

  const markdown = skillMarkdown(entry);
  const data = skillJson(entry, markdown);
  const directory = path.join(skillRoot, entry.slug);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), markdown);
  await writeFile(path.join(directory, "skill.json"), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(path.join(directory, "index.html"), skillPage(entry, markdown));
  libraryEntries.push(data);
  counts[data.skill_mode] += 1;
  if (trusted) trustedCatalogEntries.push(data);
}

libraryEntries.sort((a, b) => a.title.localeCompare(b.title));
trustedCatalogEntries.sort((a, b) => a.title.localeCompare(b.title));
const library = {
  schema_version: 2,
  name: "Brali Complete AI Agent Skills Library",
  description: "One generated Agent Skill artifact for every Brali hack. Skill mode preserves whether the underlying record is usable, review-required, or restricted-reference.",
  canonical_url: `${base}/skill-packs/`,
  specification: specUrl,
  source_index: `${base}/life-os/`,
  generation_rule: "Every hack in data/life-os-content/index.json gets a deterministic SKILL.md, skill.json and stable skill page on every build. Trust state changes skill behavior; it never removes the skill identity.",
  recommendation_rule: "Only reviewed/practical skills are recommendation-eligible. Pending-review skills are review-only. Restricted skills are non-operational reference shells.",
  count: libraryEntries.length,
  counts_by_mode: counts,
  license: `${licenseId}; Brali names and logos are not licensed for reuse.`,
  entries: libraryEntries,
};
await writeFile(path.join(skillRoot, "library.json"), `${JSON.stringify(library, null, 2)}\n`);
const catalog = {
  schema_version: 2,
  name: "Brali Trusted AI Agent Skills Catalog",
  description: "Recommendation-eligible Agent Skills generated from Brali records that currently meet the reviewed/practical trust gate.",
  canonical_url: `${base}/skill-packs/`,
  full_library: `${base}/skill-packs/library.json`,
  specification: specUrl,
  compatible_hosts: ["Claude Code", "Hermes Agent", "OpenClaw", "AgentSkills.io-compatible hosts"],
  source_feed: `${base}/life-os/datasets/protocols.json`,
  generation_rule: "Trusted catalog is a filtered view of the complete one-skill-per-hack library; reviewed/practical status controls recommendation eligibility.",
  verification_policy: "Every skill is checked for corpus coverage, deterministic identity, evidence-state parity, trust mode, stable links and SHA-256 integrity. Brali verification is not third-party vendor endorsement.",
  count: trustedCatalogEntries.length,
  total_skill_artifacts: libraryEntries.length,
  license: `${licenseId}; Brali names and logos are not licensed for reuse.`,
  entries: trustedCatalogEntries,
};
await writeFile(path.join(skillRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`Agent Skills generated: ${libraryEntries.length}/${sourceIndex.length} hacks covered; usable=${counts.usable}, review-required=${counts["review-required"]}, restricted-reference=${counts["restricted-reference"]}; trusted catalog=${trustedCatalogEntries.length}.`);
