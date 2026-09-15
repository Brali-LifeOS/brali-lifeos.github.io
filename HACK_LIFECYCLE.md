# Hack lifecycle and review history

Brali treats a hack as a maintained knowledge object, not a frozen article.

A public hack can be useful today and still need revision later. New evidence can narrow a claim, contradict it, or show that the recommendation no longer deserves the same confidence. Brali preserves that history instead of silently rewriting the past.

## Source of truth

The lifecycle has two layers:

1. Existing `editorialCuration` metadata in `data/life-os-content/*.json` is legacy review provenance. It is preserved and exposed as the initial review record when present.
2. New lifecycle changes are append-only events in `data/hack-review-events.json`.

Do not rewrite old lifecycle events to make the current conclusion look cleaner. Add a new event that explains what changed. Corrections to a materially wrong event should be explicit correction events or a reviewed repository change with a clear reason.

The generated current status is derived from the event stream. It is not an independent editorial field that can drift away from the history.

## Status model

- `active` — published, with no explicit review conclusion beyond the source content.
- `reviewed` — an editorial/evidence review has been recorded and no later event changes that conclusion.
- `watch` — still usable, but a known uncertainty or fast-changing evidence area deserves monitoring.
- `needs-review` — a new review is required before treating the current conclusion as fresh.
- `contested` — material evidence or reasoning challenges the current recommendation and the dispute is unresolved.
- `refuted` — the central recommendation is no longer supported strongly enough to present as current guidance.
- `retired` — retained for provenance/history but no longer maintained as an active recommendation.

`refuted` and `retired` records normally remain addressable. The public page should explain the current state rather than disappearing and losing the audit trail. Safety, legal, privacy, or abuse concerns can justify removal.

## Event model

Supported event types are:

- `reviewed`
- `evidence-added`
- `evidence-changed`
- `observation`
- `challenged`
- `refuted`
- `restored`
- `retired`
- `note`

Each event has a stable `id`, `slug`, ISO date, concise summary, and optional reviewer, evidence references, localized summaries, next-review date, and resulting status.

Events that can materially change an evidence conclusion (`evidence-changed`, `challenged`, `refuted`, `restored`) require evidence references. A personal observation cannot change evidence status by itself.

## Observations are not evidence grades

Brali can record implementation observations: where a protocol felt difficult, what users commonly misunderstood, whether a step needed clarification, or what context appeared to matter.

Those observations can trigger a review. They cannot on their own upgrade, downgrade, refute, or restore an evidence conclusion. This prevents anecdotal popularity from becoming an evidence score.

## Review triggers

Create a lifecycle event or request a re-review when any of the following happens:

- a primary source is corrected, retracted, superseded, or materially updated;
- a strong new review or primary study changes the balance of evidence;
- a hack contains a claim that is broader than its sources support;
- a safety boundary or important context changes;
- repeated observations reveal a likely implementation failure or ambiguity;
- an explicit `review_after` date is reached;
- a contributor submits a credible challenge with traceable sources.

The review should result in one of: no material change, narrower wording, changed evidence framing, `watch`, `needs-review`, `contested`, `refuted`, `restored`, or `retired`.

## Public contract

The build generates:

- a review-history block on hack pages;
- a current lifecycle status derived from provenance and events;
- `life-os/datasets/reviews.json` for machines and agents;
- `/life-os/review-log/` as the human review ledger.

The review dataset is evidence/editorial metadata. Sponsorship is never allowed to modify it.

## Adding an event

Append an object to `data/hack-review-events.json`. Keep earlier objects unchanged.

Example:

```json
{
  "id": "2026-09-15-example-hack-challenge-01",
  "slug": "example-hack",
  "date": "2026-09-15",
  "type": "challenged",
  "summary": "A newer systematic review materially narrows the effect claimed by this protocol; re-review is required.",
  "actor": "Brali editorial review",
  "evidence_refs": ["https://doi.org/example"],
  "status_after": "contested",
  "review_after": "2026-10-15",
  "summary_i18n": {
    "ru": "Новый систематический обзор существенно сужает заявленный эффект; протокол требует повторной проверки."
  }
}
```

The build rejects unknown hacks, duplicate event IDs, invalid status transitions, unsafe event shapes, and material challenge events without references.

## Commercial independence

Lifecycle state, evidence labels, search/retrieval ranking, inclusion decisions, and review outcomes must not depend on sponsorship or affiliate relationships. See `SPONSORSHIP_POLICY.md`.
