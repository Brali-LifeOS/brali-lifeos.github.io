# Brali agent loop

## Goal

Make Brali a trustworthy and practical system for turning useful ideas into personal experiments.

Optimize for: trust, clarity, usefulness, then discovery. New content volume is not a goal by itself.

## Knowledge loop

`research candidate -> evidence decision -> hack -> protocol -> public discovery`

- **Research candidate**: an unreviewed lead.
- **Evidence decision**: explicit result of reading the actual source.
- **Hack**: an atomic reusable practical technique.
- **Protocol**: an executable sequence or personal experiment that can combine hacks.

No agent may jump from a title, DOI, abstract, citation count, search result, or AI summary directly to `reviewed` content.

## Editorial agents

The public registry is `/agents/registry.json`.

1. **Research Scout** finds recent research and updates the candidate queue. It cannot publish.
2. **Evidence Reviewer** reads the actual source and decides whether it supports, challenges, rejects, or suggests content.
3. **Protocol Builder** turns accepted atomic actions into short executable protocols.
4. **Taxonomy Curator** maps knowledge into Life Areas, Growth Zones, and method tags without breaking stable URLs.

Reusable instructions live under `/skills/`; machine-readable shapes live under `/contracts/`.

## Iteration loop

1. **Inspect** repository outputs, evidence queues, research candidates, and public pages.
2. **Prioritize** trust/editorial problems before more content volume.
3. **Change** through small reversible branch changes. Keep discovery, review, hack authoring, protocol composition, and taxonomy as separate handoffs.
4. **Validate** the deterministic build, strict content checks, research mappings, contracts, evidence/indexing states, and public discovery.
5. **Review** for overstated evidence, hidden provenance, duplicate hacks, broken URLs, and needless complexity.
6. **Continue** with the highest-leverage unfinished item.

## Foundation

Brali already has explicit evidence states (`reviewed`, `practical`, `pending-review`, `restricted`), review queues, Life Areas and Growth Zones, trust-aware indexing, local search, structured data, related protocols, a Trusted Protocol Feed, and content-quality checks.

The research layer adds:

- Hack, Protocol, Research Candidate, and Evidence Decision contracts;
- Research Scout, Evidence Reviewer, Protocol Builder, and Taxonomy Curator roles;
- provider-neutral skill files;
- explicit research queries mapped to the taxonomy;
- a weekly Crossref discovery workflow that only updates an unreviewed queue;
- a machine-readable agent registry;
- sitemap and AI/developer discovery for the new layer.

## Priority queue

### P0 — Evidence review

Work through existing `restricted` and `pending-review` material. Verify that sources support exact wording. Remove unsupported precision rather than attaching vaguely related citations. Record review provenance.

### P1 — Continuous research discovery

Maintain `data/research-queries.json`. Let the weekly scout update `data/research-candidates.json`. Prioritize systematic reviews, meta-analyses, guidelines, replications, strong primary work, and useful negative/null findings. Triage only after reading the relevant source into: `rejected`, `watch`, `support-existing`, `challenge-existing`, `propose-hack`, or `propose-protocol`.

Prefer research that corrects or strengthens existing content over research that merely creates another page.

### P2 — Stronger hacks and protocols

Gradually separate atomic hacks from composed protocols without breaking current public URLs. Prefer 1–5 steps, explicit check-ins, review points, and stop/change rules. Reuse hack identity instead of duplicating the same technique under new names. Do not invent durations, percentages, mechanisms, or guarantees.

### P3 — Taxonomy refinement

Keep existing Growth Zone URLs stable. Separate broad life destinations from method lenses more clearly. Prefer tags over new zones when the new term is a method, synonym, or narrow subtopic.

### P4 — Discovery and integrations

Keep `llms.txt`, agent registry, contracts, Trusted Protocol Feed, methodology, structured data, and sitemap synchronized. Add a versioned API or MCP layer only over the same canonical knowledge model.

## Definition of done for research-derived content

Before research-derived content becomes discovery-eligible, it needs:

- a clear user problem and concrete action;
- an appropriate evidence state;
- traceable source review, not just a source URL;
- wording scoped to the studied population/intervention/outcomes;
- limitations and safety framing when relevant;
- stable taxonomy and canonical identity;
- no unsupported precise quantitative claims;
- a traceable handoff from research candidate/evidence decision to the public claim.

## Non-goals

- Becoming another generic all-in-one productivity app.
- Increasing page count or sitemap size as a success metric.
- Using scientific language to make weak guidance sound authoritative.
- Treating a source URL as proof that review happened.
- Letting an agent auto-publish a hack because a paper title sounds relevant.
- Creating new taxonomy zones for every new research term.
