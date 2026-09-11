# AGENTS.md — Brali LifeOS

Use this file as the root entry point for ChatGPT and other repository agents. Brali is knowledge-first: preserve the canonical knowledge model, evidence states, provenance, stable identities, public API contracts, and the boundary between discovery and review.

## Start here

Read only the context required for the task:

1. `README.md` — current product direction, knowledge model, public surfaces, integrations, releases, and checks.
2. `SOURCE_POLICY.md` — source and provenance rules for evidence-like material.
3. `CONTENT_QUALITY.md` — publication/content-quality boundaries.
4. Relevant docs under `docs/` only when the task touches versioning, integrations, demos, releases, citation, or data contracts.
5. `.arwp/README.md` and `.arwp/image-discovery.json` when the task changes public Search/discovery imagery, social/preferred-image metadata, sitemap image coverage or deployment verification.

Do not start by loading all generated API files, all research candidates, or the entire public site.

## Task router

| Task | Canonical source | Coupled files to inspect | Verification |
| --- | --- | --- | --- |
| Knowledge/taxonomy | canonical data under `data/` using `Domain -> Topic -> Hack -> Protocol` | ontology mappings, aliases, generated pages/API | `npm run build` and `npm run check` |
| Evidence/source review | source/evidence records plus `SOURCE_POLICY.md` | evidence indexes, protocol/hack links, review state | `npm run build` and `npm run check` |
| Research discovery | `data/research-queries.json`, research scout/provider code | `data/research-candidates.json`, research docs/workflow | `npm run research:check` |
| Public API / data release | canonical datasets and generator code | `/api/v1/`, manifest, checksums, schemas, release docs | `npm run build`, `npm run check`; release tasks also use `npm run release:check -- --version <version>` |
| AI/agent integration | canonical generated data plus `agents/`, `contracts/`, `skills/`, integration examples | `/for-ai/`, demos, OpenAPI/MCP surfaces | `npm run build`, `npm run check`, plus relevant `mcp:check`, `demos:check`, `adoption:check`, or `query:check` |
| Identity/localization | canonical IDs and alias registries | multilingual labels, historical aliases, API identity surfaces | `npm run build` and `npm run check` |
| Site/discovery | human source pages plus build generators | llms/discovery files, generated API/site pages, links, representative images, sitemap image entries, `.arwp/image-discovery.json` | `npm run build`, `npm run check`, `node scripts/apply-image-discovery.mjs`, `node scripts/check-image-discovery.mjs`; review live Image Discovery after deploy |

## Source-of-truth rules

- Preferred model is `Domain -> Topic -> Hack -> Protocol`; Evidence/provenance is separate. Do not recreate the retired feature-first LifeOS architecture as a parallel source of truth.
- `topic-pending` is explicit editorial debt, not permission to invent a Topic.
- Evidence states are `reviewed`, `practical`, `pending-review`, and `restricted`. Only `reviewed` and `practical` normally qualify for trusted retrieval.
- Research-scout metadata is discovery input. It must not be promoted directly to reviewed evidence without reading and reviewing the actual source.
- Preserve canonical identities `brali:<kind>:<local-id>` and treat titles, URLs, localized labels, and historical IDs as aliases.
- `/api/v1/` and other generated outputs are views over canonical data. Fix the source/generator, then rebuild; do not hand-edit generated output as the source.
- The MCP server is currently local stdio, not a hosted remote Brali MCP service. Do not imply otherwise.
- Do not invent adoption, download, user, efficacy, or external search metrics.
- Image Discovery must reuse an actually visible informative image and its existing human-authored alt text. Do not manufacture an image description from a filename or concept title. Logos, favicons and utility icons are not promoted as representative page imagery merely to increase sitemap coverage.
- Keep Discover-specific image-size guidance separate from ordinary image crawl/index eligibility. A passing image gate does not establish Google Images indexing, Search thumbnail selection, Discover placement, ranking or traffic.

## GitHub / publication boundary

- `main` is the production GitHub Pages source. Do not push or merge to `main` unless the active user request authorizes it.
- `.github/workflows/deploy-pages.yml` runs verification for pull requests, but the `deploy` job is skipped for `pull_request`. Preserve that separation.
- Do not weaken source review, quality gates, release checks, Pages permissions, or deployment triggers for agent convenience.
- A passing build/check proves repository consistency, not external adoption or effectiveness.

## Verification

Normal local gate:

```bash
npm run build
npm run check
```

Use focused checks when appropriate:

```bash
npm run research:check
npm run mcp:check
npm run demos:check
npm run adoption:check
npm run query:check
node scripts/apply-image-discovery.mjs
node scripts/check-image-discovery.mjs
```

For a Search/discovery release, run Image Discovery against the exact final sitemap after sitemap normalization, then gate the artifact before upload. After a successful production deployment, `scripts/check-live-image-discovery.mjs` provides bounded live evidence for the published sitemap, page metadata and image responses.

Use the release commands documented in `README.md` for versioned data-release work. Do not claim a check passed unless it ran for the changed revision.
