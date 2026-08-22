# Brali product outcome agent loop

## Canonical controls

This file defines the human-readable operating rules. The machine-readable control plane is `data/agent-loop-plan.json`, validated against `contracts/agent-loop-plan.schema.json` by `scripts/check-agent-loop-plan.mjs` and `.github/workflows/agent-loop.yml`.

GitHub issues are the execution record. The plan may name a target or next slice, but a workstream becomes complete only when the issue and plan contain observed completion evidence. A planned release, demo, synthetic event, generated counter, or confident paragraph does not count.

## Mission

Brali is an **evidence-aware protocol layer for people and AI agents**.

The canonical value chain is:

`practical question -> trusted protocol match -> bounded action -> evidence and provenance -> outcome review -> measured learning`

The primary product is the knowledge layer: canonical protocols, evidence decisions, retrieval, citation, safe abstention, APIs, and read-only agent access. The zero-install human Query is a public view over the same layer. The original LifeOS organizer is a legacy and optional application layer; it must not drive the main roadmap or be revived as another broad feature race.

Optimize in this order:

1. trust and safety;
2. outcome-ready protocol quality;
3. observed usefulness;
4. external adoption;
5. discovery;
6. operational and commercial readiness.

New content volume, page count, sitemap size, generated files, CI checks, and unverified downloads are not product outcomes.

## North-star metric

The north-star metric is `weekly_verified_successful_executions`.

It means completed Brali protocol runs that are explicitly marked helpful, deduplicated through privacy-safe client or session semantics and kept separate from targets, demos, fixtures, and synthetic events.

The initial target in the plan is a hypothesis, not an observed result. Until issue #111 implements the event contract and collection boundary, the truthful status is `not-collected`.

Supporting signals include:

- trusted-answer and safe-abstention rates;
- protocol start, completion, and helpfulness rates;
- repeat use;
- source and citation interaction;
- unresolved-query and bad-match rates;
- active external integrations.

No public adoption claim may be inferred from repository views, page generation, test runs, or issue creation.

## Stage gates

The loop follows the gates in `data/agent-loop-plan.json`. Gate order is binding unless a later slice is required to unblock an earlier gate.

### 0. `trust-reset`

Issues: #109 and #93.

- eliminate unsupported quantitative, first-party, causal, mechanism, guarantee, and clinical-sounding claims from indexable surfaces;
- keep sensitive material out of normal discovery until explicitly reviewed;
- record source-bounded evidence decisions, including `keep practical`, `rewrite`, `watch`, and `reject` outcomes;
- publish claim debt honestly and deterministically.

### 1. `gold-core`

Issues: #110 and #93.

Create 20 manually reviewed, outcome-ready protocols chosen by recurring user value, actionability, safety, evidence quality, retrieval demand, and observability. Do not force equal representation across legacy Life Areas merely because symmetrical dashboards look reassuring.

Each Gold protocol needs:

- a clear user problem and eligibility conditions;
- when not to use it;
- the smallest first action and complete bounded steps;
- a justified review horizon rather than an invented duration;
- an observable signal;
- stop/change rules and a fallback;
- evidence state, source boundary, limitations, last review date, and citation;
- canonical identity and consistent site/API/MCP exposure;
- problem-first retrieval and evaluation coverage.

### 2. `outcome-loop`

Issue: #111.

- define privacy-light outcome events and retention rules;
- separate platform/adoption metrics from legacy companion-app metrics;
- collect helpful, not-helpful, safe no-answer, bad-match, and missing-knowledge signals without retaining personal prompts by default;
- feed observed failures back into evaluation, ontology, retrieval, and editorial queues;
- distinguish observed values from targets, demos, and synthetic data everywhere.

### 3. `distribution-and-adoption`

Issues: #112, #113, and #117.

- present one product promise and one primary proof path;
- make Query the zero-install demonstration of the canonical knowledge layer;
- publish and verify MCP/package/registry states externally before updating status claims;
- recruit a small design-partner cohort and preserve failed integrations as valid learning;
- require verifiable external use before claiming adoption.

