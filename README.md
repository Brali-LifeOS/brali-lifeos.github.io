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
- `/for-ai/` — guidance for AI tools and developers.
- `/for-ai/query/` — zero-install browser query that returns transparent Topic → Protocol → Evidence/provenance packets.
- `/for-ai/demos/` — deterministic reference agent scenarios.
- `/for-ai/integrations/` — copy-paste OpenAI API, Claude Code, and Cursor integration kits.
- `/cite/` — citation and attribution guidance for people and downstream AI systems.
- `/api/v1/` — generated versioned read-only Knowledge API.
- `/llms.txt` — compact machine-readable project orientation.

## Stable identity and integrations

Generated entities expose canonical IDs as `brali:<kind>:<local-id>`. Titles, URLs, localized labels, and historical IDs are aliases around that identity. See `docs/DATA_VERSIONING.md`.

`npm run build` generates a canonical dataset manifest with SHA-256 checksums, identity and multilingual alias registries, an actionable ontology migration queue, evidence-debt metrics, retrieval/evaluation outputs, and `/api/v1/` files for Topics, Hacks, Protocols, Evidence, search, identity, demos, integrations, manifest, and OpenAPI.

The optional read-only MCP server in `mcp/` exposes `search_knowledge`, `get_hack`, `get_protocol`, `get_evidence`, `list_topics`, and `get_related` over the same generated data. It is currently a **local stdio server**, not a hosted remote MCP service. Cursor and Claude Code starter configs use that local server. The OpenAI example uses the hosted static Brali API and a bounded answer packet instead of pretending a hosted Brali MCP endpoint exists.

Start with `/for-ai/query/` to inspect the live retrieval contract with no setup, then use `docs/INTEGRATION_QUICKSTART.md`, `docs/REFERENCE_AGENT_DEMOS.md`, `examples/integrations/`, and `/for-ai/integrations/` for programmatic integration.

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
npm run demos:check
npm run adoption:check
npm run query:check
npm run adoption:openai -- "How can I remember what I study?"
npm run release:data -- --version 1.0.0
npm run release:check -- --version 1.0.0
```

`adoption:openai` prints a request preview when `OPENAI_API_KEY` is absent. With a key it sends the bounded Brali packet to the OpenAI Responses API.

`npm run check` validates ontology and legacy mappings, source provenance, evidence/indexing rules, canonical identities, aliases, manifest checksums, API surfaces, agent evaluation/reference demos, zero-install query behavior, adoption/citation contracts, MCP syntax, research-provider contracts, release tooling syntax, and the existing strict content audit.

## Releases and citation

The first stable dataset baseline is `1.0.0`, using the immutable tag convention `data-v1.0.0`. See `docs/releases/1.0.0.md` for included surfaces, trust rules, and known limitations.

The `Package Brali data release` workflow rebuilds and checks the repository, packages every canonical dataset plus the complete API v1 surface, then verifies the release manifest and SHA-256 checksums before publishing tag assets. The bundle also includes `CITATION.cff`, license/licensing terms, evidence/source policies, versioning rules, and version-specific release notes. Consumers that need reproducibility should pin a release instead of `main`.

When Brali materially informs a downstream answer, keep the canonical record URL/ID and evidence state. Dataset-level or research use should cite **Dzmitryi Kharlanau, Brali Practical Knowledge Library**, together with the pinned `data-v*` release. See `docs/CITATION_AND_ATTRIBUTION.md` and `/cite/`.

## Contributing and partnerships

Structured GitHub issue forms cover source suggestions, corrections, taxonomy proposals, research collaboration, and integration/partnership proposals. Evidence-like submissions still pass through `SOURCE_POLICY.md` and `CONTENT_QUALITY.md`. See `CONTRIBUTING.md`, `/partners/`, and `LICENSING.md`.

External adopters are encouraged to report what they integrated, which Brali surface they used, and where the contract was awkward. There is deliberately no made-up download/user counter in the repository; adoption claims should come from observable use.

## Direction

Near-term work should improve the knowledge asset and external utility rather than recreate the retired feature race: reduce evidence and taxonomy debt, improve retrieval quality, expand multilingual identity, and make the same trusted data easy to consume through static APIs, local MCP, versioned releases, verifiable third-party integrations, and a zero-install browser query.

## License

The root `LICENSE` is authoritative for original repository material: CC BY-NC-SA 4.0. Commercial use requires prior written permission. See `LICENSING.md`.
