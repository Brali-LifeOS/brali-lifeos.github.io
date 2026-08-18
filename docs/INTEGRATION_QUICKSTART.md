# Brali integration quickstart

Brali is a read-only practical-knowledge source. The same canonical identities and evidence states are exposed through generated JSON and the optional MCP server.

## 1. Discover the API

```bash
curl -s https://brali-lifeos.github.io/api/v1/index.json
curl -s https://brali-lifeos.github.io/api/v1/topics.json
curl -s https://brali-lifeos.github.io/api/v1/protocols.json
```

Use `canonical_id` as the durable identity. Keep `reviewed`, `practical`, `pending-review`, and `restricted` states visible downstream. Do not turn a research candidate into evidence.

## 2. Problem-first retrieval

1. Search `/api/v1/search.json` using the user's words and approved aliases.
2. Resolve the canonical Topic or Protocol ID.
3. Read the canonical item from `topics.json`, `protocols.json`, or `hacks.json`.
4. Read `evidence.json` before making an evidence-like statement.
5. Link the Brali page/source URL supplied by the record.

For `pending-review` or `restricted` records, show the status explicitly and do not present them as trusted recommendations.

## 3. Python

```bash
python examples/python/brali_client.py "how can I focus"
```

## 4. JavaScript

```bash
node examples/javascript/brali-client.mjs "how can I focus"
```

## 5. MCP

The MCP implementation lives in `mcp/` and reads the same generated API files.

```bash
npm run build
cd mcp
npm install
npm start
```

Tools: `search_knowledge`, `get_hack`, `get_protocol`, `get_evidence`, `list_topics`, `get_related`.

Example client configuration:

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

Run from a checkout where `npm run build` has already generated `/api/v1/`.

## 6. Pin reproducible data

For research and durable integrations, pin the stable `data-v1.0.0` baseline instead of following `main`. The release bundle includes the complete canonical manifest and API v1 payload, release metadata, `CITATION.cff`, license/policy files, and SHA-256 checksums. Read `docs/releases/1.0.0.md` for the exact scope and known limitations, and `docs/DATA_VERSIONING.md` for compatibility rules.

To verify a locally packaged snapshot:

```bash
npm run build
npm run check
npm run release:data -- --version 1.0.0
npm run release:check -- --version 1.0.0
```
