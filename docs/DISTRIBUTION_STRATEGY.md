# Brali distribution strategy

## Objective

Make Brali useful and discoverable **outside its own website** without turning the library into a content farm or treating page count as growth.

The maintained product position is:

> **Brali is an evidence-aware practical knowledge layer for humans and AI agents.**

The website is one interface. The durable asset is the canonical knowledge model plus its trust state, provenance, stable identities, protocols, Agent Skills, API, releases and evaluation artifacts.

Popularity is not the target by itself. The target is repeated external use of trusted Brali knowledge: people finding and using a protocol, agents installing or retrieving it, developers integrating it, researchers or builders citing it, and third parties linking back to the canonical identity.

## What Brali should not compete on

Do not try to win by publishing more generic life-hack pages than established media sites. Brali's defensible advantages are different:

1. explicit evidence and review state;
2. stable identity across human and machine representations;
3. executable protocol structure rather than inspirational prose;
4. one-skill-per-hack machine coverage without pretending every skill is trusted;
5. reproducible datasets, releases and evaluation cases;
6. a deliberate no-answer boundary when trusted coverage does not exist.

More content helps only when it improves trusted coverage, solves a real search/user problem, or creates a reusable external artifact.

## Four acquisition loops

### 1. Problem → protocol → reuse

**Entry:** a non-branded search query or external link about a concrete problem.

**Flow:** problem/topic page → trusted protocol → Query Playground → save/share/cite or agent context.

**Why it compounds:** useful protocol pages can earn links and long-tail search discovery, while canonical IDs and related-topic navigation keep the user inside one coherent knowledge graph.

**Rule:** build problem-first pages only when they contain a real decision path and trusted coverage. Do not generate keyword permutations.

### 2. Agent discovery → router skill → trusted catalog

**Entry:** GitHub Agent Skills discovery, direct repository discovery, a skill registry, or a developer recommendation.

**Flow:** preview `brali-life-os` → install router → retrieve only trusted catalog records → preserve provenance → link to canonical Brali records.

**Why it compounds:** every external use can create a visible source link or a repository reference without requiring the user to discover the website first.

**Distribution rule:** publish the **router first**. Do not flood external registries with every generated per-hack skill. The full one-skill-per-hack corpus remains useful as a Brali library and machine surface; external registries should receive curated entry points with clear trust behavior.

### 3. Dataset/research discovery → release → citation

**Entry:** dataset search, a dataset hub, research tooling, GitHub releases, DOI/citation discovery, or a developer looking for reusable grounded practical knowledge.

**Flow:** dataset card/release → pinned `data-v*` bundle → manifest/checksums → citation → API/skills/site.

**Why it compounds:** datasets and research artifacts can be cited independently of individual content pages and can create durable backlinks and reproducible usage.

**Priority external surfaces:**

- Hugging Face Datasets: a maintained dataset card pointing to the canonical release and trust model;
- Zenodo: archive stable data releases and obtain a durable DOI when the GitHub integration/release path is configured;
- GitHub Releases: keep versioned bundles and citation metadata inspectable.

Do not claim an external mirror, DOI or download count until it exists and can be linked.

### 4. Evaluation artifact → developer reuse → citation

**Entry:** builders searching for retrieval, grounding, provenance or safety evaluation examples.

**Flow:** public source cases → run Brali evaluation → reuse or adapt cases → compare a retrieval approach → cite the source suite.

**Why it compounds:** evaluation assets are useful even to someone who does not adopt Brali as their primary knowledge source.

The current suite is deliberately a Brali retrieval/grounding evaluation. The next external-facing layer should add optional provider/model harnesses without retroactively describing the deterministic suite as a model benchmark.

## P0 distribution actions

### GitHub repository discovery

Repository metadata should communicate the actual product rather than “Official website for Brali LifeOS”. Recommended description:

> Evidence-aware practical knowledge for humans and AI agents: protocols, Agent Skills, API, datasets and reproducible evaluation.

Recommended homepage:

`https://brali-lifeos.github.io/`

Recommended repository topics, subject to GitHub limits and actual feature coverage:

- `agent-skills`
- `ai-agents`
- `knowledge-base`
- `datasets`
- `evidence`
- `productivity`
- `self-improvement`
- `mcp`
- `openapi`
- `github-pages`

The connected repository tool used by ChatGPT does not currently expose repository-metadata mutation, so this remains an explicit external action rather than a fabricated completed change.

### GitHub Agent Skills

The repository already validates `gh skill publish agent-skills --dry-run` in CI. Use the maintained `brali-life-os` router as the public entry point and keep the preview-first instruction visible:

```bash
gh skill preview Brali-LifeOS/brali-lifeos.github.io brali-life-os
```

Then install into a supported host only after inspection.

A real public release/search result should be recorded before claiming registry adoption.

### ClawHub

Publish or import the **router skill only** as the first Brali entry. The description should emphasize:

- evidence-aware practical knowledge;
- reviewed/practical recommendation boundary;
- canonical Brali links;
- no trusted answer when coverage is not sufficient.

