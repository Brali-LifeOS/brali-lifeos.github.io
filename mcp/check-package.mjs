import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
const server = JSON.parse(fs.readFileSync(path.join(HERE, 'server.json'), 'utf8'));
const bundled = path.join(HERE, 'dist-data', 'api', 'v1');
const required = ['index.json','topics.json','protocols.json','hacks.json','evidence.json','search.json','identity.json'];

const fail = message => { throw new Error(message); };
if (pkg.private === true) fail('MCP package must not be private.');
if (!pkg.bin?.['brali-knowledge-mcp']) fail('MCP package must expose the brali-knowledge-mcp bin.');
if (pkg.mcpName !== server.name) fail('package.json mcpName must match server.json name.');
if (pkg.name !== server.packages?.[0]?.identifier) fail('npm package name must match server.json package identifier.');
if (pkg.version !== server.version || pkg.version !== server.packages?.[0]?.version) fail('Package and Registry versions must match.');
if (server.packages?.[0]?.transport?.type !== 'stdio') fail('Registry transport must remain stdio until a remote MCP service exists.');
for (const name of required) {
  const file = path.join(bundled, name);
  if (!fs.existsSync(file)) fail(`Bundled MCP data is missing ${name}. Run prepare-package.mjs.`);
  JSON.parse(fs.readFileSync(file, 'utf8'));
}
const source = fs.readFileSync(path.join(HERE, 'server.mjs'), 'utf8');
if (!source.startsWith('#!/usr/bin/env node')) fail('server.mjs must remain directly executable by npm bin linking.');
if (!source.includes('BUNDLED_API')) fail('server.mjs must retain packaged-data fallback.');
if (!source.includes('BRALI_API_DIR')) fail('server.mjs must retain explicit API directory override support.');
console.log(`MCP package verified: ${pkg.name}@${pkg.version}; ${required.length} bundled API files; registry=${server.name}.`);
