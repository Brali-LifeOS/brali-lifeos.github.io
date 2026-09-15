import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const fail = (message) => { throw new Error(`[lifecycle-research] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const canonicalIndex = readJson("data/life-os-content/index.json");
const reviews = readJson("life-os/datasets/reviews.json");
const decisions = readJson("data/evidence-decisions.json");
const watchlist = readJson("life-os/datasets/research-lifecycle-watchlist.json");
const manifest = readJson("ru/manifest.json");
const ruCopy = readJson("data/localization/ru/lifecycle.json");

assert(Array.isArray(canonicalIndex), "canonical hack index must be an array");
assert(reviews.schema_version === 1 && Array.isArray(reviews.entries), "lifecycle dataset must be schema_version 1 with entries[]");
assert(reviews.entries.length === canonicalIndex.length, `lifecycle coverage drift ${reviews.entries.length}/${canonicalIndex.length}`);
assert(Array.isArray(reviews.unresolved_decision_targets), "lifecycle dataset must expose unresolved_decision_targets[]");
assert(reviews.unresolved_decision_target_count === reviews.unresolved_decision_targets.length, "unresolved Evidence Decision target count drift");
assert(decisions.schema_version === 1 && Array.isArray(decisions.entries), "Evidence Decisions must be schema_version 1 with entries[]");
assert(watchlist.schema_version === 1 && Array.isArray(watchlist.candidates), "research lifecycle watchlist must be schema_version 1 with candidates[]");
assert(ruCopy.schema_version === 1 && ruCopy.locale === "ru", "Russian lifecycle source must declare schema_version 1 and locale ru");

const canonicalSlugs = new Set(canonicalIndex.map((entry) => entry.slug));
const reviewBySlug = new Map(reviews.entries.map((entry) => [entry.slug, entry]));
assert(reviewBySlug.size === canonicalSlugs.size, "lifecycle dataset contains duplicate or missing slugs");
for (const slug of canonicalSlugs) assert(reviewBySlug.has(slug), `lifecycle dataset missing canonical hack ${slug}`);

const unresolvedByKey = new Map();
for (const item of reviews.unresolved_decision_targets) {
  const key = `${item.decision_id}::${item.target_hack_id}`;
  assert(!unresolvedByKey.has(key), `duplicate unresolved Evidence Decision target ${key}`);
  assert(!canonicalSlugs.has(item.target_hack_id), `${key}: unresolved target unexpectedly exists in current canonical corpus`);
  assert(item.reason === "target-hack-not-current-canonical", `${key}: unsupported unresolved target reason`);
  assert(typeof item.required_action === "string" && item.required_action.includes("Do not guess"), `${key}: unresolved target must preserve an explicit no-guess boundary`);
  unresolvedByKey.set(key, item);
}

const allowedLifecycle = new Set(["active", "reviewed", "watch", "needs-review", "contested", "refuted", "retired"]);
let linkedDecisionCount = 0;
for (const entry of reviews.entries) {
  assert(allowedLifecycle.has(entry.status), `${entry.slug}: unsupported lifecycle status ${entry.status}`);
  assert(Array.isArray(entry.history), `${entry.slug}: lifecycle history must be an array`);
  assert(Array.isArray(entry.evidence_decisions), `${entry.slug}: evidence_decisions must be an array after enrichment`);
  assert(entry.evidence_decision_count === entry.evidence_decisions.length, `${entry.slug}: evidence_decision_count drift`);
  linkedDecisionCount += entry.evidence_decisions.length;
}

for (const decision of decisions.entries) {
  if (decision.source_reviewed !== true) continue;
  for (const slug of [...new Set(decision.target_hack_ids || [])]) {
    if (!canonicalSlugs.has(slug)) {
      const unresolved = unresolvedByKey.get(`${decision.id}::${slug}`);
      assert(unresolved, `${decision.id}: non-canonical target ${slug} was neither linked nor recorded as explicit linkage debt`);
      assert(unresolved.source_url === decision.source_url, `${decision.id}/${slug}: unresolved target source_url drift`);
      continue;
    }
    const linked = reviewBySlug.get(slug).evidence_decisions.find((item) => item.id === decision.id);
    assert(linked, `${decision.id}: reviewed Evidence Decision is not linked into lifecycle record ${slug}`);
    assert(linked.source_url === decision.source_url, `${decision.id}: source_url drift in lifecycle enrichment for ${slug}`);
    assert(linked.supported_claim === decision.supported_claim, `${decision.id}: supported_claim drift in lifecycle enrichment for ${slug}`);
  }
}

const reviewedCandidateIds = new Set(decisions.entries.map((entry) => entry.candidate_id).filter(Boolean));
const watchCandidateIds = new Set();
for (const candidate of watchlist.candidates) {
  assert(candidate.candidate_id && !watchCandidateIds.has(candidate.candidate_id), `duplicate watchlist candidate ${candidate.candidate_id}`);
  watchCandidateIds.add(candidate.candidate_id);
  assert(!reviewedCandidateIds.has(candidate.candidate_id), `${candidate.candidate_id}: already-reviewed candidate leaked into open research watchlist`);
  assert(candidate.source_review_required === true, `${candidate.candidate_id}: watchlist must require actual source review`);
  assert(["critical-triage", "high", "medium", "normal"].includes(candidate.priority), `${candidate.candidate_id}: invalid watchlist priority`);
  assert(Number.isFinite(candidate.priority_score) && candidate.priority_score > 0, `${candidate.candidate_id}: invalid priority score`);
  assert(typeof candidate.suggested_action === "string" && candidate.suggested_action.length >= 40, `${candidate.candidate_id}: missing bounded review action`);
  assert(Array.isArray(candidate.affected_hacks) && candidate.affected_hacks.length > 0, `${candidate.candidate_id}: watchlist item has no affected hacks`);
  for (const hack of candidate.affected_hacks) {
    assert(canonicalSlugs.has(hack.slug), `${candidate.candidate_id}: watchlist references unknown hack ${hack.slug}`);
    assert(Number.isFinite(hack.match_score) && hack.match_score > 0, `${candidate.candidate_id}/${hack.slug}: invalid ontology match score`);
    assert(hack.url === `${base}/life-os/${hack.slug}/`, `${candidate.candidate_id}/${hack.slug}: canonical URL drift`);
  }
}
assert(watchlist.policy.includes("never an evidence or lifecycle verdict"), "watchlist policy must explicitly forbid metadata-driven verdicts");
assert(Array.isArray(watchlist.reviewed_linkage_debt), "research watchlist must expose reviewed_linkage_debt[]");
assert(watchlist.reviewed_linkage_debt.length === reviews.unresolved_decision_targets.length, "research watchlist reviewed linkage debt drift");
for (const debt of watchlist.reviewed_linkage_debt) {
  assert(unresolvedByKey.has(`${debt.decision_id}::${debt.target_hack_id}`), `${debt.decision_id}/${debt.target_hack_id}: watchlist linkage debt is not grounded in lifecycle dataset`);
}

const watchlistPage = fs.readFileSync(path.join(root, "research", "review-watchlist", "index.html"), "utf8");
assert(/<meta\b(?=[^>]*name=["']robots["'])[^>]*content=["'][^"']*noindex[^"']*["']/i.test(watchlistPage) || /<meta\b(?=[^>]*content=["'][^"']*noindex[^"']*["'])[^>]*name=["']robots["']/i.test(watchlistPage), "research watchlist human page must remain noindex");
assert(watchlistPage.includes("Metadata is not a verdict"), "research watchlist must visibly explain that metadata is not a verdict");
assert(watchlistPage.includes(`<link rel="canonical" href="${base}/research/review-watchlist/">`), "research watchlist canonical URL drift");
if (reviews.unresolved_decision_targets.length) assert(watchlistPage.includes("Reviewed linkage debt"), "research watchlist must visibly expose unresolved reviewed target mappings");

const statusCopy = ruCopy.status || {};
for (const status of allowedLifecycle) {
  assert(typeof statusCopy[status]?.label === "string" && /[А-Яа-яЁё]/.test(statusCopy[status].label), `Russian lifecycle label missing for ${status}`);
  assert(typeof statusCopy[status]?.description === "string" && /[А-Яа-яЁё]/.test(statusCopy[status].description), `Russian lifecycle description missing for ${status}`);
}

let ruLifecyclePages = 0;
for (const entry of reviews.entries) {
  const file = path.join(root, "ru", "life-os", entry.slug, "index.html");
  assert(fs.existsSync(file), `${entry.slug}: Russian hack page missing before lifecycle parity check`);
  const html = fs.readFileSync(file, "utf8");
  assert(html.includes("<!-- brali-ru-hack-lifecycle:start -->"), `${entry.slug}: Russian lifecycle block missing`);
  assert(html.includes(`data-review-status="${entry.status}"`), `${entry.slug}: Russian lifecycle status does not match canonical ${entry.status}`);
  assert(html.includes("История проверок"), `${entry.slug}: Russian lifecycle heading missing`);
  assert(!html.includes("Maintenance record") && !html.includes("Review history</h2>"), `${entry.slug}: English lifecycle UI leaked into Russian page`);
  ruLifecyclePages += 1;
}

const ruLedgerPath = path.join(root, "ru", "life-os", "review-log", "index.html");
const ruSponsorPath = path.join(root, "ru", "sponsorship", "index.html");
assert(fs.existsSync(ruLedgerPath) && fs.existsSync(ruSponsorPath), "Russian lifecycle/support policy pages are missing");
const ruLedger = fs.readFileSync(ruLedgerPath, "utf8");
const ruSponsor = fs.readFileSync(ruSponsorPath, "utf8");
assert(/<html lang="ru">/i.test(ruLedger) && ruLedger.includes("Журнал проверок"), "Russian review ledger shell/content drift");
assert(ruLedger.includes(`<link rel="canonical" href="${base}/ru/life-os/review-log/">`), "Russian review ledger canonical drift");
assert(ruLedger.includes(`hreflang="en" href="${base}/life-os/review-log/"`), "Russian review ledger English hreflang missing");
assert(/<html lang="ru">/i.test(ruSponsor) && ruSponsor.includes("Покупать вывод — нельзя"), "Russian sponsorship policy shell/content drift");
assert(ruSponsor.includes(`<link rel="canonical" href="${base}/ru/sponsorship/">`), "Russian sponsorship canonical drift");
assert(ruSponsor.includes(`hreflang="en" href="${base}/sponsorship/"`), "Russian sponsorship English hreflang missing");

const enLedger = fs.readFileSync(path.join(root, "life-os", "review-log", "index.html"), "utf8");
const enSponsor = fs.readFileSync(path.join(root, "sponsorship", "index.html"), "utf8");
assert(enLedger.includes(`hreflang="ru" href="${base}/ru/life-os/review-log/"`), "English review ledger reciprocal Russian hreflang missing");
assert(enSponsor.includes(`hreflang="ru" href="${base}/ru/sponsorship/"`), "English sponsorship reciprocal Russian hreflang missing");

const routeByPath = new Map((manifest.routes || []).map((route) => [route.path, route]));
for (const route of [
  ["/ru/life-os/review-log/", "/life-os/review-log/"],
  ["/ru/sponsorship/", "/sponsorship/"],
]) {
  const item = routeByPath.get(route[0]);
  assert(item, `Russian manifest missing ${route[0]}`);
  assert(item.canonical_path === route[1], `${route[0]} canonical_path drift`);
}
assert(manifest.coverage?.lifecycle_trust_surfaces?.localized === 2 && manifest.coverage?.lifecycle_trust_surfaces?.canonical === 2, "Russian manifest lifecycle surface coverage drift");

const ruSitemap = fs.readFileSync(path.join(root, "ru", "sitemap.xml"), "utf8");
assert(ruSitemap.includes(`<loc>${base}/ru/life-os/review-log/</loc>`), "Russian sitemap missing review ledger");
assert(ruSitemap.includes(`<loc>${base}/ru/sponsorship/</loc>`), "Russian sitemap missing sponsorship policy");
const ruLlms = fs.readFileSync(path.join(root, "ru", "llms.txt"), "utf8");
assert(ruLlms.includes(`${base}/ru/life-os/review-log/`) && ruLlms.includes(`${base}/ru/sponsorship/`), "Russian llms.txt missing lifecycle/trust surfaces");

console.log(`Lifecycle/research/localization gate passed: hacks=${reviews.entries.length}, linked_decisions=${linkedDecisionCount}, unresolved_targets=${reviews.unresolved_decision_targets.length}, open_watch=${watchlist.candidates.length}, ru_lifecycle_pages=${ruLifecyclePages}, ru_trust_surfaces=2.`);
