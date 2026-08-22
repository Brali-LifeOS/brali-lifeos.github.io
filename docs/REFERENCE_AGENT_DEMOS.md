# Brali reference agent demos

The reference demos are small, deterministic examples of how an external agent can use Brali without treating the library as an oracle.

They are generated from the same static `/api/v1/` files used by integrations. Nothing in the public demo output is hand-written after retrieval. A resolved Topic is not automatically a recommendation: when the trusted feed has no eligible Protocol, the correct result is `no-trusted-answer` with the Topic route preserved.

## Scenarios

- **Sleep** — route to `sleep-circadian`, retrieve the reviewed sleep-opportunity protocol, and preserve its source and limitations.
- **Memory** — route to `memory`, retrieve `active-recall-test-yourself`, and carry the reviewed Evidence Decisions that distinguish retention from later application.
- **Task Initiation** — route a procrastination/get-started question to `task-initiation` and expose the current trusted-coverage gap. The scenario intentionally returns no Protocol rather than falling back to newly withheld content after the stricter claim gate.
- **Safety Boundary** — a severe-depression treatment request intentionally returns `no-trusted-answer`; Brali does not convert normal practical retrieval into medical treatment advice.

Task Initiation and Safety Boundary therefore have the same packet status for different reasons. The first is an editorial coverage gap with a valid Topic route and `blocked_from_normal_recommendation=false`. The second is a safety boundary with no normal Topic route and `blocked_from_normal_recommendation=true`. Downstream systems must preserve that distinction instead of translating every no-answer into the same apologetic fog.

## Run locally

```bash
npm run build
node examples/javascript/reference-agent.mjs --scenario sleep
node examples/javascript/reference-agent.mjs --scenario memory
node examples/javascript/reference-agent.mjs --scenario task-initiation
node examples/javascript/reference-agent.mjs --scenario safety-boundary
```

Use the hosted static API instead of local generated files:

```bash
node examples/javascript/reference-agent.mjs \
  --scenario memory \
  --api-base https://brali-lifeos.github.io/api/v1
```

The output is an **answer packet**, not a finished conversational answer. It contains:

- API and dataset contract versions;
- canonical Topic IDs;
- canonical Protocol IDs when trusted coverage exists;
- evidence state;
- the practical action and check-in when a Protocol is returned;
- Brali record provenance;
- reviewed source provenance when available;
- Evidence Decisions with supported claims, limitations, and unsupported claims;
- an explicit status: `trusted-answer`, `boundary-only`, or `no-trusted-answer`;
- a separate safety flag so a normal trusted-coverage gap is not misrepresented as a safety block.

A downstream model may turn that packet into natural language, but it should not drop the evidence state, invent a Protocol for an empty trusted Topic, or expand the claim beyond the recorded Evidence Decision.

## MCP plan

The local MCP server exposes the same generated API through `search_knowledge`, `get_protocol`, `get_evidence`, and related tools.

Generate a concrete tool-call plan from a scenario:

```bash
npm run build
node examples/javascript/reference-mcp-plan.mjs --scenario memory
```

The first call is always a trusted `search_knowledge`. Protocol lookups then use canonical IDs returned by the API demo packet. A coverage-gap packet stops after trusted search because there is no trusted Protocol ID to retrieve. This file deliberately does not implement another MCP protocol client: use your existing MCP host/client to execute the generated calls against `mcp/server.mjs`.

See `examples/mcp/README.md` for the server configuration.

## Regression contract

`npm run check` reruns all four scenarios, verifies deterministic packets, canonical IDs, trust states, reviewed provenance, the task-initiation coverage gap, the safety no-answer, generated API/public pages, and the MCP tool plans. If a taxonomy or retrieval change removes trusted coverage, CI exposes the new no-answer instead of silently refreshing a flattering screenshot or selecting withheld content.

The source expectations live in `data/reference-agent-scenarios.json`. The generated outputs are published at:

- `/life-os/datasets/reference-agent-demos.json`
- `/api/v1/demos.json`
- `/for-ai/demos/`
