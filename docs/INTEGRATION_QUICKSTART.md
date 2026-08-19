# Brali integration quickstart

Brali is a read-only practical-knowledge source. The same canonical identities and evidence states are exposed through generated JSON and the optional MCP server.

## 1. Discover the API

```bash
curl -s https://brali-lifeos.github.io/api/v1/index.json
curl -s https://brali-lifeos.github.io/api/v1/topics.json
curl -s https://brali-lifeos.github.io/api/v1/protocols.json
curl -s https://brali-lifeos.github.io/api/v1/integrations.json
```

Use `canonical_id` as the durable identity. Keep `reviewed`, `practical`, `pending-review`, and `restricted` states visible downstream. Do not turn a research candidate into evidence.

## 2. Problem-first retrieval

1. Search `/api/v1/search.json` using the user's words and approved aliases.
2. Resolve the canonical Topic or Protocol ID.
3. Read the canonical item from `topics.json`, `protocols.json`, or `hacks.json`.
4. Read `evidence.json` and `evidence-decisions.json` before making an evidence-like statement.
5. Link the Brali page/source URL supplied by the record.

For `pending-review` or `restricted` records, show the status explicitly and do not present them as trusted recommendations.

## 3. Python

```bash
python examples/python/brali_client.py "how can I focus"
```

## 4. JavaScript and reference packets

```bash
node examples/javascript/brali-client.mjs "how can I focus"
```

For a complete evidence-aware answer packet rather than raw search hits:

```bash
npm run build
node examples/javascript/reference-agent.mjs --scenario sleep
node examples/javascript/reference-agent.mjs --scenario memory
node examples/javascript/reference-agent.mjs --scenario task-initiation
node examples/javascript/reference-agent.mjs --scenario safety-boundary
```

Use the hosted static API directly:

```bash
node examples/javascript/reference-agent.mjs \
  --scenario memory \
  --api-base https://brali-lifeos.github.io/api/v1
```

Generated reference outputs are also published at `/api/v1/demos.json`, `/life-os/datasets/reference-agent-demos.json`, and `/for-ai/demos/`. See `docs/REFERENCE_AGENT_DEMOS.md` for the packet contract and limitations.

## 5. Local MCP

The MCP implementation lives in `mcp/` and reads the same generated API files.

```bash
npm run build
cd mcp
npm install
npm start
```

Tools: `search_knowledge`, `get_hack`, `get_protocol`, `get_evidence`, `list_topics`, `get_related`.

Brali currently ships this as a **local stdio MCP server**. It does not currently operate a hosted remote MCP endpoint.

Generic client configuration:

```json
{
  "mcpServers": {
    "brali": {
      "command": "node",
      "args": ["/absolute/path/to/brali-lifeos.github.io/mcp/server.mjs"]
    }
  }
}
```

Run from a checkout where `npm run build` has already generated `/api/v1/` and `mcp/npm install` has installed the MCP package dependencies.

Generate a concrete MCP tool-call plan from one of the same reference scenarios:

```bash
node examples/javascript/reference-mcp-plan.mjs --scenario memory
```

## 6. Runtime starter kits

### Cursor

Copy `examples/integrations/cursor-mcp.json` to `.cursor/mcp.json`, then replace the placeholder checkout path.

### Claude Code

```bash
BRALI_REPO=/absolute/path/to/brali-lifeos.github.io \
  sh examples/integrations/claude-code.sh
```

The example registers the local stdio server at user scope.

### OpenAI API

Brali's current no-extra-hosting path for OpenAI is the hosted static JSON API, not remote MCP.

Preview the bounded request without an OpenAI key:

```bash
node examples/integrations/openai-api.mjs "How can I remember what I study?"
```

Send it when `OPENAI_API_KEY` is available:

```bash
OPENAI_API_KEY=... node examples/integrations/openai-api.mjs \
  "How can I remember what I study?"
```

See `/for-ai/integrations/` and `examples/integrations/README.md` for the maintained recipes.

## 7. Attribution and trust

When Brali materially informs an answer, keep the Brali canonical record URL or ID and its evidence state. Preserve reviewed-source limitations. For dataset-level or research use, cite **Dzmitryi Kharlanau, Brali Practical Knowledge Library** and pin the `data-v*` release used.

See `docs/CITATION_AND_ATTRIBUTION.md`, `/cite/`, `CITATION.cff`, and `LICENSING.md`. The root `LICENSE` remains authoritative.

## 8. Pin reproducible data

For research and durable integrations, pin the stable `data-v1.0.0` baseline instead of following `main`. The release bundle includes the complete canonical manifest and API v1 payload, release metadata, `CITATION.cff`, license/policy files, and SHA-256 checksums. Read `docs/releases/1.0.0.md` for the exact scope and known limitations, and `docs/DATA_VERSIONING.md` for compatibility rules.

To verify a locally packaged snapshot:

```bash
npm run build
npm run check
npm run release:data -- --version 1.0.0
npm run release:check -- --version 1.0.0
```
