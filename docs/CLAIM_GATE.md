# Brali claim gate

Brali distinguishes a practical instruction from a factual claim that needs source-bounded review. The claim gate is deliberately conservative: it can identify review debt, but it does not decide that a claim is true or false merely because a phrase matches a pattern.

## Outputs

- `life-os/datasets/claim-debt.json` lists public claim markers, enforced categories, Topic IDs, review signals, debt reasons, evidence state, source presence, and review metadata.
- The report aggregates marker and debt counts by category, status, and canonical Topic while retaining an explicit topic-pending count.
- `contracts/claim-debt.schema.json` defines the versioned report contract.
- `scripts/lib/claim-taxonomy.mjs` contains the shared marker taxonomy used by evidence generation and strict audit.
- `scripts/audit-content.mjs --strict` prevents indexable enforced claim debt, validates Topic aggregation, and detects enforced markers introduced only in generated HTML.

## Enforced categories

- **quantitative**: percentages, explicit sample sizes, and participant counts;
- **effect-estimate**: risk ratios, odds ratios, hazard ratios, confidence intervals, standardized differences, effect sizes, percentage-point differences, and comparative magnitudes;
- **first-party-result**: claims about Brali, author, user, pilot, trial, experiment, or internal-data results;
- **guarantee**: universal effectiveness, guarantees, and unsupported proof language;
- **clinical-outcome**: high-confidence diagnosis, treatment, cure, prevention, symptom, or disease-outcome wording;
- **causal-assertion**: high-confidence `shown to`, `proven to`, or explicit cause wording tied to an outcome.

An enforced marker is not automatically an error when it is correctly reviewed and supported. Exact public wording still has to fit the reviewed source's population, intervention or exposure, comparison, outcome, limitations, and study design. Guarantee language remains debt even on a reviewed record because the default editorial action should be to remove or sharply bound the guarantee rather than decorate it with a citation.

## Monitor-only categories

- **causal-effect**: broader `leads to`, `results in`, or outcome-improvement wording that still needs human context review;
- **mechanism**;
- **research-language**.

These categories are published for review prioritization and false-positive analysis. They are not automatic blockers by themselves because broad enforcement would create avoidable false positives. A human reviewer can still decide that the wording requires rewrite, restriction, or rejection.

## Debt semantics

A record can appear in the report without being debt. `categories` lists detected review signals; `debt_reasons` explains why the current state is incomplete or unsafe for normal trusted discovery.

Typical debt reasons include:

- quantitative claim not reviewed;
- effect estimate not reviewed;
- first-party result not reviewed;
- high-confidence causal assertion not reviewed;
- clinical outcome not reviewed;
- guarantee language requiring rewrite review;
- an enforced claim remaining indexable without reviewed status;
- a reviewed claim lacking usable source or review metadata.

Topic counts describe editorial workload. They are not evidence-strength, safety-risk, popularity, or usage scores. A record without a canonical Topic stays visible in the report as topic-pending debt rather than being assigned to an invented category merely to improve coverage.

No public usage, pilot, effectiveness, or outcome claim may be inferred from demo runs, fixtures, page views, repository activity, generated counters, or Topic debt counts.

## Editorial workflow

1. Inspect the exact public wording and its claim category.
2. Read the actual source when the claim is evidence-like.
3. Record an Evidence Decision with supported wording, unsupported wording, limitations, population/intervention/outcome boundaries, provenance, and editorial outcome.
4. Choose one outcome: keep practical, rewrite, review and retain, restrict, watch, or reject.
5. Preserve the canonical Topic assignment or leave it explicitly pending; do not create a Topic to make a dashboard look complete.
6. Rebuild and verify that evidence state, indexing, page JSON, API, citation, Topic aggregation, and claim debt agree.
7. Add regression coverage when a reviewed phrase must not silently return.

The absence of a marker is not proof of evidence quality. The presence of a marker is not proof that the claim is false. The gate exists to make review debt visible and to prevent unsupported precision from reaching normal discovery while everyone is busy admiring the ontology.