### 4. `trusted-discovery`

Issue: #114.

- index only canonical, trusted, useful pages;
- keep sitemap, robots, canonical, navigation, evidence state, page JSON, API, and aliases aligned;
- build problem-first pages from Gold protocols instead of thin combinatorial SEO pages;
- publish knowledge updates from actual additions, rewrites, downgrades, rejections, and unresolved gaps.

### 5. Operational and commercial readiness

Issues: #115, #116, and #118.

- separate software, knowledge-data, content, brand, third-party, and commercial licensing only through an explicit reviewed decision;
- decompose the build into deterministic, idempotent, diagnosable stages without weakening the full trust gate;
- run a pinned model-with-Brali versus model-without-Brali benchmark with human grading and visible null or negative results.

## Work lanes and WIP limits

The loop has four lanes:

- **implementation**: code, contracts, generated surfaces, retrieval, CI, publishing infrastructure;
- **editorial**: actual-source review, claim decisions, protocol wording, safety boundaries;
- **external**: npm/registry publication, hosted deployment, adopter contact, consented usage evidence;
- **decision**: licensing, branding, legal, and irreversible product choices.

Limits:

- one active implementation slice;
- one open implementation pull request;
- at most two active editorial reviews;
- external or decision work may wait for credentials or approval, but waiting must be explicit.

Do not start an active P1 or P2 implementation slice while an unblocked P0 implementation slice remains. Editorial source review may proceed in parallel because it has a separate WIP lane.

## Agents and responsibilities

The public editorial registry remains `/agents/registry.json`:

1. **Research Scout** finds candidates and cannot publish.
2. **Evidence Reviewer** reads actual sources and records bounded decisions.
3. **Protocol Builder** composes accepted actions into executable protocols.
4. **Taxonomy Curator** preserves canonical identity and legacy compatibility.

The product loop adds operating responsibilities without granting automatic publication:

- **Product Steward** selects the highest-leverage unblocked slice and prevents roadmap drift.
- **Trust Auditor** finds unsupported claims, indexing leaks, provenance loss, and unsafe recommendations.
- **Retrieval Evaluator** turns real failures into reproducible cases rather than tuning only happy paths.
- **Adoption Observer** records real external use, failed integrations, and outcome signals without inventing counters.
- **Distribution Maintainer** keeps static API, package, MCP, citation, version, and deployment states accurate.

One agent may perform several responsibilities, but each handoff and decision must remain traceable.

## Execution cycle

1. **Inspect** `data/agent-loop-plan.json`, current issues, open pull requests, quality/evidence outputs, evaluation failures, public pages, and external blockers.
2. **Select** the highest-priority unblocked workstream by P0/P1/P2, gate order, trust risk, external user value, and reversibility.
3. **Slice** one change with a before state, expected output, validation path, and linked issue. Avoid mixing unrelated cleanup.
4. **Implement** on a feature branch. Keep source changes, generated outputs, editorial decisions, and external actions distinguishable.
5. **Validate** narrow checks first, then the complete deterministic build and check gate required by the repository.
6. **Review** for unsupported claims, evidence-state loss, provenance loss, unsafe indexing, fake adoption signals, broken compatibility, and needless complexity.
7. **Record** only observed evidence in the issue and `completion_evidence`. Targets, preparation, and intent are not completion.
8. **Merge or close** the slice before opening another implementation pull request.
9. **Continue** with the next highest-leverage unblocked item.

When an external credential, legal decision, human source review, or adopter response is required, mark the workstream `awaiting-external`, record exactly what is ready and what is missing, and continue with the next independent slice. Never convert an unavailable external action into fictional success.

## Selection rules

Prefer work that:

1. removes unsafe or unsupported indexed claims;
2. improves the first Gold protocols;
3. closes a real evaluation or trusted-coverage failure;
4. enables outcome observation;
5. removes friction from one actual external integration;
6. simplifies the system without weakening trust;
7. improves discovery of already-trusted knowledge.

