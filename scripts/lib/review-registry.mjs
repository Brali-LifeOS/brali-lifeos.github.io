import fs from "node:fs";
import path from "node:path";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const candidateUpdateFields = new Set(["status", "last_seen_at", "review_notes"]);
const candidateWorkflowStates = new Set(["new", "screening", "watch", "rejected", "support-existing", "challenge-existing", "propose-hack", "propose-protocol"]);

function mergeKeyed(target, additions, label) {
  target.entries ||= {};
  for (const [key, value] of Object.entries(additions ?? {})) {
    if (target.entries[key]) {
      if (!same(target.entries[key], value)) throw new Error(`Conflicting ${label} in review registries: ${key}`);
      continue;
    }
    target.entries[key] = value;
  }
}

function mergeList(target, key, additions, label) {
  target[key] ||= [];
  const byId = new Map(target[key].map((entry) => [entry.id, entry]));
  for (const entry of additions ?? []) {
    const existing = byId.get(entry.id);
    if (existing) {
      if (!same(existing, entry)) throw new Error(`Conflicting ${label} in review registries: ${entry.id}`);
      continue;
    }
    target[key].push(entry);
    byId.set(entry.id, entry);
  }
}

function applyCandidateUpdates(researchCandidates, updates, sourceName) {
  const byId = new Map((researchCandidates.candidates ?? []).map((entry) => [entry.id, entry]));
  for (const [candidateId, patch] of Object.entries(updates ?? {})) {
    const candidate = byId.get(candidateId);
    if (!candidate) throw new Error(`${sourceName}: research candidate update references unknown candidate ${candidateId}`);
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error(`${sourceName}: invalid research candidate update for ${candidateId}`);
    const unknownFields = Object.keys(patch).filter((field) => !candidateUpdateFields.has(field));
    if (unknownFields.length) throw new Error(`${sourceName}: research candidate update for ${candidateId} contains unsupported fields: ${unknownFields.join(", ")}`);
    if (patch.status && !candidateWorkflowStates.has(patch.status)) throw new Error(`${sourceName}: invalid workflow status ${patch.status} for ${candidateId}`);
    Object.assign(candidate, patch);
  }
}

export function loadReviewRegistry(root) {
  const dataRoot = path.join(root, "data");
  const evidenceOverrides = clone(read(path.join(dataRoot, "evidence-overrides.json")));
  const ontologyOverrides = clone(read(path.join(dataRoot, "ontology-overrides.json")));
  const evidenceDecisions = clone(read(path.join(dataRoot, "evidence-decisions.json")));
  const researchCandidates = clone(read(path.join(dataRoot, "research-candidates.json")));
  const correctionsPath = path.join(dataRoot, "evidence-decision-corrections.json");
  const decisionCorrections = fs.existsSync(correctionsPath) ? read(correctionsPath) : { entries: {} };
  const correctionEntries = decisionCorrections?.entries ?? {};

  const normalizeDecision = (entry) => {
    const normalized = clone(entry);
    const patch = correctionEntries[normalized.id];
    if (patch && typeof patch === "object" && !Array.isArray(patch)) Object.assign(normalized, patch);
    return normalized;
  };

  // Corrections are part of the effective Evidence Decision state. Normalize both
  // the persisted base and supplemental inputs before conflict comparison so a
  // build followed by check remains idempotent instead of comparing corrected
  // base records with their pre-correction historical registry form.
  evidenceDecisions.entries = (evidenceDecisions.entries ?? []).map(normalizeDecision);

  const supplemental = fs.readdirSync(dataRoot)
    .filter((name) => /^review-registry-.*\.json$/.test(name))
    .sort();

  const loaded = [];
  for (const name of supplemental) {
    const document = read(path.join(dataRoot, name));
    if (document.schema_version !== 1) throw new Error(`${name}: review registry schema_version must be 1`);
    loaded.push(name);
    mergeKeyed(evidenceOverrides, document.evidence_overrides, "evidence override");
    mergeKeyed(ontologyOverrides, document.ontology_overrides, "ontology override");
    mergeList(evidenceDecisions, "entries", (document.evidence_decisions ?? []).map(normalizeDecision), "Evidence Decision id");
    mergeList(researchCandidates, "candidates", document.research_candidates, "research candidate id");
    applyCandidateUpdates(researchCandidates, document.research_candidate_updates, name);
  }

  evidenceDecisions.entries.sort((a, b) => a.id.localeCompare(b.id));
  researchCandidates.candidates.sort((a, b) => a.id.localeCompare(b.id));
  return { evidenceOverrides, ontologyOverrides, evidenceDecisions, researchCandidates, supplemental: loaded };
}