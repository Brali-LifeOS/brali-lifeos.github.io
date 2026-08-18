# Brali website and knowledge platform

Official public site and knowledge repository for Brali, published at `https://brali-lifeos.github.io`.

Brali started as a feature-rich personal organizer. The maintained direction is now knowledge-first: practical hacks, executable protocols, an explicit ontology, evidence states, machine-readable data, research and integration surfaces for humans and AI systems. The original LifeOS app remains an optional application layer.

## Knowledge model v2

Preferred model: `Domain -> Topic -> Hack -> Protocol`, with optional Method and Lens metadata and separate Evidence/source provenance. Legacy Life Area and Growth Zone URLs remain a compatibility layer. `topic-pending` is explicit editorial debt, not permission to invent a Topic.

Evidence states remain `reviewed`, `practical`, `pending-review`, and `restricted`. Only `reviewed` and `practical` entries qualify for normal trusted retrieval.

## Main entry points

- `/ontology/` and `/ontology/coverage/` — semantic model and migration coverage.
- `/life-os/` and `/life-os/datasets/` — public library and machine-readable data.
- `/research/` — research notes and discovery pipeline.
- `/agents/`, `/contracts/`, `/skills/` — guarded agent/editorial workflows.
- `/for-ai/` and `/for-ai/quickstart/` — AI/developer guidance and copyable integration path.
- `/api/v1/` — generated versioned read-only Knowledge API.
- `/citation/` and `CITATION.cff` — attribution and citation identity.
- `/llms.txt` — compact machine-readable project orientation.

## Stable identity and integrations

Generated entities expose canonical IDs as `brali:<kind>:<local-id>`. Titles, URLs, localized labels, and historical IDs are aliases around that identity. See `docs/DATA_VERSIONING.md`.

`npm run build` generates a canonical dataset manifest with SHA-256 checksums, identity and multilingual alias registries, an actionable ontology migration queue, evidence-debt metrics, a retrieval benchmark report, and `/api/v1/` files for Topics, Hacks, Protocols, Evidence, search, identity, manifest, and OpenAPI.

The optional read-only MCP server in `mcp/` exposes `search_knowledge`, `get_hack`, `get_protocol`, `get_evidence`, `list_topics`, and `get_related` over the same generated data. Start with `docs/INTEGRATION_QUICKSTART.md`.

API and dataset metadata carry the attribution identity `Brali — Dzmitryi Kharlanau` plus the canonical citation URL. Downstream systems should keep canonical identity, evidence state, source scope, and attribution together.

## Continuous research loop

1. `data/research-queries.json` defines maintained research lenses with canonical ontology classification.
2. `scripts/research_scout.py` queries provider-neutral scholarly metadata adapters and deduplicates leads into `data/research-candidates.json`.
3. `.github/workflows/research-scout.yml` runs weekly against Crossref and Europe PMC and proposes queue changes through a bot PR.
4. Discovery metadata remains unreviewed until the Evidence Reviewer reads the actual source and records a bounded decision.
5. Protocol Builder and Taxonomy Curator preserve canonical identity and legacy URL compatibility.

The scout may find weak, negative, null, or contradictory results. It may not promote search metadata directly into `reviewed` content.

## Local build

```bash
npm run build
npm run check
python3 -m http.server 8080
```

Additional helpers:

```bash
npm run research:check
npm run research:scout
npm run mcp:check
npm run release:data -- --version 1.0.0
```

`npm run check` validates ontology and legacy mappings, source provenance, evidence/indexing rules, canonical identities, aliases, manifest checksums, the API surface, retrieval benchmark, MCP syntax, attribution/citation surfaces, research-provider contracts, and the existing strict content audit.

## Releases and citation

The `Package Brali data release` workflow creates immutable `data-v*` bundles with a machine-readable release manifest and SHA-256 checksums. `CITATION.cff` is the canonical citation metadata. Consumers that need reproducibility should pin a release instead of `main`. See `/citation/` and `ATTRIBUTION.md` for the requested creator/project attribution.

## Contributing and partnerships

Structured GitHub issue forms cover source suggestions, corrections, taxonomy proposals, research collaboration, and integration/partnership proposals. Evidence-like submissions still pass through `SOURCE_POLICY.md` and `CONTENT_QUALITY.md`. See `CONTRIBUTING.md`, `/partners/`, and `LICENSING.md`.

## Direction

Near-term work should improve the knowledge asset rather than recreate the retired feature race: reduce evidence and taxonomy debt, improve retrieval quality, expand multilingual identity, and make the same trusted data easy to consume through static APIs, MCP, and versioned releases.

## License

The root `LICENSE` is authoritative for original repository material: CC BY-NC-SA 4.0. Commercial use requires prior written permission. See `LICENSING.md`.
