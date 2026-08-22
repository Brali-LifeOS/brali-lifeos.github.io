# Brali claim gate

Brali distinguishes a practical instruction from a factual claim that needs source-bounded review. The claim gate is deliberately conservative: it can identify review debt, but it does not decide that a claim is true or false merely because a phrase matches a pattern.

## Outputs

- `life-os/datasets/claim-debt.json` lists public claim markers, enforced categories, review signals, debt reasons, evidence state, source presence, and review metadata.
- `contracts/claim-debt.schema.json` defines the report contract.
- `scripts/lib/claim-taxonomy.mjs` contains the shared marker taxonomy used by evidence generation and strict audit.
- `scripts/audit-content.mjs --strict` prevents indexable enforced claim debt and detects enforced markers introduced only in generated HTML.

## Phase-one enforced categories

- **quantitative**: percentages, explicit sample sizes, and participant counts;
- **first-party-result**: claims about Brali, author, user, pilot, trial, experiment, or internal-data results;
- **guarantee**: universal effectiveness, guarantees, and unsupported proof language;
- **clinical-outcome**: high-confidence diagnosis, treatment, cure, prevention, symptom, or disease-outcome wording.

An enforced marker is not automatically an error when it is correctly reviewed and supported. Guarantee language remains debt even on a reviewed record because the default editorial action should be to remove or sharply bound the guarantee rather than decorate it with a citation.

## Monitor-only categories

- **causal-effect**;
- **mechanism**;
- **research-language**.

These categories are published for review prioritization and false-positive analysis. They are not phase-one blockers by themselves because broad automatic enforcement would create avoidable false positives. A human reviewer can still decide that the wording requires rewrite, restriction, or rejection.

## Debt semantics

A record can appear in the report without being debt. `categories` lists detected review signals; `debt_reasons` explains why the current state is incomplete or unsafe for normal trusted discovery.

Typical debt reasons include:

- quantitative claim not reviewed;
- first-party result not reviewed;
- clinical outcome not reviewed;
- guarantee language requiring rewrite review;
- an enforced claim remaining indexable without reviewed status;
- a reviewed claim lacking usable source or review metadata.

No public usage, pilot, effectiveness, or outcome claim may be inferred from demo runs, fixtures, page views, repository activity, or generated counters.

## Editorial workflow

1. Inspect the exact public wording and its claim category.
2. Read the actual source when the claim is evidence-like.
3. Record an Evidence Decision with supported wording, unsupported wording, limitations, population/intervention/outcome boundaries, provenance, and editorial outcome.
4. Choose one outcome: keep practical, rewrite, review and retain, restrict, watch, or reject.
5. Rebuild and verify that evidence state, indexing, page JSON, API, citation, and claim debt agree.
6. Add regression coverage when a reviewed phrase must not silently return.

The absence of a marker is not proof of evidence quality. The presence of a marker is not proof that the claim is false. The gate exists to make review debt visible and to prevent unsupported precision from reaching normal discovery while everyone is busy admiring the ontology.
