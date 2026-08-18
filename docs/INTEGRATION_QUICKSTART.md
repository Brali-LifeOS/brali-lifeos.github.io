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

For research and durable integrations, use a `data-v*` release instead of following `main`. Each release bundle includes a release manifest and SHA-256 checksums. See `docs/DATA_VERSIONING.md` and `CITATION.cff`.
