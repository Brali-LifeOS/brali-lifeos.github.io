# Brali claim gate

Brali distinguishes a practical instruction from a factual claim that needs source-bounded review. The claim gate is deliberately conservative: it can identify review debt, but it does not decide that a claim is true or false merely because a phrase matches a pattern.

A recorded source URL is not evidence that the source was actually reviewed, and a `reviewed` label by itself does not prove that the exact public claim is supported. Claim-bearing records that require source-bounded support must also resolve to a traceable Brali Evidence Decision before they can enter normal trusted discovery.

## Outputs

- `life-os/datasets/claim-debt.json` lists public claim markers, enforced categories, decision-required categories, linked Evidence Decision IDs, review signals, debt reasons, evidence state, source presence, and indexing state.
- `life-os/datasets/evidence-decisions.json` publishes the source-bounded decisions used by the knowledge layer.
- `contracts/claim-debt.schema.json` defines the report contract.
- `scripts/lib/claim-taxonomy.mjs` contains the shared marker taxonomy used by evidence generation and strict audit.
- `scripts/audit-content.mjs --strict` prevents indexable enforced claim debt, decision-gate leaks, and enforced markers introduced only in generated HTML.

## Enforced marker categories

These high-confidence markers are direct trust-gate signals:

- **quantitative**: percentages, explicit sample sizes, participant counts, and named effect estimates;
- **first-party-result**: claims about Brali, author, user, pilot, trial, experiment, or internal-data results;
- **guarantee**: universal effectiveness, guarantees, and unsupported proof language;
- **clinical-outcome**: high-confidence diagnosis, treatment, cure, prevention, symptom, or disease-outcome wording.

An enforced marker is not automatically an error when it is correctly reviewed and supported. Guarantee language remains debt even on a reviewed record because the default editorial action should be to remove or sharply bound the guarantee rather than decorate it with a citation.

## Decision-gated categories

The following categories require a traceable, source-reviewed Evidence Decision targeting the record before normal trusted discovery:

- **quantitative**;
- **first-party-result**;
- **guarantee**;
- **clinical-outcome**;
- **causal-effect**;
- **mechanism**.

Causal and mechanism categories remain non-enforced regex categories because broad automatic blocking at detection time would create too many false positives. The distinction is intentional: detection creates a review signal, while the decision gate controls whether the record may be treated as trusted/indexable. A source URL or manual status override does not bypass this requirement.

A traceable Evidence Decision must record actual-source review, reviewer and review date, source URL, supported claim, limitations/boundaries, and a target Hack or Protocol. `watch` and `reject` decisions do not grant discovery eligibility.

## Monitor-only category

- **research-language**.

Generic research/study wording remains visible for review prioritization and false-positive analysis but does not automatically imply that the public sentence makes a claim specific enough to require a target Evidence Decision. A human reviewer can still decide that the wording needs rewrite, restriction, or rejection.

## Debt semantics

A record can appear in the report without being debt. `categories` lists detected review signals; `decision_required_categories` lists markers that need a source-bounded decision for trusted discovery; `evidence_decision_ids` identifies any qualifying linked decisions; `debt_reasons` explains why the current state is incomplete or unsafe for normal trusted discovery.

Typical debt reasons include:

- quantitative claim not reviewed;
- first-party result not reviewed;
- clinical outcome not reviewed;
- guarantee language requiring rewrite review;
- a decision-required claim without a qualifying Evidence Decision;
- an enforced claim remaining indexable without reviewed status;
- a reviewed claim lacking usable source or review metadata.

No public usage, pilot, effectiveness, or outcome claim may be inferred from demo runs, fixtures, page views, repository activity, or generated counters.

## Editorial workflow

1. Inspect the exact public wording and its claim category.
2. Read the actual source when the claim is evidence-like.
3. Record an Evidence Decision with supported wording, unsupported wording, limitations, population/intervention/outcome boundaries, provenance, and editorial outcome.
4. Target the affected Hack or Protocol explicitly so the decision can be traced by the build.
5. Choose one outcome: keep practical, rewrite, review and retain, restrict, watch, or reject.
6. Rebuild and verify that evidence state, indexing, page JSON, API, citation, decision linkage, and claim debt agree.
7. Add regression coverage when a reviewed phrase must not silently return.

The absence of a marker is not proof of evidence quality. The presence of a marker is not proof that the claim is false. A linked Evidence Decision is also not permission to broaden its supported wording. The gate exists to make review debt visible and to prevent unsupported precision or scientific authority from reaching normal discovery while everyone is busy admiring the ontology.
