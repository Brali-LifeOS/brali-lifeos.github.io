import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reviewsPath = path.join(root, "life-os", "datasets", "reviews.json");
const decisionsPath = path.join(root, "data", "evidence-decisions.json");
const migrationsPath = path.join(root, "data", "hack-identity-migrations.json");
const markerStart = "<!-- brali-lifecycle-evidence:start -->";
const markerEnd = "<!-- brali-lifecycle-evidence:end -->";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();

if (!fs.existsSync(reviewsPath)) throw new Error("Hack lifecycle dataset must exist before Evidence Decision enrichment");
const reviews = readJson(reviewsPath);
const decisions = readJson(decisionsPath);
const migrations = readJson(migrationsPath);
if (!Array.isArray(reviews.entries)) throw new Error("life-os/datasets/reviews.json must contain entries[]");
if (!Array.isArray(decisions.entries)) throw new Error("data/evidence-decisions.json must contain entries[]");
if (migrations.schema_version !== 1 || !Array.isArray(migrations.entries)) throw new Error("data/hack-identity-migrations.json must use schema_version 1 with entries[]");

const reviewBySlug = new Map(reviews.entries.map((entry) => [entry.slug, entry]));
const migrationByHistorical = new Map(migrations.entries.map((entry) => [entry.historical_id, entry]));
const linksBySlug = new Map();
const unresolvedTargets = [];
const resolvedHistoricalTargets = [];
let linkedDecisions = 0;
let mappedHistoricalLinks = 0;

function decisionLink(decision, targetResolution) {
  return {
    id: decision.id,
    candidate_id: decision.candidate_id || null,
    decision: decision.decision,
    reviewed_at: decision.reviewed_at,
    reviewed_by: decision.reviewed_by,
    source_url: decision.source_url,
    source_title: decision.source_title,
    source_type: decision.source_type || null,
    supported_claim: decision.supported_claim,
    limitations: decision.limitations || [],
    notes: decision.notes || null,
    target_resolution: targetResolution,
  };
}

function addLink(slug, decision, resolution) {
  if (!reviewBySlug.has(slug)) throw new Error(`${decision.id}: resolved lifecycle target is not canonical: ${slug}`);
  const list = linksBySlug.get(slug) || [];
  const duplicate = list.some((item) => item.id === decision.id && item.target_resolution?.historical_target_id === resolution.historical_target_id);
  if (!duplicate) {
    list.push(decisionLink(decision, resolution));
    linksBySlug.set(slug, list);
    linkedDecisions += 1;
  }
}

for (const decision of decisions.entries) {
  if (decision.source_reviewed !== true) continue;
  const targets = [...new Set(decision.target_hack_ids || [])];
  for (const target of targets) {
    if (reviewBySlug.has(target)) {
      addLink(target, decision, { kind: "current-canonical", target_hack_id: target });
      continue;
    }

    const migration = migrationByHistorical.get(target);
    if (!migration) {
      unresolvedTargets.push({
        decision_id: decision.id,
        candidate_id: decision.candidate_id || null,
        target_hack_id: target,
        reviewed_at: decision.reviewed_at || null,
        source_url: decision.source_url || null,
        source_title: decision.source_title || null,
        reason: "target-hack-not-current-canonical",
        required_action: "Resolve the historical target only through data/hack-identity-migrations.json with exact identity/provenance evidence. Do not guess a replacement slug.",
      });
      continue;
    }

    const resolution = {
      decision_id: decision.id,
      candidate_id: decision.candidate_id || null,
      target_hack_id: target,
      disposition: migration.disposition,
      current_slug: migration.current_slug || null,
      evidence_type: migration.evidence?.type || null,
      evidence_note: migration.evidence?.note || null,
      resolved_at: migration.resolved_at || null,
      resolved_by: migration.resolved_by || null,
    };

    if (migration.disposition === "mapped") {
      if (!migration.current_slug || !reviewBySlug.has(migration.current_slug)) throw new Error(`${decision.id}: mapped historical target ${target} does not resolve to a current lifecycle hack`);
      addLink(migration.current_slug, decision, {
        kind: "historical-mapped",
        historical_target_id: target,
        target_hack_id: migration.current_slug,
        evidence_type: migration.evidence?.type || null,
      });
      mappedHistoricalLinks += 1;
      resolvedHistoricalTargets.push(resolution);
      continue;
    }

    if (!["retired", "not-published-target"].includes(migration.disposition)) throw new Error(`${decision.id}: unsupported historical target disposition ${migration.disposition}`);
    resolvedHistoricalTargets.push(resolution);
  }
}

