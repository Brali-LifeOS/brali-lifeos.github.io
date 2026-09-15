import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reviewsPath = path.join(root, "life-os", "datasets", "reviews.json");
const decisionsPath = path.join(root, "data", "evidence-decisions.json");
const markerStart = "<!-- brali-lifecycle-evidence:start -->";
const markerEnd = "<!-- brali-lifecycle-evidence:end -->";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const text = (value = "") => String(value).replace(/\s+/g, " ").trim();

if (!fs.existsSync(reviewsPath)) throw new Error("Hack lifecycle dataset must exist before Evidence Decision enrichment");
const reviews = readJson(reviewsPath);
const decisions = readJson(decisionsPath);
if (!Array.isArray(reviews.entries)) throw new Error("life-os/datasets/reviews.json must contain entries[]");
if (!Array.isArray(decisions.entries)) throw new Error("data/evidence-decisions.json must contain entries[]");

const reviewBySlug = new Map(reviews.entries.map((entry) => [entry.slug, entry]));
const linksBySlug = new Map();
let linkedDecisions = 0;

for (const decision of decisions.entries) {
  if (decision.source_reviewed !== true) continue;
  const targets = [...new Set(decision.target_hack_ids || [])];
  for (const slug of targets) {
    if (!reviewBySlug.has(slug)) throw new Error(`Evidence Decision ${decision.id} targets unknown lifecycle hack ${slug}`);
    const list = linksBySlug.get(slug) || [];
    list.push({
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
    });
    linksBySlug.set(slug, list);
    linkedDecisions += 1;
  }
}

for (const entry of reviews.entries) {
  entry.evidence_decisions = (linksBySlug.get(entry.slug) || []).sort((a, b) => (a.reviewed_at || "").localeCompare(b.reviewed_at || "") || a.id.localeCompare(b.id));
  entry.evidence_decision_count = entry.evidence_decisions.length;
}
fs.writeFileSync(reviewsPath, `${JSON.stringify(reviews, null, 2)}\n`);

function evidenceBlock(items) {
  if (!items.length) return "";
  const list = items.map((decision) => {
    const source = decision.source_url
      ? `<a href="${escapeHtml(decision.source_url)}" rel="noopener noreferrer">Reviewed source</a>`
      : "Reviewed source recorded in the Evidence Decision";
    return `<li data-evidence-decision="${escapeHtml(decision.id)}"><p><strong>${escapeHtml(decision.reviewed_at || "reviewed")} · ${escapeHtml(decision.decision || "decision")}</strong> · <code>${escapeHtml(decision.id)}</code></p><p>${source}. ${escapeHtml(text(decision.supported_claim))}</p></li>`;
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

console.log(`lifecycle_evidence decisions=${decisions.entries.length} linked=${linkedDecisions} hacks=${linksBySlug.size} patched_pages=${patchedPages}`);
