# Brali knowledge contracts

These contracts turn the Growth Library into a maintained data product instead of a collection of loosely related pages.

## Core distinction

- **Hack**: the smallest reusable practical technique. One clear action that can stand on its own.
- **Protocol**: an executable sequence or personal experiment. A protocol can reference one or more hacks, adds ordering/context, and always includes a check-in.
- **Research candidate**: an unreviewed paper or scholarly record found by the scout. It is input to editorial review, not evidence by itself.

## Contracts

- `hack.schema.json` — canonical shape for atomic hacks.
- `protocol.schema.json` — canonical shape for executable protocols.
- `research-candidate.schema.json` — shape for discovery-queue records.
- `evidence-decision.schema.json` — explicit review/handoff between discovery and public content.

All public or generated formats may evolve, but these contracts define the direction of travel for new content.

## Promotion rules

`research candidate -> evidence review -> hack proposal -> protocol proposal -> public library`

No automated step may jump directly from a search result to `reviewed`. A DOI, title, abstract, citation count, or AI summary is not a review.

For health, mental-health, financial, legal, clinical, or safety-critical material, prefer conservative wording and an explicit human/editorial gate.

## Compatibility

Existing Brali pages and source records do not need to be migrated at once. New agents should produce contract-shaped proposals first, then adapt them to the current build format through explicit editorial changes.