Defer work that mainly:

- creates more long-tail entries;
- adds another API, transport, taxonomy layer, app shell, or visual dashboard without an observed need;
- translates the full corpus before canonical identity and retrieval demand justify it;
- increases page count or automation theatre;
- optimizes for a benchmark by weakening expected outcomes or deleting difficult cases.

## Knowledge and claim rules

The knowledge loop remains:

`research candidate -> actual-source review -> evidence decision -> hack -> protocol -> trusted discovery -> observed outcome`

No agent may jump from a title, DOI, abstract, citation count, search result, or AI summary directly to `reviewed` content.

Precise public wording requires precise support. Percentages, sample sizes, effect estimates, mechanisms, causal statements, internal pilot results, guarantees, and treatment/diagnosis/prevention language need a reviewed source decision supporting the exact bounded claim. If that support is absent, remove the precision, keep the item practical, restrict it, noindex it, or reject it.

A source URL is not proof that review occurred. A neighboring mechanism is not proof of a protocol-specific effect. The absence of a regex match is not proof of evidence quality.

Safe abstention is a product feature. Retrieval may return no trusted answer rather than silently using `pending-review` or `restricted` material.

## Outcome and privacy rules

- Do not collect full prompt text or personal data by default.
- Preserve only the minimum identifiers needed for protocol/result version, client category, coarse event state, and deduplication.
- Document collection, consent, retention, deletion, aggregation, and demo-data boundaries.
- Publish zero rather than a fabricated metric when no observation exists.
- A failed protocol, bad match, no-answer case, rejected source, or abandoned integration is valid learning and must not be hidden to improve optics.

## Discovery and integration rules

- Static API, local MCP, hosted MCP, Query, datasets, and pages must use the same canonical IDs, evidence states, provenance, and citation boundaries.
- Do not describe local stdio MCP as hosted remote MCP.
- Do not claim npm or registry publication until the external package identity resolves and a clean-machine test succeeds.
- Do not create a new integration surface while the existing static API, package, Query, or MCP can solve the observed need.
- Sitemap inclusion is earned by trusted coverage and unique user value, not by file existence.
- Legacy, alias, duplicate, empty, restricted, and archive-only pages do not belong in normal discovery.

## Branch and pull-request protocol

- Work from a feature branch, never directly from `main`.
- Use one active implementation branch and pull request at a time.
- Link the issue and gate in the pull request body.
- Keep changes small, reversible, and single-purpose.
- Do not stage or overwrite unrelated work.
- Create pull requests as draft unless the slice is fully validated and explicitly ready.
- Full build/check, relevant focused checks, and review of generated diffs are required before merge.
- Close stale or superseded pull requests after verifying that their intended behavior exists on `main` or is represented by the current backlog.

## Current active slices

- Implementation: #109, extend the claim gate and produce measurable claim debt.
- Editorial: #93, complete the first four actual-source decisions.
- Next after the trust gate: #110 Gold 20 contract, then #111 outcome event contract.

Status changes must be reflected in `data/agent-loop-plan.json`; CI enforces WIP limits, issue references, dependency integrity, gate order, and the presence of this control document.

## Definition of done for a loop slice

A slice is complete only when:

- the linked issue's acceptance criteria for that slice are met;
- source and generated outputs are consistent;
- evidence state, provenance, citation, canonical identity, and safety boundaries are preserved;
- no fake usage, evidence, publication, or completion claim is introduced;
- focused and full validations pass;
- the pull request is merged or intentionally closed;
- observed completion evidence is recorded;
- the next workstream status and next slice are updated.

## Non-goals

- Rebuilding a generic all-in-one productivity application.
- Becoming the largest collection of advice pages.
- Using scientific language to decorate weak guidance.
- Treating automation volume as product traction.
- Publishing synthetic research, adoption, or outcome claims.
- Hiding negative evidence, safe no-answer behavior, or failed integrations.
- Allowing the loop to grow itself instead of improving the product.
