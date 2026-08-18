---
name: brali-research-discovery
description: Discover recent research candidates that may improve Brali hacks or protocols without promoting metadata into evidence.
---

# Brali Research Discovery

Read `data/research-queries.json`, `data/knowledge-ontology.json`, `life-os/datasets/ontology-coverage.json`, the current protocol feed, review queue, and `SOURCE_POLICY.md`.

Search recent scholarly sources for each active query. Prefer systematic reviews, meta-analyses, guidelines, replications, and strong primary research.

For every candidate, preserve provenance from the first step. Capture at minimum: stable source URL, DOI when available, title, authors, publication date, publication/source name, source type, matched query IDs, risk flags, and the canonical ontology fields required by the Research Candidate contract: `domain_ids`, `topic_ids`, `method_ids`, and `lens_ids`.

Use Domain and Topic to describe the user need or capability. Use Method only for a named structured approach actually relevant to the search lens. Use Lens only when a professional, philosophical, or strategic way of thinking is deliberately being applied. Do not turn a Method or Lens into a Topic just to obtain complete-looking metadata.

Legacy Life Area and Growth Zone fields remain in research records for compatibility, but they are not the canonical semantic classification. Resolve old zones through `data/knowledge-ontology.json` when maintaining older records.

For taxonomy screening, distinguish the user need from the named approach. For example, retrieval practice is a Method that may support the Topics Memory or Skill Learning; ACT is a sensitive Method that may support Psychological Flexibility; QA is a Lens rather than a Topic.

Use the ontology coverage report to prioritize useful gaps. A `growth-gap` Topic is a research target, not a request to manufacture content. A `topic-pending` library record is an editorial classification gap, not permission to guess a Topic from its Method or Lens.

Deduplicate against `data/research-candidates.json` by DOI or another stable source identifier.

Output only research-candidate contract records. Do not write a public hack, protocol, evidence claim, or `reviewed` status from search metadata alone.

Prioritize candidates that could:
- correct an existing claim;
- simplify or strengthen an existing hack;
- support a `growth-gap` Topic in the ontology;
- challenge a popular but weak recommendation;
- reveal an important safety limitation;
- help classify a high-value `topic-pending` record after proper content review.

Never replace a source with a search-result URL, AI summary, press release, or unattributed paraphrase when the original source is available.
