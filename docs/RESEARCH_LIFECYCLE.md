# Research-to-lifecycle pipeline

Brali separates discovery, source review and lifecycle decisions so fresh research can trigger maintenance without turning metadata into evidence.

## Pipeline

```text
Research Scout / provider metadata
  -> data/research-candidates.json
  -> open research lifecycle watchlist
  -> actual source review
  -> Evidence Decision
  -> exact target_hack_ids linkage
  -> explicit append-only lifecycle event when warranted
```

The forbidden shortcut is:

```text
metadata -> automatic evidence or lifecycle status change
```

## Open watchlist

`life-os/datasets/research-lifecycle-watchlist.json` is generated from the effective research-candidate state and the effective Brali ontology.

Candidates already represented by an Evidence Decision are excluded. Unresolved candidates are matched to existing hacks primarily by Topic and Method. Domain, Lens and legacy Growth Zone are weaker contextual signals.

Priority is an editorial scheduling score, not a scientific score. It may use:

- the existing candidate workflow state (`challenge-existing`, `watch`, `screening`, `new`, `support-existing`);
- possible correction/retraction wording in discovery metadata;
- review/meta-analysis wording in discovery metadata;
- risk flags;
- strength of the ontology match.

The human page at `/research/review-watchlist/` is intentionally `noindex,follow`. It exists for transparent maintenance and review operations, not as a public evidence conclusion.

## Reviewed Evidence Decisions

Evidence Decisions are actual source-review records. When an Evidence Decision declares `target_hack_ids`, the build links that reviewed record to the corresponding lifecycle entry and canonical hack review history.

This linkage preserves:

- decision identity;
- candidate identity;
- reviewed date/reviewer;
- source URL/title/type;
- supported claim;
- limitations and notes.

Linkage alone does not change lifecycle status. If the source review warrants a material change, add an explicit event to `data/hack-review-events.json` following `HACK_LIFECYCLE.md`.

## Localization

The Russian surface mirrors canonical lifecycle state. It may localize event summaries through `summary_i18n.ru`, but it must not translate unreviewed scientific conclusions into a new verdict.

Reviewed Evidence Decisions remain canonical English machine records. Russian hack pages expose the number of linked decisions and hand off explicitly to the English dataset when the scientific detail is needed.

## Gates

`npm run lifecycle:check` verifies:

- full lifecycle coverage of the canonical hack corpus;
- exact Evidence Decision linkage to target hacks;
- exclusion of already-reviewed candidates from the open watchlist;
- mandatory `source_review_required` boundary for every open watch item;
- noindex boundary on the human research watchlist;
- lifecycle-state parity on every Russian hack page;
- Russian review-ledger and commercial-policy routes, hreflang, sitemap and llms surfaces.

The production Pages workflow also checks the same surfaces over live HTTP, while the localization browser gate crawls all declared Russian manifest routes in Chromium.
