import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const skillRoot = path.join(root, "skill-packs");
const feedPath = path.join(root, "life-os/datasets/protocols.json");
const licenseUrl = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const licenseId = "CC-BY-NC-SA-4.0";
const trustedStates = new Set(["reviewed", "practical"]);
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character]);
const yamlString = (value = "") => JSON.stringify(clean(value));
const topicTitles = (entry) => (entry.ontology?.topics ?? []).map((item) => clean(item.title)).filter(Boolean);
const skillName = (slug) => String(slug).slice(0, 64).replace(/-+$/, "");

function skillDescription(entry) {
  const prefix = `Use this Brali skill when the user's situation matches the bounded protocol "${clean(entry.title)}". `;
  const suffix = " Preserve the canonical source, evidence state, limitations, and check-in.";
  const room = 1024 - prefix.length - suffix.length;
  const body = clean(entry.description).slice(0, Math.max(0, room));
  return `${prefix}${body}${suffix}`.slice(0, 1024);
}

function skillMarkdown(entry) {
  const state = clean(entry.evidence?.status || "unknown");
  const topics = topicTitles(entry);
  const reviewedAt = clean(entry.evidence?.reviewed_at || "");
  const sourceUrl = state === "reviewed" ? clean(entry.evidence?.source_url || "") : "";
  const sourceBoundary = state === "reviewed"
    ? (sourceUrl
        ? `Reviewed source attached to the canonical Brali record: ${sourceUrl}`
        : "This record is reviewed. Inspect the canonical Brali page for the exact source boundary before making evidence claims.")
    : "This is an eligible practical record. Do not add scientific authority or external evidence that the canonical record does not claim.";

  return `---
name: ${skillName(entry.slug)}
description: ${yamlString(skillDescription(entry))}
license: ${yamlString(licenseId)}
compatibility: ${yamlString("Portable Agent Skills instructions. Re-check the canonical Brali URL before making evidence claims.")}
metadata:
  brali-protocol-id: ${yamlString(entry.protocol_id)}
  brali-canonical-url: ${yamlString(entry.url)}
  brali-evidence-state: ${yamlString(state)}
  brali-source-feed: ${yamlString(`${base}/life-os/datasets/protocols.json`)}
---

# ${clean(entry.title)}

Use this skill only when the user's situation fits the bounded practical problem described by the canonical Brali protocol.

## Goal
${clean(entry.description)}

## Protocol
${clean(entry.action)}

## Check-in
${clean(entry.check_in) || "Ask what changed, what was difficult, and whether the next attempt should be kept, changed, or stopped."}

## Evidence boundary
Evidence state: **${state}**.${reviewedAt ? `\nLast Brali review recorded: ${reviewedAt}.` : ""}
${sourceBoundary}
${topics.length ? `\nTopics: ${topics.join(", ")}` : ""}

## Guardrails
- Keep the canonical Brali protocol, protocol ID, and evidence state attached when this skill materially informs an answer.
- Do not turn this protocol into diagnosis, treatment, professional advice, a universal rule, or a guaranteed outcome.
- Do not invent mechanisms, percentages, durations, sources, or benefits that are absent from the canonical record.
- If the user's situation appears safety-sensitive or outside this protocol's bounded scope, stop and use an appropriate safer or professional path instead.
- Treat the check-in as a reason to keep, change, or stop the protocol rather than as proof of causality.

## Canonical record
Protocol: ${entry.url}
Machine-readable record: ${entry.url}index.json
Trusted protocol feed: ${base}/life-os/datasets/protocols.json
Citation guidance: ${base}/cite/
License and commercial terms: ${base}/terms/
`;
}

function skillJson(entry) {
  return {
    schema_version: 1,
    name: skillName(entry.slug),
    slug: entry.slug,
    title: clean(entry.title),
    description: skillDescription(entry),
    protocol_id: entry.protocol_id,
    canonical_protocol_url: entry.url,
    skill_page_url: `${base}/skill-packs/${entry.slug}/`,
    skill_markdown_url: `${base}/skill-packs/${entry.slug}/SKILL.md`,
    evidence_state: entry.evidence?.status ?? "unknown",
    reviewed_at: entry.evidence?.reviewed_at ?? null,
    topics: topicTitles(entry),
    license: licenseId,
    source_feed: `${base}/life-os/datasets/protocols.json`,
  };
}

