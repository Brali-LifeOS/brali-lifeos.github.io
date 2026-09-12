# Cross-project ecosystem relations

Brali can participate in a wider network of specialized products without becoming a portal for them. Cross-project links are allowed only when the destination provides a materially different next step for the user.

## Ownership model

Brali owns practical life and work interventions: hacks, protocols, topics, evidence state and Brali-specific editorial interpretation.

Other projects keep ownership of their own specialist domains. In the first implemented bridge, Cognitive Biases owns the canonical explanation of cognitive-bias concepts, their distinctions, evidence and decision checks. Brali may link to that specialist reference from a bias-related hack instead of reproducing a second long concept explanation.

This is an outbound relation model. The source project owns the handoff semantics. A reciprocal link is not required and must not be added merely for SEO.

## Relation contract

Source: `data/ecosystem-relations.json`.

Each relation must have:

- a stable namespaced relation ID;
- a stable Brali source identity (`brali:<kind>:<local-id>`);
- an HTTPS canonical target;
- a small user-journey relation type such as `understand_with`;
- a plain-language user job explaining why the handoff exists;
- an explicit semantic basis and review date;
- a boundary that prevents the target from being treated as evidence for the Brali protocol itself.

The relation overlay is deliberately separate from Brali evidence. A semantic link is not an Evidence Decision, source citation or efficacy claim.

## UX rule

Render contextual next steps, not an ecosystem directory.

Good:

> Understand the mechanism → Anchoring Effect: evidence and decision checks

Bad:

> More from our projects → Cognitive Biases / CBT Cards / Metkagram / Ptichi

A page should normally expose no more than one or two cross-project continuations, and only when the target does something the source page does not.

## Search and entity boundary

Cross-project relations exist to clarify product specialization and user journeys. They must not be generated from keywords, made reciprocal by default, repeated in a site-wide footer or used to manipulate anchor text.

Distinct projects and resources must never be connected with `sameAs`. If structured data is added later, use properties such as `relatedLink`, `about`, `mentions`, `citation` or `subjectOf` only when their Schema.org meaning matches the actual relation.

## Failure and independence

Brali pages must remain useful when another project is unavailable or changes. The relation feed is static and build-time only; there is no runtime dependency on the target site.

Target URLs and IDs are reviewed data. Do not silently guess a replacement when a target changes. Update the relation record explicitly and run the normal repository checks.

## Current bridge: action → mechanism

The first P0 bridge covers a small set of Brali hacks whose titles directly invoke established cognitive-bias concepts:

- anchoring → Cognitive Biases Anchoring Effect;
- confirmation bias → Cognitive Biases Confirmation Bias;
- sunk cost → Cognitive Biases Sunk Cost Effect.

The Cognitive Biases destination explains the concept, its evidence and its limits. It does **not** validate the Brali hack, inherited quantitative claims or effectiveness.

## Future candidates

Future relations should be added only after the same usefulness review. Likely candidates include:

- a reviewed Brali learning or language habit → Metkagram for language structure;
- a reviewed Brali speaking/rehearsal habit → Ptichi for microphone-native practice;
- selected Brali reflection workflows → CBT Cards where a reviewed CBT-specific practice provides a genuinely different intervention.

Do not add these by taxonomy overlap alone. Review the exact source record, evidence state, target capability and user moment first.
