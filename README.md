# Brali website and knowledge platform

Official public site and knowledge repository for Brali, published at `https://brali-lifeos.github.io`.

Brali started as a feature-rich personal organizer. The maintained direction is now knowledge-first: practical hacks, executable protocols, an explicit ontology, evidence states, machine-readable data, research and integration surfaces for humans and AI systems. The original LifeOS app remains an optional application layer.

## Knowledge model v2

Brali no longer treats every old Growth Zone as the same semantic thing. The preferred model is:

`Domain -> Topic -> Hack -> Protocol`

with optional:

`Method -> Hack / Protocol`

`Lens -> Hack / Protocol`

and separate:

`Hack / Protocol -> Evidence state -> Sources`

`Research candidate -> Evidence decision -> content proposal`

A **Domain** is a broad area of life or work. A **Topic** is the concrete problem, capability, or outcome. A **Method** is a named structured approach that may cross Topics. A **Lens** is a transferable way of thinking borrowed from another discipline or tradition and is not evidence by itself. A **Hack** is the smallest reusable practical technique. A **Protocol** is an executable sequence or personal experiment that can reference one or more hacks and adds context, order, a check-in, and a stop/change rule. A **Research candidate** is an unreviewed scholarly lead and is never trusted evidence by itself.

The original **Life Area** and **Growth Zone** taxonomy remains available as a compatibility layer. Existing `/life-os/{zone}/` URLs are kept stable. Every legacy Growth Zone maps to a Topic, Method, or Lens in `data/knowledge-ontology.json`.

`topic-pending` is a valid migration state rather than a failed record. It means a legacy Method or Lens collection is known, but the concrete Topic for an individual entry still needs editorial classification. Brali exposes this debt instead of inventing a Topic automatically.

Evidence states remain `reviewed`, `practical`, `pending-review`, and `restricted`. Only `reviewed` and `practical` entries qualify for normal search indexing and the Trusted Protocol Feed.

## Main entry points

- `/ontology/` — preferred knowledge model and human-readable ontology.
- `/ontology/coverage/` — ontology migration coverage, unresolved legacy collections, and deliberate growth gaps.
- `/life-os/datasets/ontology.json` — machine-readable Domains, Topics, Methods, Lenses, and legacy mapping.
- `/life-os/datasets/ontology-coverage.json` — machine-readable coverage and taxonomy backlog.
- `/life-os/flagships/` — curated human starting points.
- `/life-os/` — complete Growth Library and stable legacy collection URLs.
- `/life-os/datasets/protocols.json` — Trusted Protocol Feed schema v3 with ontology metadata.
- `/life-os/datasets/evidence.json` — Evidence Index schema v2 with ontology metadata.
- `/research/` — research notes and the living research pipeline.
- `/agents/` and `/agents/registry.json` — editorial agents and machine-readable registry.
- `/contracts/` — schemas for hacks, protocols, research candidates, and evidence decisions.
- `/skills/` — reusable discovery, evidence, protocol, and taxonomy skills.
- `/for-ai/` — guidance for AI tools and developers.
- `/llms.txt` — compact machine-readable project orientation.

## Continuous research loop

1. `data/research-queries.json` defines maintained search lenses with canonical Domain/Topic/Method/Lens classification plus legacy compatibility fields.
2. `scripts/research_scout.py` queries scholarly metadata and deduplicates leads into `data/research-candidates.json`, preserving the same ontology fields.
3. `.github/workflows/research-scout.yml` runs weekly and proposes queue changes on a bot branch/PR.
4. The Evidence Reviewer reads the actual source and records a bounded decision before a hack or protocol can change.
5. Protocol Builder assigns Domain/Topic and optional Method/Lens tags, while Taxonomy Curator preserves legacy URLs and prevents category duplication.
6. `ontology-coverage.json` makes unresolved Topic classification and `growth-gap` Topics measurable so editorial agents can work against explicit backlog rather than category guesswork.

The scout is intentionally allowed to find weak, negative, null, or contradictory results. It is not allowed to promote search metadata directly into `reviewed` content.

## Data propagation

The ontology is not only a navigation page. Trusted Protocol Feed, Evidence Index, Review Queue, Research Queries, and Research Candidates expose ontology v2 classifications. New integrations should use these fields as canonical semantic metadata while keeping Life Area/Growth Zone only for backward compatibility.

## Local build

```bash
npm run build
npm run check
python3 -m http.server 8080
```

Ontology and research helpers:

```bash
npm run ontology
npm run research:check
npm run research:scout
```

`npm run check` validates the ontology, complete legacy-zone mapping, ontology coverage, source provenance, research contracts, trust/indexing rules, and the existing strict content audit.

## Direction

Near-term work should improve the knowledge asset rather than recreate the retired feature race: resolve high-value `topic-pending` content, grow empty Topics only when useful evidence or practical material exists, strengthen atomic hacks and protocols, improve retrieval, add multilingual identity, and eventually expose a versioned API or MCP layer over the same canonical ontology and data.

See [AGENT_LOOP.md](AGENT_LOOP.md), [CONTENT_QUALITY.md](CONTENT_QUALITY.md), [SOURCE_POLICY.md](SOURCE_POLICY.md), [contracts/README.md](contracts/README.md), and [LICENSING.md](LICENSING.md).

## License

The root [LICENSE](LICENSE) is the authoritative current license for original repository material: CC BY-NC-SA 4.0. Commercial use requires prior written permission. See [LICENSING.md](LICENSING.md) for details.
