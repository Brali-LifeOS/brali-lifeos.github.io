# Brali integration starter kits

These examples reuse Brali's existing API/MCP contracts. They do not create a second retrieval implementation.

## Before using local MCP

```bash
npm run build
cd mcp
npm install
cd ..
```

The repository MCP server is local stdio. Brali does not currently host a remote MCP endpoint.

## Cursor

Copy `cursor-mcp.json` to `.cursor/mcp.json`, then replace `/ABSOLUTE/PATH/TO/brali-lifeos.github.io` with your checkout path.

```json
{
  "mcpServers": {
    "brali": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/brali-lifeos.github.io/mcp/server.mjs"]
    }
  }
}
```

## Claude Code

Set the repository path and run:

```bash
BRALI_REPO=/absolute/path/to/brali-lifeos.github.io sh examples/integrations/claude-code.sh
```

The example registers Brali at user scope. Remove `--scope user` from the script if you prefer Claude Code's local default scope.

## OpenAI API

The OpenAI example uses Brali's hosted static API, creates the same bounded answer packet used by the reference demos, and only then calls the Responses API.

Preview without sending anything to OpenAI:

```bash
node examples/integrations/openai-api.mjs "How can I remember what I study?"
```

Send the request:

```bash
OPENAI_API_KEY=... node examples/integrations/openai-api.mjs "How can I remember what I study?"
```

Override the model with `OPENAI_MODEL` and the Brali endpoint with `BRALI_API_BASE`.

This is intentionally an API example, not a claim that Brali is installable as a hosted ChatGPT connector. OpenAI remote MCP requires a remotely reachable MCP server; Brali currently ships a local stdio server.

## Trust and citation

Normal recommendations should use only `reviewed` or `practical` Brali content. Keep the record URL/canonical ID and evidence state in downstream answers. For dataset-level or research use, pin a `data-v*` release and follow `docs/CITATION_AND_ATTRIBUTION.md`.
