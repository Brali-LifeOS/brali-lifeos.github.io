# Research-to-lifecycle pipeline

Brali separates discovery, source review and lifecycle decisions so fresh research can trigger maintenance without turning metadata into evidence.

## Pipeline

```text
Research Scout / provider metadata
  -> data/research-candidates.json
  -> data/research-triage.json
  -> open research lifecycle watchlist
  -> actual source review
  -> Evidence Decision
  -> current canonical target OR governed historical identity disposition
  -> explicit append-only lifecycle event when warranted
```

The forbidden shortcuts are:

```text
metadata -> automatic evidence or lifecycle status change
historical target ID -> guessed current hack alias
retraction/review metadata -> automatic refutation/support verdict
```

## Scheduled Research Scout triage

The existing Research Scout workflow remains the scheduler: weekly discovery plus the monthly digest run. After Crossref/Europe PMC discovery, it now builds `data/research-triage.json` before opening or refreshing the bot PR.

The triage file is source-controlled and deterministic over the effective research candidate workflow plus reviewed Evidence Decisions. Its role is operational scheduling only. Every item keeps `source_review_required: true`.

Shared triage signals include:

- `source-integrity-alert` for metadata describing a retraction, withdrawal, expression of concern, erratum or correction;
- `strong-review-lead` for systematic reviews, meta-analyses and umbrella reviews;
- existing `challenge-existing`, `watch`, `screening`, `new` and `support-existing` workflow context;
- risk flags.

A critical signal creates a GitHub Actions warning and is surfaced in the Research Scout PR summary. It still cannot alter a hack, evidence state, lifecycle status, retrieval eligibility or Agent Skill trust mode.

`data/research-triage.json` is guarded by a freshness check. A PR that changes candidates or effective review state without regenerating triage must fail rather than silently publishing a stale priority queue.

## Open watchlist

`life-os/datasets/research-lifecycle-watchlist.json` is generated from the effective research-candidate state and the effective Brali ontology.

Candidates already represented by an Evidence Decision are excluded from the open metadata queue. Unresolved candidates are matched to existing hacks primarily by Topic and Method. Domain, Lens and legacy Growth Zone are weaker contextual signals.

The source-level Scout triage and public maintenance watchlist use the same signal/priority library. The public watchlist may additionally use ontology-match strength to decide which current hacks deserve attention. Priority is an editorial scheduling score, not a scientific score.

The human page at `/research/review-watchlist/` is intentionally `noindex,follow`. It exists for transparent maintenance and review operations, not as a public evidence conclusion.

## Reviewed Evidence Decisions

Evidence Decisions are actual source-review records. When an Evidence Decision declares a `target_hack_id` that resolves to a current canonical hack, the build links that reviewed record to the corresponding lifecycle entry and canonical hack review history.

This linkage preserves:

- decision identity;
- candidate identity;
- reviewed date/reviewer;
- source URL/title/type;
- supported claim;
- limitations and notes;
- target identity resolution provenance.

Linkage alone does not change lifecycle status. If the source review warrants a material change, add an explicit event to `data/hack-review-events.json` following `HACK_LIFECYCLE.md`.

## Historical target identity registry

Historical Evidence Decision target IDs are governed by `data/hack-identity-migrations.json`. Similarity matching is forbidden.

The full-history audit checks:

- whether `data/life-os-content/<historical-id>.json` ever existed;
- whether the ID ever appeared as canonical membership in `data/life-os-content/index.json`;
- whether it ever appeared in `data/life-os-content-additions.json`;
- exact source aliases/source-record matches;
- exact Git rename chains;
- the effective review-registry files that still reference the target handle.

Allowed dispositions are:

- `mapped` — exact provenance proves a current canonical replacement;
- `retired` — Git history proves the ID was once canonical and has no active replacement;
- `not-published-target` — full Git history proves the ID was used by review metadata but never existed as a canonical Brali hack.

`not-published-target` is intentionally different from `retired`. A review author can name a proposed target handle without creating a public knowledge object. Such a handle must not later be attached to a similar current hack merely because the wording looks close.

The current closure pass proved that all previously unresolved historical handles belong to `not-published-target`: no article path, canonical index membership, content-addition membership or exact rename/alias was found. The review provenance is preserved in the lifecycle dataset, but no false current-hack link is created.

The identity audit runs with full Git history and `--require-complete`. New reviewed decisions cannot introduce unresolved historical targets without either a proven mapping or an explicit non-current disposition.

## Localization

The Russian surface mirrors canonical lifecycle state. It may localize event summaries through `summary_i18n.ru`, but it must not translate unreviewed scientific conclusions into a new verdict.

Reviewed Evidence Decisions remain canonical English machine records. Russian hack pages expose the number of linked decisions and hand off explicitly to the English dataset when the scientific detail is needed.

## Gates

`npm run lifecycle:check` verifies:

- full lifecycle coverage of the canonical hack corpus;
- exact Evidence Decision linkage where a target resolves;
- zero unresolved reviewed historical target mappings;
- provenance-backed dispositions for historical target handles;
- exclusion of already-reviewed candidates from the open metadata watchlist;
- mandatory `source_review_required` boundary for every open watch item;
- noindex boundary on the human research watchlist;
- lifecycle-state parity on every Russian hack page;
- Russian review-ledger and commercial-policy routes, hreflang, sitemap and llms surfaces.

The identity workflow independently reconstructs full-history evidence, while the Research triage workflow independently rebuilds `data/research-triage.json` and rejects stale source state. The production Pages workflow checks generated/live surfaces, and the localization browser gate crawls all declared Russian manifest routes in Chromium.
