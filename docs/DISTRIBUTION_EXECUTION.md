# Brali distribution execution runbook

This runbook separates **source readiness** from **provider-visible publication**. A committed file or passing CI job is never counted as external adoption by itself.

## 1. Hosted Remote MCP

Source: `mcp/core.mjs`, `mcp/server.mjs`, `mcp/remote.mjs`.

`remote.mjs` uses the official web-standard `createMcpHandler` entry point and the same `createBraliServer` factory as stdio. The default backing data is the canonical Brali API v1. Provider-specific wrappers must not reimplement tool retrieval or trust filtering.

Publication gate:

1. Deploy `mcp/remote.mjs` to a web-standard runtime.
2. Route a stable public `/mcp` endpoint to the handler.
3. Verify initialization plus representative trusted retrieval, missing-ID behavior, safety/no-answer behavior, and evidence provenance over the public URL.
4. Only then set `data/adoption.json -> mcp.hosted_remote` to `true`, record the URL, and add remote transport to MCP registry metadata.

Until all four steps pass, Brali must say "deployment-ready remote source", not "hosted Remote MCP".

## 2. GitHub Agent Skill

Canonical skill: `agent-skills/skills/brali-life-os/SKILL.md`.

External package: `distribution/github-skill/skills/brali-life-os/SKILL.md`.

CI enforces byte identity. `.github/workflows/publish-router-skill.yml` publishes **only this router** using a fixed version tag and records the provider-visible release URL in issue #192.

Do not bulk-publish generated per-hack skills merely to increase registry inventory.

## 3. ClawHub

Prepared package: `distribution/clawhub/brali-life-os/`.

ClawHub authentication is an external account action. After authentication, inspect the slug, publish one router version, search the registry for the result, and record the actual public entry URL in issue #192. A local `SKILL.md` is not publication evidence.

## 4. Hugging Face dataset mirror

Every new immutable `data-v*` package generates a root `README.md` Dataset Card with release pinning, trust model, citation, licensing and Brali Bench boundaries.

Mirror the exact immutable GitHub release, not `main`. After upload, verify the public dataset page and record its URL plus provider-exposed downloads/likes only when they exist.

## 5. Zenodo archive / DOI

Brali uses `CITATION.cff` as archive metadata. Do not add a `.zenodo.json` file unless Zenodo-specific metadata is genuinely needed; maintaining two overlapping metadata sources creates drift.

After Zenodo/GitHub integration is enabled, archive an immutable data release, verify the resulting record, then record the DOI. Never pre-fill a DOI in release metadata.

## 6. Brali Bench

Canonical page: `https://brali-lifeos.github.io/bench/` after deployment.

The portable files (`manifest.json`, `cases.json`, `results.json`) must stay exactly aligned with the repository evaluation suite/report. It evaluates deterministic Brali retrieval/grounding behavior, not an unpinned language model.

## 7. Organic acquisition

`data/acquisition-clusters.json` contains a deliberately small candidate portfolio. It is not permission to generate pages immediately. Expand existing canonical problem/topic/protocol surfaces only when external distribution and observed search demand justify the cluster.

## Measurement boundary

Count only provider-observed signals: releases, search visibility, installs/downloads, dataset downloads/likes, DOI views/downloads/citations, external backlinks, or explicit integration reports. CI success is quality evidence, not adoption.
