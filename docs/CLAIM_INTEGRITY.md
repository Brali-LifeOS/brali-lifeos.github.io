# Brali claim integrity

Brali treats unsupported precision as editorial debt. A percentage, internal result, causal statement, mechanism claim, clinical claim, research-appeal phrase, or guarantee must not remain in normal discovery merely because it sounds useful or scientific.

## Enforced marker classes

The deterministic claim gate currently detects high-confidence forms of:

- quantitative effects, sample sizes, and statistical estimates;
- first-party pilots, internal observations, and user-cohort claims;
- phrases such as “research shows” or “clinically proven”;
- direct causal and certain-outcome wording;
- named biological or psychological mechanisms;
- treatment, cure, diagnosis, or prevention claims for sensitive conditions;
- guarantees and universal optimality claims.

Ordinary durations, step counts, dates, identifiers, and qualified practical language are not treated as evidence claims by default.

## Resolution paths

A detected marker is not resolved by attaching a URL. It needs one of two traceable paths:

1. An excerpt-level approval in `data/claim-review-registry.json`, linked to one or more source-reviewed Evidence Decisions.
2. For research-appeal, causal, or mechanism wording only, a `reviewed` protocol mapped to a source-reviewed Evidence Decision with a bounded supported claim.

Quantitative, first-party, clinical, and guarantee claims require excerpt-level approval because these forms are especially easy to overstate or fabricate.

## Indexing rule

An unsupported enforced marker on an indexable page is a build-blocking defect. Unsupported markers may remain only behind `pending-review` or `restricted` boundaries, where they appear in the claim-debt report but are withheld from the sitemap, trusted retrieval, and normal discovery.

The generated outputs are:

- `life-os/datasets/claim-debt.json` — canonical machine-readable report;
- `/api/v1/claim-debt.json` — API copy;
- `/state/claims/` — public summary;
- `scripts/fixtures/claim-integrity.json` — regression fixtures.

## Important limitation

A clean detector is not proof that every sentence is evidence-supported. Regex and deterministic rules can find maintained high-confidence markers; they cannot replace reading the actual source, checking the population and intervention, interpreting outcomes, preserving limitations, or deciding whether a sentence stays inside the reviewed boundary.

Absence of a marker means “no enforced pattern was found,” not “proven true.”

## Editorial workflow

1. Inspect the public sentence and its full context.
2. Read the actual source, not only metadata or an abstract when full context is needed.
3. Record an Evidence Decision with supported and unsupported wording, population, intervention or exposure, outcomes, limitations, and provenance.
4. Rewrite, remove, restrict, or reject the public claim when the source does not support it.
5. Add an excerpt-level registry approval only when the exact bounded wording is intentionally retained.
6. Run `npm run claims:check`, followed by the complete build and check gate.
