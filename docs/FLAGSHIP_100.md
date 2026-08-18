# Brali Flagship 100

Flagship 100 is the smaller default retrieval core inside the wider Brali knowledge library.

It does **not** replace the existing seven Start Here flagships. Those seven remain manually curated, one per Life Area, and are forced anchors in Flagship 100 when they continue to meet the quality contract.

## Why it exists

A large library is useful for coverage but weak as a default agent context. Flagship 100 gives humans and AI systems a bounded set with stronger consistency, explicit trust metadata, and a reproducible selection trail.

## Eligibility

A candidate must:

- already belong to the trusted Protocol Feed;
- have a trusted evidence state (`reviewed` or `practical`);
- expose identity, URL, title, description, action, and a valid Life Area;
- preserve its evidence state and source metadata;
- pass the safety-sensitive boundary.

Safety-sensitive content identified by the maintained policy terms is eligible only when the protocol is `reviewed` and has a source URL. This intentionally prefers omission over quietly presenting a weakly reviewed health-like item as a flagship recommendation.

## Ranking

Eligible candidates receive deterministic points for:

- source-reviewed evidence;
- source linkage;
- canonical Topic mapping;
- a useful check-in;
- sufficiently clear action and description text.

Selection begins with the seven Start Here anchors. Remaining slots are chosen by quality score plus a decaying Life Area and Topic diversity bonus. Stable slug sorting resolves ties.

This is deliberately simple enough to audit. A mysterious machine-learning ranker would be impressive theater and a poor trust mechanism here.

## Outputs

- `/life-os/flagships/100/` — human-readable collection.
- `/life-os/datasets/flagship-100.json` — selected core.
- `/life-os/datasets/flagship-100-candidates.json` — candidate audit trail, including non-selected and ineligible records.
- `/data/flagship-100-policy.json` — machine-readable policy.
- `/api/v1/flagships.json` — API representation of the same selected dataset.

The build adds these files to the canonical manifest with SHA-256 checksums. `scripts/check-flagship-100.mjs` verifies exact count, uniqueness, anchors, trust state, safety boundaries, API equality, manifest hashes, Life Area coverage, page links, and sitemap presence.

## Interpretation

`reviewed` remains stronger than `practical`. Flagship status says the record is suitable for the bounded high-trust retrieval core under the current Brali contract. It does not imply medical advice, universal effectiveness, or equal scientific support across all selected records.

The candidate queue is intentionally public so that future evidence review can replace score heuristics with stronger source-backed decisions instead of silently changing the list.
