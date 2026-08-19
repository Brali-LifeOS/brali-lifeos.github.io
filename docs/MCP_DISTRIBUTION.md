# Brali MCP distribution

This document separates **distribution readiness** from **actual publication**. Repository metadata alone does not mean that the npm package or Official MCP Registry entry exists.

## Prepared artifacts

- npm package directory: `mcp/`
- candidate npm package name: `brali-knowledge-mcp`
- Official MCP Registry name: `io.github.dkharlanau/brali-knowledge`
- Registry descriptor: `mcp/server.json`
- package validator: `mcp/check-package.mjs`
- bundled-data builder: `mcp/prepare-package.mjs`

The package is self-contained: packing copies the minimal Brali API v1 files required by the MCP server into `mcp/dist-data/api/v1`. A published installation therefore does not need a repository checkout.

## Verify before publishing

From the repository root:

```bash
npm run build
npm run mcp:package
```

The second command prepares bundled data, validates package/registry identity, and runs `npm pack --dry-run`.

Before the first real publish, also verify that the npm name is still available and that the publishing npm account is the intended owner.

## Publish to npm

This step requires npm authentication and is intentionally not performed by repository CI:

```bash
cd mcp
npm adduser
npm publish --access public
```

After publication, verify the public package before advertising the `npx` command.

## Publish to the Official MCP Registry

The Official MCP Registry stores metadata rather than the npm artifact, so npm publication must happen first.

Install the official `mcp-publisher`, then authenticate with GitHub and publish from `mcp/`:

```bash
cd mcp
mcp-publisher login github
mcp-publisher publish
```

The GitHub-authenticated Registry namespace is `io.github.dkharlanau/brali-knowledge`; this matches `package.json#mcpName` and `server.json#name`.

After publication, verify the Registry search result before adding a "published" badge or claim to the website.

## Community directory submission

`data/mcp-directory-submissions.json` contains conservative submission text for community directories. Submit only after the npm package is public, so directory users receive an installable artifact instead of a repository-only promise.

For `punkpeye/awesome-mcp-servers`, follow the repository's current contribution format and add the agent marker to the PR title only if the contribution is actually submitted by an automated agent.

## Claims boundary

Until external publication succeeds, Brali may accurately say:

- MCP source is available in the repository;
- the package is npm/Registry-ready and CI-checked;
- local stdio MCP works from a checkout.

It must not say:

- the npm package is published;
- Brali is listed in the Official MCP Registry;
- Brali operates a hosted remote MCP endpoint.
