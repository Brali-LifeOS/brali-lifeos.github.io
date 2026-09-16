# Scenario validation

Brali scenario validation is a small, pre-registered experiment loop for testing whether an existing Brali path creates observable value on a real recurring problem. It is not a place to manufacture user stories, conversion numbers, adoption claims, or synthetic trials.

The canonical active experiment is `data/scenario-validation.json`. Its contract is `contracts/scenario-validation.schema.json`. Real privacy-light outcome events remain governed by `contracts/outcome-event.schema.json`, `data/outcome-policy.json`, and `data/outcome-observations.json`; scenario validation references those events instead of inventing a second telemetry format.

## Evidence states

Keep these meanings separate:

- **planned** — pre-registered target, procedure, success criteria, failure criteria, or limitation. A plan is not an attempt.
- **attempted** — a real human trial or real external integration attempt happened. Add one `attempts[]` record. An attempt alone does not establish usefulness.
- **observed** — something was directly reported or directly visible during that attempt and has a privacy-safe source reference. It can be positive or negative.
- **verified** — an observation has enough auditable support for the claim being made, such as an accepted Brali outcome event or a provider-visible integration artifact. Verification does not make a small sample representative.
- **inferred** — analysis derived from one or more observations. Inference must never be promoted to a direct observation and cannot by itself justify the scenario decision.

Do not create placeholder attempt/evidence rows to show progress. Empty arrays are the correct state before the first real trial.

## Human track

Target: 10–15 real attempts.

For each attempt:

1. Use the participant's own recent interrupted knowledge-work task. Do not copy the task text, employer/client material, names, contact details, account IDs, or other personal data into Brali's repository.
2. Before Brali, capture only privacy-safe categorical context: whether a concrete next action already exists and the broad workaround category. Interest or praise is not an outcome.
3. Use the public Brali path that exists at the time: Ask Brali → trusted recommendation or explicit no-answer → Protocol Runner when eligible.
4. After the attempt, record only what is needed to evaluate the pre-registered criteria: concrete next action, start/completion, helpful/not-helpful, abandonment/workaround, and rejected alternative.
5. Prefer accepted privacy-light outcome events for protocol completion and helpfulness. A generated event, downloaded bundle, share-sheet open, page view, or GitHub draft is not an accepted observation.
6. Record repeat use only from a separate later real attempt that is deliberately reported. Brali does not use cookies, persistent user IDs, local storage, or passive analytics to infer repeat use.

### Human decision evidence

A keep/change/reject decision must not be made before at least 10 real reviewed human attempts. The pre-registered success/failure criteria live in `data/scenario-validation.json` and must not be edited after observations begin merely to fit the result. If criteria need to change, version the procedure and record why before collecting the next batch.

## External agent/integration track

Target: 5 real attempts.

For each attempt:

1. Start from a clean external context and identify the actual public Brali interface used. Source code that could be deployed is not a hosted service.
2. Run a realistic interrupted-work query through Brali's maintained trusted retrieval path.
3. Accept a correct explicit no-answer as valid behavior when trusted coverage is insufficient.
4. Verify canonical IDs/URLs, locale metadata where exposed, evidence state, limitations, and provenance across the integration boundary.
5. Record setup friction, transport/metadata failures, trust-state leakage, correct abstention, and whether the documented integration path is repeatable.
6. Use privacy-light `integration_reported` outcome events when they fit. Provider-visible artifacts can verify external availability; CI, release source, or repository existence alone cannot.

A track can fail while the other succeeds. Keep the evidence separate.

## Adding an attempt

Add an `attempts[]` record only after the attempt occurred. Use an opaque attempt ID such as `attempt-human-001` or `attempt-agent-001`; it must not encode a person's identity, employer, email, account, or raw task text.

`outcome_event_ids` may reference only events already accepted into `data/outcome-observations.json`. A locally generated event that has not passed consent/privacy/provenance review is not eligible here. `source_refs` may point to a public GitHub issue, provider-visible artifact, accepted outcome event, or maintainer review reference.

The checker requires `tracks.<track>.target.observed_attempts` to equal the actual number of attempt records for that track. Targets remain targets; they must never be overwritten with claimed results.

## Adding evidence

Every evidence row must point to an existing attempt on the same track.

- `observed`: needs at least one privacy-safe source reference.
- `verified`: needs auditable source support; any referenced outcome event must exist in the accepted outcome registry.
- `inferred`: must point back to real attempt evidence and is never enough on its own for the final decision.

Record negative findings under the same rules as positive findings. Abandonment, no-answer, workarounds, rejected alternatives and trust-boundary failures are first-class evidence.

## Decision gate

The experiment begins with:

```json
{
  "status": "pending",
  "value": null,
  "rationale": null,
  "evidence_refs": []
}
```

Keep it pending until both tracks meet their minimum real-attempt target. A made decision must be one of `keep`, `change`, or `reject`, must cite verified evidence rows, and must list limitations. Inferred evidence may inform the rationale but cannot be the only evidence cited.

Decision meanings:

- **keep** — the pre-registered success criteria are substantially met and no trust/safety failure overrides them.
- **change** — the problem appears real/useful enough to continue, but repeated fixable failures show that the current Brali path or scenario definition needs revision.
- **reject** — the pre-registered failure criteria are met or the experiment cannot produce useful evidence within Brali's privacy/trust boundary.

Do not turn a mixed or underpowered result into a confident verdict. The correct state remains `pending` when the gate is not met.

## Validation

Run:

```bash
npm run scenario:check
npm run build
npm run check
```

`scenario:check` is expected to fail if, among other things:

- planned targets are presented as observed attempts;
- attempt/evidence IDs are duplicated;
- evidence points to a nonexistent attempt or mismatched track;
- an outcome-event reference is not present in the reviewed observation registry;
- an empty experiment claims a made decision or completion;
- a decision is made before both minimum attempt targets are met;
- a decision cites only inferred/unverified evidence;
- the privacy boundary drifts.

Passing this check proves repository consistency. It does not prove that the scenario works.
