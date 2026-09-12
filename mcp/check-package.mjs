import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
const server = JSON.parse(fs.readFileSync(path.join(HERE, 'server.json'), 'utf8'));
const bundled = path.join(HERE, 'dist-data', 'api', 'v1');
const required = ['index.json','topics.json','protocols.json','hacks.json','evidence.json','search.json','identity.json'];
const sources = ['core.mjs','server.mjs','remote.mjs','http-server.mjs','check-remote-canary.mjs'];

const fail = message => { throw new Error(message); };
if (pkg.private === true) fail('MCP package must not be private.');
if (!pkg.bin?.['brali-knowledge-mcp']) fail('MCP package must expose the brali-knowledge-mcp bin.');
if (pkg.mcpName !== server.name) fail('package.json mcpName must match server.json name.');
if (pkg.name !== server.packages?.[0]?.identifier) fail('npm package name must match server.json package identifier.');
if (pkg.version !== server.version || pkg.version !== server.packages?.[0]?.version) fail('Package and Registry versions must match.');
if (server.packages?.[0]?.transport?.type !== 'stdio') fail('Registry transport must remain stdio until a remote MCP service exists.');
for (const rel of sources) {
  if (!pkg.files?.includes(rel)) fail(`MCP package files must include ${rel}.`);
  const file = path.join(HERE, rel);
  if (!fs.existsSync(file)) fail(`MCP source missing ${rel}.`);
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}
if (pkg.exports?.['./remote'] !== './remote.mjs') fail('MCP package must export the remote handler source.');
for (const name of required) {
  const file = path.join(bundled, name);
  if (!fs.existsSync(file)) fail(`Bundled MCP data is missing ${name}. Run prepare-package.mjs.`);
  JSON.parse(fs.readFileSync(file, 'utf8'));
}
const stdio = fs.readFileSync(path.join(HERE, 'server.mjs'), 'utf8');
const core = fs.readFileSync(path.join(HERE, 'core.mjs'), 'utf8');
const remote = fs.readFileSync(path.join(HERE, 'remote.mjs'), 'utf8');
const http = fs.readFileSync(path.join(HERE, 'http-server.mjs'), 'utf8');
const canary = fs.readFileSync(path.join(HERE, 'check-remote-canary.mjs'), 'utf8');
if (!stdio.startsWith('#!/usr/bin/env node')) fail('server.mjs must remain directly executable by npm bin linking.');
if (!stdio.includes('BUNDLED_API')) fail('server.mjs must retain packaged-data fallback.');
if (!stdio.includes('BRALI_API_DIR')) fail('server.mjs must retain explicit API directory override support.');
if (!stdio.includes('createBraliServer') || !core.includes('createBraliServer')) fail('stdio must use the shared Brali MCP factory.');
if (!remote.includes('createMcpHandler') || !remote.includes('createBraliServer')) fail('remote MCP must use the official HTTP entry and shared Brali MCP factory.');
if (!remote.includes('https://brali-lifeos.github.io/api/v1')) fail('remote MCP must default to Brali public API v1.');
if (!core.includes("trust_mode: 'trusted-only'") || core.includes('trusted_only: z.boolean')) fail('public MCP must be fail-closed trusted-only with no caller trust bypass.');
if (!core.includes("registerTool('get_provenance'")) fail('public MCP must expose provenance explicitly.');
if (!http.includes('createMcpExpressApp') || !http.includes('allowedHosts')) fail('hosted runtime must use MCP HTTP middleware with Host validation.');
if (!http.includes("jsonLimit: '64kb'") || !http.includes('basicAbuseGate')) fail('hosted runtime must bound request bodies and basic abuse.');
if (!canary.includes('blocked_fixture_checked') || !canary.includes('get_provenance')) fail('production canary must verify trust blocking and provenance.');
console.log(`MCP package verified: ${pkg.name}@${pkg.version}; ${required.length} bundled API files; trusted stdio + hardened hosted runtime source; registry=${server.name}.`);
