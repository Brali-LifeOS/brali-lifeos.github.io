# Brali MCP reference flow

Build Brali first so `/api/v1/` exists, then start the read-only MCP server:

```bash
npm run build
cd mcp
npm install
npm start
```

Example MCP host configuration:

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

Generate scenario-specific tool arguments from the same deterministic API client used by the public reference demos:

```bash
node examples/javascript/reference-mcp-plan.mjs --scenario memory
```

The plan starts with `search_knowledge` using `trusted_only: true`, then uses canonical Protocol IDs for `get_protocol` and the corresponding record ID for `get_evidence`.

Do not promote `pending-review` or `restricted` material to normal recommendations, and do not fill a `no-trusted-answer` result by inventing knowledge outside the Brali packet while claiming it came from Brali.
