---
name: brali-research-discovery
description: Discover recent research candidates that may improve Brali hacks or protocols without promoting metadata into evidence.
---

# Brali Research Discovery

Read `data/research-queries.json`, `data/knowledge-ontology.json`, the current protocol feed, review queue, and `SOURCE_POLICY.md`. Legacy Life Areas and Growth Zones may still appear in query configuration and old records; resolve them through `legacy_zone_map` when deciding the likely Domain, Topic, Method, or Lens.

Search recent scholarly sources for each active query. Prefer systematic reviews, meta-analyses, guidelines, replications, and strong primary research.

For every candidate, preserve provenance from the first step. Capture at minimum: stable source URL, DOI when available, title, authors, publication date, publication/source name, source type, matched query IDs, likely taxonomy, and risk flags. Do not keep a candidate if you cannot retain a traceable source record.

For taxonomy screening, distinguish the user need from the named approach. For example, retrieval practice is a Method that may support the Topics Memory or Skill Learning; ACT is a sensitive Method that may support Psychological Flexibility; QA is a Lens rather than a Topic.

Deduplicate against `data/research-candidates.json` by DOI or another stable source identifier.

Output only research-candidate contract records. Do not write a public hack, protocol, evidence claim, or `reviewed` status from search metadata alone.

Prioritize candidates that could:
- correct an existing claim;
- simplify or strengthen an existing hack;
- support a `growth-gap` Topic in the ontology;
- challenge a popular but weak recommendation;
- reveal an important safety limitation;
- show that an existing legacy collection should be mapped more precisely for future records.

Never replace a source with a search-result URL, AI summary, press release, or unattributed paraphrase when the original source is available.
