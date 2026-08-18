---
name: brali-research-discovery
description: Discover recent research candidates that may improve Brali hacks or protocols without promoting metadata into evidence.
---

# Brali Research Discovery

Read `data/research-queries.json`, the Life Areas, Growth Zones, current protocol feed, and review queue.

Search recent scholarly sources for each active query. Prefer systematic reviews, meta-analyses, guidelines, replications, and strong primary research. Capture DOI/stable URL, title, date, authors, source, matched query IDs, likely taxonomy, and risk flags.

Deduplicate against `data/research-candidates.json`.

Output only research-candidate contract records. Do not write a public hack, protocol, evidence claim, or `reviewed` status from search metadata alone.

Prioritize candidates that could:
- correct an existing claim;
- simplify or strengthen an existing hack;
- support a missing practical technique;
- challenge a popular but weak recommendation;
- reveal an important safety limitation.
