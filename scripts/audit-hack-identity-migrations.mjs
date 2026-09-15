import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const discover = args.has("--discover");
const requireComplete = args.has("--require-complete");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();

const decisions = readJson("data/evidence-decisions.json");
const index = readJson("data/life-os-content/index.json");
const registry = readJson("data/hack-identity-migrations.json");
const hacks = readJson("life-os/datasets/hacks.json");

if (decisions.schema_version !== 1 || !Array.isArray(decisions.entries)) throw new Error("Evidence Decisions must use schema_version 1 with entries[]");
if (!Array.isArray(index)) throw new Error("Canonical content index must be an array");
if (registry.schema_version !== 1 || !Array.isArray(registry.entries)) throw new Error("Hack identity migration registry must use schema_version 1 with entries[]");
if (!Array.isArray(hacks)) throw new Error("life-os/datasets/hacks.json must be an array");

const currentSlugs = new Set(index.map((entry) => entry.slug));
const historical = new Map();
for (const decision of decisions.entries) {
  if (decision.source_reviewed !== true) continue;
  for (const target of [...new Set(decision.target_hack_ids || [])]) {
    if (currentSlugs.has(target)) continue;
    const item = historical.get(target) || { historical_id: target, decision_ids: [], candidate_ids: [] };
    item.decision_ids.push(decision.id);
    if (decision.candidate_id) item.candidate_ids.push(decision.candidate_id);
    historical.set(target, item);
  }
}
for (const item of historical.values()) {
  item.decision_ids = [...new Set(item.decision_ids)].sort();
  item.candidate_ids = [...new Set(item.candidate_ids)].sort();
}

const allowedDispositions = new Set(["mapped", "retired"]);
const allowedEvidenceTypes = new Set(["git-rename", "source-alias", "source-record", "manual-reviewed"]);
const registryByHistorical = new Map();
for (const entry of registry.entries) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Identity migration entry must be an object");
  if (!historical.has(entry.historical_id)) throw new Error(`Identity migration references a target with no current reviewed linkage debt: ${entry.historical_id}`);
  if (registryByHistorical.has(entry.historical_id)) throw new Error(`Duplicate identity migration: ${entry.historical_id}`);
  if (!allowedDispositions.has(entry.disposition)) throw new Error(`${entry.historical_id}: unsupported disposition ${entry.disposition}`);
  if (!entry.evidence || !allowedEvidenceTypes.has(entry.evidence.type)) throw new Error(`${entry.historical_id}: explicit provenance evidence is required`);
  if (typeof entry.evidence.note !== "string" || text(entry.evidence.note).length < 20) throw new Error(`${entry.historical_id}: evidence.note must explain the provenance basis`);
  if (entry.disposition === "mapped") {
    if (!entry.current_slug || !currentSlugs.has(entry.current_slug)) throw new Error(`${entry.historical_id}: mapped current_slug is not canonical: ${entry.current_slug}`);
    if (entry.current_slug === entry.historical_id) throw new Error(`${entry.historical_id}: historical id cannot map to itself when it is absent from the current corpus`);
  } else if (entry.current_slug) {
    throw new Error(`${entry.historical_id}: retired identities cannot also declare current_slug`);
  }
  registryByHistorical.set(entry.historical_id, entry);
}

function aliasValues(hack) {
  return [...new Set([
    hack.slug,
    hack.legacySlug,
    hack.analysis?.original?.slug,
    hack.analysis?.ai?.recommendedSlug,
  ].filter(Boolean))];
}

const sourceAliasCandidates = new Map();
for (const hack of hacks) {
  const aliases = aliasValues(hack);
  const current = aliases.filter((value) => currentSlugs.has(value));
  if (current.length !== 1) continue;
  for (const alias of aliases) {
    if (alias === current[0]) continue;
    const list = sourceAliasCandidates.get(alias) || [];
    list.push({
      current_slug: current[0],
      source_hack_id: String(hack.id || hack.hackInfo?.hackId || ""),
      source_aliases: aliases,
      evidence_type: "source-alias",
    });
    sourceAliasCandidates.set(alias, list);
  }
}

const articleSourceMatches = new Map();
for (const entry of index) {
  const file = path.join(root, "data", "life-os-content", `${entry.slug}.json`);
  if (!fs.existsSync(file)) continue;
  const article = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [field, value] of Object.entries({
    lifeOsSourceHack: article.lifeOsSource?.hack,
    lifeOsSourceWhatYouDo: article.lifeOsSource?.whatYouDo,
  })) {
    const normalized = text(value);
    if (!normalized) continue;
    const key = `${field}:${normalized}`;
    const list = articleSourceMatches.get(key) || [];
    list.push(entry.slug);
    articleSourceMatches.set(key, list);
  }
}

const sourceRecordCandidates = new Map();
for (const hack of hacks) {
  const aliases = aliasValues(hack);
  const exactKeys = [
    ["lifeOsSourceWhatYouDo", hack.hackInfo?.whatYouDo],
    ["lifeOsSourceHack", hack.hackInfo?.whatYouDo],
  ].filter(([, value]) => text(value));
  const matched = new Set();
  const evidenceFields = [];
  for (const [field, value] of exactKeys) {
    const slugs = articleSourceMatches.get(`${field}:${text(value)}`) || [];
    for (const slug of slugs) matched.add(slug);
    if (slugs.length) evidenceFields.push({ field, source_value: text(value), matched_slugs: slugs });
  }
  if (matched.size !== 1) continue;
  const currentSlug = [...matched][0];
  for (const alias of aliases) {
    if (alias === currentSlug) continue;
    const list = sourceRecordCandidates.get(alias) || [];
    list.push({
      current_slug: currentSlug,
      source_hack_id: String(hack.id || hack.hackInfo?.hackId || ""),
      evidence_fields: evidenceFields,
      evidence_type: "source-record",
    });
    sourceRecordCandidates.set(alias, list);
  }
}