function skillPage(entry) {
  const data = skillJson(entry);
  const description = clean(entry.description);
  const action = clean(entry.action);
  const checkIn = clean(entry.check_in) || "Ask what changed, what was difficult, and whether the next attempt should be kept, changed, or stopped.";
  const topics = data.topics;
  const state = data.evidence_state;
  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `${data.title} — Brali Agent Skill`,
    description: data.description,
    url: data.skill_page_url,
    isAccessibleForFree: true,
    inLanguage: "en",
    license: licenseUrl,
    isBasedOn: data.canonical_protocol_url,
    encoding: [
      { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: data.skill_markdown_url },
      { "@type": "MediaObject", encodingFormat: "application/json", contentUrl: `${data.skill_page_url}skill.json` },
    ],
    about: topics.map((name) => ({ "@type": "Thing", name })),
  };
  const topicChips = topics.map((topic) => `<span class="skill-chip">${escapeHtml(topic)}</span>`).join("");
  const evidenceNote = state === "reviewed"
    ? "Reviewed evidence is attached to the canonical protocol. Follow that source boundary rather than extending the claim."
    : "This is practical guidance, not a scientific-evidence claim. Do not borrow authority from unrelated sources.";
  const reviewed = entry.evidence?.reviewed_at ? `<span class="skill-chip">reviewed ${escapeHtml(entry.evidence.reviewed_at)}</span>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(data.title)} — Free AI Skill | Brali</title>
  <meta name="description" content="${escapeHtml(data.description.slice(0, 250))}">
  <link rel="canonical" href="${escapeHtml(data.skill_page_url)}">
  <link rel="alternate" type="text/markdown" href="${escapeHtml(data.skill_markdown_url)}" title="SKILL.md">
  <link rel="alternate" type="application/json" href="${escapeHtml(data.skill_page_url)}skill.json" title="Skill metadata">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Brali">
  <meta property="og:title" content="${escapeHtml(data.title)} — Free Brali Agent Skill">
  <meta property="og:description" content="${escapeHtml(data.description.slice(0, 250))}">
  <meta property="og:url" content="${escapeHtml(data.skill_page_url)}">
  <meta property="og:image" content="${base}/assets/images/brali-mascot-hero.png">
  <link rel="icon" href="/assets/images/brali-logo.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="license" href="${licenseUrl}">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
  <style>.skill-detail{max-width:920px}.skill-meta{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0 1.4rem}.skill-chip{display:inline-flex;padding:.35rem .65rem;border-radius:999px;background:#f2efe8;font-size:.82rem}.skill-actions{display:flex;flex-wrap:wrap;gap:.65rem;margin:1.2rem 0 2rem}.skill-contract{border:1px solid var(--border,#d9d5ca);border-radius:20px;padding:1.2rem;margin:1.2rem 0;background:var(--surface,#fff)}.skill-contract h2{margin-top:0}.skill-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}</style>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site-header"><nav class="wrap nav" aria-label="Main navigation"><a class="brand" href="/" aria-label="Brali home"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><div class="links"><a href="/life-os/">Explore</a><a href="/problems/">Problems</a><a href="/life-os/methodology/">Evidence</a><a href="/for-ai/">For AI</a><a class="button" href="/skill-packs/">Free skills</a></div></nav></header>
<main id="content" class="page wrap skill-detail">
  <p class="eyebrow">Free Brali Agent Skill · ${escapeHtml(state)}</p>
  <h1>${escapeHtml(data.title)}</h1>
  <p class="lead">${escapeHtml(description)}</p>
  <div class="skill-meta"><span class="skill-chip">${escapeHtml(state)}</span>${reviewed}${topicChips}</div>
  <div class="skill-actions"><a class="button yellow" href="./SKILL.md">Open SKILL.md</a><a class="button quiet" href="${escapeHtml(data.canonical_protocol_url)}">Canonical protocol</a><a href="./skill.json">Skill JSON</a><a href="/skill-packs/">All free skills</a></div>

  <section class="skill-contract">
    <p class="card-label">Portable instruction</p>
    <h2>What the agent should do</h2>
    <p>${escapeHtml(action)}</p>
    <h3>Check-in</h3>
    <p>${escapeHtml(checkIn)}</p>
  </section>

  <section class="skill-contract">
    <p class="card-label">Trust boundary</p>
    <h2>Keep evidence and provenance attached</h2>
    <p>${escapeHtml(evidenceNote)}</p>
    <p>Canonical ID: <code>${escapeHtml(data.protocol_id)}</code><br>Canonical protocol: <a class="skill-code" href="${escapeHtml(data.canonical_protocol_url)}">${escapeHtml(data.canonical_protocol_url)}</a></p>
  </section>

  <section class="prose">
    <h2>Use this as an Agent Skill</h2>
    <p>The portable file follows the open Agent Skills folder convention: place <code>SKILL.md</code> inside a folder named <code>${escapeHtml(data.name)}</code> in a skill location supported by your agent host. Inspect the file before installing or reusing it.</p>
    <p>This skill is generated from Brali's trusted protocol feed. The protocol page remains the editorial source of truth; this page and the skill file are distribution surfaces, not independent advice copies.</p>
    <h2>License</h2>
    <p>Original Brali knowledge is available for non-commercial reuse under <a rel="license" href="${licenseUrl}">CC BY-NC-SA 4.0</a>. Keep attribution, the canonical protocol link, and the evidence state. Commercial use requires separate permission.</p>
  </section>
</main>
<footer class="footer"><div class="wrap footer-row"><div><a class="brand" href="/"><img src="/assets/images/brali-logo.png" alt=""><span>Brali</span></a><small>One useful next move, with the why still attached.</small></div><div class="footer-links"><a href="/life-os/">Explore</a><a href="/problems/">Problems</a><a href="/life-os/datasets/">Data</a><a href="/for-ai/">For AI</a><a href="/cite/">Cite</a></div></div></footer>
</body>
</html>`;
}