Do not bulk-publish hundreds of individual skills merely to occupy registry pages.

### Hugging Face dataset

Create a Brali dataset repository with a concise dataset card that explains:

- what the records contain;
- evidence states;
- canonical IDs;
- provenance/source boundaries;
- current version and release pinning;
- license and commercial-use boundary;
- known limitations;
- links back to Brali API, methodology and citation guide.

Mirror or derive from a stable `data-v*` release, not an unpinned `main` snapshot.

### Zenodo

Connect release archival when the repository/release workflow is ready. Preserve `CITATION.cff`, release version, license and checksums. Add the DOI to Brali only after Zenodo actually issues it.

## Search and content distribution

### Keep the trusted SEO reset

The existing trusted SEO work remains necessary because old legacy pages can survive in search caches after the live build has been corrected. Treat stale legacy snippets as a crawl/index-cleanup problem, not as permission to hand-edit generated pages or publish replacement keyword pages.

For each stale URL:

1. verify the final deployed page and its evidence/search state;
2. verify canonical/robots/sitemap parity;
3. preserve the canonical URL when a neutral review record has distinct provenance value;
4. remove or redirect only when the record no longer deserves an independent public identity;
5. request recrawl/reindex through the available search-console workflow where appropriate;
6. record the result separately from repository build success.

### Build only pages with an acquisition job

Every new public search-facing page should have one primary job:

- answer a concrete problem;
- explain a concept or evidence boundary;
- expose a useful dataset/research artifact;
- document an integration;
- compare meaningful options;
- summarize a real knowledge update or change.

If a page exists only because another keyword combination exists, do not create it.

## Conversion design

Every major entry surface should make the next action obvious.

### Human protocol pages

Useful actions, in order of intent:

1. use the protocol;
2. save/share/cite it;
3. inspect evidence and limitations;
4. explore the related Topic/problem;
5. use it with an agent when relevant.

### AI/developer pages

Useful actions:

1. Query without setup;
2. preview the router skill;
3. install into a chosen host;
4. fetch trusted JSON/API;
5. run the evaluation;
6. pin a release/cite it;
7. report an integration or missing coverage.

Do not lead with architecture when the visitor has not yet experienced the value.

## Measurement

Measure externally observable use. Recommended metrics:

### Search

- non-branded impressions and clicks;
- clicks by problem/topic cluster;
- indexed canonical trusted pages versus eligible pages;
- stale/incorrect indexed URLs awaiting cleanup.

### Product/adoption

- Query Playground starts;
- successful trusted packets versus deliberate no-answer outcomes;
- packet/canonical-link copy actions where privacy-safe analytics already support them;
- outbound clicks to Agent Skills/integration/citation surfaces;
- integration reports or corrections submitted by external users.

### External distribution

Use provider-reported metrics only when available:

- GitHub stars, forks, referrers and release activity;
- skill installs/downloads/search position if the registry exposes them reliably;
- Hugging Face dataset downloads/likes if a real dataset exists;
- Zenodo views/downloads/citations if a real record exists;
- external backlinks and citations.

Never backfill zeroes with estimates and never publish invented adoption counters.

## 30 / 60 / 90-day execution order

This is a sequencing model, not a forecast.

### First 30 days — make adoption easy

- finish the trusted SEO reset and stale-index cleanup;
- make the repository and `/for-ai/` entry points conversion-first;
- publish the router through GitHub Skills and one external skill registry;
- create the Hugging Face dataset mirror/card from a pinned release;
- configure Zenodo release archiving when the release flow is ready;
- expose clean measurement for the Query → reuse funnel.

### Days 31–60 — create reasons to cite Brali

- package the evaluation cases as a standalone reusable eval artifact;
- add optional model/provider harnesses with pinned versions;
- publish evidence/change notes that are genuinely useful to external builders;
- improve the strongest problem/topic clusters using observed search and Query gaps rather than raw keyword volume;
- collect the first verifiable external integrations and case studies.

### Days 61–90 — compound what actually worked

- double down on the acquisition surfaces that produced observed external use;
- retire distribution channels that produced no meaningful traffic or adoption;
- expand curated external skill packs only when router usage demonstrates a real need;
- use retrieval/evaluation failures to prioritize new evidence work;
- turn real integrations, citations and external reuse into durable proof pages.

## Decision rules

1. **Distribution before inventory:** another 100 hacks are lower priority than getting one trusted Brali surface into the workflows people already use.
2. **Router before registry spam:** one strong entry skill is better than hundreds of near-duplicate external listings.
3. **Evidence before persuasion:** popularity must not weaken the source/review boundary.
4. **Reusable artifact before generic article:** prefer a dataset, eval case, integration recipe, comparison or protocol when it solves the same acquisition job better.
5. **Observed signal before expansion:** expand a channel after it produces measurable use, not because it sounds fashionable.
6. **Canonical identity everywhere:** external mirrors and skills should point back to the Brali identity instead of becoming detached copies.
7. **No fake traction:** repository checks prove consistency; external metrics prove external use. Keep those claims separate.