for (const entry of reviews.entries) {
  entry.evidence_decisions = (linksBySlug.get(entry.slug) || []).sort((a, b) => (a.reviewed_at || "").localeCompare(b.reviewed_at || "") || a.id.localeCompare(b.id));
  entry.evidence_decision_count = entry.evidence_decisions.length;
}
reviews.resolved_decision_targets = resolvedHistoricalTargets.sort((a, b) => a.target_hack_id.localeCompare(b.target_hack_id) || a.decision_id.localeCompare(b.decision_id));
reviews.resolved_decision_target_count = reviews.resolved_decision_targets.length;
reviews.unresolved_decision_targets = unresolvedTargets.sort((a, b) => a.target_hack_id.localeCompare(b.target_hack_id) || a.decision_id.localeCompare(b.decision_id));
reviews.unresolved_decision_target_count = reviews.unresolved_decision_targets.length;
fs.writeFileSync(reviewsPath, `${JSON.stringify(reviews, null, 2)}\n`);

function evidenceBlock(items) {
  if (!items.length) return "";
  const list = items.map((decision) => {
    const source = decision.source_url
      ? `<a href="${escapeHtml(decision.source_url)}" rel="noopener noreferrer">Reviewed source</a>`
      : "Reviewed source recorded in the Evidence Decision";
    const resolution = decision.target_resolution?.kind === "historical-mapped"
      ? `<p><small>Historical target <code>${escapeHtml(decision.target_resolution.historical_target_id)}</code> was resolved to this canonical hack through reviewed identity provenance.</small></p>`
      : "";
    return `<li data-evidence-decision="${escapeHtml(decision.id)}"><p><strong>${escapeHtml(decision.reviewed_at || "reviewed")} · ${escapeHtml(decision.decision || "decision")}</strong> · <code>${escapeHtml(decision.id)}</code></p><p>${source}. ${escapeHtml(text(decision.supported_claim))}</p>${resolution}</li>`;
  }).join("");
  return `${markerStart}<div class="review-evidence-context"><h3>Reviewed evidence decisions</h3><p>These source reviews are linked to this hack for provenance. They do not change lifecycle status automatically; any material status change still requires an explicit lifecycle event.</p><ol>${list}</ol><p><a href="/life-os/datasets/evidence-decisions.json">Browse the machine-readable Evidence Decisions</a></p></div>${markerEnd}`;
}

let patchedPages = 0;
for (const entry of reviews.entries) {
  const file = path.join(root, "life-os", entry.slug, "index.html");
  if (!fs.existsSync(file)) throw new Error(`Generated hack page missing for lifecycle evidence enrichment: ${entry.slug}`);
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g"), "");
  const block = evidenceBlock(entry.evidence_decisions || []);
  if (block) {
    const lifecycleEnd = html.indexOf("<!-- brali-hack-lifecycle:end -->");
    if (lifecycleEnd < 0) throw new Error(`${entry.slug}: lifecycle marker missing before Evidence Decision enrichment`);
    const lifecycleStart = html.lastIndexOf("</section>", lifecycleEnd);
    if (lifecycleStart < 0) throw new Error(`${entry.slug}: lifecycle section closing tag missing`);
    html = `${html.slice(0, lifecycleStart)}${block}${html.slice(lifecycleStart)}`;
    patchedPages += 1;
  }
  fs.writeFileSync(file, html);
}

console.log(`lifecycle_evidence decisions=${decisions.entries.length} linked=${linkedDecisions} hacks=${linksBySlug.size} mapped_historical=${mappedHistoricalLinks} resolved_historical_targets=${resolvedHistoricalTargets.length} unresolved_targets=${unresolvedTargets.length} patched_pages=${patchedPages}`);
