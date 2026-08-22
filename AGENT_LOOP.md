# Brali product outcome agent loop

## Canonical controls

`data/agent-loop-plan.json` is the machine-readable control plane. `contracts/agent-loop-plan.schema.json`, `scripts/check-agent-loop-plan.mjs`, and `.github/workflows/agent-loop.yml` validate it. GitHub issues are the execution record.

A target, generated counter, demo, synthetic event, or confident paragraph is not completion evidence. A workstream becomes complete only after observed evidence is recorded and the relevant checks pass.

## Mission

Brali is an **evidence-aware protocol layer for people and AI agents**.

Canonical value chain:

`practical question -> trusted protocol match -> bounded action -> evidence and provenance -> outcome review -> measured learning`

The primary product is the knowledge layer: canonical protocols, evidence decisions, retrieval, citation, safe abstention, APIs, and read-only agent access. Query is a zero-install public view over that layer. The original LifeOS organizer is a legacy application layer and must not drive the roadmap.

Optimize in this order:

1. trust and safety;
2. outcome-ready protocol quality;
3. observed usefulness;
4. external adoption;
5. discovery;
6. operational and commercial readiness.

Page count, corpus size, sitemap size, generated files, CI checks, and unverified downloads are anti-metrics when used as substitutes for outcomes.

## North star

The north star is `weekly_verified_successful_executions`: completed Brali protocol runs explicitly marked helpful, deduplicated with privacy-safe client/session semantics and kept separate from targets, demos, fixtures, and synthetic events.

Until #111 implements the event contract and collection boundary, the truthful collection status is `not-collected`. The initial target is a hypothesis, not an observed value.

## Stage gates

Gate order is binding unless later work is strictly required to unblock an earlier gate.

### 0. `trust-reset` — completed

Issues #109 and #93 established claim gating, deterministic/public claim debt, explicit search-vs-recommendation boundaries, and the first source-bounded editorial decisions. The trust gate remains regression-protected even though every public entry is now crawlable.

### 1. `gold-core` — active

Issue #110 creates 20 manually reviewed, outcome-ready protocols selected for practical value rather than legacy taxonomy symmetry.

A Gold protocol requires:

- a clear user problem and eligibility conditions;
- when not to use it;
- the smallest first action and bounded steps;
- a justified review horizon, not an invented duration;
- an observable signal;
- a stop/change rule and fallback;
- evidence state, source boundary, limitations, review date, and citation;
- canonical identity and consistent site/API/MCP exposure;
- problem-first retrieval and evaluation coverage;
- an agent-friendly summary.

Candidate selection is not Gold approval. `data/gold-20-candidates.json` is an editorial product hypothesis until observed demand exists. `data/gold-20-reviews.json` is the manual promotion boundary, governed by `contracts/gold-protocol-review.schema.json`.

### 2. `outcome-loop`

Issue #111 defines privacy-light outcome events, retention rules, helpful/not-helpful/no-answer/bad-match/missing-knowledge signals, and a strict separation between observed values and targets or demos.

### 3. `distribution-and-adoption`

Issues #112, #113, and #117 align product identity, verify installable MCP/package states externally, and seek real design-partner use without manufacturing adoption claims.

### 4. `trusted-discovery`

Issue #114 aligns sitemap, robots, canonical, navigation, evidence state, page JSON and API policy, then builds problem-first discovery from Gold protocols rather than thin page multiplication.

### 5. `operational-and-commercial-readiness`

Issues #115, #116, and #118 cover licensing boundaries, deterministic build decomposition, and a pinned model-with-Brali versus model-without-Brali benchmark that must show null or negative results when they occur.

## Lanes and WIP

- **implementation**: code, contracts, generated surfaces, retrieval, CI, publishing infrastructure;
- **editorial**: actual-source review, claim decisions, protocol wording, safety boundaries;
- **external**: publication, deployment, adopter contact, consented usage evidence;
- **decision**: licensing, legal, branding, and other irreversible choices.

Limits:

- one active implementation slice;
- one open implementation PR;
- at most two active editorial reviews.

Do not start a P1/P2 implementation slice while an unblocked P0 implementation slice remains. Editorial source review may proceed in parallel within its own WIP limit.

