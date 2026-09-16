# Outcome signal semantics

Brali separates product exposure from observable use and observable use from outcomes. The machine-readable source is `data/outcome-signal-definitions.json`; the generated report is `life-os/datasets/outcome-signal-report.json`.

The report answers a deliberately narrow question: **what kind of evidence does Brali actually have for each stage?** It is not a traffic dashboard and it does not fill missing data with zeroes.

## Signal ladder

| Signal | Current evidence path | What zero/null means |
| --- | --- | --- |
| Page discovered | Provider-only, outside the outcome-event registry | `null`: unknown to this outcome system. Search impressions or registry visibility remain separate provider measurements. |
| Page opened | Reviewed `protocol_opened` event | `0`: zero accepted explicit open events, not zero real page opens or users. |
| Method understood | Not collected | `null`: unknown. Completion/helpfulness cannot substitute for understanding. |
| Method attempted | Reviewed `protocol_started` event | `0`: zero accepted explicit start events. |
| Method completed | Reviewed `protocol_completed` event | `0`: zero accepted explicit completion events. |
| User-reported usefulness | Reviewed `helpful_yes` / `helpful_no` | Counts can be zero; the helpfulness rate stays `null` until the denominator is non-zero. |
| Return usage | Not collected | `null`: unknown. Brali deliberately avoids passive cross-session identity. |
| External agent/tool usage | Reviewed `integration_reported` event | Count means accepted explicit integration reports only, not MCP/API calls or active integrations. |
| Downstream outcome | Not collected | `null`: unknown. Immediate completion/helpfulness is not downstream efficacy. |

## Why some fields are null

`null` is not missing implementation polish. It is an explicit epistemic state. A system that does not observe return usage cannot honestly publish `0 return users`; that turns missing measurement into a behavioral claim. The same applies to method understanding and downstream results.

Numeric zero is used only when a supported reviewed-event channel has zero accepted events. Even then, the scope stays narrow: zero accepted `protocol_started` events is not evidence that nobody tried a Brali method.

## Stage boundaries

Never infer a later stage from an earlier one:

`discovered != opened != understood != attempted != completed != helpful != returned != downstream outcome`

Useful examples:

- Search Console impressions can support a statement about search exposure, not method attempts.
- Opening a protocol is not evidence that the method was understood.
- Clicking Start is not completion.
- Completing a protocol is not evidence that it helped.
- Saying it helped is not proof of a later real-world outcome.
- An integration report is not a count of MCP calls or active external agents.

## Privacy boundary

The outcome system continues to use explicit opt-in, privacy-light events. It does not add cookies, local/session storage, background outcome telemetry, persistent user identifiers, or raw prompts/tasks merely to make the funnel look complete.

If Brali later adds an explicit method-understanding, repeat-use, or downstream-outcome report, that change should extend the versioned outcome contract and its fixtures/checks. Until then those stages remain `unknown`.

## Verification

`node scripts/build-outcome-signal-report.mjs` produces the machine-readable report from the definitions, reviewed observation registry, current outcome-event schema, and dataset manifest.

`node scripts/check-outcome-signal-report.mjs` fails when:

- a required signal disappears;
- an unsupported event type is mapped into a signal;
- an uncollected/provider-only signal becomes numeric;
- an empty helpfulness denominator becomes `0%` rather than `null`;
- accepted-event counts drift from the reviewed registry;
- population-level language replaces the explicit opt-in scope.

Passing the check establishes semantic consistency, not product success.
