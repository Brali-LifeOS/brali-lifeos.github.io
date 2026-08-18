# Brali source policy

Brali distinguishes ideas we formulate editorially from claims or techniques derived from external material.

## Core rule

If a hack, protocol, research note, or evidence claim comes from an external source, the source must remain attached to it from discovery through publication.

For research-derived material, a public page must show enough provenance for a reader to inspect the source directly. Keeping a URL only in an internal JSON file is not sufficient.

## Required provenance

At minimum record:

- source title;
- stable URL and DOI when available;
- source type (primary study, systematic review, meta-analysis, guideline, consensus, or other);
- what exact claim or action the source supports (`claim_scope`);
- important limitations;
- review date and reviewer when Brali marks the evidence as reviewed.

## Promotion rule

`search metadata -> research candidate -> source review -> evidence decision -> hack/protocol -> public page`

Search snippets, titles, abstracts, citation counts, press releases, secondary summaries, and AI summaries are discovery aids, not evidence decisions.

## Public display

A research-derived public page should expose a compact `Sources` or `Evidence` section with direct source links and the evidence state. Do not hide citations behind generic phrases such as "research shows".

## Multiple sources

When several sources support different parts of a protocol, keep their scopes separate. Do not attach one vaguely related paper to a broader claim than it actually supports.

## Source conflicts

When credible sources disagree, record the disagreement and narrow the Brali claim. Do not silently select the source that produces the cleaner story.

## Safety-sensitive content

Health, mental-health, clinical, financial, legal, and safety-critical material requires particularly explicit source scope and limitations. Brali does not convert general research findings into individualized treatment, diagnosis, or professional advice.