function gitRenameGraph() {
  const graph = new Map();
  let output = "";
  try {
    output = execFileSync("git", [
      "log", "--all", "--diff-filter=R", "--name-status", "--find-renames=20%", "--format=@@%H", "--", "data/life-os-content",
    ], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    if (discover) console.warn(`identity migration discovery: git rename history unavailable: ${error.message}`);
    return graph;
  }
  let commit = null;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("@@")) {
      commit = line.slice(2);
      continue;
    }
    const parts = line.split("\t");
    if (!/^R\d+$/.test(parts[0] || "") || parts.length < 3 || !commit) continue;
    const from = parts[1];
    const to = parts[2];
    if (!from.startsWith("data/life-os-content/") || !to.startsWith("data/life-os-content/") || !from.endsWith(".json") || !to.endsWith(".json")) continue;
    if (from.endsWith("/index.json") || to.endsWith("/index.json")) continue;
    const fromSlug = path.basename(from, ".json");
    const toSlug = path.basename(to, ".json");
    const similarity = Number(parts[0].slice(1));
    const list = graph.get(fromSlug) || [];
    list.push({ from_slug: fromSlug, to_slug: toSlug, commit_sha: commit, similarity });
    graph.set(fromSlug, list);
  }
  return graph;
}

function exactGitProposal(historicalId, graph) {
  const chain = [];
  const seen = new Set([historicalId]);
  let cursor = historicalId;
  for (let step = 0; step < 12; step += 1) {
    const edges = graph.get(cursor) || [];
    const uniqueTargets = [...new Set(edges.map((edge) => edge.to_slug))];
    if (uniqueTargets.length !== 1) break;
    const next = uniqueTargets[0];
    const edge = edges.find((item) => item.to_slug === next);
    chain.push(edge);
    if (seen.has(next)) return null;
    seen.add(next);
    cursor = next;
    if (currentSlugs.has(cursor)) return { current_slug: cursor, evidence_type: "git-rename", chain };
  }
  return null;
}

const proposals = new Map();
function addProposal(historicalId, proposal) {
  const list = proposals.get(historicalId) || [];
  const key = `${proposal.current_slug}:${proposal.evidence_type}`;
  if (!list.some((item) => `${item.current_slug}:${item.evidence_type}` === key)) list.push(proposal);
  proposals.set(historicalId, list);
}

for (const historicalId of historical.keys()) {
  const alias = sourceAliasCandidates.get(historicalId) || [];
  if (alias.length === 1) addProposal(historicalId, alias[0]);
  const source = sourceRecordCandidates.get(historicalId) || [];
  if (source.length === 1) addProposal(historicalId, source[0]);
}
if (discover) {
  const graph = gitRenameGraph();
  for (const historicalId of historical.keys()) {
    const proposal = exactGitProposal(historicalId, graph);
    if (proposal) addProposal(historicalId, proposal);
  }
}

const uncovered = [...historical.keys()].filter((id) => !registryByHistorical.has(id)).sort();
const conflictingRegistry = [];
for (const [historicalId, entry] of registryByHistorical) {
  if (entry.disposition !== "mapped") continue;
  const candidates = proposals.get(historicalId) || [];
  const provenSlugs = [...new Set(candidates.map((item) => item.current_slug))];
  if (provenSlugs.length && !provenSlugs.includes(entry.current_slug)) conflictingRegistry.push({ historical_id: historicalId, registry: entry.current_slug, proven_slugs: provenSlugs });
}
if (conflictingRegistry.length) throw new Error(`Identity migration registry conflicts with exact provenance discovery: ${JSON.stringify(conflictingRegistry)}`);

console.log(`hack_identity_migration_audit historical=${historical.size} registry=${registry.entries.length} uncovered=${uncovered.length} discover=${discover}`);
if (discover) {
  for (const historicalId of [...historical.keys()].sort()) {
    const item = historical.get(historicalId);
    const candidateList = proposals.get(historicalId) || [];
    const currentSlugsFound = [...new Set(candidateList.map((candidate) => candidate.current_slug))];
    const payload = {
      historical_id: historicalId,
      decision_ids: item.decision_ids,
      candidate_ids: item.candidate_ids,
      registry: registryByHistorical.get(historicalId) || null,
      exact_proposals: candidateList,
      uniquely_resolved_current_slug: currentSlugsFound.length === 1 ? currentSlugsFound[0] : null,
      ambiguous: currentSlugsFound.length > 1,
    };
    console.log(`IDENTITY_MIGRATION_REPORT ${JSON.stringify(payload)}`);
  }
}

if (requireComplete && uncovered.length) {
  throw new Error(`Hack identity migration registry is incomplete: ${uncovered.length} historical target(s) remain: ${uncovered.join(", ")}`);
}

console.log("Hack identity migration audit passed.");
