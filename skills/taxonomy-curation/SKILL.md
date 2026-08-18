---
name: brali-taxonomy-curation
description: Map new Brali knowledge into Domains, Topics, Methods, and Lenses while protecting stable legacy URLs and avoiding duplicate concepts.
---

# Brali Taxonomy Curation

Read `data/knowledge-ontology.json`, `data/life-os-zones.json`, and the candidate hack/protocol. Treat `data/life-areas.json` and Growth Zones as compatibility navigation, not the preferred semantic model for new records.

Use the dimensions deliberately:

- **Domain** answers where the need broadly belongs.
- **Topic** answers what concrete problem, capability, or outcome the record addresses.
- **Method** names a structured approach used by the record. A Method does not replace the Topic.
- **Lens** names a transferable way of thinking borrowed from a profession, discipline, philosophy, or strategic tradition. A Lens is not evidence.

For a new Hack or Protocol, choose the smallest useful set of Domain and Topic tags. Add Method and Lens tags only when they genuinely explain how the action is constructed or framed.

Before creating a new Topic, check whether an existing Topic already expresses the user need at the right level. Before creating a Method or Lens, check for aliases and legacy Growth Zones in `legacy_zone_map`.

Do not create a new Topic merely because a paper uses a new term, a therapy has a named school, or a professional metaphor sounds interesting. Named approaches usually belong under Method; borrowed professional/philosophical perspectives usually belong under Lens.

Empty `growth-gap` Topics are intentional research backlog. They may receive new content without requiring a new legacy Growth Zone.

Never rename or delete an existing `/life-os/{zone}/` canonical URL as a side effect of classification. Legacy Growth Zones remain stable compatibility collections and map to the new ontology through `legacy_zone_map`.

When a legacy collection is ambiguous, preserve the URL, choose the best compatibility mapping, and classify new individual Hacks more precisely with `domain_slugs`, `topic_slugs`, `method_slugs`, and `lens_slugs`.
