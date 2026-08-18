# Brali website and knowledge platform

Official public site and knowledge repository for Brali, published at `https://brali-lifeos.github.io`.

Brali started as a feature-rich personal organizer. The maintained direction is now knowledge-first: practical hacks, executable protocols, taxonomy, evidence states, machine-readable data, research and integration surfaces for humans and AI systems. The original LifeOS app remains an optional application layer.

## Knowledge model

Brali separates four layers instead of treating every useful idea as the same kind of page:

`Life Area -> Growth Zone -> Hack`

`Protocol -> one or more Hacks`

`Hack / Protocol -> Evidence state`

`Research candidate -> Evidence decision -> content proposal`

A **Hack** is the smallest reusable practical technique. A **Protocol** is an executable sequence or personal experiment that can reference one or more hacks and adds context, order, a check-in, and a stop/change rule. A **Research candidate** is an unreviewed scholarly lead and is never trusted evidence by itself.

Evidence states remain `reviewed`, `practical`, `pending-review`, and `restricted`. Only `reviewed` and `practical` entries qualify for normal search indexing and the Trusted Protocol Feed.

## Main entry points

- `/life-os/flagships/` — curated human starting points.
- `/life-os/` — complete Growth Library.
- `/life-os/datasets/protocols.json` — Trusted Protocol Feed.
- `/research/` — research notes and the living research pipeline.
- `/agents/` and `/agents/registry.json` — editorial agents and machine-readable registry.
- `/contracts/` — schemas for hacks, protocols, research candidates, and evidence decisions.
- `/skills/` — reusable discovery, evidence, protocol, and taxonomy skills.
- `/for-ai/` — guidance for AI tools and developers.
- `/llms.txt` — compact machine-readable project orientation.

## Continuous research loop

1. `data/research-queries.json` defines maintained search lenses mapped to Life Areas and Growth Zones.
2. `scripts/research_scout.py` queries scholarly metadata and deduplicates leads into `data/research-candidates.json`.
3. `.github/workflows/research-scout.yml` runs weekly and proposes queue changes on a bot branch/PR.
4. The Evidence Reviewer reads the actual source and records a bounded decision before a hack or protocol can change.
5. Protocol Builder and Taxonomy Curator turn accepted ideas into contract-shaped proposals without silently changing public URLs.

The scout is intentionally allowed to find weak, negative, null, or contradictory results. It is not allowed to promote search metadata directly into `reviewed` content.

## Local build

```bash
npm run build
npm run check
python3 -m http.server 8080
```

Research helpers:

```bash
npm run research:check
npm run research:scout
```

`npm run check` includes the research-system contract checker alongside the existing trust/indexing audits.

## Direction

Near-term work should improve the knowledge asset rather than recreate the retired feature race: stronger atomic hacks, executable protocols, continuous research discovery with explicit review gates, evidence review, multilingual identity, research collections, better retrieval, and eventually a versioned API or MCP layer over the same canonical data.

See [AGENT_LOOP.md](AGENT_LOOP.md), [CONTENT_QUALITY.md](CONTENT_QUALITY.md), [contracts/README.md](contracts/README.md), and [LICENSING.md](LICENSING.md).

## License

The root [LICENSE](LICENSE) is the authoritative current license for original repository material: CC BY-NC-SA 4.0. Commercial use requires prior written permission. See [LICENSING.md](LICENSING.md) for details.
