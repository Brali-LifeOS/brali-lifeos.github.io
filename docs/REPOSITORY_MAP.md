# Brali repository map

This is the compact architecture/navigation map for maintainers and coding agents. It complements `AGENTS.md`; it does not replace evidence, content, localization, release, or distribution policy.

## Architecture

```text
canonical/editorial inputs
  -> policy + source validation
  -> build/generation
  -> final artifact checks and search/discovery finalization
  -> GitHub Pages artifact
  -> production deployment
  -> live HTTP + real-browser verification
```

The normal repository gate is `npm run build` followed by `npm run check`. `.github/workflows/deploy-pages.yml` is the canonical pull-request verification and production deployment pipeline. Pull requests run verification only; `main` also uploads/deploys the verified Pages artifact and then runs production-only gates.

## Main areas

| Area | Purpose | Source of truth / ownership | Generated? | Main consumer |
| --- | --- | --- | --- | --- |
| `data/life-os-content/` | Canonical hack/content corpus | `data/life-os-content/index.json` plus governed additions/review inputs | Mixed: canonical data is transformed by build helpers | Site, API, skills, retrieval |
| `data/localization/<locale>/` | Locale authoring data | Locale datasets governed by `.arwp/localization.json` and `docs/LOCALIZATION.md` | Authored inputs; public locale surfaces are generated | Localized site/search/AI surfaces |
| `data/research-*` | Research discovery inputs/candidates | Research query/provider pipeline | Mixed; candidates may be bot-updated and are not reviewed evidence | Research review workflow |
| `.arwp/` | Search/discovery/localization policy contracts | Files in `.arwp/` | Authored policy/config | Generators, validators, ARWP workflows |
| `scripts/` | Build, generation, validation, release and operational tooling | Script implementations + `package.json` entry points | No | CI and maintainers |
| `mcp/` | Local/remote-ready MCP implementation | MCP source | Package/build outputs may be derived | Agent integrations |
| `agents/`, `contracts/`, `skills/` | Guarded agent/editorial workflows and integration contracts | Repository source files | Mostly authored | Agents/integrators |
| `api/v1/` | Versioned Knowledge API surface | Canonical data + generators | Yes | External consumers |
| `skill-packs/` | One-skill-per-hack library/catalog | Canonical hack corpus + evidence state | Yes | Agent hosts |
| `life-os/` | Human library and compatibility surfaces | Canonical data + generators | Largely generated | Browser users/crawlers |
| `for-ai/` | Query, evaluation, demos and integration surfaces | Canonical data + generators/examples | Mixed | AI developers/agents |
| `docs/` and root policy docs | Public `/docs/` start page plus repository runbooks/policy beside it | Named documents and `docs/index.html` | Mixed public/source tree | Browser users plus maintainers/agents |
| `.github/workflows/` | CI, deploy, releases and scheduled/external automation | Workflow YAML | No | GitHub Actions |

`data/` is not uniformly “hand-authored JSON”. Before editing a data file, identify its owning generator/workflow and policy. Research candidates and derived reports are not equivalent to reviewed evidence.

## Authored vs generated

Do not hand-edit a generated surface when an owning source or generator exists. Important derived families include:

- `/api/v1/`;
- `/skill-packs/`;
- generated library/ontology/topic/problem/outcome pages under the public site trees;
- generated localization pages, locale manifests and machine/search surfaces;
- `sitemap.xml`, search/AI discovery outputs and other build-finalized public artifacts;
- `.editorial-normalizations-applied.json` and `.protocol-content-overrides-applied.json`, which are active build marker outputs.

The authoritative rule remains: locate the source or generator, edit it, rebuild, then validate. Some top-level public files are authored while others are generated or finalized by scripts; do not infer ownership from extension or location alone.

Current caveat: `npm run check` is not a purely read-only test command. It reapplies content additions/review registry before the validation chain. Inspect resulting diffs rather than assuming checks cannot touch repository state.

## Common tasks

