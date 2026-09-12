# Brali Knowledge MCP

Read-only Model Context Protocol server for the Brali Practical Knowledge Library.

It exposes Brali Topics, trusted Protocols, Hacks, Evidence metadata and related knowledge while preserving canonical IDs and evidence states. `pending-review` and `restricted` material is excluded from normal trusted search by default.

## Status

The repository contains two transports backed by the same tool factory and trust rules:

- `server.mjs` — local stdio server for repository/package use.
- `remote.mjs` — deployment-ready web-standard Streamable HTTP handler backed by Brali's public static API.

Brali does **not** claim a public hosted remote MCP endpoint until a provider deployment has been completed and verified. Do not invent a remote URL from the presence of `remote.mjs`.

## Local stdio from a repository checkout

```bash
npm run build
cd mcp
npm install
npm start
```

The stdio server prefers the repository's generated `../api/v1` data while running from a checkout.

## Remote Streamable HTTP source

`remote.mjs` exports a web-standard MCP handler created with the official v2 `createMcpHandler` entry point. Deploy that module in a web-standard runtime and route the provider's `/mcp` request to its default export.

By default it reads trusted source data from:

```text
https://brali-lifeos.github.io/api/v1
```

For a controlled mirror, instantiate `createRemoteMcpHandler({ dataOrigin: "https://example.org/api/v1" })`. In Node-compatible runtimes, `BRALI_REMOTE_DATA_ORIGIN` may also override the source origin.

The remote implementation deliberately reuses `core.mjs`; it must not reimplement retrieval or trust filtering in provider-specific code.

## Published-package command

After npm publication, MCP clients will be able to launch the package with:

```bash
npx -y brali-knowledge-mcp@latest
```

No Brali API key is required. The npm package bundles the minimal generated API snapshot needed by the stdio server.

## MCP tools

- `search_knowledge` — search Topics and trusted Protocols.
- `get_hack` — resolve one Hack by canonical or legacy ID.
- `get_protocol` — resolve one Protocol.
- `get_evidence` — retrieve evidence metadata and provenance.
- `list_topics` — list canonical Topics, optionally by Domain.
- `get_related` — find trusted Protocols sharing Topic IDs.

## Data selection

`npm run prepare:data` copies only the API files the package actually needs into `dist-data/api/v1` before packing. A packaged stdio install therefore does not depend on a sibling Brali repository checkout.

Set `BRALI_API_DIR=/path/to/api/v1` to deliberately override the local stdio data directory.

## Registry identity

Official MCP Registry name:

```text
io.github.dkharlanau/brali-knowledge
```

Registry metadata is in `server.json`. It continues to declare the published stdio package only until a real public remote endpoint exists and is provider-verifiable.

## Trust and attribution

Normal recommendations should preserve Brali canonical IDs/URLs and evidence states. For research or dataset-level use, pin a `data-v*` release and follow the repository citation guidance.

The authoritative repository license currently remains CC BY-NC-SA 4.0. Commercial use requires separate permission. See the repository `LICENSE`, `LICENSING.md`, and `/cite/` guidance.