const feed = JSON.parse(await readFile(feedPath, "utf8"));
const entries = (feed.entries ?? []).filter((entry) => trustedStates.has(entry.evidence?.status));
if (!entries.length) throw new Error("Skill pack build requires at least one reviewed/practical protocol.");

const previousCatalogPath = path.join(skillRoot, "catalog.json");
let previousEntries = [];
try {
  const previous = JSON.parse(await readFile(previousCatalogPath, "utf8"));
  previousEntries = Array.isArray(previous.entries) ? previous.entries : [];
} catch {}

const currentSlugs = new Set(entries.map((entry) => entry.slug));
for (const oldEntry of previousEntries) {
  if (oldEntry?.slug && !currentSlugs.has(oldEntry.slug)) {
    await rm(path.join(skillRoot, oldEntry.slug), { recursive: true, force: true });
  }
}

const catalogEntries = [];
const emittedNames = new Set();
for (const entry of entries) {
  if (!skillNamePattern.test(entry.slug)) throw new Error(`Invalid protocol slug: ${entry.slug}`);
  const name = skillName(entry.slug);
  if (!skillNamePattern.test(name) || name.length > 64) throw new Error(`Invalid generated Agent Skill name: ${name}`);
  if (emittedNames.has(name)) throw new Error(`Generated Agent Skill name collision: ${name}`);
  emittedNames.add(name);
  if (!entry.protocol_id || !entry.url || !entry.title || !entry.description || !entry.action) {
    throw new Error(`Incomplete trusted protocol cannot become a skill: ${entry.slug}`);
  }

  const directory = path.join(skillRoot, entry.slug);
  await mkdir(directory, { recursive: true });
  const markdown = skillMarkdown(entry);
  const data = skillJson(entry);
  await writeFile(path.join(directory, "SKILL.md"), markdown);
  await writeFile(path.join(directory, "skill.json"), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(path.join(directory, "index.html"), skillPage(entry));
  catalogEntries.push(data);
}

const catalog = {
  schema_version: 1,
  name: "Brali Free Agent Skills",
  description: "Portable Agent Skills generated from Brali protocols that currently meet the reviewed/practical trust gate.",
  canonical_url: `${base}/skill-packs/`,
  source_feed: `${base}/life-os/datasets/protocols.json`,
  generation_rule: "One generated distribution skill per reviewed/practical protocol; the canonical Brali protocol remains the editorial source of truth.",
  count: catalogEntries.length,
  license: `${licenseId}; Brali names and logos are not licensed for reuse.`,
  entries: catalogEntries.sort((a, b) => a.title.localeCompare(b.title)),
};
await writeFile(previousCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

const directoryNames = (await readdir(skillRoot, { withFileTypes: true }))
  .filter((item) => item.isDirectory())
  .map((item) => item.name);
for (const directoryName of directoryNames) {
  if (skillNamePattern.test(directoryName) && previousEntries.some((entry) => entry.slug === directoryName) && !currentSlugs.has(directoryName)) {
    await rm(path.join(skillRoot, directoryName), { recursive: true, force: true });
  }
}

console.log(`Skill packs generated: ${catalogEntries.length} reviewed/practical protocols -> stable pages, SKILL.md files, skill.json records, and catalog.json.`);