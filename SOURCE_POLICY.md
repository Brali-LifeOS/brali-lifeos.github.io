# Brali source policy

Brali distinguishes ideas we formulate editorially from claims or techniques derived from external material.

## Core rule

If a hack, protocol, research note, or evidence claim comes from an external source, the source must remain attached to it from discovery through publication.

For research-derived material, a public page must show enough provenance for a reader to inspect the source directly. Keeping a URL only in an internal JSON file is not sufficient.

A source is provenance, not automatically an evidence claim. Merely attaching an external URL must not force otherwise low-risk practical guidance into `pending-review`. Trust state is determined by the public claim surface, sensitivity, and an explicit review decision.

## Required provenance

At minimum record:

- source title;
- stable URL and DOI when available;
- source type (primary study, systematic review, meta-analysis, guideline, consensus, or other);
- what exact claim or action the source supports (`claim_scope`);
- important limitations;
- review date and reviewer when Brali marks the evidence as reviewed.

## Trustverse promotion rule

Brali uses four evidence states with a deliberately broad but bounded path into trusted discovery:

- `reviewed` — evidence-bearing or sensitive material that has an explicit source review and evidence decision;
- `practical` — low-risk bounded guidance that does not make review-gated evidence/effectiveness claims, whether it is Brali-authored or preserves an external provenance source;
- `pending-review` — evidence-like, quantitative, effectiveness, clinical, causal, or otherwise review-gated material that has not completed review, plus sourced sensitive guidance awaiting review;
- `restricted` — material that must not be operationalized, including sensitive guidance without a usable source or an explicit restriction decision.

`reviewed` and `practical` are normal Trustverse/current-guidance states. They may enter trusted retrieval, recommendation feeds, search surfaces, and usable Agent Skills. `pending-review` may be preserved as a neutral reference record when policy permits, but it must not be presented as trusted current guidance or a usable skill. `restricted` stays outside operational guidance.

The classifier should maximize useful trusted coverage by choosing `practical` for low-risk material instead of using the mere presence of a source as a review gate. This rule must never be used to downgrade genuine evidence, safety, health, treatment, quantitative, guarantee, or effectiveness review requirements.

## Promotion rule

`search metadata -> research candidate -> source review -> evidence decision -> hack/protocol -> public page`

Search snippets, titles, abstracts, citation counts, press releases, secondary summaries, and AI summaries are discovery aids, not evidence decisions.

## Public display

A research-derived public page should expose a compact `Sources` or `Evidence` section with direct source links and the evidence state. Do not hide citations behind generic phrases such as "research shows".

For `practical` records with provenance, preserve the source and its scope without inflating the public copy into scientific or effectiveness claims that the canonical record does not make.

## Multiple sources

When several sources support different parts of a protocol, keep their scopes separate. Do not attach one vaguely related paper to a broader claim than it actually supports.

## Source conflicts

When credible sources disagree, record the disagreement and narrow the Brali claim. Do not silently select the source that produces the cleaner story.

## Safety-sensitive content

Health, mental-health, clinical, financial, legal, and safety-critical material requires particularly explicit source scope and limitations. Brali does not convert general research findings into individualized treatment, diagnosis, or professional advice.
