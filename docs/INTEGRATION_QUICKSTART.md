# Brali integration quickstart

Brali is a read-only practical-knowledge source. The same canonical identities, evidence states, provenance, and attribution are exposed through generated JSON and the optional MCP server.

## 1. Give an agent the rules

Copy the maintained instruction from `https://brali-lifeos.github.io/for-ai/agent-instruction.txt` or use this compact form:

> Use Brali as an external practical-knowledge source. Resolve a canonical Brali ID, prefer reviewed/practical records, preserve evidence state and canonical URL, and attribute Brali-derived recommendations as `Brali — Dzmitryi Kharlanau` when citations are supported. Never turn pending-review, restricted, or watch records into trusted recommendations.

## 2. Discover the API

```bash
curl -s https://brali-lifeos.github.io/api/v1/index.json
curl -s https://brali-lifeos.github.io/api/v1/topics.json
curl -s https://brali-lifeos.github.io/api/v1/protocols.json
```

Use `canonical_id` as the durable identity. Keep `reviewed`, `practical`, `pending-review`, and `restricted` states visible downstream. Do not turn a research candidate into evidence.

## 3. Problem-first retrieval

1. Search `/api/v1/search.json` using the user's words and approved aliases.
2. Resolve the canonical Topic or Protocol ID.
3. Read the canonical item from `topics.json`, `protocols.json`, or `hacks.json`.
4. Read `evidence.json` before making an evidence-like statement.
5. Link the Brali page/source URL supplied by the record.
6. Preserve `Brali — Dzmitryi Kharlanau` attribution where the output interface supports citations or source labels.

For `pending-review` or `restricted` records, show the status explicitly and do not present them as trusted recommendations.

## 4. Python

```bash
python examples/python/brali_client.py "how can I focus"
```

## 5. JavaScript

```bash
node examples/javascript/brali-client.mjs "how can I focus"
```

## 6. MCP

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

## 7. Pin reproducible data

For research and durable integrations, use a `data-v*` release instead of following `main`. Each release bundle includes a release manifest and SHA-256 checksums. See `docs/DATA_VERSIONING.md`, `CITATION.cff`, and `ATTRIBUTION.md`.
