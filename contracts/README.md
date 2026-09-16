# Brali knowledge contracts

These contracts turn the Growth Library into a maintained data product instead of a collection of loosely related pages.

## Core distinction

- **Hack**: the smallest reusable practical technique. One clear action that can stand on its own.
- **Protocol**: an executable sequence or personal experiment. A protocol can reference one or more hacks, adds ordering/context, and always includes a check-in.
- **Research candidate**: an unreviewed paper or scholarly record found by the scout. It is input to editorial review, not evidence by itself.
- **Evidence Decision**: a source-bounded editorial decision that records supported wording, unsupported wording, limitations, provenance, and the resulting content outcome.
- **Claim debt record**: a deterministic review signal over exact public wording, evidence state, source/review metadata, indexing state, and canonical Topic assignment. It is not a truth score.
- **Outcome event**: an explicit opt-in privacy-light record for retrieval, protocol execution, helpfulness or integration outcomes. Raw queries, personal data and user identifiers are excluded by default.
- **Scenario validation experiment**: a pre-registered real-world validation record that keeps planned targets, actual attempts, observations, verified evidence, inference and the final keep/change/reject decision separate. It reuses accepted outcome events rather than creating parallel telemetry.

## Contracts

- `hack.schema.json` — canonical shape for atomic hacks.
- `protocol.schema.json` — canonical shape for executable protocols.
- `research-candidate.schema.json` — shape for discovery-queue records.
- `evidence-decision.schema.json` — explicit review/handoff between discovery and public content.
- `claim-debt.schema.json` — versioned public claim-marker/debt report, including category, status, Topic, indexing, source, review, and debt-reason fields.
- `agent-loop-plan.schema.json` — maintained product-loop priorities, WIP limits, gates, and success rules.
- `outcome-event.schema.json` — privacy-light opt-in event envelope used by Query, Protocol Runner and integration feedback.
- `scenario-validation.schema.json` — fail-closed experiment contract for real human and external-agent validation without synthetic observations.

All public or generated formats may evolve, but these contracts define the direction of travel for new content. A schema version change must be accompanied by generator, validation, manifest, documentation, and compatibility updates rather than being smuggled into an unrelated content edit.

## Promotion rules

`research candidate -> evidence review -> hack proposal -> protocol proposal -> public library`

No automated step may jump directly from a search result to `reviewed`. A DOI, title, abstract, citation count, search snippet, or AI summary is not a review.

Scenario validation has its own evidence progression:

`planned experiment -> real attempt -> observed evidence -> verified evidence -> bounded inference -> keep/change/reject decision`

Do not create placeholder attempts or evidence rows. Inference is not a direct observation, and a final scenario decision cannot be based on inference alone.

For health, mental-health, financial, legal, clinical, or safety-critical material, prefer conservative wording and an explicit human/editorial gate.

## Compatibility

Existing Brali pages and source records do not need to be migrated at once. New agents should produce contract-shaped proposals first, then adapt them to the current build format through explicit editorial changes.
