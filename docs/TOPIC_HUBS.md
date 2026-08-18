# Topic Knowledge Hubs

Brali Topic Knowledge Hubs are problem-first entry points over the same canonical knowledge model used by the library, API, Flagship 100, and research workflow.

The initial set covers Sleep, Focus, Memory, Stress, Habits, Learning, and Movement / Exercise.

## What a hub contains

Each hub is generated from maintained data rather than duplicated by hand. It combines:

- one or more canonical Topics and their definitions;
- up to eight trusted `reviewed` or `practical` protocols;
- Flagship 100 badges when a selected protocol belongs to that core;
- reviewed Evidence Decisions and their supported / unsupported claim boundaries;
- clearly labeled research-discovery leads that remain **discovery only** until reviewed;
- related Topics and Methods derived from the selected knowledge;
- canonical HTML, JSON, API, sitemap, and structured-data surfaces.

## Selection rule

Protocol recommendations come from the complete trusted Protocol Feed. Flagship 100 items receive priority, but a hub may use a non-flagship trusted protocol when Flagship 100 has a topical coverage gap. This is intentional: a useful Sleep hub is preferable to a decorative empty page, provided the trust boundary remains intact.

The hub generator never promotes `pending-review` or `restricted` material into recommendations.

## Evidence and research boundary

Evidence Decisions are linked through their reviewed research candidate and may be quoted only within their recorded supported claim and limitations. Research-watch items are metadata discovered by the research scout. Their presence indicates a lead to review, not support for a public claim.

## Machine-readable surfaces

- `/life-os/datasets/topic-hubs.json` — canonical collection.
- `/topics/<slug>/index.json` — individual hub snapshot.
- `/api/v1/hubs.json` — read-only API representation.
- `/topics/<slug>/` — human/search entry page.

Protocol pages link back to the relevant hubs. The homepage, Growth Library, Research, Ontology, For AI, sitemap, and `llms.txt` expose the hub index so humans and agents can discover the same entry points.

## Quality gate

`node scripts/check-topic-hubs.mjs` verifies the seven initial hubs, trusted protocol states, reverse links, evidence provenance, discovery-only labeling, JSON/API equality, manifest hashes, structured data, canonical URLs, sitemap coverage, and entry links from major site surfaces.