| Task | Start here | Primary gate |
| --- | --- | --- |
| Add/change a hack or protocol | `AGENTS.md`, `SOURCE_POLICY.md`, `CONTENT_QUALITY.md`, canonical `data/` record | `npm run build && npm run check` |
| Add/review evidence | `SOURCE_POLICY.md`, `CONTRIBUTING.md` | build + check; preserve provenance/review decision |
| Change Agent Skills | `docs/agent-skills.md`, skill generators | `npm run skills:build && npm run skills:check`, then normal gate |
| Change localization | `docs/LOCALIZATION.md`, `.arwp/localization.json`, locale dataset | `npm run localization:check`, then normal gate; production release also requires live + browser proof |
| Change templates/generation | owning script(s) in `scripts/` and affected source data | `npm run build && npm run check` plus focused surface checks |
| Change Search/discovery | `.arwp/README.md`, `.arwp/image-discovery.json`, relevant generators | normal gate plus final Image/Internal Discovery gates |
| Change MCP/integration | `mcp/`, integration docs/examples | `npm run mcp:check` plus normal gate |
| Change research scout | `data/research-queries.json`, research scripts/workflow | `npm run research:check` |
| Change CI/deployment | `.github/workflows/deploy-pages.yml` plus affected focused workflow | validate through the actual PR workflow; do not replace it with isolated script success |
| Package a data release | `docs/DATA_VERSIONING.md`, release docs/workflow | `npm run release:check -- --version <version>` |

## Critical invariants

- Evidence provenance and trust state are governed by `SOURCE_POLICY.md`, `CONTENT_QUALITY.md` and `CONTRIBUTING.md`. Search metadata is discovery input, not reviewed evidence.
- Canonical identity and trust modes must survive every generated representation. Do not turn `pending-review` or `restricted` material into trusted guidance.
- Every canonical hack has exactly one deterministic generated Agent Skill; recommendation eligibility remains evidence-state dependent.
- Localization keeps English canonical evidence/provenance intact. Published locales require contract/corpus/language/rendered/live/browser proof as defined in `docs/LOCALIZATION.md`.
- Generated Search/AI surfaces must agree with canonical/indexable URLs, language metadata, sitemap and public data.
- The GitHub Pages artifact is a strict public release boundary: build-only/internal trees such as `reports/`, `qa/`, `source/` and `sources/` must not ship. `docs/` is mixed: only the declared public rendered view may ship; repository runbooks/source files beside it remain excluded. Declared historical or compatibility HTML may remain off-sitemap only with an exact `noindex,follow` robots policy.
- PR verification and production deployment stay separated. Production-only network/browser checks run only after the exact merged artifact is deployed.

## CI/workflow map

- `.github/workflows/deploy-pages.yml` — canonical source/build/final-artifact verification; deploys `main`; then runs live/browser production gates.
- `.github/workflows/data-release.yml` — versioned dataset packaging/release lifecycle.
- `.github/workflows/research-scout.yml` — scheduled/manual research discovery automation.
- `.github/workflows/agent-loop.yml` — autonomous repository-agent loop.
- `.github/workflows/arwp.yml`, `arwp-site-focus.yml`, `arwp-growth.yml` — focused ARWP/source/site/growth governance with distinct triggers or production/external behavior.
- `.github/workflows/google-search.yml` — Search-provider operational integration.
- `.github/workflows/publish-router-skill.yml` — external router-skill publication/distribution.

Keep workflows separate when permissions, external side effects, schedules, release semantics, or production requirements differ. Prefer `deploy-pages.yml` for repository-wide PR verification instead of creating another parallel full-build workflow.

## Shortest useful reading path

For a new agent:

1. `AGENTS.md` — operational boundaries and task routing.
2. `README.md` — current product model and public surfaces.
3. this file — architecture, ownership and generated boundaries.
4. only the task-specific policy/runbook named above.

Do not begin with a full crawl of generated HTML, API JSON, skill packs or research candidates.
