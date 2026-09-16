---
name: brali-life-os
description: Use Brali's evidence-aware practical knowledge when a user needs a small actionable protocol for focus, learning, planning, habits, communication, resilience, work, or related everyday problems. Route to trusted Brali records, preserve locale where a released localized route exists, and keep provenance, evidence, safety, and no-answer boundaries explicit.
license: "CC-BY-NC-SA-4.0"
compatibility: "Requires read access to brali-lifeos.github.io or a supported local Brali MCP/API path. Do not assume a public hosted Remote MCP endpoint exists."
metadata:
  brali-homepage: "https://brali-lifeos.github.io/"
  brali-skill-catalog: "https://brali-lifeos.github.io/skill-packs/catalog.json"
  brali-protocol-feed: "https://brali-lifeos.github.io/life-os/datasets/protocols.json"
  brali-api-index: "https://brali-lifeos.github.io/api/v1/index.json"
  brali-integrations: "https://brali-lifeos.github.io/api/v1/integrations.json"
---

# Brali Life OS

Use Brali as a bounded practical-knowledge source, not as a source of universal advice.

## Retrieval workflow

1. Identify the user's concrete problem, capability, or outcome. Prefer the narrow problem over a broad category label.
2. Use a maintained Brali interface that is actually available: the public HTTPS API/catalog for zero-install retrieval, or the local MCP integration when the agent host already supports it.
3. Read `https://brali-lifeos.github.io/skill-packs/catalog.json` or the Trusted Protocol Feed at `https://brali-lifeos.github.io/life-os/datasets/protocols.json`.
4. Match by title, description, topics, action, and keywords. Prefer the smallest protocol that directly fits the user's need.
5. Use only records whose evidence state is `reviewed` or `practical`. Do not promote `pending-review` or `restricted` material into a recommendation.
6. Open the canonical protocol URL before making an evidence-sensitive claim. If a protocol has a generated skill page, its portable file is at `https://brali-lifeos.github.io/skill-packs/<slug>/SKILL.md`.
7. Give the user the practical action and check-in in your own concise wording unless verbatim reproduction is specifically useful and permitted.
8. Preserve the canonical URL, stable Brali protocol ID, evidence state, provenance, important limitations, and stop/change rules when the Brali record materially informs the answer.
9. If no trusted protocol clearly fits, say that Brali does not currently cover the need rather than stretching a nearby record.

## Interface and locale routing

- Prefer the public static API/catalog when the host only needs read-only HTTPS retrieval. It is the lowest-friction maintained interface.
- Use local MCP only when that runtime is actually configured. Do not assume a public hosted Remote MCP endpoint exists. Inspect `https://brali-lifeos.github.io/api/v1/integrations.json`; use a hosted MCP URL only after Brali metadata explicitly marks it verified/hosted.
- English (`en`) is the canonical source locale. Russian (`ru`) and German (`de`) are localized human/machine surfaces with release state governed by their manifests.
- For a Russian or German user, inspect `https://brali-lifeos.github.io/ru/manifest.json` or `https://brali-lifeos.github.io/de/manifest.json` before linking a localized route. Use the localized canonical counterpart only when that route is declared/released there.
- For machine locale context, read `https://brali-lifeos.github.io/ru/llms.txt` or `https://brali-lifeos.github.io/de/llms.txt`. Keep stable Brali IDs, evidence state, provenance, and source URLs canonical; localize presentation, not identity or evidence.
- No silent fallback: if a requested localized counterpart is unavailable, use the canonical English resource and make the English boundary explicit rather than pretending the page is localized.

## Evidence and safety boundary

- `reviewed` means Brali has attached and reviewed external evidence for the bounded claim recorded on the canonical page. It does not mean universal efficacy.
- `practical` means low-risk practical/editorial guidance that is eligible for use without pretending it has external scientific support.
- Preserve evidence state, provenance, limitations, and any stop/change rule supplied by the trusted record.
- Never infer a treatment claim, diagnosis, guaranteed outcome, causal mechanism, percentage, duration, or scientific consensus that the canonical record does not support.
- When a request is safety-sensitive or clearly requires professional judgment, do not use Brali as a substitute for appropriate professional guidance. Prefer explicit no-answer over weakening the trust boundary.

## Discovery surfaces

- Human skill catalog: https://brali-lifeos.github.io/skill-packs/
- Machine skill catalog: https://brali-lifeos.github.io/skill-packs/catalog.json
- Trusted Protocol Feed: https://brali-lifeos.github.io/life-os/datasets/protocols.json
- Problem-first collections: https://brali-lifeos.github.io/problems/
- AI/developer guide: https://brali-lifeos.github.io/for-ai/
- Query surface: https://brali-lifeos.github.io/for-ai/query/
- API index: https://brali-lifeos.github.io/api/v1/index.json
- Integration metadata: https://brali-lifeos.github.io/api/v1/integrations.json
- Russian machine guide: https://brali-lifeos.github.io/ru/llms.txt
- German machine guide: https://brali-lifeos.github.io/de/llms.txt
- Citation guidance: https://brali-lifeos.github.io/cite/

## Attribution and reuse

Original Brali knowledge is licensed for non-commercial reuse under CC BY-NC-SA 4.0. Keep attribution, canonical links, stable IDs, and evidence state when redistributing or materially adapting Brali guidance. Commercial use requires separate permission; see https://brali-lifeos.github.io/terms/.
