# Brali Knowledge MCP

Read-only Model Context Protocol server for the Brali Practical Knowledge Library.

The public contract is deliberately fail-closed: Brali exposes trusted retrieval, canonical identity, evidence state, provenance and explicit `no_answer` outcomes. A caller cannot disable the trust filter. `pending-review` and `restricted` Protocol/Hack records are not available through normal public retrieval, including direct ID lookup.

## Status

The repository contains three runtime entry points backed by the same tool factory:

- `server.mjs` — local stdio server for repository/package use.
- `remote.mjs` — web-standard Streamable HTTP handler backed by Brali's public static API.
- `http-server.mjs` — production Node/Express host for `remote.mjs`, with Host validation, bounded JSON bodies, basic abuse/concurrency protection, health/version endpoints and graceful shutdown.

The target public endpoint is:

```text
https://mcp.brali.life/mcp
```

Do **not** describe that endpoint as live until an external production canary succeeds against the real URL.

## Trusted retrieval contract

The intended path is:

```text
search -> Topic -> trusted Protocol/Hack -> Evidence -> provenance -> answer | no-answer
```

Rules:

- only `reviewed` and `practical` Protocol/Hack records are eligible for public trusted retrieval;
- safety-sensitive queries can deliberately abstain;
- missing or untrusted direct IDs return structured `no_answer`, not a nearby substitute;
- Topics remain taxonomy records and are never presented as recommendations by themselves;
- provenance keeps canonical identity, evidence state and available source/citation fields;
- the server is read-only: there are no write, shell, filesystem or arbitrary URL-fetch tools.

## MCP tools

- `search_knowledge` — search canonical Topics and trusted Protocols/Hacks; trust mode is fixed and cannot be disabled by the caller.
- `get_topic` — resolve one canonical Topic.
- `get_hack` — resolve one trusted Hack; untrusted/missing IDs return `no_answer`.
- `get_protocol` — resolve one trusted Protocol; untrusted/missing IDs return `no_answer`.
- `get_evidence` — retrieve evidence metadata without promoting pending/restricted material into trusted evidence.
- `get_provenance` — return canonical identity, evidence state and available source/citation/provenance fields.
- `list_topics` — list canonical Topics, optionally by Domain.
- `get_related` — find trusted Protocols sharing Topic IDs.

## Local stdio from a repository checkout

```bash
npm run build
cd mcp
npm install
npm start
```

The stdio server prefers the repository's generated `../api/v1` data while running from a checkout.

## Web-standard Streamable HTTP handler

`remote.mjs` exports a handler built with the official v2 `createMcpHandler` entry point. By default it reads canonical data from:

```text
https://brali-lifeos.github.io/api/v1
```

For a controlled mirror, set `BRALI_REMOTE_DATA_ORIGIN` or instantiate `createRemoteMcpHandler({ dataOrigin })`.

Provider adapters must reuse this handler/shared core. Do not reimplement retrieval or trust filtering in platform-specific code.

## Production Node host

Install dependencies and run:

```bash
cd mcp
npm install
npm run start:http
```

Default endpoints:

```text
GET  /healthz
GET  /version
*    /mcp
```

Production settings:

- `PORT` — listen port, default `3000`.
- `HOST` — bind address, default `0.0.0.0`.
- `BRALI_REMOTE_DATA_ORIGIN` — canonical/mirrored Brali API v1 origin.
- `BRALI_MCP_ALLOWED_HOSTS` — optional comma-separated additional hostnames.
- `BRALI_MCP_REQUESTS_PER_MINUTE` — per-instance coarse request ceiling, default `600`.
- `BRALI_MCP_MAX_CONCURRENT` — per-instance in-flight ceiling, default `32`.

`mcp.brali.life`, localhost, and Railway-provided public/private domains are automatically included in the Host allow-list. MCP clients that do not send an `Origin` header are unaffected by browser-origin restrictions.

## Railway deployment

The `mcp/Dockerfile` is intentionally self-contained. For a Railway service sourced from this repository:

1. set the service Root Directory to `/mcp`;
2. enable HTTP public networking;
3. use `/healthz` as the health-check path;
4. deploy the Dockerfile;
5. attach `mcp.brali.life` as the custom domain;
6. run the production canary against `https://mcp.brali.life/mcp`;
7. only after the canary passes, update Brali integration metadata and MCP Registry metadata to claim the hosted endpoint.

The runtime also accepts Railway's generated public/private domain automatically, which allows canary verification before the custom DNS cutover.

## Production canary

From an environment with the MCP package dependencies installed:

```bash
cd mcp
npm install
npm run canary:remote -- https://mcp.brali.life/mcp
```

The canary checks:

- external `/healthz` and `/version`;
- MCP connection using official client negotiation;
- required trusted tools;
- absence of a caller-controlled trust bypass;
- a representative trusted search;
- safety-sensitive abstention;
- explicit no-answer for a missing Protocol;
- dynamic blocking of a real `pending-review`/`restricted` Protocol fixture when one exists;
- preservation of trusted evidence state;
- provenance/canonical identity.

## Published-package command

After npm publication, stdio clients can launch the package with:

```bash
npx -y brali-knowledge-mcp@latest
```

No Brali API key is required. The npm package bundles the minimal generated API snapshot needed by the stdio server.

## Data selection

`npm run prepare:data` copies only the API files the package needs into `dist-data/api/v1` before packing. A packaged stdio install therefore does not depend on a sibling Brali repository checkout.

Set `BRALI_API_DIR=/path/to/api/v1` to deliberately override the local stdio data directory.

## Registry identity

Official MCP Registry name:

```text
io.github.dkharlanau/brali-knowledge
```

Registry metadata is in `server.json`. It continues to declare the published stdio package only until a real public remote endpoint exists and is provider-verifiable.

## Trust and attribution

Normal recommendations preserve Brali canonical IDs/URLs and evidence states. For research or dataset-level use, pin a `data-v*` release and follow the repository citation guidance.

The authoritative repository license currently remains CC BY-NC-SA 4.0. Commercial use requires separate permission. See the repository `LICENSE`, `LICENSING.md`, and `/cite/` guidance.
