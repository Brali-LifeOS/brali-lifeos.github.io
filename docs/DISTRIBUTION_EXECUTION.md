# Brali distribution execution runbook

This runbook separates **source readiness** from **provider-visible publication**. A committed file or passing CI job is never counted as external adoption by itself.

## Current execution order

Do the next distribution work in this order unless new external evidence changes the decision:

1. **Hosted Remote MCP — P0**: one public read-only URL, no repository checkout.
2. **Agent Skill acquisition — P0**: finish GitHub discovery verification and publish one `brali-life-os` router to ClawHub.
3. **Brali Bench — P1**: make the 50-case retrieval/grounding suite a standalone downloadable, versioned evaluation product that third parties can run against their own systems.
4. **Dataset/research distribution — P1**: mirror immutable `data-v1.1.0` to Hugging Face and archive it on Zenodo with a verified DOI.

Do not spend another cycle rebuilding source packages that already exist. The dominant remaining work is external publication, clean-install verification and durable linkable product surfaces.

## 1. Hosted Remote MCP — P0

Source: `mcp/core.mjs`, `mcp/server.mjs`, `mcp/remote.mjs`.

`remote.mjs` uses the same shared Brali MCP core as stdio. Provider-specific wrappers must not reimplement retrieval or trust filtering.

Target experience:

`agent -> https://mcp.brali.life/mcp -> trusted Brali retrieval`

No checkout, local Node process or repository path should be required for a consumer.

Trusted public contract:

`search -> Topic -> Protocol -> Evidence -> provenance -> answer | no-answer`

Publication gate:

1. Deploy the existing Streamable HTTP handler to a stable web/serverless runtime.
2. Route a stable public HTTPS `/mcp` endpoint, preferably `https://mcp.brali.life/mcp`.
3. Verify initialization plus representative trusted retrieval over the public URL.
4. Verify evidence state and canonical provenance survive the transport.
5. Verify unknown/out-of-domain requests produce explicit no-answer rather than a weaker untrusted recommendation.
6. Verify pending-review/restricted content cannot leak through the trusted surface.
7. Verify a clean external client can connect without a Brali checkout.
8. Only then set `data/adoption.json -> mcp.hosted_remote` to `true`, record the URL, and update public integration metadata.

Security boundary: read-only only; no shell/filesystem execution, arbitrary client-supplied outbound fetches, write tools or hidden fallback around the trust gate. Add bounded requests and basic abuse/rate protection without creating account friction. Avoid retaining sensitive free-form prompts by default.

Until the external URL passes these gates, Brali must say **deployment-ready remote source**, not **hosted Remote MCP**.

Tracked in #113.

## 2. Agent Skill acquisition — P0

Canonical skill: `agent-skills/skills/brali-life-os/SKILL.md`.

External package: `distribution/github-skill/skills/brali-life-os/SKILL.md`.

Verified current state (2026-09-12):

- `gh skill publish` completed;
- public GitHub release `v1.0.0` exists;
- GitHub skill-search discovery is not yet verified because the publishing token could not add the required repository topic;
- no verified public ClawHub Brali entry exists yet.

Next actions:

1. fix/perform the repository-metadata action required for GitHub Agent Skills discovery and verify search/preview/install from a clean external context;
2. publish **only** the `brali-life-os` router to ClawHub;
3. inspect the public registry artifact and test its install path;
4. record real provider URLs/metrics only after they exist;
5. point the router at the hosted Remote MCP from #113 once that URL is live.

Acquisition loop:

`discover skill -> preview/install -> agent uses Brali -> trusted packet/no-answer -> canonical Brali links`

Do not bulk-publish the generated per-hack skills merely to increase registry inventory.

Tracked in #192.

## 3. Brali Bench — P1

Public identity:

> **Brali Bench — evaluation set for grounded practical-knowledge retrieval.**

The current 50-case evaluation is already useful internally. The next step is to make it independently useful to developers who may not use Brali as their primary knowledge base.

Product package should expose:

- versioned downloadable cases (`brali-bench-v1.x.json`, with JSONL if useful);
- stable case/result schemas;
- a small third-party adapter/runner contract;
- per-dimension scoring for retrieval/routing, trust/evidence preservation, provenance, unsupported-claim leakage and appropriate no-answer behavior;
- reproducible lexical and structured-Brali baseline result files with exact data/runner versions;
- a canonical `/bench/` surface with download/run/citation/limitations information;
- independent Bench release/version semantics so historical results do not silently change.

A third party should be able to download a Bench version, run its own retrieval system, emit the documented result schema, score locally and cite the exact Bench version without requiring a live Brali connection.

Keep maintained regression cases distinct from held-out retrieval evaluation (#151) and model/human outcome benchmarking (#118). Do not turn an internal deterministic score into an LLM-quality or external-effectiveness claim.

Tracked in #197.

## 4. Dataset/research distribution — P1

Verified current state (2026-09-12):

- immutable GitHub release `data-v1.1.0` exists;
- release artifacts include a Hugging Face-ready Dataset Card, `CITATION.cff`, checksums and release metadata;
- no public Hugging Face Brali dataset mirror is verified yet;
- no public Zenodo Brali record/DOI is verified yet.

### Hugging Face

Mirror the exact immutable `data-v1.1.0` release, not `main`.

The public Dataset Card must explain Brali as a structured research/data asset, including ontology and canonical IDs, trust states, evidence decisions, provenance, Agent Skills relationship, Brali Bench relationship, limitations, safe no-answer boundary, version pinning, licensing/citation and canonical Brali links. Do not reduce the artifact to a row count.

After upload, verify the public dataset page and record provider-exposed downloads/likes only when they exist.

### Zenodo

Archive the same immutable release. Preserve version, checksums, `CITATION.cff`, license and canonical repository identity. Record a version DOI and any concept/all-versions DOI only after they resolve publicly. Never pre-fill a DOI.

### Parity

External mirrors must preserve canonical IDs, trust/evidence states and provenance. GitHub/Brali remains the canonical editorial source; Hugging Face and Zenodo are distribution/archive surfaces, not independently edited forks.

Tracked in #146.

## Organic acquisition after the four gates

`data/acquisition-clusters.json` contains a deliberately small candidate portfolio. It is not permission to generate pages immediately. Expand existing canonical problem/topic/protocol surfaces only when external distribution and observed search demand justify the cluster.

The four product loops should reinforce one another:

- hosted MCP removes integration friction;
- router skill creates agent discovery and installation;
- Brali Bench creates developer/research citations even without full Brali adoption;
- dataset mirrors/DOI create durable catalog and research discovery.

All four should route users or agents back to stable Brali canonical identity rather than create detached copies.

## Measurement boundary

Count only provider-observed signals: reachable hosted endpoint, registry/search visibility, installs/downloads, dataset downloads/likes, DOI views/downloads/citations, external backlinks, or explicit integration reports. CI success is quality evidence, not adoption.