## Responsibilities

The public editorial registry remains `/agents/registry.json`: Research Scout discovers but cannot publish; Evidence Reviewer reads actual sources and records bounded decisions; Protocol Builder turns accepted actions into executable protocols; Taxonomy Curator preserves canonical identity and compatibility.

Product-loop responsibilities are Product Steward, Trust Auditor, Retrieval Evaluator, Adoption Observer, and Distribution Maintainer. One agent may perform several roles, but decisions and handoffs must remain traceable.

## Execution cycle

1. Inspect the plan, issues, open PRs, quality/evidence outputs, evaluation failures, public surfaces, and external blockers.
2. Select the highest-priority unblocked workstream by gate order, trust risk, user value, and reversibility.
3. Slice one reversible change with a before state, expected output, validation path, and issue link.
4. Implement on a feature branch; keep source, generated, editorial, and external changes distinguishable.
5. Run focused checks, then the complete deterministic repository gate.
6. Review for unsupported claims, evidence/provenance loss, unsafe discovery, fake adoption signals, compatibility breaks, and needless complexity.
7. Record only observed completion evidence.
8. Merge or close the slice before opening another implementation PR.
9. Continue with the next highest-leverage unblocked item.

External credentials, legal decisions, actual-source review, adopter consent, publication, and usage evidence cannot be invented. Mark the exact blocker and continue with an independent slice when possible.

## Claim and knowledge rules

Knowledge flow:

`research candidate -> actual-source review -> evidence decision -> protocol -> trusted discovery -> observed outcome`

No title, DOI, abstract, citation count, search result, or AI summary can directly create `reviewed` content. Precise quantitative, causal, mechanism, first-party, guarantee, treatment, diagnosis, or prevention wording requires a reviewed decision supporting that exact bounded claim. Otherwise remove precision, keep practical, restrict from trusted recommendation, or reject.

A source URL is not proof of review. A neighboring mechanism is not proof of protocol effectiveness. Absence of a regex marker is not proof of evidence quality. Safe abstention is a product feature.

## Outcome and privacy rules

Do not collect full prompts or personal data by default. Keep only the minimum identifiers needed for protocol/result version, client category, coarse event state, and deduplication. Document consent, retention, deletion, aggregation, and demo-data boundaries. Publish zero rather than a fabricated metric. Failed protocols, bad matches, no-answer cases, rejected sources, and abandoned integrations are valid learning.

## Discovery and integration rules

Static API, local MCP, Query, datasets and pages must share canonical IDs, evidence state, provenance and citation boundaries. Do not describe local stdio MCP as hosted remote MCP. Do not claim npm/registry publication until external identity and clean-machine installation are verified. Do not add another integration surface when existing Query/API/MCP can solve the observed need. Sitemap inclusion is earned by trusted unique value, not file existence.

## Branch and PR protocol

Work from a feature branch, never directly from `main`. Keep one implementation branch/PR active. Link the issue and gate. Keep changes single-purpose and reversible. Create draft PRs until validated. Full build/check and generated-diff review are required before merge. Close stale or superseded PRs once their intent is on `main` or represented in the backlog.

## Current active slices

- Implementation: #110 — Gold 20 manual-review contract, candidate set, and deterministic readiness registry.
- Editorial: none required to start the contract slice; manual Gold reviews may begin after the contract is validated.
- Next gate after Gold 20: #111 outcome event and privacy contract.

Status changes must be reflected in `data/agent-loop-plan.json`.

## Definition of done

A slice is complete only when the linked acceptance criteria are met; source and generated outputs agree; trust/provenance/citation/canonical identity/safety are preserved; no fake evidence, usage, publication or completion claim is introduced; focused and full checks pass; the PR is merged or intentionally closed; observed completion evidence is recorded; and the next workstream state is updated.

## Non-goals

- Rebuilding a generic all-in-one productivity app.
- Becoming the largest advice collection.
- Scientific language used as decoration.
- Automation volume treated as traction.
- Synthetic research, adoption, or outcome claims.
- Hiding negative evidence, safe no-answer behavior, or failed integrations.
- Letting the loop grow itself instead of improving the product.
