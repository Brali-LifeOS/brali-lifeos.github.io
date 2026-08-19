# Brali Knowledge MCP

Read-only Model Context Protocol server for the Brali Practical Knowledge Library.

It exposes Brali Topics, trusted Protocols, Hacks, Evidence metadata and related knowledge while preserving canonical IDs and evidence states. `pending-review` and `restricted` material is excluded from normal trusted search by default.

## Status

This directory is prepared for npm and Official MCP Registry publication. Until the package is actually published, use the repository checkout instructions below. Do not assume `npx brali-knowledge-mcp` is available merely because the package metadata exists here.

## From a repository checkout

```bash
npm run build
cd mcp
npm install
npm start
```

The server prefers the repository's generated `../api/v1` data while running from a checkout.

## Published-package command

After npm publication, MCP clients will be able to launch the package with:

```bash
npx -y brali-knowledge-mcp@latest
```

No Brali API key is required. The npm package bundles the minimal generated API snapshot needed by the server.

## MCP tools

- `search_knowledge` — search Topics and trusted Protocols.
- `get_hack` — resolve one Hack by canonical or legacy ID.
- `get_protocol` — resolve one Protocol.
- `get_evidence` — retrieve evidence metadata and provenance.
- `list_topics` — list canonical Topics, optionally by Domain.
- `get_related` — find trusted Protocols sharing Topic IDs.

## Data selection

`npm run prepare:data` copies only the API files the server actually needs into `dist-data/api/v1` before packing. A packaged install therefore does not depend on a sibling Brali repository checkout.

Set `BRALI_API_DIR=/path/to/api/v1` to deliberately override the data directory.

## Registry identity

Official MCP Registry name:

```text
io.github.dkharlanau/brali-knowledge
```

Registry metadata is in `server.json`. Package and registry versions are checked together.

## Trust and attribution

Normal recommendations should preserve Brali canonical IDs/URLs and evidence states. For research or dataset-level use, pin a `data-v*` release and follow the repository citation guidance.

The authoritative repository license currently remains CC BY-NC-SA 4.0. Commercial use requires separate permission. See the repository `LICENSE`, `LICENSING.md`, and `/cite/` guidance.
