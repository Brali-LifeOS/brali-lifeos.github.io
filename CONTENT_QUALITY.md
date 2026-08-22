# Brali Growth Library content quality

The Growth Library is product content, not an SEO page factory. Public guidance should be useful when read by a person and defensible when read by a search engine, reviewer, or AI system.

## Evidence states

Every entry has one explicit state:

- `reviewed`: evidence-like claims have traceable sources and the practical guidance has been checked.
- `practical`: the entry is a low-risk personal practice and contains no evidence-like claim that requires support.
- `pending-review`: a source is recorded or evidence-like wording exists, but editorial review is not complete.
- `restricted`: sensitive health or mental-health guidance does not yet meet the evidence bar.

The default state is derived automatically. Manual editorial decisions live in `data/evidence-overrides.json` and must include `reviewed_at` and `reviewed_by`.

## Review workflow

1. Run `npm run build` to generate `life-os/datasets/evidence.json` and `life-os/datasets/review-queue.json`.
2. Work through `restricted` entries first, then `pending-review`; quantitative claims are prioritized within each state.
3. Check the source and the wording. Remove unsupported precision instead of searching for a citation that merely looks convenient.
4. When a decision is complete, add an override with `status`, `reviewed_at`, `reviewed_by`, and an optional `note`.
5. Run `npm run check`. Invalid overrides, evidence-state drift, missing protocol summaries, and indexing-policy drift fail the build.

A `practical` override is rejected while evidence-like claims remain. A sensitive or evidence-claiming entry cannot be marked `reviewed` without a usable source.

## Editorial normalizations

The migrated source corpus is preserved for provenance, so inherited boilerplate can remain in repository source files even after editorial review identifies a problem. Reviewed corpus-wide corrections live in `data/editorial-normalizations.json`.

A normalization must record:

- the exact inherited wording being corrected;
- the replacement wording;
- the reason for the change;
- the review source used to evaluate the inherited claim;
- `reviewed_at` and `reviewed_by`.

Reviewed normalizations are applied before public pages, evidence states, search indexing, and the Trusted Protocol Feed are generated. The applied-rule register is published as `life-os/datasets/editorial-normalizations.json` so the correction is visible rather than silently rewriting history.

Use this mechanism for genuinely repeated inherited claims. Do not use it to make article-specific editorial decisions look like generic rules.

## Claims

Precise claims require precise support. Percentages, sample sizes, effect estimates, phrases such as "research shows", and claims about treatment, diagnosis, prevention, or clinical outcomes require a source that a reader can trace.

When a source is unavailable, prefer a modest practical statement over scientific-sounding language. Do not invent a study-shaped explanation to make a recommendation look authoritative.

## Health and mental health

Health and mental-health entries receive the highest review priority. Until the evidence bar is met, keep them out of search indexing, frame them as general education rather than medical advice, and avoid diagnosis or treatment promises.

## Structure of a strong protocol

A strong Brali entry should answer:

1. What problem is this for?
2. What should I try?
3. How small can the first action be?
4. How long should I try it before reviewing?
5. What should I observe or record?
6. What would make me keep, change, or stop it?
7. What evidence supports any factual claim?
8. Are there safety limits or contexts where this is not appropriate?

## Brand and provenance

Public pages use Brali branding. Historical MetalHatsCats URLs and names may remain in archived source records for provenance, but they must not leak into generated public pages and they do not count as evidence.

## Search policy

Indexing is earned by content quality, not by the existence of a generated URL.

- `reviewed` and `practical` entries may be included in the sitemap.
- All public entry URLs are crawlable and included in the sitemap. `pending-review` and `restricted` entries remain visibly labelled and are excluded from the Trusted Protocol Feed and normal recommendations until the quality bar is met.
- Related-protocol recommendations may point only to indexable entries.

This deliberately favors a smaller trusted search surface over a large collection of unreviewed pages.

## Machine-readable outputs

- `life-os/datasets/evidence.json` exposes the evidence state for every Growth Library entry.
- `life-os/datasets/review-queue.json` exposes the current editorial queue.
- `life-os/datasets/indexing.json` lists which entries meet the current search-indexing bar.
- `life-os/datasets/protocols.json` provides the compact discovery-ready Protocol Feed.
- `life-os/datasets/editorial-normalizations.json` records reviewed inherited-claim corrections and their application counts.
- `life-os/datasets/manifest.json` includes evidence, indexing, protocol-feed, and normalization counts.

These files are public so search systems, AI tools, and contributors can distinguish reviewed material from content still awaiting review.
