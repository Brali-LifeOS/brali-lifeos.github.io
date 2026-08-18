---
name: brali-protocol-design
description: Turn reviewed or clearly practical hacks into concise executable Brali protocols.
---

# Brali Protocol Design

Use `contracts/hack.schema.json`, `contracts/protocol.schema.json`, `data/knowledge-ontology.json`, and `SOURCE_POLICY.md`.

Compose a protocol from one or more existing or proposed hacks. Keep it executable: problem, 1–5 steps, check-in, optional success signal, review point, and stop/change rule.

Reuse hack IDs. Do not duplicate the same atomic technique under new names just to create more pages.

Classify new proposals with the smallest useful set of `domain_slugs` and `topic_slugs`. Add `method_slugs` when the sequence relies on a named structured approach, and `lens_slugs` when a borrowed way of thinking materially shapes the protocol. A Method or Lens must never substitute for a concrete Topic.

Keep legacy `life_area_slugs` and `zone_slugs` during the migration period so older consumers continue to work. Use `legacy_zone_map` to choose the closest stable compatibility collection without inventing a new Growth Zone.

Do not invent durations, percentages, biological mechanisms, or guarantees. Preserve the weakest relevant evidence state and the important limitations of the underlying hacks.

For reviewed or research-derived protocols, aggregate the relevant source records from the underlying hacks and evidence decisions. Keep `claim_scope` specific so a source is not made to support more than it actually studied. The public protocol proposal must include a visible Sources/Evidence section or enough structured provenance for the site generator to render one.

If a step has no external evidence and is merely a low-risk editorial suggestion, label it as practical rather than borrowing authority from another sourced step.

Output a contract-shaped protocol proposal plus a short rationale for Domain/Topic placement, optional Method/Lens tags, legacy compatibility mapping, and source coverage.
