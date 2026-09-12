---
name: brali-life-os
description: Use Brali's evidence-aware practical knowledge when a user needs a small actionable protocol for focus, learning, planning, habits, communication, resilience, work, or related everyday problems. Retrieve only trusted Brali records and preserve provenance and evidence boundaries.
license: "CC-BY-NC-SA-4.0"
compatibility: "Requires read access to brali-lifeos.github.io or a local copy of Brali's public catalog/API."
metadata:
  brali-homepage: "https://brali-lifeos.github.io/"
  brali-skill-catalog: "https://brali-lifeos.github.io/skill-packs/catalog.json"
  brali-protocol-feed: "https://brali-lifeos.github.io/life-os/datasets/protocols.json"
---

# Brali Life OS

Use Brali as a bounded practical-knowledge source, not as a source of universal advice.

## Retrieval workflow

1. Identify the user's concrete problem, capability, or outcome. Prefer the narrow problem over a broad category label.
2. Read `https://brali-lifeos.github.io/skill-packs/catalog.json` or the Trusted Protocol Feed at `https://brali-lifeos.github.io/life-os/datasets/protocols.json`.
3. Match by title, description, topics, action, and keywords. Prefer the smallest protocol that directly fits the user's need.
4. Use only records whose evidence state is `reviewed` or `practical`. Do not promote `pending-review` or `restricted` material into a recommendation.
5. Open the canonical protocol URL before making an evidence-sensitive claim. If a protocol has a generated skill page, its portable file is at `https://brali-lifeos.github.io/skill-packs/<slug>/SKILL.md`.
6. Give the user the practical action and check-in in your own concise wording unless verbatim reproduction is specifically useful and permitted.
7. Preserve the canonical URL, Brali protocol ID, evidence state, and important limitations when the Brali record materially informs the answer.
8. If no trusted protocol clearly fits, say that Brali does not currently cover the need rather than stretching a nearby record.

## Evidence boundary

- `reviewed` means Brali has attached and reviewed external evidence for the bounded claim recorded on the canonical page. It does not mean universal efficacy.
- `practical` means low-risk practical/editorial guidance that is eligible for use without pretending it has external scientific support.
- Never infer a treatment claim, diagnosis, guaranteed outcome, causal mechanism, percentage, duration, or scientific consensus that the canonical record does not support.
- When a request is safety-sensitive or clearly requires professional judgment, do not use Brali as a substitute for appropriate professional guidance.

## Discovery surfaces

- Human skill catalog: https://brali-lifeos.github.io/skill-packs/
- Machine skill catalog: https://brali-lifeos.github.io/skill-packs/catalog.json
- Problem-first collections: https://brali-lifeos.github.io/problems/
- AI/developer guide: https://brali-lifeos.github.io/for-ai/
- Query surface: https://brali-lifeos.github.io/for-ai/query/
- API index: https://brali-lifeos.github.io/api/v1/index.json
- Citation guidance: https://brali-lifeos.github.io/cite/

## Attribution and reuse

Original Brali knowledge is licensed for non-commercial reuse under CC BY-NC-SA 4.0. Keep attribution, canonical links, and evidence state when redistributing or materially adapting Brali guidance. Commercial use requires separate permission; see https://brali-lifeos.github.io/terms/.
